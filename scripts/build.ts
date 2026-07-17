import fs from 'node:fs';
import { getPluginData, getAllPluginData } from './getPluginData.ts';
import { runBuild } from './runBuild.ts';

/**
 * Build the plugin package in the cwd, or all plugin packages with `--all`.
 */
async function run() {
  const plugins = process.argv.includes('--all')
    ? getAllPluginData()
    : [getPluginData(process.cwd())];

  for (const plugin of plugins) {
    fs.rmSync(plugin.paths.dist, { recursive: true, force: true });
    await runBuild(plugin);
  }
}

run().catch((error) => {
  console.error((error as Error).stack || error);
  process.exit(1);
});
