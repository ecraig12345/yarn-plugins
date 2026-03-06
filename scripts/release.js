const fs = require('fs');
const semver = require('semver');
const { git } = require('workspace-tools');
const { getPluginData } = require('./getPluginData');

/**
 * Release a single plugin package.
 */
async function run() {
  const nanoSpawn = (await import('nano-spawn')).default;

  const pkg = getPluginData(process.cwd());
  const cwd = pkg.paths.packageRoot;

  const bumpType = /** @type {import('semver').ReleaseType} */ (process.argv[2]);
  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js <major|minor|patch>');
    process.exit(1);
  }

  let packageJsonText = fs.readFileSync(pkg.paths.packageJson, 'utf8');
  const oldVersion = pkg.version;
  const newVersion = semver.inc(oldVersion, bumpType);
  if (!newVersion) {
    // shouldn't be possible
    console.error(`Could not bump version from ${oldVersion} with type ${bumpType}`);
    process.exit(1);
  }
  const oldTag = `${pkg.shortName}_v${oldVersion}`;
  const newTag = `${pkg.shortName}_v${newVersion}`;

  // generate the bundles
  require('./build');

  console.log(`Updating package.json version from ${oldVersion} to ${newVersion}`);
  packageJsonText = packageJsonText.replace(oldVersion, newVersion);
  fs.writeFileSync(pkg.paths.packageJson, packageJsonText, 'utf8');

  console.log(`Updating README.md versions from ${oldTag} to ${newTag}`);
  let readmeText = fs.readFileSync(pkg.paths.readme, 'utf8');
  readmeText = readmeText.replaceAll(oldTag, newTag);
  fs.writeFileSync(pkg.paths.readme, readmeText, 'utf8');

  // unstage anything previously staged
  git(['reset'], { cwd, throwOnError: true });
  // add the modified files and commit
  git(['add', pkg.paths.packageJson, pkg.paths.readme, pkg.paths.dist], {
    cwd,
    throwOnError: true,
  });
  git(['commit', '-m', `"Bump ${pkg.name} version to ${newVersion}"`], { cwd, throwOnError: true });

  // tag and push the new version
  git(['tag', newTag], { cwd, throwOnError: true });
  git(['push', '--tags', 'origin', 'main'], { cwd, throwOnError: true });

  // create a github release
  await nanoSpawn('gh', ['release', 'create', '--generate-notes', newTag], {
    cwd,
    stdio: 'inherit',
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
