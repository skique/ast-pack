const fs = require("fs"); // 文件流
const path = require("path"); // 路径解析
const parser = require("@babel/parser"); // babel解析，用于分析源代码，产出 AST；
const traverse = require("@babel/traverse").default; // babel遍历，用于遍历 AST，找到 import 声明；
const babel = require("@babel/core"); // babel核心，用于编译，将源代码编译为 ES5；
const resolve = require("resolve").sync; // 用于获取依赖的绝对路径。

type Deps = string[];

interface ModuleInfo {
  id: number;
  filePath: string;
  deps: Deps;
  code: string;
}

interface ModuleInfoMap extends ModuleInfo {
  map?: {
    [prop: string]: number;
  };
}

type GraphTree = ModuleInfoMap[];

let ID: number = 0;

/** 维护一个全局 ID，并通过遍历 AST，访问ImportDeclaration节点，收集依赖到deps数组中 */
function createModuleInfo(filePath: string): ModuleInfo {
  // 读取模块源代码
  const content = fs.readFileSync(filePath, "utf-8");
  // 对源代码进行 AST 产出
  const ast = parser.parse(content, {
    sourceType: "module",
  });
  // 相关模块依赖数组
  const deps: Deps = [];
  // 遍历模块 AST，将依赖推入 deps 数组中
  traverse(ast, {
    // @ts-ignore
    ImportDeclaration: ({ node }) => {
      deps.push(node.source.value);
    },
  });
  const id = ID++;
  // 编译为 ES5
  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ["@babel/preset-env"],
  });
  return {
    id, // 该模块对应 ID；
    filePath, // 该模块路径；
    deps, // 该模块的依赖数组；
    code, // 该模块经过 Babel 编译后的代码。
  };
}

/** 生成整个项目的依赖树 */
export function createDependencyGraph(entry: string): GraphTree {
  // 获取模块信息
  const entryInfo = createModuleInfo(entry);
  // 项目依赖树
  const graphArr: GraphTree = [];
  graphArr.push(entryInfo);
  // 以入口模块为起点，遍历整个项目依赖的模块，并将每个模块信息维护到 graphArr 中
  for (const module of graphArr) {
    module.map = {};
    module.deps.forEach((depPath) => {
      const baseDir = path.dirname(module.filePath);
      const moduleDepPath = resolve(depPath, { baseDir });
      const moduleInfo = createModuleInfo(moduleDepPath);
      graphArr.push(moduleInfo);
      // @ts-ignore
      module.map[depPath] = moduleInfo.id;
    });
  }
  return graphArr;
}

/* 生成打包后代码 */
export function pack(graph: GraphTree) {
  // 创建一个对应每个模块的模板对象，每个模块都有factory和map属性
  // 在factory对应的内容中，我们包裹模块代码，并注入exports和require两个参数
  // map为这个模块所需要的依赖
  const moduleArgArr = graph.map((module) => {
    return `${module.id}: {
            factory: (exports, require) => {
                ${module.code}
            },
            map: ${JSON.stringify(module.map)}
        }`;
  });
  // 构造了一个 IIFE 风格的代码区块，用于将依赖树中的代码串联在一起
  const iifeBundler = `(function(modules){
        const require = id => {
            const {factory, map} = modules[id];
            const localRequire = requireDeclarationName => require(map[requireDeclarationName]); 
            const module = {exports: {}};
            factory(module.exports, localRequire); 
            return module.exports; 
        }
        require(0);
        
        })({${moduleArgArr.join()}})
    `;
  return iifeBundler;
}
