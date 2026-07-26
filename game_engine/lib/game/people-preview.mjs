// Visual verification harness for people.ts. Transpiles the TS module,
// serves it plus three.js over a tiny static server, renders every preset
// (walking pose) in a row plus six random seeds of one preset to prove
// variation, and saves people-preview.png next to this file.
//
// Run with: node lib/game/people-preview.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const BUILD_DIR = path.join(__dirname, ".preview-build");
const SCRATCHPAD =
  "C:/Users/apoor/AppData/Local/Temp/claude/c--Users-apoor-OneDrive-Desktop-sarvam-hackathon/a7b1851f-4975-4f79-a3e9-8ac697c598a9/scratchpad";

const tsPath = path.join(REPO, "node_modules/typescript/lib/typescript.js");
const ts = (await import(new URL("file:///" + tsPath.replace(/\\/g, "/")))).default;
const { chromium } = await import(
  new URL("file:///" + path.join(SCRATCHPAD, "node_modules/playwright-core/index.mjs").replace(/\\/g, "/"))
);

fs.mkdirSync(BUILD_DIR, { recursive: true });

function transpile(srcRel, outName) {
  const src = fs.readFileSync(path.join(REPO, srcRel), "utf8");
  const result = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: srcRel,
  });
  const fixed = result.outputText.replace(/from "\.\/props"/g, 'from "./props.mjs"');
  fs.writeFileSync(path.join(BUILD_DIR, outName), fixed, "utf8");
}

transpile("lib/game/people.ts", "people.mjs");
transpile("lib/game/props.ts", "props.mjs");

const html = fs.readFileSync(path.join(__dirname, ".preview-page.html"), "utf8");
fs.writeFileSync(path.join(BUILD_DIR, "preview.html"), html, "utf8");

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };

const server = http.createServer((req, res) => {
  let url = req.url.split("?")[0];
  let filePath;
  if (url === "/" || url === "/preview.html") {
    filePath = path.join(BUILD_DIR, "preview.html");
  } else if (url === "/people.mjs" || url === "/props.mjs") {
    filePath = path.join(BUILD_DIR, url);
  } else if (url === "/three/three.module.js" || url === "/three/three.core.js") {
    filePath = path.join(REPO, "node_modules/three/build", path.basename(url));
  } else if (url === "/three/BufferGeometryUtils.js") {
    filePath = path.join(REPO, "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js");
  } else {
    res.writeHead(404);
    res.end("not found: " + url);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end(String(err));
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
});

await new Promise((r) => server.listen(8792, r));

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1900, height: 1260 } });
page.on("console", (msg) => console.log("[page]", msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));
page.on("response", (res) => {
  if (res.status() >= 400) console.log("[response]", res.status(), res.url());
});

await page.goto("http://localhost:8792/preview.html", { timeout: 15000 });
await page.waitForFunction(() => window.__rendered === true, { timeout: 10000 });
await page.waitForTimeout(150);

const triByPreset = await page.evaluate(() => window.__triByPreset);
console.log("Triangle counts per preset:", JSON.stringify(triByPreset, null, 2));

const outPng = path.join(__dirname, "people-preview.png");
await page.screenshot({ path: outPng, fullPage: true });
console.log("saved", outPng);

await browser.close();
server.close();
