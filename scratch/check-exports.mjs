globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({
    getContext: () => ({})
  }),
  getElementsByTagName: () => []
};
globalThis.navigator = {
  userAgent: "node"
};
import * as xeokit from "../lib/xeokit/xeokit-sdk.min.es.js";
console.log("Keys:", Object.keys(xeokit).filter(k => k.includes("Measur") || k.includes("Snap") || k.includes("Lens") || k.includes("Distance") || k.includes("Angle") || k.includes("Area")));
