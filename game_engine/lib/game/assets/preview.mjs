// Visual verification harness for the district asset kits in this folder.
//
// For each of the four districts it builds every hero / vehicle / street
// prop via getDistrictKit(), lays them out on a grid (heroes at the back,
// vehicles and street props up front where the camera can get close),
// lights the scene with a three-point rig, and saves two screenshots:
//   preview-<city>.png         — the whole kit, wide 3/4 view
//   preview-<city>-detail.png  — vehicles + street props, close 3/4 view
//
// assets/*.ts are transpiled in isolation with TypeScript's transpileModule
// (type erasure only — `npx tsc --noEmit` is the real type-check, run
// separately) and served next to three.js's ESM build over a tiny static
// server, then driven with real headless Chrome via Playwright.
//
// Run with: node lib/game/assets/preview.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..", "..");
const SCRATCH =
  "C:/Users/apoor/AppData/Local/Temp/claude/c--Users-apoor-OneDrive-Desktop-sarvam-hackathon/a7b1851f-4975-4f79-a3e9-8ac697c598a9/scratchpad";

const ts = (await import(pathToFileURL(path.join(REPO, "node_modules/typescript/lib/typescript.js")).href))
  .default;
const { chromium } = await import(
  pathToFileURL(path.join(SCRATCH, "node_modules/playwright-core/index.mjs")).href
);

/* ------------------------------------------------------------------ *
 * Transpile assets/*.ts (+ the one outside dependency, props.ts) into a
 * flat set of .mjs modules with fixed-up relative import specifiers.
 * ------------------------------------------------------------------ */

function transpile(tsSrc, fileName) {
  const out = ts.transpileModule(tsSrc, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    fileName,
  });
  // Every relative import in this kit points at a sibling file that will
  // also be flattened into the same served directory, so ".{,.}/name" ->
  // "./name.mjs" is a safe global rewrite. Type-only imports (e.g. index.ts
  // -> "../materials") are already elided by transpileModule.
  return out.outputText.replace(/from "(\.\.?\/)([\w-]+)"/g, 'from "./$2.mjs"');
}

const modules = {
  "shared.mjs": transpile(fs.readFileSync(path.join(__dirname, "shared.ts"), "utf8"), "shared.ts"),
  "delhi.mjs": transpile(fs.readFileSync(path.join(__dirname, "delhi.ts"), "utf8"), "delhi.ts"),
  "chennai.mjs": transpile(fs.readFileSync(path.join(__dirname, "chennai.ts"), "utf8"), "chennai.ts"),
  "bengaluru.mjs": transpile(fs.readFileSync(path.join(__dirname, "bengaluru.ts"), "utf8"), "bengaluru.ts"),
  "kolkata.mjs": transpile(fs.readFileSync(path.join(__dirname, "kolkata.ts"), "utf8"), "kolkata.ts"),
  "index.mjs": transpile(fs.readFileSync(path.join(__dirname, "index.ts"), "utf8"), "index.ts"),
  "props.mjs": transpile(fs.readFileSync(path.join(REPO, "lib/game/props.ts"), "utf8"), "props.ts"),
};

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";

  if (p === "/index.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HTML);
    return;
  }
  const modName = p.replace(/^\//, "");
  if (modules[modName]) {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(modules[modName]);
    return;
  }
  if (p === "/three/three.module.js" || p === "/three/three.core.js") {
    const filePath = path.join(REPO, "node_modules/three/build", path.basename(p));
    res.writeHead(200, { "content-type": "text/javascript" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  if (p === "/three/BufferGeometryUtils.js") {
    const filePath = path.join(REPO, "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js");
    res.writeHead(200, { "content-type": "text/javascript" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end("not found: " + p);
});

const HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#cfe6ef;}canvas{display:block}</style>
<script type="importmap">
{
  "imports": {
    "three": "/three/three.module.js",
    "three/examples/jsm/utils/BufferGeometryUtils.js": "/three/BufferGeometryUtils.js"
  }
}
</script>
</head>
<body>
<script type="module">
import * as THREE from "three";
import { getDistrictKit } from "/index.mjs";
import { countTriangles } from "/shared.mjs";

const W = 1900, H = 1100;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe6ef);
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);

// Three-point lighting rig.
const key = new THREE.DirectionalLight(0xfff2df, 2.6);
key.position.set(1, 1.4, 1);
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfeeff, 1.0);
fill.position.set(-1, 0.7, 0.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.3);
rim.position.set(0, 0.8, -1);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 1m grid so scale (10m+ heroes vs pavement-scale props) is judgeable.
const grid = new THREE.GridHelper(200, 200, 0x444444, 0x777777);
grid.position.y = 0.01;
scene.add(grid);

function addLabel(text, x, y, z) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#fff";
  ctx.font = "30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 60);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.4, 0.64, 1);
  sprite.position.set(x, y, z);
  scene.add(sprite);
}

function layoutRow(groups, z, gap) {
  // Compute footprint widths first so items don't overlap regardless of
  // how big any individual hero is.
  const widths = groups.map((g) => {
    const box = new THREE.Box3().setFromObject(g);
    return { w: box.max.x - box.min.x, h: box.max.y - box.min.y, minX: box.min.x, minY: box.min.y };
  });
  let cursor = 0;
  const placed = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const { w, h, minX, minY } = widths[i];
    const x = cursor - minX;
    g.position.x = x;
    g.position.z = z;
    g.position.y = -minY; // sit on the ground regardless of local origin
    scene.add(g);
    placed.push({ g, x: x + (widths[i].w) / 2 - (widths[i].w/2 - (0)), topY: h + 0.4 });
    cursor += w + gap;
  }
  return { totalWidth: cursor - gap, items: groups.map((g, i) => ({ g, w: widths[i].w, h: widths[i].h })) };
}

const landmark = new URL(location.href).searchParams.get("landmark") || "delhi";
const kit = getDistrictKit(landmark);

const heroGroups = kit.hero.map((fn) => fn());
const vehicleGroups = kit.vehicles.map((fn) => fn());
const streetGroups = kit.streetProps.map((fn) => fn());

const triCounts = {};
[...heroGroups, ...vehicleGroups, ...streetGroups].forEach((g) => {
  triCounts[g.name || "unnamed"] = countTriangles(g);
});

const heroRow = layoutRow(heroGroups, 0, 4);
const vehRow = layoutRow(vehicleGroups, -10, 3);
const streetRow = layoutRow(streetGroups, -16, 2.5);

// Centre every row on the same X midpoint so the grid reads cleanly.
const maxW = Math.max(heroRow.totalWidth, vehRow.totalWidth || 1, streetRow.totalWidth || 1);
function recentre(row, groups) {
  const offset = (maxW - row.totalWidth) / 2;
  groups.forEach((g) => (g.position.x += offset));
}
recentre(heroRow, heroGroups);
recentre(vehRow, vehicleGroups);
recentre(streetRow, streetGroups);

// Labels above each item.
function labelRow(groups, names) {
  groups.forEach((g, i) => {
    const box = new THREE.Box3().setFromObject(g);
    addLabel(names[i], (box.min.x + box.max.x) / 2, box.max.y + 0.7, g.position.z);
  });
}
labelRow(heroGroups, heroGroups.map((g) => g.name));
labelRow(vehicleGroups, vehicleGroups.map((g) => g.name));
labelRow(streetGroups, streetGroups.map((g) => g.name));

const midX = maxW / 2;

window.__triCounts = triCounts;
window.__setFullView = () => {
  const dist = Math.max(22, maxW * 0.85);
  camera.position.set(midX - dist * 0.55, dist * 0.62, dist * 0.75);
  camera.lookAt(midX, 3.5, -8);
  renderer.render(scene, camera);
};
window.__setDetailView = () => {
  const w2 = Math.max(vehRow.totalWidth, streetRow.totalWidth, 6);
  const dist = Math.max(9, w2 * 0.7);
  camera.position.set(midX - dist * 0.5, dist * 0.55, -13 + dist * 0.85);
  camera.lookAt(midX, 1.2, -13);
  renderer.render(scene, camera);
};
window.__setFullView();
window.__ready = true;
</script>
</body></html>`;

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const allTris = {};
const errors = [];

for (const landmark of ["delhi", "chennai", "bengaluru", "kolkata"]) {
  const page = await browser.newPage({ viewport: { width: 1900, height: 1100 } });
  page.on("pageerror", (e) => errors.push(`${landmark}: ${e.message}\n${e.stack ?? ""}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${landmark} console: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/?landmark=${landmark}`, { waitUntil: "load" });
  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  } catch (e) {
    console.log(`TIMEOUT for ${landmark}. Errors so far:`, errors);
    throw e;
  }
  const tris = await page.evaluate(() => window.__triCounts);
  allTris[landmark] = tris;

  await page.evaluate(() => window.__setFullView());
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, `preview-${landmark}.png`) });

  await page.evaluate(() => window.__setDetailView());
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, `preview-${landmark}-detail.png`) });

  await page.close();
}

await browser.close();
server.close();

console.log("TRIANGLE COUNTS:", JSON.stringify(allTris, null, 2));
if (errors.length) {
  console.log("BROWSER ERRORS:");
  for (const e of errors.slice(0, 30)) console.log(" -", e);
} else {
  console.log("no browser errors");
}
