import {
  Manifest,
  SettingsType,
  structUtils,
  type ConfigurationDefinitionMap,
  type ConfigurationValueMap,
  type Descriptor,
  type DescriptorHash,
  type Hooks,
  type Linker,
  type Package,
  type Plugin,
  type Project,
  type Report,
  type miscUtils,
} from '@yarnpkg/core';
import { NodeFS, type PortablePath } from '@yarnpkg/fslib';
import path from 'path';
import semver from 'semver';
import { isRangeSatisfied, parseRange } from './ranges.js';

interface EnginesConfig {
  engines: miscUtils.ToMapValue<{
    ignorePackages: string[];
    includeDevDependencies: boolean;
    verbose: boolean;
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
      verbose: {
        description: 'Enable verbose warnings for debugging',
        type: SettingsType.BOOLEAN,
        default: false,
      },
    },
  },
};

const nodeFs = new NodeFS();

/**
 * Recursively find non-dev dependencies of published packages, and verify that any `engines.node`
 * requirements match the version from the root `package.json`'s `engines.node`.
 * (Yarn v1 would verify this automatically, but v2+ does not...)
 */
const validateProjectAfterInstall: NonNullable<Hooks['validateProjectAfterInstall']> = async (
  project,
  report,
) => {
  const enginesConfig = project.configuration.get('engines') as
    | EnginesConfig['engines']
    | undefined;
  const ignorePackages = enginesConfig?.get('ignorePackages') || [];
  const includeDevDependencies = !!enginesConfig?.get('includeDevDependencies');
  const verbose = !!enginesConfig?.get('verbose');
  const linkerName = (project.configuration.get('nodeLinker') as string) || 'node-modules';

  const reportError = (message: unknown) => {
    report.reportError(0, `[yarn-plugin-engines] ${String(message)}`);
  };

  const verboseWarning = (message: unknown) => {
    verbose && report.reportWarning(0, `[yarn-plugin-engines] warning: ${String(message)}`);
  };

  if (linkerName !== 'pnpm' && linkerName !== 'node-modules') {
    reportError(`This plugin is not compatible with the ${linkerName} linker`);
    return;
  }

  const rangeStr = project.topLevelWorkspace.manifest.raw.engines?.node;
  if (!rangeStr) {
    reportError('Missing package.json engines.node field');
    return;
  }
  const repoRange = parseRange(rangeStr);
  if (!repoRange) {
    reportError(`Invalid semver range "${rangeStr}" in package.json engines.node`);
    return;
  }
  if (!semver.satisfies(process.versions.node, repoRange)) {
    reportError(
      `The current Node version ${process.versions.node} does not satisfy ${repoRange.raw}`,
    );
    return;
  }

  // Get the enabled linker. In practice there's exactly one enabled linker per project,
  // so we can find the supported linker for any package (a workspace package is most
  // easily available) and use that for all the others.
  const linker = project.configuration
    .getLinkers()
    .find((linker) => linker.supportsPackage(project.workspaces[0].anchoredPackage, { project }))!;

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
      ignorePackages.includes(pkgName) ||
      processedDependencies.has(descriptor.descriptorHash) ||
      dependenciesQueue.includes(descriptor.descriptorHash)
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
      // unless dev dependencies are requested
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
    processedDependencies.add(descriptorHash);

    const isOptional = optionalDependencies.has(descriptorHash);
    const maybeReportError = (message: string) => !isOptional && reportError(message);

    const desc = project.storedDescriptors.get(descriptorHash);
    if (!desc) {
      maybeReportError(`Could not find descriptor for hash ${descriptorHash}`);
      continue;
    }
    const prettyDesc = structUtils.prettyDescriptor(project.configuration, desc);

    const locatorHash = project.storedResolutions.get(descriptorHash);
    if (!locatorHash) {
      maybeReportError(`Could not find a resolved version for ${prettyDesc}`);
      continue;
    }

    const pkg = project.storedPackages.get(locatorHash);
    if (!pkg) {
      maybeReportError(`Could not find an installed package for ${prettyDesc}`);
      continue;
    }

    const location = await findPackageLocation(pkg, {
      project,
      report,
      linker,
      isOptional,
      verboseWarning,
    });
    if (!location) {
      maybeReportError(`Could not find location for ${prettyDesc}`);
      continue;
    }

    const manifest = await Manifest.tryFind(location, { baseFs: nodeFs });
    if (!manifest) {
      // The package supposedly exists on disk, so even for optional packages, it's an error
      // if we can't read the package.json
      reportError(`Could not find package.json for ${prettyDesc} at ${location}`);
      continue;
    }

    const manifestRange: string | undefined = manifest.raw.engines?.node;
    if (manifestRange && !isRangeSatisfied({ repoRange, manifestRange })) {
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
      `The following packages require Node ${nodeReq}, which does not match the repo requirement ${repoRange.raw}:\n` +
        [...pkgs]
          .sort()
          .map((pkg) => `  - ${pkg}`)
          .join('\n'),
    );
  }
};

async function findPackageLocation(
  pkg: Package,
  opts: {
    project: Project;
    report: Parameters<typeof validateProjectAfterInstall>[1];
    linker: Linker;
    isOptional: boolean;
    verboseWarning: (message: unknown) => void;
  },
): Promise<PortablePath | undefined> {
  const { project, report, linker, isOptional, verboseWarning } = opts;

  const prettyPkg = structUtils.prettyLocator(project.configuration, pkg);

  // Try the original locator first even if virtualized, since it may be valid.
  try {
    return await linker.findPackageLocation(pkg, { project, report: report as Report });
  } catch (e) {
    if (isOptional) {
      verboseWarning(`Could not find location for optional package ${prettyPkg}, skipping...`);
      return undefined;
    }

    if (structUtils.isVirtualLocator(pkg)) {
      verboseWarning(
        `Could not find location for ${prettyPkg} - trying devirtualized locator... (original error: ${e})`,
      );
      try {
        const loc = structUtils.devirtualizeLocator(pkg);
        return await linker.findPackageLocation(loc, { project, report: report as Report });
      } catch {}
    }
  }

  // Fallback: look in node_modules by package name
  const nmPath = path.join(project.cwd, 'node_modules', structUtils.stringifyIdent(pkg));
  if (nodeFs.existsSync(nmPath as PortablePath)) {
    verboseWarning(`Falling back to node_modules path for ${prettyPkg}: ${nmPath}`);
    return nmPath as PortablePath;
  }

  return undefined;
}

const plugin: Plugin = {
  hooks: { validateProjectAfterInstall },
  configuration: configurationMap,
};

export default plugin;
