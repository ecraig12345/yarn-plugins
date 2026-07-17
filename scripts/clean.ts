import fs from 'node:fs';
import { getAllPluginData } from './getPluginData.ts';

const plugins = getAllPluginData();
for (const plugin of plugins) {
  // Delete the @yarnpkg/builder raw output
  fs.rmSync(plugin.paths.bundles, { recursive: true, force: true });
}
