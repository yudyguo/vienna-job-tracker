/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

function xdgAppPaths(name = "app") {
  const base = path.join(process.cwd(), ".workflow-data", name);
  const api = {
    cache: () => path.join(base, "cache"),
    config: () => path.join(base, "config"),
    data: () => path.join(base, "data"),
    runtime: () => path.join(base, "runtime"),
    state: () => path.join(base, "state"),
    configDirs: () => [path.join(base, "config")],
    dataDirs: () => [path.join(base, "data")],
  };
  return api;
}

module.exports = xdgAppPaths;
