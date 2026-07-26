/**
 * Standalone probe (no relay involved): proves both Sarvam streaming
 * directions work against the live API.
 *
 *   1. TTS: streams a short Hindi sentence over wss://api.sarvam.ai/text-to-speech/ws
 *      and writes the collected PCM audio to roznamcha/server/probe-out.wav.
 *   2. STT: streams that same PCM audio into wss://api.sarvam.ai/speech-to-text/ws
 *      and prints every event/transcript frame received.
 *
 * Run: node roznamcha/server/probe.mjs
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  if (process.env.SARVAM_API_KEY) return;
  const candidates = [
    path.resolve(__dirname, "..", "..", ".env"),
    path.resolve(__dirname, "..", ".env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
    if (process.env.SARVAM_API_KEY) return;
  }
}
loadDotEnv();

const API_KEY = process.env.SARVAM_API_KEY;
if (!API_KEY) {
  console.error("SARVAM_API_KEY not set");
  process.exit(1);
}

const SARVAM_HOST = "api.sarvam.ai";
const TEXT = "नमस्ते, मेरा नाम सुनीता है और मेरी उम्र पचास साल है।";
const LANGUAGE = "hi-IN";
const SPEAKER = "priya";
const TTS_SAMPLE_RATE = 22050;
const STT_SAMPLE_RATE = 16000;

/** Naive linear-interpolation resampler for mono s16le PCM. Good enough for a probe. */
function resamplePcm16(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  const inSamples = buffer.length / 2;
  const outSamples = Math.floor((inSamples * toRate) / fromRate);
  const out = Buffer.alloc(outSamples * 2);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, inSamples - 1);
    const frac = srcPos - i0;
    const s0 = buffer.readInt16LE(i0 * 2);
    const s1 = buffer.readInt16LE(i1 * 2);
    const s = Math.round(s0 + (s1 - s0) * frac);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i * 2);
  }
  return out;
}

function wavHeader(dataLen, sampleRate, channels = 1, bitsPerSample = 16) {
  const buf = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

function logShape(tag, seen, obj) {
  const top = Object.keys(obj ?? {}).sort().join(",");
  const inner = Object.keys(obj?.data ?? {}).sort().join(",");
  const sig = `type=${obj?.type}:top=[${top}]:data=[${inner}]`;
  const prefix = seen.has(sig) ? "" : "NEW ";
  seen.add(sig);
  console.log(`[${tag}] ${prefix}shape ${sig}`);
  console.log(`[${tag}]   ${JSON.stringify(obj).slice(0, 300)}`);
}

/* ------------------------------------------------------------------ *
 * Step 1: TTS
 * ------------------------------------------------------------------ */

function runTts() {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      model: "bulbul:v3",
      send_completion_event: "true",
    });
    const url = `wss://${SARVAM_HOST}/text-to-speech/ws?${qs.toString()}`;
    console.log(`\n=== TTS: connecting ${url} ===`);
    const sock = new WebSocket(url, {
      headers: { "Api-Subscription-Key": API_KEY },
    });

    const seen = new Set();
    const chunks = [];
    let settled = false;
    let idleTimer = null;

    // No documented completion event arrived within a reasonable window in
    // testing, so treat "no new audio for 2.5s after we've received at least
    // one chunk" as done -- same heuristic the relay could fall back to.
    function finish(reason) {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      clearTimeout(idleTimer);
      console.log(`[tts] finishing (${reason}), ${chunks.length} chunks collected`);
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      resolve(Buffer.concat(chunks));
    }

    function bumpIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finish("idle after audio"), 2500);
    }

    const hardTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error("[tts] TIMEOUT waiting for audio/completion");
        sock.terminate();
        if (chunks.length) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error("TTS timeout with no audio"));
        }
      }
    }, 25000);

    sock.on("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        console.error(`[tts] handshake failed: HTTP ${res.statusCode}`);
        console.error(`[tts] body: ${body.slice(0, 500)}`);
        if (!settled) {
          settled = true;
          clearTimeout(hardTimeout);
          clearTimeout(idleTimer);
          reject(new Error(`TTS handshake ${res.statusCode}`));
        }
      });
    });

    sock.on("open", () => {
      console.log("[tts] socket open, sending config/text/flush");
      sock.send(
        JSON.stringify({
          type: "config",
          data: {
            target_language_code: LANGUAGE,
            speaker: SPEAKER,
            model: "bulbul:v3",
            speech_sample_rate: String(TTS_SAMPLE_RATE),
            output_audio_codec: "linear16",
            output_audio_bitrate: "128k",
          },
        })
      );
      sock.send(JSON.stringify({ type: "text", data: { text: TEXT } }));
      sock.send(JSON.stringify({ type: "flush" }));
    });

    sock.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.log(`[tts] non-JSON frame: ${raw.toString().slice(0, 200)}`);
        return;
      }
      logShape("tts", seen, msg);

      const data = msg.data ?? msg;
      const audioB64 = data?.audio ?? msg.audio;
      if (audioB64 && (msg.type === "audio" || msg.type === undefined)) {
        chunks.push(Buffer.from(audioB64, "base64"));
        bumpIdleTimer();
        return;
      }
      if (
        msg.type === "completion" ||
        msg.type === "done" ||
        data?.event_type === "completion"
      ) {
        finish("completion event");
      }
    });

    sock.on("error", (err) => {
      console.error(`[tts] socket error: ${err.message}`);
      if (!settled) {
        settled = true;
        clearTimeout(hardTimeout);
        clearTimeout(idleTimer);
        if (chunks.length) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(err);
        }
      }
    });

    sock.on("close", (code, reason) => {
      console.log(`[tts] socket closed code=${code} reason=${reason}`);
      if (!settled) {
        settled = true;
        clearTimeout(hardTimeout);
        clearTimeout(idleTimer);
        if (chunks.length) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error("TTS socket closed with no audio"));
        }
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Step 2: STT
 * ------------------------------------------------------------------ */

function runStt(pcmBuffer, sampleRate) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      "language-code": LANGUAGE,
      model: "saaras:v3",
      mode: "transcribe",
      sample_rate: String(sampleRate),
      vad_signals: "true",
      high_vad_sensitivity: "true",
      input_audio_codec: "pcm_s16le",
    });
    const url = `wss://${SARVAM_HOST}/speech-to-text/ws?${qs.toString()}`;
    console.log(`\n=== STT: connecting ${url} ===`);
    const sock = new WebSocket(url, {
      headers: { "Api-Subscription-Key": API_KEY },
    });

    const seen = new Set();
    const transcripts = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error("[stt] TIMEOUT waiting for transcript");
        sock.terminate();
        resolve(transcripts); // don't fail the whole probe, just report empty
      }
    }, 20000);

    sock.on("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        console.error(`[stt] handshake failed: HTTP ${res.statusCode}`);
        console.error(`[stt] body: ${body.slice(0, 500)}`);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`STT handshake ${res.statusCode}`));
        }
      });
    });

    sock.on("open", () => {
      console.log("[stt] socket open, streaming PCM frames");
      // Stream in ~100ms frames (sampleRate * 2 bytes/sample * 0.1s)
      const frameSize = Math.round(sampleRate * 2 * 0.1);
      let offset = 0;
      const sendNext = () => {
        if (offset >= pcmBuffer.length) {
          console.log("[stt] all audio sent, sending flush");
          sock.send(JSON.stringify({ type: "flush" }));
          // give the server a few seconds to finish transcribing, then close
          setTimeout(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              sock.close();
              resolve(transcripts);
            }
          }, 4000);
          return;
        }
        const frame = pcmBuffer.subarray(offset, offset + frameSize);
        offset += frameSize;
        sock.send(
          JSON.stringify({
            audio: {
              data: frame.toString("base64"),
              sample_rate: String(sampleRate),
              encoding: "audio/wav",
            },
          })
        );
        setTimeout(sendNext, 100);
      };
      sendNext();
    });

    sock.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.log(`[stt] non-JSON frame: ${raw.toString().slice(0, 200)}`);
        return;
      }
      logShape("stt", seen, msg);

      const data = msg.data ?? msg;
      const signal = data?.signal_type ?? msg.signal_type;
      if (signal) console.log(`[stt] VAD signal: ${signal}`);

      const transcript = data?.transcript ?? msg.transcript;
      if (typeof transcript === "string" && transcript) {
        console.log(`[stt] TRANSCRIPT: "${transcript}"`);
        transcripts.push(transcript);
      }
    });

    sock.on("error", (err) => {
      console.error(`[stt] socket error: ${err.message}`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    sock.on("close", (code, reason) => {
      console.log(`[stt] socket closed code=${code} reason=${reason}`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(transcripts);
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log(`Synthesizing: "${TEXT}"`);
  const pcm = await runTts();
  console.log(`\n[tts] collected ${pcm.length} bytes of PCM audio`);

  if (pcm.length === 0) {
    throw new Error("No audio bytes collected from TTS; cannot feed STT");
  }

  const outPath = path.resolve(__dirname, "probe-out.wav");
  const wav = Buffer.concat([wavHeader(pcm.length, TTS_SAMPLE_RATE), pcm]);
  writeFileSync(outPath, wav);
  console.log(`[tts] wrote ${outPath} (${wav.length} bytes)`);

  // Sarvam's STT websocket only accepts 8000 or 16000 Hz (confirmed live:
  // it rejects 22050 with close code 4000 "Unsupported sample rate"), but
  // our synthesized audio came back at 22050Hz. Resample before feeding STT.
  console.log(
    `\nResampling ${TTS_SAMPLE_RATE}Hz -> ${STT_SAMPLE_RATE}Hz before feeding STT.`
  );
  const pcm16k = resamplePcm16(pcm, TTS_SAMPLE_RATE, STT_SAMPLE_RATE);

  const transcripts = await runStt(pcm16k, STT_SAMPLE_RATE).catch((err) => {
    console.error("[stt] failed:", err.message);
    return [];
  });
  console.log(`\n=== RESULT ===`);
  console.log(`Transcripts received: ${JSON.stringify(transcripts)}`);
  if (transcripts.length === 0) {
    console.warn(
      "WARNING: no transcript text was received. Check the logged shapes above for the actual field names."
    );
  }
}

main().catch((err) => {
  console.error("\nPROBE FAILED:", err.message);
  process.exit(1);
});
