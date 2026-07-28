/**
 * Module-singleton Web Audio backbone for one-shot SFX playback (ported from
 * kahani's `lib/sound-engine.ts`). One `AudioContext`, one decode cache keyed
 * by data URI (SFX clips are tiny and reused constantly — decoding once beats
 * decoding on every play), and a master `GainNode` so muting is a real gain
 * ramp rather than an `if` guard scattered across every call site.
 */

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();

/** Lazily create the shared context + master gain, and arm the autoplay unlock. */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioContext = new Ctor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioContext.destination);

    // Browsers block audio until a user gesture; the game is driven by
    // keyboard/pointer input, so resume on the first interaction anywhere.
    if (audioContext.state === "suspended") {
      const ctx = audioContext;
      const unlock = () => {
        void ctx.resume().catch(() => {});
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    }
  }
  return audioContext;
}

/** Mute/unmute every SFX at once, without touching individual play calls. */
export function setSfxMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  const ctx = getAudioContext();
  if (!masterGain) return;
  masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
}

async function decodeAudioData(dataUri: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(dataUri);
  if (cached) return cached;

  const ctx = getAudioContext();
  const base64 = dataUri.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
  bufferCache.set(dataUri, audioBuffer);
  return audioBuffer;
}

export interface PlaySoundOptions {
  volume?: number;
  playbackRate?: number;
}

/** Decode (or reuse) a clip and play it once through the master gain. */
export async function playSound(dataUri: string, options: PlaySoundOptions = {}): Promise<void> {
  const { volume = 1, playbackRate = 1 } = options;
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
  if (!masterGain) return;

  const buffer = await decodeAudioData(dataUri);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(masterGain);
  source.start(0);
}
