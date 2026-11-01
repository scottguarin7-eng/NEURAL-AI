const TAU = Math.PI * 2;
const FRAME_SECONDS = 1 / 60;
export const PARTICLE_COUNT = 55;
export const MAX_BOLTS = 32;
export const MAX_SPARKS = 192;
export const MAX_TEXTURE_PIXELS = 4_000_000;

export function canvasPixelRatio(width, height, deviceRatio = 1) {
  return Math.min(Math.max(deviceRatio, 1), 2, Math.sqrt(2_000_000 / Math.max(1, width * height)));
}

function createSurface(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export class QuantumRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!this.context) throw new Error("Canvas 2D is unavailable.");
    this.surface = options.createSurface || createSurface;
    this.random = options.random || Math.random;
    this.requestFrame = options.requestFrame || ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame || ((id) => cancelAnimationFrame(id));
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.frameId = null;
    this.lastTime = null;
    this.running = false;
    this.reducedMotion = false;
    this.heroVisible = true;
    this.intensity = "normal";
    this.orb = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0, active: false };
    this.bolts = [];
    this.sparks = [];
    this.sparkPool = [];
    this.sprites = new Map();
    this.texturePixels = 0;
    this.connections = Array.from({ length: 8 }, () => []);
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: this.random(),
      y: this.random(),
      radius: this.random() * 2 + 0.6,
      vx: (this.random() - 0.5) * 27,
      vy: (this.random() - 0.5) * 27,
      hue: this.random() > 0.5 ? 186 : 275,
      sprite: null,
    }));
    this.tick = this.tick.bind(this);
  }

  resize({ width, height, dpr = 1 }) {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    const ratio = canvasPixelRatio(nextWidth, nextHeight, dpr);
    if (nextWidth === this.width && nextHeight === this.height && ratio === this.ratio) return;
    for (const particle of this.particles) {
      particle.x = particle.x / this.width * nextWidth;
      particle.y = particle.y / this.height * nextHeight;
    }
    this.width = nextWidth;
    this.height = nextHeight;
    this.ratio = ratio;
    this.canvas.width = Math.round(nextWidth * ratio);
    this.canvas.height = Math.round(nextHeight * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.sprites.clear();
    for (const particle of this.particles) {
      particle.sprite = this.glowSprite(particle.hue, particle.radius, false);
    }
    for (const spark of this.sparks) spark.sprite = this.glowSprite(spark.hue, spark.radius, true);
    this.draw();
  }

  update(data) {
    if (data.orb) this.orb = data.orb;
    if (data.mouse) this.mouse = data.mouse;
    if (data.intensity) this.intensity = data.intensity;
    if (typeof data.heroVisible === "boolean") this.heroVisible = data.heroVisible;
    if (typeof data.reducedMotion === "boolean") {
      this.reducedMotion = data.reducedMotion;
      if (this.reducedMotion) {
        while (this.bolts.length) this.removeBolt(0);
        this.sparkPool.push(...this.sparks.splice(0));
      }
    }
    if (typeof data.running === "boolean") this.setRunning(data.running && !this.reducedMotion);
  }

  setRunning(running) {
    this.running = running;
    if (!running) {
      if (this.frameId !== null) this.cancelFrame(this.frameId);
      this.frameId = null;
      this.lastTime = null;
      if (this.reducedMotion) this.draw();
      return;
    }
    if (this.frameId === null) this.frameId = this.requestFrame(this.tick);
  }

  tick(timestamp) {
    this.frameId = null;
    if (!this.running) return;
    // Clamp a delayed frame, not the display's refresh rate; 60/90/120 Hz share the same physics.
    const delta = this.lastTime === null ? FRAME_SECONDS : Math.min(0.05, Math.max(0, (timestamp - this.lastTime) / 1000));
    this.lastTime = timestamp;
    this.advance(delta);
    this.draw();
    if (this.running) this.frameId = this.requestFrame(this.tick);
  }

  advance(delta) {
    const chance = this.intensity === "high" ? 0.14 : this.intensity === "minimal" ? 0.015 : 0.055;
    const spawnProbability = 1 - Math.pow(1 - chance, delta * 60);
    if (this.heroVisible && !this.reducedMotion && this.random() < spawnProbability) {
      const angle = this.random() * TAU;
      const radius = 70 + this.random() * 110;
      this.createBolt(
        this.orb.x + Math.cos(angle) * 45,
        this.orb.y + Math.sin(angle) * 45,
        this.orb.x + Math.cos(angle + this.random() - 0.5) * radius,
        this.orb.y + Math.sin(angle + this.random() - 0.5) * radius,
        36, 1.5, this.random() > 0.4 ? 186 : 290,
      );
    }
    for (const particle of this.particles) {
      particle.x = (particle.x + particle.vx * delta + this.width) % this.width;
      particle.y = (particle.y + particle.vy * delta + this.height) % this.height;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].alpha -= this.bolts[i].decay * delta;
      if (this.bolts[i].alpha <= 0) this.removeBolt(i);
    }
    const drag = Math.pow(0.95, delta * 60);
    const travel = (1 - drag) / 0.05;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.x += spark.vx * travel;
      spark.y += spark.vy * travel;
      spark.vx *= drag;
      spark.vy *= drag;
      spark.alpha -= 1.92 * delta;
      if (spark.alpha <= 0) {
        this.sparkPool.push(spark);
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
      }
    }
  }

  glowSprite(hue, radius, spark) {
    const roundedRadius = Math.round(radius * 4) / 4;
    const key = `${hue}:${roundedRadius}:${spark}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const size = 40;
    const image = this.surface(Math.ceil(size * this.ratio), Math.ceil(size * this.ratio));
    const context = image.getContext("2d");
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.fillStyle = `hsla(${hue}, 100%, ${spark ? 80 : 72}%, ${spark ? 1 : 0.65})`;
    context.shadowBlur = (spark ? 12 : 10) * this.ratio;
    context.shadowColor = `hsla(${hue}, 100%, ${spark ? 60 : 65}%, ${spark ? 1 : 0.8})`;
    context.beginPath();
    context.arc(size / 2, size / 2, roundedRadius, 0, TAU);
    context.fill();
    const sprite = { image, size };
    this.sprites.set(key, sprite);
    return sprite;
  }

  createBolt(x1, y1, x2, y2, displacement, thickness, hue = 186) {
    if (this.reducedMotion) return;
    const segments = [];
    const subdivide = (ax, ay, bx, by, distance) => {
      if (distance < 4) {
        segments.push(ax, ay, bx, by);
        return;
      }
      const mx = (ax + bx) / 2 + (this.random() - 0.5) * distance;
      const my = (ay + by) / 2 + (this.random() - 0.5) * distance;
      subdivide(ax, ay, mx, my, distance / 1.85);
      subdivide(mx, my, bx, by, distance / 1.85);
      if (this.random() < 0.22 && distance > 16) {
        subdivide(mx, my, mx + (this.random() - 0.5) * distance * 2.2, my + (this.random() - 0.5) * distance * 2.2, distance / 2.2);
      }
    };
    subdivide(x1, y1, x2, y2, displacement);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < segments.length; i += 2) {
      minX = Math.min(minX, segments[i]);
      maxX = Math.max(maxX, segments[i]);
      minY = Math.min(minY, segments[i + 1]);
      maxY = Math.max(maxY, segments[i + 1]);
    }
    const left = Math.max(0, Math.floor(minX - 36));
    const top = Math.max(0, Math.floor(minY - 36));
    const width = Math.min(this.width, Math.ceil(maxX + 36)) - left;
    const height = Math.min(this.height, Math.ceil(maxY + 36)) - top;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(this.ratio, Math.sqrt(800_000 / (width * height)));
    const pixelWidth = Math.max(1, Math.ceil(width * ratio));
    const pixelHeight = Math.max(1, Math.ceil(height * ratio));
    const pixels = pixelWidth * pixelHeight;
    while (this.bolts.length && (this.bolts.length >= MAX_BOLTS || this.texturePixels + pixels > MAX_TEXTURE_PIXELS)) this.removeBolt(0);
    const image = this.surface(pixelWidth, pixelHeight);
    const context = image.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio);
    context.strokeStyle = `hsl(${hue}, 100%, 88%)`;
    context.shadowColor = `hsl(${hue}, 100%, 60%)`;
    context.shadowBlur = 22 * ratio;
    context.lineWidth = thickness;
    context.beginPath();
    for (let i = 0; i < segments.length; i += 4) {
      context.moveTo(segments[i], segments[i + 1]);
      context.lineTo(segments[i + 2], segments[i + 3]);
    }
    context.stroke();
    this.texturePixels += pixels;
    this.bolts.push({ image, left, top, width, height, pixels, alpha: 1, decay: (0.045 + this.random() * 0.03) * 60 });
  }

  removeBolt(index) {
    const [bolt] = this.bolts.splice(index, 1);
    this.texturePixels -= bolt.pixels;
    bolt.image.width = 1;
    bolt.image.height = 1;
  }

  burst(x, y, count = 18) {
    if (this.reducedMotion || !this.running) return;
    const amount = Math.min(MAX_SPARKS, Math.max(0, count));
    while (this.sparks.length + amount > MAX_SPARKS) this.sparkPool.push(this.sparks.shift());
    for (let i = 0; i < amount; i++) {
      const angle = this.random() * TAU;
      const speed = this.random() * 5 + 1.5;
      const spark = this.sparkPool.pop() || {};
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.alpha = 1;
      spark.radius = this.random() * 2.2 + 0.8;
      spark.hue = this.random() > 0.4 ? 186 : 310;
      spark.sprite = this.glowSprite(spark.hue, spark.radius, true);
      this.sparks.push(spark);
    }
  }

  discharge(targetX, targetY, count = 4) {
    if (!this.running || this.reducedMotion || !this.heroVisible) return;
    for (let i = 0; i < Math.min(count, MAX_BOLTS); i++) {
      const angle = this.random() * TAU;
      const distance = 90 + this.random() * 220;
      this.createBolt(this.orb.x, this.orb.y, targetX ?? this.orb.x + Math.cos(angle) * distance, targetY ?? this.orb.y + Math.sin(angle) * distance, 65, 2.2, i % 2 === 0 ? 186 : 285);
    }
    this.burst(targetX ?? this.orb.x, targetY ?? this.orb.y, 16);
  }

  draw() {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    for (const bucket of this.connections) bucket.length = 0;
    for (const particle of this.particles) {
      const sprite = particle.sprite;
      if (sprite) context.drawImage(sprite.image, particle.x - sprite.size / 2, particle.y - sprite.size / 2, sprite.size, sprite.size);
      if (this.mouse.active && !this.reducedMotion) {
        const dx = this.mouse.x - particle.x;
        const dy = this.mouse.y - particle.y;
        const squaredDistance = dx * dx + dy * dy;
        if (squaredDistance < 21025) {
          const bucket = Math.min(7, Math.floor((1 - Math.sqrt(squaredDistance) / 145) * 8));
          this.connections[bucket].push(particle.x, particle.y);
        }
      }
    }
    for (let i = 0; i < this.connections.length; i++) {
      const bucket = this.connections[i];
      if (!bucket.length) continue;
      context.beginPath();
      for (let j = 0; j < bucket.length; j += 2) {
        context.moveTo(bucket[j], bucket[j + 1]);
        context.lineTo(this.mouse.x, this.mouse.y);
      }
      context.strokeStyle = "#00f3ff";
      context.globalAlpha = (i + 0.5) / 8 * 0.07;
      context.lineWidth = 3;
      context.stroke();
      context.globalAlpha = (i + 0.5) / 8 * 0.35;
      context.lineWidth = 0.8;
      context.stroke();
    }
    context.globalCompositeOperation = "lighter";
    for (const bolt of this.bolts) {
      context.globalAlpha = Math.max(0, bolt.alpha);
      context.drawImage(bolt.image, bolt.left, bolt.top, bolt.width, bolt.height);
    }
    for (const spark of this.sparks) {
      context.globalAlpha = Math.max(0, spark.alpha);
      context.drawImage(spark.sprite.image, spark.x - 20, spark.y - 20, 40, 40);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }

  destroy() {
    this.setRunning(false);
    while (this.bolts.length) this.removeBolt(0);
    this.sparks.length = 0;
    this.sparkPool.length = 0;
    this.sprites.clear();
  }
}
