#! /usr/bin/env node
const path = require("path");
const fs = require("fs");
const { createDependencyGraph, pack } = require("./utils");

// 默认的配置
const defaultConfig = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
  },
};
// 拿到最终配置
const config = {
  ...defaultConfig,
  ...require(path.resolve("./kkb.config.js")),
};
// 生成依赖树
const graph = createDependencyGraph(config.entry);
// 生成打包后的代码
const template = pack(graph);
// 写入到输出文件
fs.writeFileSync("./dist/" + config.output.filename, template);
