// Visual verification harness for clutter.ts.
//
// Builds a small mock street (ground + kerb + two rows of building boxes,
// forming one intersection like the real city grid does) entirely in the
// browser, runs createClutter() over it, and screenshots the result from a
// 3/4 view and an eye-level view so density/placement can be judged by eye.
//
// clutter.ts is TypeScript; we transpile it with the TS compiler's
// `transpileModule` (type-erasure only, no type-check — tsc --noEmit is run
// separately) and serve it next to three.js's ESM build via a tiny static
// server, then drive real Chrome (headless) with Playwright.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scratchDir = "C:/Users/apoor/AppData/Local/Temp/claude/c--Users-apoor-OneDrive-Desktop-sarvam-hackathon/a7b1851f-4975-4f79-a3e9-8ac697c598a9/scratchpad";

// playwright-core and typescript live in the scratchpad's node_modules, not
// the project's — resolve them by explicit file URL rather than bare
// specifier so this script can run from the project directory.
const ts = (await import(pathToFileURL(path.join(repoRoot, "node_modules", "typescript", "lib", "typescript.js")).href)).default;
const { chromium } = await import(pathToFileURL(path.join(scratchDir, "node_modules", "playwright-core", "index.mjs")).href);

function transpile(tsPath) {
  const src = fs.readFileSync(tsPath, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: tsPath,
  });
  return out.outputText;
}

const clutterJs = transpile(path.join(__dirname, "clutter.ts"));

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let p = decodeURIComponent(url.pathname);

  if (p === "/") p = "/index.html";

  if (p === "/index.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HTML);
    return;
  }

  if (p === "/clutter.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(clutterJs);
    return;
  }

  // Serve three.js straight out of node_modules.
  if (p.startsWith("/vendor/three/")) {
    const rel = p.replace("/vendor/three/", "");
    const filePath = path.join(repoRoot, "node_modules", "three", rel);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  res.writeHead(404);
  res.end("not found: " + p);
});

const HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#111}canvas{display:block}</style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "/vendor/three/build/three.module.js",
    "three/examples/jsm/utils/BufferGeometryUtils.js": "/vendor/three/examples/jsm/utils/BufferGeometryUtils.js"
  }
}
</script>
<script type="module">
import * as THREE from "three";
import { createClutter } from "/clutter.js";

const W = 60; // mock street: 60x60m block, one intersection, like the real grid
const ROAD_W = 14;
const BLOCK = 44;
const SPACING = BLOCK + ROAD_W; // 58, close enough to the 60m ask
const HALF = SPACING; // world half-extent so both roads have runway either side

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8d8);
scene.fog = new THREE.Fog(0xd9c8a0, 40, 160);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 300;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd8ef, 0x8a7050, 0.9));

// ---- mock world: ground, two roads crossing, kerbed pavement squares,
// two rows of plain building boxes either side of the roads. ----

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF * 3, HALF * 3),
  new THREE.MeshLambertMaterial({ color: 0x9c8f77 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const roadLines = [0, SPACING];
const tarmac = new THREE.MeshLambertMaterial({ color: 0x33363b });
for (const c of roadLines) {
  const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, HALF * 3), tarmac);
  rz.rotation.x = -Math.PI / 2;
  rz.position.set(c, 0.02, 0);
  scene.add(rz);
  const rx = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 3, ROAD_W), tarmac);
  rx.rotation.x = -Math.PI / 2;
  rx.position.set(0, 0.02, c);
  scene.add(rx);
}

const kerbMat = new THREE.MeshLambertMaterial({ color: 0xb9ae97 });
const colliders = [];
const lines = [-SPACING, 0, SPACING, SPACING * 2];
for (let i = 0; i < lines.length - 1; i++) {
  for (let j = 0; j < lines.length - 1; j++) {
    const cx = (lines[i] + lines[i + 1]) / 2;
    const cz = (lines[j] + lines[j + 1]) / 2;
    const pave = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 5, 0.22, BLOCK + 5), kerbMat);
    pave.position.set(cx, 0.11, cz);
    pave.receiveShadow = true;
    scene.add(pave);
  }
}

const buildingMat = new THREE.MeshLambertMaterial({ color: 0xd9c8a9 });
function addBuilding(cx, cz, w, d, h) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
  b.position.set(cx, h / 2, cz);
  b.castShadow = true;
  b.receiveShadow = true;
  scene.add(b);
  colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2 });
}

// Two rows either side of each road, a handful of buildings per block,
// mirroring city.ts's per-block subdivision.
for (let i = 0; i < lines.length - 1; i++) {
  for (let j = 0; j < lines.length - 1; j++) {
    const cx = (lines[i] + lines[i + 1]) / 2;
    const cz = (lines[j] + lines[j + 1]) / 2;
    if (cx === SPACING / 2 && cz === SPACING / 2) continue; // leave the chowk open
    const count = 2 + (i + j) % 2;
    const slot = BLOCK / count;
    for (let k = 0; k < count; k++) {
      const w = slot - 2;
      const d = BLOCK * 0.55;
      const floors = 2 + ((i * 3 + j * 5 + k) % 4);
      addBuilding(cx - BLOCK / 2 + slot * (k + 0.5), cz, w, d, 4 + floors * 3.2);
    }
  }
}

const theme = {
  landmark: (new URL(location.href).searchParams.get("landmark")) || "delhi",
  leaf: 0x2f6b34,
  canopies: [0xe74c3c, 0x27ae60, 0xe67e22],
};

const clutter = createClutter(scene, theme, undefined, {
  colliders,
  roadLines,
  roadWidth: ROAD_W,
  blockSize: BLOCK,
  spacing: SPACING,
  chowk: { x: SPACING / 2, z: SPACING / 2 },
  worldLimit: SPACING * 1.6,
  seed: 20260726,
});

window.__clutterResult = { instanceCount: clutter.instanceCount, drawCalls: clutter.drawCalls };
console.log("CLUTTER", JSON.stringify(window.__clutterResult));

window.__setView = (mode) => {
  if (mode === "iso") {
    camera.position.set(SPACING / 2 - 30, 26, SPACING / 2 - 34);
    camera.lookAt(SPACING / 2, 2, SPACING / 2);
  } else if (mode === "eye") {
    camera.position.set(SPACING / 2 - 2, 1.7, SPACING / 2 - 20);
    camera.lookAt(SPACING / 2 - 4, 1.6, SPACING / 2 + 5);
  } else if (mode === "corner") {
    camera.position.set(ROAD_W / 2 + 2, 1.7, ROAD_W / 2 + 2);
    camera.lookAt(ROAD_W / 2 + 10, 1.5, ROAD_W / 2 + 10);
  }
  renderer.render(scene, camera);
};
window.__setView("iso");
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

const results = {};
const errors = [];

for (const landmark of ["delhi", "chennai", "bengaluru", "kolkata"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push(`${landmark}: ${e.message}\n${e.stack ?? ""}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${landmark} console: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/?landmark=${landmark}`, { waitUntil: "load" });
  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  } catch (e) {
    console.log("TIMEOUT for", landmark, "errors so far:", errors);
    throw e;
  }
  const info = await page.evaluate(() => window.__clutterResult);
  results[landmark] = info;

  if (landmark === "delhi") {
    await page.evaluate(() => window.__setView("iso"));
    await page.screenshot({ path: path.join(scratchDir, "clutter-iso.png") });
    await page.evaluate(() => window.__setView("eye"));
    await page.screenshot({ path: path.join(scratchDir, "clutter-eye.png") });
    await page.evaluate(() => window.__setView("corner"));
    await page.screenshot({ path: path.join(scratchDir, "clutter-corner.png") });
  }
  await page.close();
}

await browser.close();
server.close();

console.log("RESULTS:", JSON.stringify(results, null, 2));
if (errors.length) {
  console.log("ERRORS:");
  for (const e of errors.slice(0, 20)) console.log(" -", e);
} else {
  console.log("no browser errors");
}
