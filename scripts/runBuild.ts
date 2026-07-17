import { getDynamicLibs } from '@yarnpkg/cli';
import { build, type BuildResult } from 'esbuild-wasm';
import type { PluginData } from './getPluginData.ts';

// These can be updated if needed, but the goal is to keep them low to reduce parse time penalty
// on EVERY yarn command (even when the plugin isn't used)
const maxKbDev = 75;
const maxKbMin = 30;

export async function runBuild(plugin: PluginData) {
  try {
    await runSingleBuild(plugin, false);
    await runSingleBuild(plugin, true);
  } catch (err) {
    if ((err as BuildResult).errors) {
      console.error(`\n❌ Failed to bundle ${plugin.name} plugin`);
      process.exit(1);
    }
  }
}

async function runSingleBuild(plugin: PluginData, minify: boolean) {
  const outfile = minify ? plugin.paths.minBundle : plugin.paths.devBundle;
  console.log(`\nBundling: ${outfile}`);

  const result = await build({
    entryPoints: [plugin.paths.entry],
    outfile,
    absWorkingDir: plugin.paths.projectRoot,
    bundle: true,
    metafile: true,
    format: 'iife',
    globalName: 'plugin',
    platform: 'node',
    target: 'node22',
    // log errors, warnings, and a summary (which includes the output file sizes)
    logLevel: 'info',
    minify,
    // Wrap the bundle in the module shape Yarn expects for a plugin
    banner: {
      js: [
        `/* eslint-disable */`,
        `//prettier-ignore`,
        `module.exports = {`,
        `name: "@yarnpkg/plugin-${plugin.shortName}",`,
        `factory: function (require) {`,
      ].join('\n'),
    },
    footer: {
      js: [`return plugin;`, `}`, `};`].join('\n'),
    },
    plugins: [
      {
        // Plugin that mimics `@yarnpkg/builder`: mark Yarn's built-in dynamic libraries and any
        // `@yarnpkg/plugin-*` as external, so they're required from the host Yarn at runtime.
        name: 'dynamic-lib-resolver',
        setup(build) {
          const dynamicLibs = getDynamicLibs();
          build.onResolve({ filter: /()/ }, (args) => {
            if (dynamicLibs.has(args.path) || /^@yarnpkg\/plugin-/.test(args.path)) {
              return { path: args.path, external: true };
            }
          });
        },
      },
    ],
  });

  const stats = Object.values(result.metafile.outputs)[0];
  const kb = Math.round(stats.bytes / 1024);
  const maxKb = minify ? maxKbMin : maxKbDev;
  if (kb > maxKb) {
    console.error(
      `❌ ${outfile} bundle size has increased: ${kb} KB (previous limit: ${maxKb} KB)`,
    );
    console.log(
      'You can increase the size in scripts/runBuild.ts if needed, but first check the diff ' +
        'to see what changed and if anything can be removed.',
    );
    process.exit(1);
  }
}
