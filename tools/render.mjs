import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const PORTFOLIO = "C:/Workspace/ehtf-portfolio";
const OUT = resolve("assets");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString("base64")}`;
const font = (pkg, file) => dataUri(`${PORTFOLIO}/node_modules/@fontsource-variable/${pkg}/files/${file}`, "font/woff2");
const art = (name) => dataUri(`${PORTFOLIO}/src/assets/images/gravuras/${name}.webp`, "image/webp");

const base = `
@font-face { font-family: Antonio; src: url(${font("antonio", "antonio-latin-wght-normal.woff2")}); font-weight: 100 700; }
@font-face { font-family: Inter; src: url(${font("inter", "inter-latin-wght-normal.woff2")}); font-weight: 100 900; }
@font-face { font-family: JBM; src: url(${font("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")}); font-weight: 100 800; }
:root {
  --bed: #0A0A0B; --bed-vignette: #030304; --fg: #EDEDED; --fg-soft: #B4B4B8;
  --muted: #8E8E93; --line: #2C2C2E; --accent: #7CC4A4; --ink: #D6D6DA;
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E");
  --vignette: radial-gradient(120% 90% at 50% 40%, transparent 55%, var(--bed-vignette) 100%);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  background-color: var(--bed);
  background-image: var(--grain), var(--vignette);
  color: var(--fg);
  font-family: Inter, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ink { background: var(--ink); -webkit-mask: var(--src) center / contain no-repeat; }
.mono { font-family: JBM, monospace; text-transform: uppercase; letter-spacing: 0.14em; }
`;

const banner = `
<style>
.wrap { display: flex; height: 100%; padding: 0 56px; align-items: center; gap: 40px; }
.text { flex: 1; display: flex; flex-direction: column; gap: 22px; }
.eyebrow { font-size: 12px; color: var(--fg-soft); }
h1 { font-family: Antonio, sans-serif; font-weight: 300; font-size: 72px; line-height: 0.95; letter-spacing: -0.015em; text-transform: uppercase; }
.site { font-size: 12px; color: var(--accent); }
.fig { width: 250px; height: 312px; --src: url(${art("ehtf-gravura-hero-empireo")}); }
</style>
<div class="wrap">
  <div class="text">
    <p class="eyebrow mono">Fullstack Developer</p>
    <h1>Still chasing<br>why things break.</h1>
    <p class="site mono">erickhtf.com.br ↗</p>
  </div>
  <div class="fig ink"></div>
</div>`;

const footer = `
<style>
.wrap { position: relative; height: 100%; display: flex; align-items: center; padding: 0 56px; }
.text { position: relative; display: flex; flex-direction: column; gap: 14px; }
.eyebrow { font-size: 12px; color: var(--fg-soft); }
h2 { font-family: Antonio, sans-serif; font-weight: 300; font-size: 56px; line-height: 0.92; text-transform: uppercase; }
.site { font-size: 12px; color: var(--accent); }
</style>
<div class="wrap">
  <div class="text">
    <p class="eyebrow mono">// get in touch</p>
    <h2>Let's talk</h2>
    <p class="site mono">erickhtf.com.br ↗</p>
  </div>
</div>`;

const channel = ({ rank, note, name, handle, link }) => `
<style>
.card { display: flex; flex-direction: column; gap: 16px; height: 100%; padding: 28px 40px; }
.rule { height: 1px; background: var(--line); }
.rank { font-size: 14px; color: var(--muted); }
.note { color: var(--accent); }
.name { font-family: Antonio, sans-serif; font-weight: 400; font-size: 52px; line-height: 1; }
.handle { font-family: JBM, monospace; font-size: 16px; color: var(--fg-soft); }
.handle.link { color: var(--fg); text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 5px; }
</style>
<div class="card">
  <div class="rule"></div>
  <p class="rank mono">${rank}${note ? ` <span class="note">${note}</span>` : ""}</p>
  <p class="name">${name}</p>
  <p class="handle${link ? " link" : ""}">${handle}</p>
</div>`;

mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "ehtf-readme-render");
mkdirSync(tmp, { recursive: true });

const jobs = [
  ["banner", banner, 880, 380, OUT],
  ["footer-bg", footer, 880, 220, tmp],
  ["contact-email", channel({ rank: "#1", note: "// fastest", name: "Email", handle: "erick.henrique4@outlook.com", link: true }), 520, 200, OUT],
  ["contact-linkedin", channel({ rank: "#2", name: "LinkedIn", handle: "in/erickhentf ↗" }), 520, 200, OUT],
];

for (const [name, body, w, h, dir] of jobs) {
  const html = join(tmp, `${name}.html`);
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${base}</style>${body}`);
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",
    `--window-size=${w},${h}`,
    "--virtual-time-budget=2000",
    `--screenshot=${join(dir, `${name}.png`)}`,
    `file:///${html.replace(/\\/g, "/")}`,
  ], { stdio: "ignore" });
  console.log(`${name}.png`);
}

execFileSync("python", [resolve("tools/footer-gif.py"), resolve("tools/galaxy.gif"), join(tmp, "footer-bg.png"), join(OUT, "footer.gif")], { stdio: "inherit" });
