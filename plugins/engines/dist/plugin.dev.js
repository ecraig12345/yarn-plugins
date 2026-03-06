/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-engines",
factory: function (require) {
"use strict";
var plugin = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    default: () => src_default
  });
  var import_core = __require("@yarnpkg/core");
  var import_fslib = __require("@yarnpkg/fslib");
  var import_semver2 = __toESM(__require("semver"));

  // src/ranges.ts
  var import_semver = __toESM(__require("semver"));
  function parseRange(range) {
    try {
      const rangeObj = new import_semver.default.Range(range || "");
      return rangeObj.range || rangeObj.raw === "*" ? rangeObj : null;
    } catch {
      return null;
    }
  }
  function isRangeSatisfied(params) {
    const { repoRange, manifestRange } = params;
    const manifestSemver = parseRange(manifestRange);
    return !manifestSemver || import_semver.default.subset(repoRange, manifestSemver);
  }

  // src/index.ts
  var configurationMap = {
    engines: {
      description: "Config for yarn-plugin-engines",
      type: import_core.SettingsType.SHAPE,
      properties: {
        ignorePackages: {
          description: "List of packages to ignore when validating engines.node (also ignores their dependencies)",
          type: import_core.SettingsType.STRING,
          isArray: true,
          default: []
        },
        includeDevDependencies: {
          description: "Whether to include local dev dependencies and private packages when validating engines.node",
          type: import_core.SettingsType.BOOLEAN,
          default: false
        }
      }
    }
  };
  var validateProjectAfterInstall = async (project, report) => {
    const nodeFs = new import_fslib.NodeFS();
    const enginesConfig = project.configuration.get("engines");
    const ignorePackages = enginesConfig?.get("ignorePackages") || [];
    const includeDevDependencies = !!enginesConfig?.get("includeDevDependencies");
    const reportError = (message) => {
      report.reportError(0, `[yarn-plugin-engines] ${String(message)}`);
    };
    const rangeStr = project.topLevelWorkspace.manifest.raw.engines?.node;
    if (!rangeStr) {
      reportError("Missing package.json engines.node field");
      return;
    }
    const repoRange = parseRange(rangeStr);
    if (!repoRange) {
      reportError(`Invalid semver range "${rangeStr}" in package.json engines.node`);
      return;
    }
    if (!import_semver2.default.satisfies(process.versions.node, repoRange)) {
      reportError(
        `The current Node version ${process.versions.node} does not satisfy ${repoRange.raw}`
      );
      return;
    }
    const linker = project.configuration.getLinkers().find((linker2) => linker2.supportsPackage(project.workspaces[0].anchoredPackage, { project }));
    if (!linker) {
      reportError("No supported linker found");
      return;
    }
    const dependenciesQueue = [];
    const processedDependencies = /* @__PURE__ */ new Set();
    const optionalDependencies = /* @__PURE__ */ new Set();
    const enqueueDependency = (descriptor, manifest) => {
      const pkgName = import_core.structUtils.stringifyIdent(descriptor);
      if (descriptor.range.startsWith("workspace:") || ignorePackages.includes(pkgName) || processedDependencies.has(descriptor.descriptorHash) || dependenciesQueue.includes(descriptor.descriptorHash)) {
        return;
      }
      dependenciesQueue.push(descriptor.descriptorHash);
      if (manifest.raw.optionalDependencies?.[pkgName] || manifest.raw.dependenciesMeta?.[pkgName]?.optional === true || manifest.raw.peerDependenciesMeta?.[pkgName]?.optional === true) {
        optionalDependencies.add(descriptor.descriptorHash);
      }
    };
    for (const workspace of project.workspaces) {
      if (workspace.manifest.private && !includeDevDependencies) continue;
      const wsPkg = project.storedPackages.get(workspace.anchoredLocator.locatorHash);
      if (!wsPkg) continue;
      for (const desc of wsPkg.dependencies.values()) {
        if (includeDevDependencies || workspace.manifest.dependencies.has(desc.identHash)) {
          enqueueDependency(desc, workspace.manifest);
        }
      }
      for (const desc of wsPkg.peerDependencies.values()) {
        enqueueDependency(desc, workspace.manifest);
      }
    }
    const unsatisfiedNodeReqs = {};
    while (dependenciesQueue.length) {
      const descriptorHash = dependenciesQueue.shift();
      processedDependencies.add(descriptorHash);
      const desc = project.storedDescriptors.get(descriptorHash);
      const prettyDesc = desc ? import_core.structUtils.prettyDescriptor(project.configuration, desc) : descriptorHash;
      const locatorHash = project.storedResolutions.get(descriptorHash);
      if (!locatorHash) {
        if (!optionalDependencies.has(descriptorHash)) {
          reportError(`Could not find a resolution for descriptor ${prettyDesc}`);
        }
        continue;
      }
      const pkg = project.storedPackages.get(locatorHash);
      if (!pkg) {
        if (!optionalDependencies.has(descriptorHash)) {
          reportError(`Could not find a package for descriptor ${prettyDesc}`);
        }
        continue;
      }
      let location;
      try {
        location = await linker.findPackageLocation(pkg, { project, report });
      } catch (e) {
        if (!optionalDependencies.has(descriptorHash)) {
          reportError(e.message || e);
        }
        continue;
      }
      const manifest = await import_core.Manifest.tryFind(location, { baseFs: nodeFs });
      if (!manifest) {
        reportError(`Could not find package.json for ${prettyDesc} at ${location}`);
        continue;
      }
      const manifestRange = manifest.raw.engines?.node;
      if (manifestRange && !isRangeSatisfied({ repoRange, manifestRange })) {
        unsatisfiedNodeReqs[manifestRange] ??= /* @__PURE__ */ new Set();
        unsatisfiedNodeReqs[manifestRange].add(import_core.structUtils.prettyLocator(project.configuration, pkg));
      }
      for (const dep of pkg.dependencies.values()) {
        enqueueDependency(dep, manifest);
      }
    }
    for (const [nodeReq, pkgs] of Object.entries(unsatisfiedNodeReqs)) {
      reportError(
        `The following packages require Node ${nodeReq}, which does not match the repo requirement ${repoRange.raw}:
` + [...pkgs].sort().map((pkg) => `  - ${pkg}`).join("\n")
      );
    }
  };
  var plugin = {
    hooks: { validateProjectAfterInstall },
    configuration: configurationMap
  };
  var src_default = plugin;
  return __toCommonJS(src_exports);
})();
return plugin;
}
};
