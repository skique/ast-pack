## 解析 webpack 打包器原理

虽然 Webpack 看上去无所不能，但从其本质上来说，Webpack 实质就是一个“前端模块打包器”。前端模块打包器做的事情很简单：它帮助开发者将 JavaScript 模块（各种类型的模块化规范）打包为一个或多个 JavaScript 脚本文件。

### 为什么需要打包器

- 不是所有浏览器都直接支持 JavaScript 规范；
- 前端需要管理依赖脚本，把控不同脚本加载的顺序；
- 前端需要按顺序加载不同类型的静态资源。

总之，打包器的需求就是前端“刚需”，实现上述打包需要也并不简单，需要考虑：

- 如何维护不同脚本的打包顺序，保证 bundle.js 的可用性；
- 如何避免不同脚本、不同模块的命名冲突；
- 在打包过程中，如何确定真正需要的脚本，而不将没有用到的脚本排除在 bundle.js 之外？

事实上，虽然当前 Webpack 依靠 loader 机制实现了对于不同类型资源的解析和打包，依靠插件机制实现了第三方介入编译构建的过程，但究其本质，Webpack 只是一个“无所不能”的打包器，实现了：
`a.js + b.js + c.js. => bundle.js`的能力。

### webpack 打包器是怎么样起作用的

我们以 ESM 模块化规范举例。假设我们有：

- circle.js 模块求圆形面积；
- square.js 模块求正方形面积；
- app.js 模块作为主模块。

```
// filename: circle.js
const PI = 3.141;
export default function area(radius) {
  return PI * radius * radius;
}
// filename: square.js
export default function area(side) {
  return side * side;
}
// filename: app.js
import squareArea from './square';
import circleArea from './circle';
console.log('Area of square: ', squareArea(5));
console.log('Area of circle', circleArea(5));
```

经过 Webpack 打包之后，我们用 bundle.js 来表示 Webpack 处理结果（精简并可读化处理后）：

```
// filename: bundle.js
const modules = {
  'circle.js': function(exports, require) {
    const PI = 3.141;
    exports.default = function area(radius) {
      return PI * radius * radius;
    }
  },
  'square.js': function(exports, require) {
    exports.default = function area(side) {
      return side * side;
    }
  },
  'app.js': function(exports, require) {
    const squareArea = require('square.js').default;
    const circleArea = require('circle.js').default;
    console.log('Area of square: ', squareArea(5))
    console.log('Area of circle', circleArea(5))
  }
}
webpackBundle({
  modules,
  entry: 'app.js'
});
```

如上代码，我们维护了 modules 变量，存储了不同模块信息，这个 map 中，key 为模块路径名，value 为一个被 wrapped 过的模块函数，我们先称之为 module factory function，该函数形如：

```
function(exports, require) {
	// 模块内容
}
```

这样做是为每个模块提供 exports 和 require 能力，同时**保证了每个模块都处于一个隔离的函数作用域范围**。

有了 modules 变量还不够，我们依赖 webpackBundle 方法，将所有内容整合在一起。webpackBundle 方法接收 modules 模块信息以及一个入口脚本。代码如下

```
function webpackBundle({ modules, entry }) {
  const moduleCache = {};

  const require = moduleName => {
    // 如果已经解析并缓存过，直接返回缓存内容
    if (moduleCache[moduleName]) {
      return moduleCache[moduleName];
    }

    const exports = {};
    // 这里是为了防止循环引用
    moduleCache[moduleName] = exports;
    // 执行模块内容，如果遇见了 require 方法，则继续递归执行 require 方法
    modules[moduleName](exports, require);

    return moduleCache[moduleName];
  };
  require(entry);
}
```

上述代码中需要注意：webpackBundle 方法中声明的 require 方法和 CommonJS 规范中的 require 是两回事，该 require 方法是 Webpack 自己实现的模块化解决方案。

我们通过下图来总结一下 Webpack 风格的打包器原理和流程：
![](https://cdn.nlark.com/yuque/0/2021/png/638254/1630742932675-6a0875cf-2ff1-4600-9ebb-55c8252d28dd.png?date=1630742934165)

整体来看 Webpack 理念：

- 使用了 module map，维护项目中的依赖关系；
- 使用了包裹函数，对每个模块进行包裹；
- 使用了一个“runtime”方法（这里举例为 webpackBundle），最终合成 bundle 内容。

### 代码实现

本项目依剧 webpack 打包器原理手写了一个简易的打包器，引入 TypeScript 做类型声明，使得代码结构更加清晰

1. 收集依赖到 deps 数组中

```
/** 维护一个全局 ID，并通过遍历 AST，访问ImportDeclaration节点，收集依赖到deps数组中 */
function createModuleInfo(filePath: string):ModuleInfo {
    // 读取模块源代码
    const content = fs.readFileSync(filePath, "utf-8");
    // 对源代码进行 AST 产出
    const ast = parser.parse(content, {
        sourceType: "module"
    });
    // 相关模块依赖数组
    const deps: Deps = [];
    // 遍历模块 AST，将依赖推入 deps 数组中
    traverse(ast, {
        // @ts-ignore
        ImportDeclaration: ({ node }) => {
          deps.push(node.source.value);
        }
    });
    const id = ID++;
    // 编译为 ES5
    const { code } = babel.transformFromAstSync(ast, null, {
        presets: ["@babel/preset-env"]
    });
    return {
        id, // 该模块对应 ID；
        filePath, // 该模块路径；
        deps, // 该模块的依赖数组；
        code // 该模块经过 Babel 编译后的代码。
    };
}
```

2. 生成整个项目的依赖树

```
/** 生成整个项目的依赖树 */
export function createDependencyGraph(entry: string):GraphTree {
    // 获取模块信息
    const entryInfo = createModuleInfo(entry);
    // 项目依赖树
    const graphArr: GraphTree = [];
    graphArr.push(entryInfo);
    // 以入口模块为起点，遍历整个项目依赖的模块，并将每个模块信息维护到 graphArr 中
    for (const module of graphArr) {
        module.map = {};
        module.deps.forEach(depPath => {
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
```

3. 生成打包后代码

```
/* 生成打包后代码 */
export function pack(graph: GraphTree) {
    // 创建一个对应每个模块的模板对象，每个模块都有factory和map属性
    // 在factory对应的内容中，我们包裹模块代码，并注入exports和require两个参数
    // map为这个模块所需要的依赖
    const moduleArgArr = graph.map(module => {
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
```

关于这里用到的 IIFE 风格的代码区块，更细致的分析：

- 使用 IIFE 的方式，来保证模块变量不会影响到全局作用域。
- 构造好的项目依赖树（Dependency Graph）数组，将会作为名为 modules 的行参，传递给 IIFE。
- 我们构造了 require(id)方法，这个方法的意义在于：
- 通过 require(map[requireDeclarationName])方式，按顺序递归调用各个依赖模块；
- 通过调用 factory(module.exports, localRequire)执行模块相关代码；
- 该方法最终返回 module.exports 对象，module.exports 最初值为空对象（{exports: {}}），但在一次次调用 factory()函数后，module.exports 对象内容已经包含了模块对外暴露的内容了。

具体代码实现见 src 目录下的 index 文件

### npm link 本地调试

package.json

```
    ...
    "bin": {
        "pack": "lib/index.js" // 指定了 CLI 命令可执行文件指向的是转译后的 lib/index.js
    },
    "scripts": { // ts代码转译
        "build": "tsc -p tsconfig.prod.json"
    },
    ...
```

1. ts 代码转译，生成 lib 目录  
   `npm run build`
2. (模块包） 目录中，执行 npm link，这样 npm link 通过链接目录和可执行文件，实现 npm 包命令的全局可执行。  
   `npm link`
3. 在 project 1 （项目）中创建链接，执行 npm link npm-package-1 命令时，它就会去 /usr/local/lib/node_modules/ 这个路径下寻找是否有这个包，如果有就建立软链接。  
   `npm link bundler-playground`
4. 调试结束后可以执行 npm unlink 以取消关联。  
   `npm unlink`

最终在本地文件生成了这样的打包后文件

```
(function(modules){
        const require = id => {
            const {factory, map} = modules[id];
            const localRequire = requireDeclarationName => require(map[requireDeclarationName]);
            const module = {exports: {}};
            factory(module.exports, localRequire);
            return module.exports;
        }
        require(0);
})({0: {
    factory: (exports, require) => {
        "use strict";

        var sayHi = require('./a.js');

        sayHi('webpack');
    },
    map: {}
}})
```

我们的打包器运行正常！
