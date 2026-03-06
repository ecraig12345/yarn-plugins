const fs = require('fs');
const { getPluginData, getAllPluginData } = require('./getPluginData');
const { runBuild } = require('./runBuild');

/**
 * Build the plugin package in the cwd, or all plugin packages with `--all`.
 */
async function run() {
  const plugins = process.argv.includes('--all')
    ? getAllPluginData()
    : [getPluginData(process.cwd())];

  for (const plugin of plugins) {
    fs.rmSync(plugin.paths.dist, { recursive: true, force: true });
    fs.mkdirSync(plugin.paths.dist, { recursive: true });

    await runBuild(plugin);
  }
}

run().catch((error) => {
  console.error(/** @type {Error} */ (error).message || error);
  process.exit(1);
});
