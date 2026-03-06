import {
  Manifest,
  SettingsType,
  structUtils,
  type ConfigurationDefinitionMap,
  type ConfigurationValueMap,
  type Descriptor,
  type DescriptorHash,
  type Hooks,
  type Plugin,
  type Report,
  type miscUtils,
} from '@yarnpkg/core';
import { NodeFS } from '@yarnpkg/fslib';
import semver from 'semver';

interface EnginesConfig {
  engines: miscUtils.ToMapValue<{
    ignorePackages: string[];
    includeDevDependencies: boolean;
  }> | null;
}

const configurationMap: ConfigurationDefinitionMap<EnginesConfig> &
  // we don't provide any of these built-in properties; this just satisfies the plugin type later
  Partial<ConfigurationDefinitionMap<ConfigurationValueMap>> = {
  engines: {
    description: 'Config for yarn-plugin-engines',
    type: SettingsType.SHAPE,
    properties: {
      ignorePackages: {
        description:
          'List of packages to ignore when validating engines.node (also ignores their dependencies)',
        type: SettingsType.STRING,
        isArray: true,
        default: [],
      },
      includeDevDependencies: {
        description:
          'Whether to include local dev dependencies and private packages when validating engines.node',
        type: SettingsType.BOOLEAN,
        default: false,
      },
    },
  },
};

/**
 * Recursively find non-dev dependencies of published packages, and verify that any `engines.node`
 * requirements match the version from the root `package.json`'s `engines.node`.
 * (Yarn v1 would verify this automatically, but v2+ does not...)
 */
const validateProjectAfterInstall: Hooks['validateProjectAfterInstall'] = async (
  project,
  report,
) => {
  const nodeFs = new NodeFS();
  const enginesConfig = project.configuration.get('engines') as
    | EnginesConfig['engines']
    | undefined;
  const ignorePackages = enginesConfig?.get('ignorePackages') || [];
  const includeDevDependencies = !!enginesConfig?.get('includeDevDependencies');

  const reportError = (message: unknown) => {
    report.reportError(0, `[yarn-plugin-engines] ${String(message)}`);
  };

  const rangeStr = project.topLevelWorkspace.manifest.raw.engines?.node;
  if (!rangeStr) {
    reportError('Missing package.json engines.node field');
    return;
  }

  let requiredRange: semver.Range | undefined;
  try {
    requiredRange = new semver.Range(rangeStr);
  } catch {
    // ignore
  }
  if (!requiredRange?.range) {
    reportError(`Invalid semver range "${rangeStr}" in package.json engines.node`);
    return;
  }

  if (!semver.satisfies(process.versions.node, requiredRange)) {
    reportError(
      `The current Node version ${process.versions.node} does not satisfy ${requiredRange.raw}`,
    );
    return;
  }

  // Get the enabled linker. There's exactly one enabled linker per project, so we can find
  // the supported linker for any package (a workspace package is most easily available)
  // and use that for all the others.
  const linker = project.configuration
    .getLinkers()
    .find((linker) => linker.supportsPackage(project.workspaces[0].anchoredPackage, { project }));

  if (!linker) {
    reportError('No supported linker found');
    return;
  }

  /** deps detected but not yet found/processed */
  const dependenciesQueue: DescriptorHash[] = [];
  const processedDependencies = new Set<DescriptorHash>();
  /** deps marked as optional by at least one manifest */
  const optionalDependencies = new Set<DescriptorHash>();

  /** Queue a descriptor for processing if not already queued/processed */
  const enqueueDependency = (descriptor: Descriptor, manifest: Manifest) => {
    const pkgName = structUtils.stringifyIdent(descriptor);
    if (
      descriptor.range.startsWith('workspace:') ||
      processedDependencies.has(descriptor.descriptorHash) ||
      dependenciesQueue.includes(descriptor.descriptorHash) ||
      ignorePackages.includes(pkgName)
    ) {
      return;
    }

    dependenciesQueue.push(descriptor.descriptorHash);

    // Check all the places a dep can be specified as optional
    // (it's probably not important to be strict about deps vs peers here)
    if (
      manifest.raw.optionalDependencies?.[pkgName] ||
      manifest.raw.dependenciesMeta?.[pkgName]?.optional === true ||
      manifest.raw.peerDependenciesMeta?.[pkgName]?.optional === true
    ) {
      optionalDependencies.add(descriptor.descriptorHash);
    }
  };

  // Seed with non-dev dependencies from public workspace manifests.
  // Use the Package object's dependency descriptors (which have correct hashes
  // matching storedResolutions, including virtual hashes for packages with peer deps),
  // but filter by idents from the manifest's dependencies/peerDependencies to exclude devDeps.
  for (const workspace of project.workspaces) {
    if (workspace.manifest.private && !includeDevDependencies) continue;

    const wsPkg = project.storedPackages.get(workspace.anchoredLocator.locatorHash);
    if (!wsPkg) continue;

    // Queue matching descriptors from the Package (which have correct hashes)
    for (const desc of wsPkg.dependencies.values()) {
      // Package.dependencies for workspaces also includes devDependencies, so ignore those
      if (includeDevDependencies || workspace.manifest.dependencies.has(desc.identHash)) {
        enqueueDependency(desc, workspace.manifest);
      }
    }
    for (const desc of wsPkg.peerDependencies.values()) {
      enqueueDependency(desc, workspace.manifest);
    }
  }

  const unsatisfiedNodeReqs: Record<string, Set<string>> = {};

  while (dependenciesQueue.length) {
    const descriptorHash = dependenciesQueue.shift()!;
    if (processedDependencies.has(descriptorHash)) {
      continue;
    }
    processedDependencies.add(descriptorHash);

    const desc = project.storedDescriptors.get(descriptorHash);
    const prettyDesc = desc
      ? structUtils.prettyDescriptor(project.configuration, desc)
      : descriptorHash;

    const locatorHash = project.storedResolutions.get(descriptorHash);
    if (!locatorHash) {
      if (!optionalDependencies.has(descriptorHash)) {
        reportError(`Could not find a resolution for descriptor ${prettyDesc}`);
      }
      continue;
    }

    const pkg = project.storedPackages.get(locatorHash);
    if (!pkg) {
      if (!optionalDependencies.has(descriptorHash)) {
        reportError(`Could not find a package for descriptor ${prettyDesc}`);
      }
      continue;
    }

    // Find the actual location on disk.
    // (Claude wants to devirtualize the package here, but that breaks the lookup.)
    let location;
    try {
      location = await linker.findPackageLocation(pkg, { project, report: report as Report });
    } catch (e) {
      if (!optionalDependencies.has(descriptorHash)) {
        reportError((e as Error).message || e);
      }
      continue;
    }

    const manifest = await Manifest.tryFind(location, { baseFs: nodeFs });
    if (!manifest) {
      reportError(`Could not find package.json for ${prettyDesc} at ${location}`);
      continue;
    }

    const manifestRange = semver.validRange(manifest.raw.engines?.node);
    if (manifestRange && !semver.intersects(manifestRange, requiredRange)) {
      unsatisfiedNodeReqs[manifestRange] ??= new Set();
      unsatisfiedNodeReqs[manifestRange].add(structUtils.prettyLocator(project.configuration, pkg));
    }

    // Recursively process this package's dependencies.
    // Use the original (possibly virtual) pkg's dependencies — these have descriptor
    // hashes that match storedResolutions. External packages don't include devDeps.
    for (const dep of pkg.dependencies.values()) {
      enqueueDependency(dep, manifest);
    }
  }

  for (const [nodeReq, pkgs] of Object.entries(unsatisfiedNodeReqs)) {
    reportError(
      `The following packages require Node ${nodeReq}, which does not match the repo requirement ${requiredRange.raw}:\n` +
        [...pkgs]
          .sort()
          .map((pkg) => `  - ${pkg}`)
          .join('\n'),
    );
  }
};

const plugin: Plugin = {
  hooks: { validateProjectAfterInstall },
  configuration: configurationMap,
};

export default plugin;
