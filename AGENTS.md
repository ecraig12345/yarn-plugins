# AGENTS.md

Instructions for AI coding agents working in this repository. **Trust these instructions**; only search or explore further if something here is incomplete or proven wrong (in case of errors, notify the user).

## Repository overview

- **Purpose:** A small collection of [Yarn v4 (Berry) plugins](https://yarnpkg.com/advanced/plugin-tutorial), published as pre-built single-file bundles.
  - `plugins/engines` (`yarn-plugin-engines`): enforces the repo-root `engines.node` requirement across dependencies of published packages.
  - `plugins/npmrc` (`yarn-plugin-npmrc`): reads registry auth from `.npmrc` instead of `.yarnrc.yml`.
- **Type/size:** Small TypeScript monorepo (~10 source files), Yarn workspaces, ESM.
- **Languages/tooling:** TypeScript `~7.0.0`, Node `>=22.18.0` (CI/dev use Node **22**, see `.nvmrc`), Yarn **4.17.1** (via `yarnPath` in `.yarnrc.yml`), Vitest `^4`, Prettier `^3`, syncpack `^15`. Bundling is done by Esbuild `^0.28.1`.
- `nodeLinker: pnpm` and `enableScripts: false` are set in `.yarnrc.yml`.

## Critical: how builds and validation work

**Always run `yarn --immutable` (or `yarn install`) once after cloning or changing dependencies before doing anything else.** Node 22.18+ runs the `.ts` scripts in `scripts/` directly (no separate compile step for them).

The plugin bundles in `plugins/*/dist/*.js` are **checked into git**. CI fails if `yarn build` produces any change to these files that is not committed. **Always run `yarn build` and commit any resulting `plugins/*/dist/` changes** after modifying plugin source.

`.yarnrc.yml` loads the built dev bundles (`plugins/*/dist/plugin.dev.js`) as a lightweight E2E test. If a bundle is broken or missing, **many `yarn` commands themselves may fail to start**. If you hit plugin-load errors, temporarily comment out the local plugins in `.yarnrc.yml` and run `yarn build` to regenerate the bundles.

### Commands (run from repo root unless noted)

All commands below were validated and pass. Run them in this order to reproduce CI:

1. `yarn --immutable` — install deps. Required first.
2. `yarn format:check` — Prettier check. Fix with `yarn format`.
3. `yarn syncpack lint` — checks dependency version consistency across `package.json` files.
4. `yarn build` — runs `yarn tsc -b` (typecheck, no emit) then `node scripts/build.ts --all` (generates minified `dist/plugin.js` and dev `dist/plugin.dev.js` for each plugin).
5. `yarn test` — `vitest run` across all `plugins/*` projects (~20 tests, sub-second).

Other scripts:

- Per-plugin: `cd plugins/<name> && yarn build` / `yarn test` build or test just that plugin.
- `yarn format` — auto-format all files with Prettier.

### Build details and constraints

- **Bundle size limits are enforced** in `scripts/build.ts` (`maxKbDev = 75`, `maxKbMin = 30`). The build **exits with an error** if a bundle exceeds its limit. If you legitimately increase size, review the diff first, then bump the limit in that file.
- `yarn tsc -b` is a `--build` (project references) invocation; it uses `tsconfig.json` → references `plugins/engines`, `plugins/npmrc`, `scripts`. `noEmit: true` — TypeScript only typechecks; bundling is done separately.
- `scripts/build.ts` uses esbuild to create `plugins/*/dist/` min and dev bundles. (Logic borrowed from `@yarnpkg/builder` but changed some settings.)

### Pre-commit / CI checks

CI is `.github/workflows/pr.yml` (PRs and pushes to `main`), matrix on `ubuntu-latest` and `windows-latest`. It runs the same sequence as above, then a **check-for-modified-files** step that fails if `yarn build` produced any uncommitted change. Before pushing, run the sequence and confirm `git status --porcelain` is clean.

## Project layout

Repo root files:

- `package.json` — root scripts, workspaces (`plugins/*`), devDependencies, `resolutions` (each explained in a `rationale` block).
- `tsconfig.json` — solution file (project references only). `tsconfig.base.json` — shared compiler options (strict, `module: node16`, `noEmit`).
- `vitest.config.mts` — top-level config pointing at `plugins/*` projects.

Directories:

- `plugins/engines/` and `plugins/npmrc/` — each has `package.json` (`main: ./src/index.ts`, scripts delegate to `../../scripts/`), `tsconfig.json` (extends base, `include: ["src"]`), `vitest.config.mts`, `src/` (source + `*.test.ts`), `dist/` (checked-in bundles), and `README.md`.
- `scripts/` — ESM `.ts` build tooling (`type: module`, own `tsconfig.json`): notably `build.ts`, `release.ts`.
- `patches/` — vendored source for the `@npmcli/config` patch (referenced by `plugins/npmrc` via a Yarn patch protocol dependency). This is ignored by Prettier.

## Conventions

- Prettier config: `printWidth: 100`, `singleQuote: true`
- Keep imports in plugin `src/index.ts` minimal / type-only where possible — these plugins are parsed on **every** `yarn` command, so bundle size and startup cost matter.
- Releases are manual and should **not** be performed by an agent unless explicitly asked: `cd plugins/<name> && yarn release <major|minor|patch>`.
