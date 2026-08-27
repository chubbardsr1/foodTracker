/** Installs the extensionless-TypeScript resolver for `node --test`. */
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
