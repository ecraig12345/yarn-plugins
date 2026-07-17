import path from 'node:path';
import {
  findPackageRoot,
  findProjectRoot,
  getPackageInfo,
  getWorkspacePackagePaths,
} from 'workspace-tools';

const pluginPrefix = /^yarn-plugin-/;

/**
 * Get absolute paths to various files and folders relative to a plugin folder,
 * as well as its package.json contents.
 * @param cwd - Get the plugin info in this directory
 */
export function getPluginData(cwd: string) {
  const packageRoot = findPackageRoot(cwd);
  const projectRoot = findProjectRoot(cwd);
  const packageInfo = packageRoot && getPackageInfo(packageRoot);

  if (!packageRoot || !packageInfo || packageRoot === projectRoot) {
    throw new Error('cwd must be under a plugin package directory');
  }

  if (!pluginPrefix.test(packageInfo.name)) {
    throw new Error(`package name must start with "yarn-plugin-" (received: ${packageInfo.name})`);
  }

  const shortName = packageInfo.name.replace(pluginPrefix, '');
  const distPath = path.join(packageRoot, 'dist');
  const bundlesPath = path.join(packageRoot, 'bundles');

  return {
    name: packageInfo.name,
    version: packageInfo.version,
    /** Short name of the plugin (without the "yarn-plugin-" prefix) */
    shortName,
    /** All paths are absolute */
    paths: {
      packageRoot,
      packageJson: packageInfo.packageJsonPath,
      readme: path.join(packageRoot, 'README.md'),
      /** Automatic top "bundles" output folder from `@yarnpkg/builder` */
      bundles: bundlesPath,
      /** Automatic output path from `@yarnpkg/builder` */
      bundleFile: path.join(
        bundlesPath,
        '@yarnpkg',
        packageInfo.name.replace(/^yarn-/, '') + '.js',
      ),
      dist: distPath,
      /** Final dist path for the minified bundle */
      minBundle: path.join(distPath, 'plugin.js'),
      /** Final dist path for the development bundle */
      devBundle: path.join(distPath, 'plugin.dev.js'),
    },
  };
}

export function getAllPluginData() {
  const paths = getWorkspacePackagePaths(process.cwd());
  if (paths?.length) {
    return paths.map((pth) => getPluginData(pth));
  }
  throw new Error('No packages found under ' + process.cwd());
}

export type PluginData = ReturnType<typeof getPluginData>;
