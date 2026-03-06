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
  var import_semver = __toESM(__require("semver"));
  var validateProjectAfterInstall = async (project, report) => {
    const nodeFs = new import_fslib.NodeFS();
    const reportError = (message) => {
      report.reportError(0, `[yarn-plugin-engines] ${String(message)}`);
    };
    const linker = project.configuration.getLinkers().find((linker2) => linker2.supportsPackage(project.workspaces[0].anchoredPackage, { project }));
    if (!linker) {
      reportError("No supported linker found");
      return;
    }
    const repoNodeReq = project.topLevelWorkspace.manifest.raw.engines?.node;
    const repoNodeMin = repoNodeReq && import_semver.default.minVersion(repoNodeReq)?.toString();
    if (!repoNodeMin) {
      reportError("Could not find engines.node requirement in the top-level package.json");
      return;
    }
    const neededDependencies = [];
    const processedExternalDependencies = /* @__PURE__ */ new Set();
    const optionalDependencies = /* @__PURE__ */ new Set();
    const enqueueDependency = (descriptor, manifest) => {
      if (descriptor.range.startsWith("workspace:") || processedExternalDependencies.has(descriptor.descriptorHash) || neededDependencies.includes(descriptor.descriptorHash)) {
        return;
      }
      neededDependencies.push(descriptor.descriptorHash);
      const pkgName = import_core.structUtils.stringifyIdent(descriptor);
      if (manifest.raw.optionalDependencies?.[pkgName] || manifest.raw.dependenciesMeta?.[pkgName]?.optional === true || manifest.raw.peerDependenciesMeta?.[pkgName]?.optional === true) {
        optionalDependencies.add(descriptor.descriptorHash);
      }
    };
    for (const workspace of project.workspaces) {
      if (workspace.manifest.private) continue;
      const wsPkg = project.storedPackages.get(workspace.anchoredLocator.locatorHash);
      if (!wsPkg) continue;
      for (const desc of wsPkg.dependencies.values()) {
        if (workspace.manifest.dependencies.has(desc.identHash)) {
          enqueueDependency(desc, workspace.manifest);
        }
      }
      for (const desc of wsPkg.peerDependencies.values()) {
        enqueueDependency(desc, workspace.manifest);
      }
    }
    const unsatisfiedNodeReqs = {};
    while (neededDependencies.length) {
      const descriptorHash = neededDependencies.shift();
      if (processedExternalDependencies.has(descriptorHash)) {
        continue;
      }
      processedExternalDependencies.add(descriptorHash);
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
      if (manifest.raw.engines?.node) {
        const prettyPkg = import_core.structUtils.prettyLocator(project.configuration, pkg);
        const minVersion = import_semver.default.minVersion(manifest.raw.engines.node)?.toString();
        if (minVersion && import_semver.default.gt(minVersion, repoNodeMin)) {
          unsatisfiedNodeReqs[minVersion] ??= /* @__PURE__ */ new Set();
          unsatisfiedNodeReqs[minVersion].add(prettyPkg);
        }
      }
      for (const dep of pkg.dependencies.values()) {
        enqueueDependency(dep, manifest);
      }
    }
    for (const [nodeReq, pkgs] of Object.entries(unsatisfiedNodeReqs)) {
      reportError(
        `The following packages require Node ${nodeReq}, which is higher than the repo minimum ${repoNodeMin}:
` + [...pkgs].sort().map((pkg) => `  - ${pkg}`).join("\n")
      );
    }
  };
  var plugin = {
    hooks: { validateProjectAfterInstall }
  };
  var src_default = plugin;
  return __toCommonJS(src_exports);
})();
return plugin;
}
};
