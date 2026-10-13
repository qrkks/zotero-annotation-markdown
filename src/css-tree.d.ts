// css-tree exposes runtime submodules; DefinitelyTyped describes the root API.
// Re-export those signatures without pulling the full lexer into our bundle.
declare module "css-tree/parser" {
  import { parse } from "css-tree";
  export default parse;
}
declare module "css-tree/walker" {
  import { walk } from "css-tree";
  export default walk;
}
