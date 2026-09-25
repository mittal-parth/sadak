/**
 * Mic capture for streaming STT: mono PCM s16le @16kHz as base64 frames.
 * Game-owned — no roznamcha imports.
 */

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
  stop(): void;
  readonly method: "worklet" | "scriptprocessor";
}

export interface CreateMicStreamOptions {
  /** Target frame duration in ms. Default 30 (~20–40ms per Sarvam guidance). */
  frameMs?: number;
}

const TARGET_SAMPLE_RATE = 16000;

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

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

class StreamResampler {
  private readonly ratio: number;
  private phase = 0;
  private lastSample = 0;

  constructor(inRate: number, outRate: number) {
    this.ratio = inRate / outRate;
  }

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
    return Float32Array.from(out);
  }
}

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

export async function createMicStream(
  onFrame: (base64Frame: string) => void,
  opts: CreateMicStreamOptions = {}
): Promise<MicStreamHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
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
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicError("denied", "Microphone access was denied.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new MicError("no-device", "No microphone was found.");
    }
    throw new MicError("unknown", (err as Error)?.message ?? "Could not open the microphone.");
  }

  const AudioCtx: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  const audioCtx = new AudioCtx();
  const resampler = new StreamResampler(audioCtx.sampleRate, TARGET_SAMPLE_RATE);

  const frameMs = opts.frameMs ?? 30;
  const frameSamples = Math.round((TARGET_SAMPLE_RATE * frameMs) / 1000);
  let pending: number[] = [];

  const flush = (float32: Float32Array) => {
    for (let i = 0; i < float32.length; i++) pending.push(float32[i]);
    while (pending.length >= frameSamples) {
      const slice = pending.splice(0, frameSamples);
      onFrame(int16ToBase64(floatToInt16(Float32Array.from(slice))));
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
    usedWorklet = true;
  } catch {
    const bufferSize = 4096;
    scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    scriptNode.onaudioprocess = (ev: AudioProcessingEvent) => {
      const input = ev.inputBuffer.getChannelData(0);
      const resampled = resampler.push(new Float32Array(input));
      if (resampled.length) flush(resampled);
    };
    source.connect(scriptNode);
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
      } catch {
        /* ignore */
      }
      try {
        scriptNode?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    },
  };
}
