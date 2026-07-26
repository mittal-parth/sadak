/**
 * Framework-free audio plumbing for the ROZNAMCHA voice loop.
 *
 * createMicStream()  — captures the mic, resamples to mono PCM s16le @16kHz,
 *                       and emits base64 frames of ~20-40ms.
 * createPlayer()     — plays base64 linear16 PCM chunks gaplessly via Web
 *                       Audio scheduling, with a stopNow() that halts and
 *                       discards everything queued in well under 200ms.
 *
 * No React, no relay-protocol knowledge. See useVoiceTurn.ts for the wiring.
 */

/* ------------------------------------------------------------------ *
 * Shared base64 <-> PCM16 helpers
 * ------------------------------------------------------------------ */

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length - (binary.length % 2); // guard against odd-length garbage
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Streaming linear resampler (arbitrary in-rate -> arbitrary out-rate)
 *
 * Keeps a one-sample tail and a fractional phase across calls so chunk
 * boundaries don't introduce clicks or dropped samples.
 * ------------------------------------------------------------------ */

class StreamResampler {
  private readonly ratio: number;
  private phase = 0;
  private lastSample = 0;
  private primed = false;

  constructor(inRate: number, outRate: number) {
    this.ratio = inRate / outRate;
  }

  /** Push a block of input samples, get back the resampled output block. */
  push(input: Float32Array): Float32Array {
    const n = input.length;
    if (n === 0) return new Float32Array(0);
    const out: number[] = [];
    let i = this.phase;
    while (i < n) {
      const idx = Math.floor(i);
      const frac = i - idx;
      const s0 = idx === 0 ? this.lastSample : input[idx - 1];
      const s1 = input[idx];
      out.push(s0 + (s1 - s0) * frac);
      i += this.ratio;
    }
    this.phase = i - n;
    this.lastSample = input[n - 1];
    this.primed = true;
    return Float32Array.from(out);
  }
}

/* ------------------------------------------------------------------ *
 * Mic capture
 * ------------------------------------------------------------------ */

export type MicErrorReason = "denied" | "no-device" | "unsupported" | "unknown";

export class MicError extends Error {
  reason: MicErrorReason;
  constructor(reason: MicErrorReason, message: string) {
    super(message);
    this.name = "MicError";
    this.reason = reason;
  }
}

export interface MicStreamHandle {
  /** Stop capture, release the mic, and tear down all audio nodes. */
  stop(): void;
  /** Which capture path was actually used — useful for diagnostics/tests. */
  readonly method: "worklet" | "scriptprocessor";
}

export interface CreateMicStreamOptions {
  /** Target frame duration in ms. Contract wants ~20-40ms frames. Default 30. */
  frameMs?: number;
}

const TARGET_SAMPLE_RATE = 16000;

// AudioWorklet processor source, injected as a Blob URL so we don't need a
// bundler-specific way to ship a separate worklet file.
const WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      let mono;
      if (input.length > 1) {
        const len = input[0].length;
        mono = new Float32Array(len);
        for (let c = 0; c < input.length; c++) {
          const ch = input[c];
          for (let i = 0; i < len; i++) mono[i] += ch[i] / input.length;
        }
      } else {
        mono = input[0].slice();
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-capture", PCMCaptureProcessor);
`;

/**
 * Opens the mic, resamples to mono 16kHz PCM s16le, and calls onFrame with
 * base64-encoded frames of roughly `frameMs` duration. Prefers an
 * AudioWorklet; falls back to a ScriptProcessorNode when AudioWorklet is
 * unavailable or fails to load (older Safari, insecure context, etc).
 *
 * Throws MicError if getUserMedia is denied or unsupported — callers MUST
 * catch this and surface a clear error state; never let it fail silently.
 */
export async function createMicStream(
  onFrame: (base64Frame: string) => void,
  opts: CreateMicStreamOptions = {}
): Promise<MicStreamHandle> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new MicError("unsupported", "getUserMedia is not available in this browser/context.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err: any) {
    const name = err?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicError("denied", "Microphone access was denied.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new MicError("no-device", "No microphone was found.");
    }
    throw new MicError("unknown", err?.message ?? "Could not open the microphone.");
  }

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const inRate = audioCtx.sampleRate;
  const resampler = new StreamResampler(inRate, TARGET_SAMPLE_RATE);

  const frameMs = opts.frameMs ?? 30;
  const frameSamples = Math.round((TARGET_SAMPLE_RATE * frameMs) / 1000);
  let pending: number[] = [];

  const flush = (float32: Float32Array) => {
    for (let i = 0; i < float32.length; i++) pending.push(float32[i]);
    while (pending.length >= frameSamples) {
      const slice = pending.splice(0, frameSamples);
      const int16 = floatToInt16(Float32Array.from(slice));
      onFrame(int16ToBase64(int16));
    }
  };

  const source = audioCtx.createMediaStreamSource(stream);

  let workletNode: AudioWorkletNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let usedWorklet = false;

  try {
    if (!audioCtx.audioWorklet) throw new Error("no audioWorklet");
    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await audioCtx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    workletNode = new AudioWorkletNode(audioCtx, "pcm-capture");
    workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const resampled = resampler.push(ev.data);
      if (resampled.length) flush(resampled);
    };
    source.connect(workletNode);
    // Not connected to destination: we never want to hear our own mic.
    usedWorklet = true;
  } catch {
    // Fallback: ScriptProcessorNode (deprecated but universally supported).
    const bufferSize = 4096;
    scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    scriptNode.onaudioprocess = (ev: AudioProcessingEvent) => {
      const input = ev.inputBuffer.getChannelData(0);
      const resampled = resampler.push(new Float32Array(input));
      if (resampled.length) flush(resampled);
    };
    source.connect(scriptNode);
    // ScriptProcessor requires a destination connection to actually pump
    // process events in every browser; route through a zero-gain node so
    // nothing is audible.
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    scriptNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);
  }

  let stopped = false;
  return {
    method: usedWorklet ? "worklet" : "scriptprocessor",
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        workletNode?.port.close();
        workletNode?.disconnect();
      } catch {}
      try {
        scriptNode?.disconnect();
      } catch {}
      try {
        source.disconnect();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    },
  };
}

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */

export interface TtsChunk {
  b64: string;
  /** Only "linear16" is produced by the relay today; anything else throws. */
  codec: string;
  sampleRate: number;
}

export interface CreatePlayerOptions {
  /**
   * Optional instrumentation hook, fired once per rendered audio block with
   * the RMS amplitude of the mix bus and the AudioContext time it occurred
   * at. Used by the test harness to prove stopNow() actually silences
   * output rather than just detaching JS references. Never used in prod.
   */
  onLevel?: (rms: number, atContextTime: number) => void;
  /** Fired when the queue drains naturally (all scheduled audio finished). */
  onDrain?: () => void;
}

export interface Player {
  /** Queue one chunk of linear16 PCM for gapless playback. */
  push(chunk: TtsChunk): void;
  /**
   * Stop all output and discard every queued/scheduled buffer immediately.
   * Synchronous — safe to call from inside a WebSocket onmessage handler
   * before any state update. Must complete in well under 200ms.
   */
  stopNow(): void;
  /** True while there is audio queued or currently playing. */
  isActive(): boolean;
  /** Tear down the AudioContext entirely (call on unmount). */
  dispose(): void;
}

export function createPlayer(opts: CreatePlayerOptions = {}): Player {
  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();

  const mixBus = ctx.createGain();
  mixBus.gain.value = 1;
  mixBus.connect(ctx.destination);

  let levelTap: ScriptProcessorNode | null = null;
  if (opts.onLevel) {
    // Small buffer for fine-grained timing; only wired up when requested
    // (test harness) since it forces main-thread callbacks in prod builds.
    levelTap = ctx.createScriptProcessor(512, 1, 1);
    levelTap.onaudioprocess = (ev: AudioProcessingEvent) => {
      const data = ev.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
      const rms = Math.sqrt(sumSq / data.length);
      opts.onLevel!(rms, ctx.currentTime);
      // pass-through silence to destination is unnecessary; this tap is
      // analysis-only, so leave its output untouched (zeros).
    };
    mixBus.connect(levelTap);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    levelTap.connect(sink);
    sink.connect(ctx.destination);
  }

  let nextStartTime = 0;
  let scheduled: AudioBufferSourceNode[] = [];
  let pendingCount = 0;

  function forgetNode(node: AudioBufferSourceNode) {
    const i = scheduled.indexOf(node);
    if (i >= 0) scheduled.splice(i, 1);
    pendingCount = Math.max(0, pendingCount - 1);
    if (pendingCount === 0 && scheduled.length === 0) {
      opts.onDrain?.();
    }
  }

  return {
    push(chunk: TtsChunk) {
      if (chunk.codec !== "linear16") {
        throw new Error(`createPlayer: unsupported codec "${chunk.codec}", expected linear16`);
      }
      const int16 = base64ToInt16(chunk.b64);
      if (int16.length === 0) return;
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);

      const buffer = ctx.createBuffer(1, float32.length, chunk.sampleRate);
      buffer.copyToChannel(float32, 0);

      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(mixBus);

      const now = ctx.currentTime;
      const startAt = Math.max(now, nextStartTime);
      node.start(startAt);
      nextStartTime = startAt + buffer.duration;

      pendingCount++;
      scheduled.push(node);
      node.onended = () => forgetNode(node);
    },

    stopNow() {
      // Synchronous: stop() takes effect at the next audio render quantum
      // (sub-millisecond to a few ms), which is what gets us under the
      // 200ms barge-in budget. No awaits, no React, no setTimeout.
      const toStop = scheduled;
      scheduled = [];
      pendingCount = 0;
      for (const node of toStop) {
        try {
          node.onended = null;
          node.stop(0);
          node.disconnect();
        } catch {
          // Node may have already finished/been stopped; ignore.
        }
      }
      nextStartTime = ctx.currentTime;
    },

    isActive() {
      return scheduled.length > 0;
    },

    dispose() {
      this.stopNow();
      try {
        levelTap?.disconnect();
      } catch {}
      try {
        mixBus.disconnect();
      } catch {}
      ctx.close().catch(() => {});
    },
  };
}
