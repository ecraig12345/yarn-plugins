A collection of yarn plugins.

## Plugins

### [`yarn-plugin-engines`](./plugins/engines)

Enforce the `engines.node` requirement from the repo root `package.json` for dependencies of published packages.

### [`yarn-plugin-npmrc`](./plugins/npmrc)

Use registry authentication settings from `.npmrc` instead of `.yarnrc.yml`.

## Releasing

Releases are created manually. `cd` to an individual plugin folder and run `yarn release <major|minor|patch>`.
