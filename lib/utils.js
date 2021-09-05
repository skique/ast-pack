"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pack = exports.createDependencyGraph = void 0;
var fs = require("fs"); // 文件流
var path = require("path"); // 路径解析
var parser = require("@babel/parser"); // babel解析，用于分析源代码，产出 AST；
var traverse = require("@babel/traverse").default; // babel遍历，用于遍历 AST，找到 import 声明；
var babel = require("@babel/core"); // babel核心，用于编译，将源代码编译为 ES5；
var resolve = require("resolve").sync; // 用于获取依赖的绝对路径。
var ID = 0;
/** 维护一个全局 ID，并通过遍历 AST，访问ImportDeclaration节点，收集依赖到deps数组中 */
function createModuleInfo(filePath) {
  // 读取模块源代码
  var content = fs.readFileSync(filePath, "utf-8");
  // 对源代码进行 AST 产出
  var ast = parser.parse(content, {
    sourceType: "module",
  });
  // 相关模块依赖数组
  var deps = [];
  // 遍历模块 AST，将依赖推入 deps 数组中
  traverse(ast, {
    // @ts-ignore
    ImportDeclaration: function (_a) {
      var node = _a.node;
      deps.push(node.source.value);
    },
  });
  var id = ID++;
  // 编译为 ES5
  var code = babel.transformFromAstSync(ast, null, {
    presets: ["@babel/preset-env"],
  }).code;
  return {
    id: id,
    filePath: filePath,
    deps: deps,
    code: code, // 该模块经过 Babel 编译后的代码。
  };
}
/** 生成整个项目的依赖树 */
function createDependencyGraph(entry) {
  // 获取模块信息
  var entryInfo = createModuleInfo(entry);
  // 项目依赖树
  var graphArr = [];
  graphArr.push(entryInfo);
  var _loop_1 = function (module_1) {
    module_1.map = {};
    module_1.deps.forEach(function (depPath) {
      var baseDir = path.dirname(module_1.filePath);
      var moduleDepPath = resolve(depPath, { baseDir: baseDir });
      var moduleInfo = createModuleInfo(moduleDepPath);
      graphArr.push(moduleInfo);
      // @ts-ignore
      module_1.map[depPath] = moduleInfo.id;
    });
  };
  // 以入口模块为起点，遍历整个项目依赖的模块，并将每个模块信息维护到 graphArr 中
  for (var _i = 0, graphArr_1 = graphArr; _i < graphArr_1.length; _i++) {
    var module_1 = graphArr_1[_i];
    _loop_1(module_1);
  }
  return graphArr;
}
exports.createDependencyGraph = createDependencyGraph;
function pack(graph) {
  var moduleArgArr = graph.map(function (module) {
    return (
      module.id +
      ": {\n            factory: (exports, require) => {\n                " +
      module.code +
      "\n            },\n            map: " +
      JSON.stringify(module.map) +
      "\n        }"
    );
  });
  var iifeBundler =
    "(function(modules){\n        const require = id => {\n            const {factory, map} = modules[id];\n            const localRequire = requireDeclarationName => require(map[requireDeclarationName]); \n            const module = {exports: {}};\n            factory(module.exports, localRequire); \n            return module.exports; \n        }\n        require(0);\n        \n        })({" +
    moduleArgArr.join() +
    "})\n    ";
  return iifeBundler;
}
exports.pack = pack;
//# sourceMappingURL=utils.js.map
