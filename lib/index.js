#! /usr/bin/env node
"use strict";
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s)
            if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var path = require("path");
var fs = require("fs");
var _a = require("./utils"),
  createDependencyGraph = _a.createDependencyGraph,
  pack = _a.pack;
// 默认的配置
var defaultConfig = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
  },
};
// 拿到最终配置
var config = __assign(
  __assign({}, defaultConfig),
  require(path.resolve("./kkb.config.js"))
);
var graph = createDependencyGraph(config.entry);
var template = pack(graph);
fs.writeFileSync("./dist/" + config.output.filename, template);
//# sourceMappingURL=index.js.map
