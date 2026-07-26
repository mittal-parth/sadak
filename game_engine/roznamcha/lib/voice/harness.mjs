#!/usr/bin/env node
/**
 * Test harness for roznamcha/lib/voice.
 *
 * Since there is no real mic or real Sarvam relay available in this
 * environment, this script:
 *   1. Stands up a FAKE relay on ws://localhost:8788 speaking exactly the
 *      CONTRACT.md wire protocol (start/audio/stop/say/shutup in;
 *      ready/speech_start/speech_end/partial/final/tts_chunk/tts_done/error
 *      out).
 *   2. Compiles audio.ts to plain browser JS (tsc, transpile-only) so a
 *      vanilla <script type="module"> page can import it without a bundler.
 *   3. Serves __harness__/page.html + the compiled audio.js over plain HTTP.
 *   4. Drives real Chrome (via playwright-core) with fake mic/UI flags,
 *      loads the page, and lets the page:
 *        a. run createMicStream() against the fake getUserMedia device and
 *           sanity-check the resampled 16kHz PCM it emits;
 *        b. open the fake relay, request TTS, and when the fake relay fires
 *           `speech_start` mid-stream, call player.stopNow() synchronously
 *           (mirrors useVoiceTurn's onmessage handler) and measure how long
 *           until the audio graph actually goes silent.
 *   5. Reads window.__harnessResult back out and asserts the barge-in
 *      silence latency is under the 200ms contract budget.
 *
 * Run with: node roznamcha/lib/voice/harness.mjs
 */

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", ".."); // .../sarvam-hackathon
const HARNESS_DIR = path.join(__dirname, "__harness__");
const SCRATCHPAD =
  "C:/Users/apoor/AppData/Local/Temp/claude/c--Users-apoor-OneDrive-Desktop-sarvam-hackathon/a7b1851f-4975-4f79-a3e9-8ac697c598a9/scratchpad";

const RELAY_PORT = 8788;
const HTTP_PORT = 8789;
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function log(...args) {
  console.log("[harness]", ...args);
}

/* ------------------------------------------------------------------ *
 * 1. Compile audio.ts -> __harness__/audio.js (plain ESM, no bundler)
 * ------------------------------------------------------------------ */

function compileAudioModule() {
  const src = path.join(__dirname, "audio.ts");
  const args = [
    "tsc",
    src,
    "--target",
    "es2020",
    "--module",
    "es2020",
    "--lib",
    "dom,dom.iterable,esnext",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--outDir",
    HARNESS_DIR,
  ];
  const result = spawnSync("npx", args, { cwd: REPO_ROOT, shell: true, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("tsc failed to compile audio.ts for the browser harness");
  }
  const outFile = path.join(HARNESS_DIR, "audio.js");
  if (!fs.existsSync(outFile)) {
    throw new Error(`expected compiled output at ${outFile}, not found`);
  }
  log("compiled audio.ts ->", outFile);
}

/* ------------------------------------------------------------------ *
 * 2. Fake relay: speaks CONTRACT.md's ClientMsg/ServerMsg protocol
 * ------------------------------------------------------------------ */

function makeSineChunk(sampleCount, sampleRate, freq, phaseOffset) {
  const int16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = (phaseOffset + i) / sampleRate;
    int16[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.6 * 0x7fff);
  }
  return Buffer.from(int16.buffer).toString("base64");
}

function startFakeRelay() {
  const wss = new WebSocketServer({ port: RELAY_PORT });
  log(`fake relay listening on ws://localhost:${RELAY_PORT}`);

  wss.on("connection", (ws) => {
    let ttsTimer = null;
    let phase = 0;
    const sampleRate = 22050;
    const chunkSamples = Math.round(sampleRate * 0.04); // 40ms chunks

    const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.t) {
        case "start":
          send({ t: "ready" });
          break;

        case "audio":
          // Fake relay doesn't run real STT; just acks by ignoring.
          break;

        case "stop":
          send({ t: "speech_end" });
          send({ t: "final", text: "(fake transcript)" });
          break;

        case "say": {
          if (ttsTimer) clearInterval(ttsTimer);
          let elapsedChunks = 0;
          let sentSpeechStart = false;
          ttsTimer = setInterval(() => {
            send({
              t: "tts_chunk",
              b64: makeSineChunk(chunkSamples, sampleRate, 440, phase),
              codec: "linear16",
              sampleRate,
            });
            phase += chunkSamples;
            elapsedChunks++;

            // Simulate the worker starting to talk ~500ms into playback —
            // this is the event under test.
            if (!sentSpeechStart && elapsedChunks * 40 >= 500) {
              sentSpeechStart = true;
              send({ t: "speech_start" });
            }

            // Simulate a natural end if nothing interrupts it.
            if (elapsedChunks * 40 >= 3000) {
              clearInterval(ttsTimer);
              ttsTimer = null;
              send({ t: "tts_done" });
            }
          }, 40);
          break;
        }

        case "shutup":
          if (ttsTimer) {
            clearInterval(ttsTimer);
            ttsTimer = null;
          }
          // Real relay would close the Sarvam TTS socket here; nothing more
          // to do in the fake since we just stop producing chunks.
          break;

        default:
          send({ t: "error", message: `fake relay: unknown message type ${msg.t}` });
      }
    });

    ws.on("close", () => {
      if (ttsTimer) clearInterval(ttsTimer);
    });
  });

  return wss;
}

/* ------------------------------------------------------------------ *
 * 3. Static file server for the harness page + compiled module
 * ------------------------------------------------------------------ */

function startStaticServer() {
  const CONTENT_TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript" };
  const server = http.createServer((req, res) => {
    const reqPath = req.url === "/" ? "/page.html" : req.url;
    const filePath = path.join(HARNESS_DIR, path.normalize(reqPath).replace(/^([.][.][/\\])+/, ""));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(HTTP_PORT, () => {
      log(`static server listening on http://localhost:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

/* ------------------------------------------------------------------ *
 * 4. Drive Chrome via playwright-core
 * ------------------------------------------------------------------ */

async function runBrowserTest() {
  const require = createRequire(path.join(SCRATCHPAD, "x.js"));
  const { chromium } = require("playwright-core");

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--no-sandbox",
    ],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => log("page console:", msg.text()));
    page.on("pageerror", (err) => log("page error:", err.message));

    await page.goto(`http://localhost:${HTTP_PORT}/page.html`);

    const deadline = Date.now() + 10000;
    let result = null;
    while (Date.now() < deadline) {
      result = await page.evaluate(() => window.__harnessResult);
      if (result && result.done) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return result;
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  compileAudioModule();
  const wss = startFakeRelay();
  const httpServer = await startStaticServer();

  let result;
  try {
    result = await runBrowserTest();
  } finally {
    wss.close();
    httpServer.close();
  }

  log("result:", JSON.stringify(result, null, 2));

  if (!result || !result.done) {
    console.error("FAIL: harness did not complete (timed out waiting for window.__harnessResult)");
    process.exit(1);
  }
  if (result.error) {
    console.error("FAIL:", result.error);
    process.exit(1);
  }
  if (!result.ok) {
    console.error("FAIL: barge-in did not reach silence within the observation window");
    process.exit(1);
  }
  if (result.silenceLatencyMs >= 200) {
    console.error(`FAIL: silence latency ${result.silenceLatencyMs}ms >= 200ms budget`);
    process.exit(1);
  }

  console.log(
    `PASS: stopNow() call latency ${result.callLatencyMs?.toFixed(2)}ms, ` +
      `audio-graph silence latency ${result.silenceLatencyMs?.toFixed(2)}ms (budget 200ms)`
  );
  if (result.mic) {
    console.log(
      `mic capture: method=${result.mic.method} frames=${result.mic.frameCount} ` +
        `samples=${result.mic.totalSamples} ratio-to-expected=${result.mic.ratio?.toFixed(2)}`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("harness crashed:", err);
  process.exit(1);
});
