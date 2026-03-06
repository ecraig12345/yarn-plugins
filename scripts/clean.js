const fs = require('fs');
const { getAllPluginData } = require('./getPluginData');

const plugins = getAllPluginData();
for (const plugin of plugins) {
  // Delete the @yarnpkg/builder raw output
  fs.rmSync(plugin.paths.bundles, { recursive: true, force: true });
}
