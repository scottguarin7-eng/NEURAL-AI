import { QuantumRenderer } from "./quantum-renderer.mjs";

let renderer;

self.onmessage = ({ data }) => {
  try {
    switch (data.type) {
      case "init":
        renderer = new QuantumRenderer(data.canvas);
        renderer.resize(data.viewport);
        renderer.update(data.state);
        self.postMessage({ type: "initialized" });
        break;
      case "resize": renderer?.resize(data.viewport); break;
      case "state": renderer?.update(data.state); break;
      case "discharge": renderer?.discharge(data.x, data.y, data.count); break;
      case "burst": renderer?.burst(data.x, data.y, data.count); break;
      case "dispose": renderer?.destroy(); self.close(); break;
    }
  } catch {
    renderer?.destroy();
    self.postMessage({ type: "unavailable" });
  }
};

const supported = typeof OffscreenCanvas !== "undefined" && typeof requestAnimationFrame === "function";
self.postMessage({ type: supported ? "ready" : "unavailable" });
