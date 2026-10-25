import { tgMode } from "./net";

// The Mini App has a look of its own (app/): each loads only its own styles.
void (tgMode ? import("./app") : import("./browser"));
