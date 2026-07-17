import fs from 'node:fs';
import nanoSpawn from 'nano-spawn';
import type { PluginData } from './getPluginData.ts';

// These can be updated if needed, but the goal is to keep them low to reduce parse time penalty
// on EVERY yarn command (even when the plugin isn't used)
const maxKbDev = 75;
const maxKbMin = 30;

// Follow the EOL which appears to be used by git in the output files, since they're checked in
const gitEol = fs.readFileSync(import.meta.filename, 'utf8').match(/\r?\n/)?.[0] || '\n';

export async function runBuild(plugin: PluginData) {
  await runSingleBuild(false);
  await runSingleBuild(true);

  async function runSingleBuild(minify: boolean) {
    // The yarn builder has no way to specify output paths, so manually rename the files...
    await nanoSpawn('builder', ['build', 'plugin', ...(minify ? [] : ['--no-minify'])], {
      cwd: plugin.paths.packageRoot,
      stdio: 'inherit',
      preferLocal: true,
    });

    const bundlePath = minify ? plugin.paths.minBundle : plugin.paths.devBundle;

    const stats = fs.statSync(plugin.paths.bundleFile);
    const kb = Math.round(stats.size / 1024);
    const maxKb = minify ? maxKbMin : maxKbDev;
    if (kb > maxKb) {
      console.error(
        `❌ ${bundlePath} bundle size has increased: ${kb} KB (previous limit: ${maxKb} KB)`,
      );
      console.log(
        'You can increase the size in scripts/build.ts if needed, but first check the diff ' +
          'to see what changed and if anything can be removed.',
      );
      process.exit(1);
    }

    // Normalize EOL to avoid spurious diffs
    const contents = fs.readFileSync(plugin.paths.bundleFile, 'utf8').replace(/\r?\n/g, gitEol);
    fs.writeFileSync(bundlePath, contents);
    console.log(`✅ Updated ${bundlePath}\n`);
  }
}
