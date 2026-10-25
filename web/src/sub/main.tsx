import { tgMode } from "./net";

// The Mini App has a look of its own (app/): each loads only its own styles. Not a ternary
// or an if/else of the two imports: the minifier merges those into one preload call with
// the browser page's styles alone, and the Mini App comes out unstyled.
const pages = { app: () => import("./app"), browser: () => import("./browser") };
void pages[tgMode ? "app" : "browser"]();
