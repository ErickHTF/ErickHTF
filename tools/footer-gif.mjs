import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import gifenc from "gifenc";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const require = createRequire("C:/Workspace/ehtf-portfolio/package.json");
const sharp = require("sharp");

const [bgPath, outPath] = process.argv.slice(2);
const SOURCE = resolve("tools/galaxy.png");

const SRC_CENTER = { x: 245, y: 125 };
const SRC_MAJOR = 230;
const AXIS_RATIO = 0.33;
const TILT = (-4 * Math.PI) / 180;

const FRAMES = 240;
const DELAY = 120;
const DOT = 2;
const INK = [214, 214, 218];

const MAJOR = 200;
const CENTER_FROM_RIGHT = 215;
const FADE_FROM = 430;
const FADE_TO = 520;
const CORE_STILL = 0.1;
const CORE_EDGE = 0.24;
const DISK_EDGE = 1.0;
const DISK_SOFT = 1.15;
const STARS = 70;

const { data: bgRgb, info: bgInfo } = await sharp(bgPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const PW = bgInfo.width;
const PH = bgInfo.height;
const GW = PW / DOT;
const GH = PH / DOT;
const CX = GW - CENTER_FROM_RIGHT;
const CY = GH / 2;

const bg = new Uint8Array(PW * PH * 4);
for (let i = 0; i < PW * PH; i++) {
  bg[i * 4] = bgRgb[i * 3];
  bg[i * 4 + 1] = bgRgb[i * 3 + 1];
  bg[i * 4 + 2] = bgRgb[i * 3 + 2];
  bg[i * 4 + 3] = 255;
}

const { data: srcRaw, info: srcInfo } = await sharp(SOURCE).greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
const SW = srcInfo.width;
const SH = srcInfo.height;
const sample = (x, y) => {
  if (x < 0 || y < 0 || x >= SW - 1 || y >= SH - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * SW + x0;
  return ((srcRaw[i] * (1 - fx) + srcRaw[i + 1] * fx) * (1 - fy) + (srcRaw[i + SW] * (1 - fx) + srcRaw[i + SW + 1] * fx) * fy) / 255;
};

let seed = 2885;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const scale = SRC_MAJOR / MAJOR;
const tc = Math.cos(TILT);
const ts = Math.sin(TILT);
const toDisk = (dx, dy) => {
  const u = dx * tc + dy * ts;
  const v = -dx * ts + dy * tc;
  return [u / MAJOR, v / (MAJOR * AXIS_RATIO)];
};
const fromDisk = (u, v) => {
  const x = u * MAJOR;
  const y = v * MAJOR * AXIS_RATIO;
  return [x * tc - y * ts, x * ts + y * tc];
};

const X0 = FADE_FROM;
const FW = GW - X0;
const field = new Float32Array(FW * GH);
for (let y = 0; y < GH; y++) {
  for (let x = 0; x < FW; x++) {
    const dx = X0 + x - CX;
    const dy = y - CY;
    const v = Math.max(0, (sample(SRC_CENTER.x + dx * scale, SRC_CENTER.y + dy * scale) - 0.1) / 0.9);
    field[y * FW + x] = v ** 1.3;
  }
}

const dots = [];
for (let y = 0; y < GH; y++) {
  const ltr = y % 2 === 0;
  for (let n = 0; n < FW; n++) {
    const x = ltr ? n : FW - 1 - n;
    const i = y * FW + x;
    const on = field[i] >= 0.5 ? 1 : 0;
    const err = field[i] - on;
    const ahead = ltr ? 1 : -1;
    if (x + ahead >= 0 && x + ahead < FW) field[i + ahead] += (err * 7) / 16;
    if (y + 1 < GH) {
      if (x - ahead >= 0 && x - ahead < FW) field[i + FW - ahead] += (err * 3) / 16;
      field[i + FW] += (err * 5) / 16;
      if (x + ahead >= 0 && x + ahead < FW) field[i + FW + ahead] += (err * 1) / 16;
    }
    if (!on) continue;
    const dx = X0 + x - CX;
    const dy = y - CY;
    const [u, v] = toDisk(dx + rand() - 0.5, dy + rand() - 0.5);
    const r = Math.hypot(u, v);
    let orbit;
    if (r < CORE_STILL) orbit = 0;
    else if (r < CORE_EDGE) orbit = (r - CORE_STILL) / (CORE_EDGE - CORE_STILL);
    else if (r < DISK_EDGE) orbit = 1;
    else if (r < DISK_SOFT) orbit = 1 - (r - DISK_EDGE) / (DISK_SOFT - DISK_EDGE);
    else orbit = 0;
    dots.push({ dx, dy, u, v, orbits: rand() < orbit, keep: rand() });
  }
}

const stars = Array.from({ length: STARS }, () => ({
  x: Math.floor(300 + rand() * (GW - 300)),
  y: Math.floor(rand() * GH),
  phase: rand(),
  cycles: 1 + Math.floor(rand() * 3),
}));

const palette = quantize(bg, 62);
palette.push(INK);
const CLEAR = palette.length;
palette.push([0, 0, 0]);

const gif = GIFEncoder();
let prev = null;

for (let f = 0; f < FRAMES; f++) {
  const a = (-2 * Math.PI * f) / FRAMES;
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const frame = bg.slice();
  const plot = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
    for (let oy = 0; oy < DOT; oy++) {
      for (let ox = 0; ox < DOT; ox++) {
        const p = ((gy * DOT + oy) * PW + gx * DOT + ox) * 4;
        frame[p] = INK[0];
        frame[p + 1] = INK[1];
        frame[p + 2] = INK[2];
      }
    }
  };

  for (const d of dots) {
    let dx = d.dx;
    let dy = d.dy;
    if (d.orbits) [dx, dy] = fromDisk(d.u * cos - d.v * sin, d.u * sin + d.v * cos);
    const x = Math.round(CX + dx);
    const y = Math.round(CY + dy);
    if (x < FADE_TO) {
      const t = Math.max(0, (x - FADE_FROM) / (FADE_TO - FADE_FROM));
      if (d.keep > t ** 1.6) continue;
    }
    plot(x, y);
  }

  for (const s of stars) {
    const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * (s.cycles * f / FRAMES + s.phase));
    if (b < 0.6) continue;
    plot(s.x, s.y);
    if (b > 0.93) {
      plot(s.x - 1, s.y);
      plot(s.x + 1, s.y);
      plot(s.x, s.y - 1);
      plot(s.x, s.y + 1);
    }
  }

  if (process.env.DUMP?.split(",").includes(String(f))) {
    await sharp(Buffer.from(frame), { raw: { width: PW, height: PH, channels: 4 } }).png().toFile(`${process.env.DUMP_DIR}/frame-${f}.png`);
  }

  const index = applyPalette(frame, palette.slice(0, CLEAR));
  const out = index.slice();
  if (prev) {
    for (let i = 0; i < out.length; i++) if (index[i] === prev[i]) out[i] = CLEAR;
  }
  prev = index;
  gif.writeFrame(out, PW, PH, { palette, delay: DELAY, repeat: 0, transparent: true, transparentIndex: CLEAR, dispose: 1 });
}

gif.finish();
writeFileSync(outPath, gif.bytes());
console.log(`footer.gif ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB`);
