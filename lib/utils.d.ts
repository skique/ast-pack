declare type Deps = string[];
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
declare type GraphTree = ModuleInfoMap[];
/** 生成整个项目的依赖树 */
export declare function createDependencyGraph(entry: string): GraphTree;
export declare function pack(graph: GraphTree): string;
export {};
