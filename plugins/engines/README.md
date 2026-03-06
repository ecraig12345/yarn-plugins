# `yarn-plugin-engines`

Recursively find non-dev dependencies of published packages within the repo, and verify that any `engines.node` requirements match the version from the root `package.json`'s `engines.node`. (Yarn v1 would verify this automatically, but v2+ does not...)

## Install

Usually you'll want the minified version of the plugin:

```
yarn plugin import https://raw.githubusercontent.com/ecraig12345/yarn-plugins/engines_v0.0.0/plugins/engines/dist/plugin.js
```

If you'd like a non-minified version for debugging:

```
yarn plugin import https://raw.githubusercontent.com/ecraig12345/yarn-plugins/engines_v0.0.0/plugins/engines/dist/plugin.dev.js
```
