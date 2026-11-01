import { QuantumRenderer } from "./quantum-renderer.mjs";

export class NeuralMotion extends EventTarget {
  constructor() {
    super();
    this.root = document.documentElement;
    this.canvas = document.getElementById("quantumCanvas");
    this.hero = document.querySelector(".hero");
    this.orb = document.getElementById("orbStage");
    this.surfaces = [...document.querySelectorAll(".glass-panel, .glass-card")];
    this.rects = new Map();
    this.visibleSurfaces = new Set(this.surfaces.filter((surface) => !surface.closest("dialog")));
    this.glowingSurfaces = new Set();
    this.reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.pointerQuery = matchMedia("(hover: hover) and (pointer: fine)");
    this.pointer = { x: 0, y: 0, active: false };
    this.heroVisible = true;
    this.dialogOpen = false;
    this.pageActive = true;
    this.geometryDirty = true;
    this.viewportDirty = true;
    this.frameId = null;
    this.worker = null;
    this.renderer = null;
    this.workerReady = false;
    this.workerTransferred = false;
    this.tiltCard = null;
    this.events = new AbortController();
    this.options = { passive: true, signal: this.events.signal };
    this.flush = this.flush.bind(this);

    for (const panel of document.querySelectorAll(".glass-panel")) {
      const border = document.createElement("span");
      border.className = "electric-border";
      border.setAttribute("aria-hidden", "true");
      panel.append(border);
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.classList.contains("glass-panel")) {
          const size = entry.borderBoxSize?.[0];
          const width = size?.inlineSize || entry.contentRect.width;
          const height = size?.blockSize || entry.contentRect.height;
          entry.target.style.setProperty("--border-size", `${Math.ceil(Math.hypot(width, height)) + 4}px`);
        }
      }
      this.invalidate();
    });
    this.surfaces.forEach((surface) => this.resizeObserver.observe(surface));

    this.intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const surface = entry.target;
        surface.classList.toggle("is-offscreen", !entry.isIntersecting);
        if (entry.isIntersecting) this.visibleSurfaces.add(surface);
        else this.visibleSurfaces.delete(surface);
        if (surface === this.hero) this.heroVisible = entry.isIntersecting;
      }
      this.syncState();
      this.invalidate();
    });
    this.surfaces.forEach((surface) => this.intersectionObserver.observe(surface));

    window.addEventListener("pointermove", (event) => {
      if (!this.pointerQuery.matches || event.pointerType === "touch" || !this.running) return;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
      const nextCard = event.target instanceof Element ? event.target.closest(".tilt-card") : null;
      if (this.tiltCard !== nextCard) {
        this.resetTilt();
        this.tiltCard = nextCard;
      }
      this.schedule();
    }, this.options);
    document.documentElement.addEventListener("pointerleave", () => this.clearPointer(), this.options);
    window.addEventListener("blur", () => this.clearPointer(), this.options);
    window.addEventListener("resize", () => { this.viewportDirty = true; this.invalidate(); }, this.options);
    window.visualViewport?.addEventListener("resize", () => { this.viewportDirty = true; this.invalidate(); }, this.options);
    document.addEventListener("scroll", () => this.invalidate(), { ...this.options, capture: true });
    document.addEventListener("visibilitychange", () => this.syncState(), this.options);
    this.reducedQuery.addEventListener("change", () => this.syncState(), this.options);
    this.pointerQuery.addEventListener("change", () => this.clearPointer(), this.options);
    window.addEventListener("pagehide", () => { this.pageActive = false; this.syncState(); }, this.options);
    window.addEventListener("pageshow", () => { this.pageActive = true; this.syncState(); this.invalidate(); }, this.options);
    this.syncState();
    this.startRenderer();
    this.schedule();
  }

  get reducedMotion() { return this.reducedQuery.matches; }
  get running() { return this.pageActive && !document.hidden && !this.dialogOpen && !this.reducedMotion; }
  get heroActive() { return this.running && this.heroVisible; }

  viewport() { return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 }; }

  state() {
    return {
      running: this.running,
      reducedMotion: this.reducedMotion,
      heroVisible: this.heroVisible,
      mouse: { ...this.pointer },
      intensity: document.getElementById("lightningIntensity").value,
      orb: this.orbCenter || { x: innerWidth / 2, y: 240 },
    };
  }

  startRenderer() {
    if (typeof Worker === "undefined" || !this.canvas.transferControlToOffscreen) {
      this.useMainThread();
      return;
    }
    try {
      this.worker = new Worker(new URL("./quantum-worker.mjs", import.meta.url), { type: "module", name: "neural-plasma" });
      this.workerTimeout = setTimeout(() => this.useMainThread(), 2500);
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          try {
            const offscreen = this.canvas.transferControlToOffscreen();
            this.workerTransferred = true;
            this.worker.postMessage({ type: "init", canvas: offscreen, viewport: this.viewport(), state: this.state() }, [offscreen]);
          } catch { this.useMainThread(); }
        } else if (data.type === "initialized") {
          clearTimeout(this.workerTimeout);
          this.workerReady = true;
          this.canvas.dataset.renderer = "worker";
          this.send({ type: "state", state: this.state() });
          this.send({ type: "resize", viewport: this.viewport() });
        } else if (data.type === "unavailable") this.useMainThread();
      };
      this.worker.onerror = (event) => { event.preventDefault(); this.useMainThread(); };
    } catch { this.useMainThread(); }
  }

  useMainThread() {
    clearTimeout(this.workerTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    if (this.renderer) return;
    if (this.workerTransferred) {
      const replacement = this.canvas.cloneNode(false);
      this.canvas.replaceWith(replacement);
      this.canvas = replacement;
      this.workerTransferred = false;
    }
    try {
      this.renderer = new QuantumRenderer(this.canvas);
      this.renderer.resize(this.viewport());
      this.renderer.update(this.state());
      this.canvas.dataset.renderer = "main";
    } catch {
      this.canvas.dataset.renderer = "unavailable";
    }
  }

  send(message) {
    if (this.workerReady) this.worker.postMessage(message);
    else if (this.renderer) {
      switch (message.type) {
        case "state": this.renderer.update(message.state); break;
        case "resize": this.renderer.resize(message.viewport); break;
        case "discharge": this.renderer.discharge(message.x, message.y, message.count); break;
        case "burst": this.renderer.burst(message.x, message.y, message.count); break;
      }
    }
  }

  syncState() {
    const suspended = !this.pageActive || document.hidden || this.dialogOpen;
    this.root.classList.toggle("scene-suspended", suspended);
    this.root.classList.toggle("motion-reduced", this.reducedMotion);
    if (!this.running) this.clearPointer();
    this.send({ type: "state", state: this.state() });
    this.dispatchEvent(new Event("statechange"));
  }

  setDialogOpen(open) { this.dialogOpen = open; this.syncState(); this.invalidate(); }
  setIntensity() { this.send({ type: "state", state: this.state() }); }
  invalidate() { this.geometryDirty = true; this.schedule(); }
  schedule() { if (this.frameId === null) this.frameId = requestAnimationFrame(this.flush); }

  flush() {
    this.frameId = null;
    if (!this.pageActive || document.hidden) return;
    // Complete layout reads before any style writes; pointer events reuse these rectangles.
    if (this.geometryDirty) {
      for (const surface of this.visibleSurfaces) this.rects.set(surface, surface.getBoundingClientRect());
      const rect = this.orb.getBoundingClientRect();
      this.orbCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.geometryDirty = false;
    }
    if (this.viewportDirty) {
      this.send({ type: "resize", viewport: this.viewport() });
      this.viewportDirty = false;
    }
    this.send({ type: "state", state: this.state() });
    if (!this.pointer.active || !this.running) return;
    for (const surface of this.visibleSurfaces) {
      const rect = this.rects.get(surface);
      if (!rect || !rect.width) continue;
      const x = this.pointer.x - rect.left;
      const y = this.pointer.y - rect.top;
      const nearby = x > -480 && x < rect.width + 480 && y > -480 && y < rect.height + 480;
      if (nearby) {
        surface.style.setProperty("--glare-x", `${Math.round(x)}px`);
        surface.style.setProperty("--glare-y", `${Math.round(y)}px`);
        surface.classList.add("has-glare");
        this.glowingSurfaces.add(surface);
      } else if (this.glowingSurfaces.delete(surface)) surface.classList.remove("has-glare");
    }
    if (this.tiltCard) {
      const rect = this.rects.get(this.tiltCard);
      if (rect?.width) {
        const x = (this.pointer.x - rect.left) / rect.width - 0.5;
        const y = (this.pointer.y - rect.top) / rect.height - 0.5;
        this.tiltCard.style.transform = `perspective(900px) rotateX(${-y * 14}deg) rotateY(${x * 14}deg) translateY(-6px) scale(1.03)`;
      }
    }
  }

  resetTilt() { if (this.tiltCard) this.tiltCard.style.transform = ""; this.tiltCard = null; }
  clearPointer() {
    this.pointer.active = false;
    this.resetTilt();
    for (const surface of this.glowingSurfaces) surface.classList.remove("has-glare");
    this.glowingSurfaces.clear();
    this.send({ type: "state", state: { mouse: { ...this.pointer } } });
  }
  discharge(x = null, y = null, count = 4) { this.send({ type: "discharge", x, y, count }); }
  burst(x, y, count = 18) { this.send({ type: "burst", x, y, count }); }

  destroy() {
    this.events.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    clearTimeout(this.workerTimeout);
    this.worker?.terminate();
    this.renderer?.destroy();
  }
}
