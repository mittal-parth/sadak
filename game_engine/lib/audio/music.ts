/**
 * Generative Web Audio background music, ported from kahani's `lib/music.ts`.
 *
 * Instead of shipping licensed tracks (weight + licensing) or generating
 * audio through a model (slow, costs credits), each district gets a small
 * recipe — scale, chord loop, tempo, timbre, rhythm — that a tiny engine
 * performs live in the browser. Zero network, zero cost, loops forever
 * without seams.
 *
 * Unlike kahani, SADAK has a *fixed* set of four districts rather than
 * player-authored worlds, so the keyword-matching/FNV-hash theme picker and
 * the `MusicThemeId` union are dropped entirely: themes are looked up
 * directly by district id via `DISTRICT_THEMES`.
 */

/** A generative "track": the musical recipe the engine performs. */
export type MusicTheme = {
  /** District id this theme belongs to (also the map key in DISTRICT_THEMES). */
  id: string;
  /**
   * Signature melody: scale degrees played evenly across EVERY bar.
   * This is what makes each track instantly recognisable; the pads and
   * random ornaments only add texture around it.
   */
  motif: number[];
  /** Semitone offsets of the scale, starting at the root. */
  scale: number[];
  /** MIDI note of the scale root (pads play here, drone an octave below). */
  root: number;
  /** Seconds per bar, one pad chord per bar. Tempo is the loudest cue. */
  barSeconds: number;
  /** Chord loop, each chord a list of scale-degree indices. */
  chords: number[][];
  /** Oscillator shape for the sustained pad chords. */
  padWave: OscillatorType;
  /** Pad loudness (0-1). */
  padLevel: number;
  /** Oscillator shape for the plucked/bell melody notes. */
  melodyWave: OscillatorType;
  /** Probability per bar that a melody phrase plays. */
  melodyChance: number;
  /** How many melody notes per phrase: [min, max]. */
  melodyNotes: [number, number];
  /** Octave shift of melody notes above the pad register. */
  melodyOctave: number;
  /** Seconds each melody note rings (bells long, plucks short). */
  melodyDecay: number;
  /** True snaps melody onto an 8th-note grid (rhythmic), false floats free. */
  melodyOnGrid: boolean;
  /** Echo tap time in seconds (longer = more spacious). */
  echoTime: number;
  /** Echo feedback 0-1 (higher = longer tail). */
  echoFeedback: number;
  /** Low-pass cutoff in Hz, the overall brightness of the mix. */
  brightness: number;
  /** Level of the continuous root drone (0 disables it). */
  droneLevel: number;
  /**
   * Rhythmic groove, one octave below the pad root: this is the strongest
   * differentiator between themes, far more than scale/harmony reads on a
   * casual listen. Each entry is a bar-fraction (0-1) where a plucked bass
   * note fires; the pattern's shape (four-on-the-floor vs syncopated vs
   * sparse) is what makes a theme instantly identifiable by ear.
   */
  bassPattern: number[];
  bassWave: OscillatorType;
  bassLevel: number;
  bassDecay: number;
  /** Hand-drum thumps per bar (0 disables percussion — every theme now has
   *  at least a soft one; a rhythm-less theme is what made Kolkata feel
   *  dead before). */
  pulseBeats: number;
  /** Pulse loudness 0-1. */
  pulseLevel: number;
  /** Starting Hz of the percussion's pitch-drop thump — this alone gives a
   *  theme its drum "character" (high shaker vs deep dhol boom). */
  percHz: number;
};

/**
 * Four cheerful, upbeat themes, one per district — a language-learning game
 * should sound encouraging, not atmospheric. Earlier drafts leaned on slow
 * tempos, minor scales and a heavy sustained drone to match each district's
 * moody blurb ("dust, gold light", "rain-washed dusk"); that read as sad
 * background-movie-score rather than "come learn a phrase", so this version
 * drops the drone entirely, moves every scale to a bright major/pentatonic
 * mode, speeds the tempo up, and keeps a short plucky marimba-ish motif
 * running almost constantly. Regional identity now comes from scale colour,
 * instrumentation and rhythm pattern, not mood.
 */
export const DISTRICT_THEMES: Record<string, MusicTheme> = {
  // Old Delhi: bright Lydian (raised 4th) for a lift-off, Bollywood-brass
  // feel, syncopated bounce in the bass so it still reads as distinctly
  // "Delhi" against Bangalore's straight four-on-the-floor.
  "purani-sadak": {
    id: "purani-sadak",
    motif: [0, 2, 4, 2], // cheerful up-and-back skip
    scale: [0, 2, 4, 6, 7, 9, 11], // Lydian — major with a bright raised 4th
    root: 48, // C3
    barSeconds: 2.2,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [4, 6, 8],
      [0, 2, 4],
    ],
    padWave: "triangle",
    padLevel: 0.3,
    melodyWave: "triangle",
    melodyChance: 0.8,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.35,
    melodyOnGrid: true, // steady, rhythmic — a game loop, not a floating ambience
    echoTime: 0.25,
    echoFeedback: 0.2,
    brightness: 2800,
    droneLevel: 0, // no sustained drone — that was the biggest source of "sad"
    bassPattern: [0, 0.375, 0.5, 0.75], // syncopated bounce
    bassWave: "triangle",
    bassLevel: 0.45,
    bassDecay: 0.22,
    pulseBeats: 4,
    pulseLevel: 0.35,
    percHz: 420, // bright clap-ish tick
  },
  // Chennai shore road: major pentatonic, the brightest and airiest register
  // of the four — a breezy, sparkly loop rather than a spacious ambient one.
  "marina-nagar": {
    id: "marina-nagar",
    motif: [0, 4, 7, 4], // bright triad bounce
    scale: [0, 2, 4, 7, 9], // major pentatonic
    root: 60, // C4 — the brightest register
    barSeconds: 2.0,
    chords: [
      [0, 2, 4],
      [2, 4, 6],
      [1, 3, 5],
      [0, 2, 4],
    ],
    padWave: "sine",
    padLevel: 0.25,
    melodyWave: "triangle",
    melodyChance: 0.85,
    melodyNotes: [1, 2],
    melodyOctave: 2,
    melodyDecay: 0.4,
    melodyOnGrid: true,
    echoTime: 0.3,
    echoFeedback: 0.25,
    brightness: 3200,
    droneLevel: 0,
    bassPattern: [0, 0.5], // light, breezy sway
    bassWave: "sine",
    bassLevel: 0.3,
    bassDecay: 0.3,
    pulseBeats: 4,
    pulseLevel: 0.25,
    percHz: 700, // high, airy shaker tick
  },
  // Bengaluru: Mixolydian (major with a bluesy flat 7th) for urban energy —
  // a driving four-on-the-floor bass carries the "delivery scooter" hustle
  // without the minor-key gloom of the earlier draft.
  "majestic-cross": {
    id: "majestic-cross",
    motif: [0, 2, 4, 5], // quick energetic run
    scale: [0, 2, 4, 5, 7, 9, 10], // Mixolydian
    root: 53, // F3
    barSeconds: 1.8, // the fastest, most driving of the four
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [4, 6, 8],
      [0, 2, 4],
    ],
    padWave: "sawtooth",
    padLevel: 0.22,
    melodyWave: "square", // chiptune-bright punch, matches the urban energy
    melodyChance: 0.8,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.25,
    melodyOnGrid: true,
    echoTime: 0.18,
    echoFeedback: 0.15,
    brightness: 3000,
    droneLevel: 0,
    bassPattern: [0, 0.25, 0.5, 0.75], // driving four-on-the-floor
    bassWave: "square",
    bassLevel: 0.5,
    bassDecay: 0.14, // shortest, punchiest bass of the four
    pulseBeats: 4,
    pulseLevel: 0.45,
    percHz: 260, // snappy pop
  },
  // Kolkata: a warm major scale with a folky, dance-like swing — still the
  // most relaxed tempo of the four, but bouncy rather than mournful, with a
  // friendly hand-drum pop instead of a deep funeral-dhol boom.
  "park-gully": {
    id: "park-gully",
    motif: [0, 2, 4, 2], // simple, happy skip
    scale: [0, 2, 4, 5, 7, 9, 11], // major
    root: 45, // A2 — warm, not heavy
    barSeconds: 2.4,
    chords: [
      [0, 2, 4],
      [4, 6, 8],
      [3, 5, 7],
      [0, 2, 4],
    ],
    padWave: "triangle",
    padLevel: 0.3,
    melodyWave: "triangle",
    melodyChance: 0.8,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.4,
    melodyOnGrid: true,
    echoTime: 0.3,
    echoFeedback: 0.25,
    brightness: 2600,
    droneLevel: 0,
    bassPattern: [0, 0.5, 0.75], // swaying, dance-like bounce
    bassWave: "triangle",
    bassLevel: 0.4,
    bassDecay: 0.3,
    pulseBeats: 4,
    pulseLevel: 0.35,
    percHz: 340, // warm hand-drum pop, not a deep boom
  },
  "charminar-lane": {
    id: "charminar-lane",
    motif: [0, 2, 4, 7],
    scale: [0, 2, 4, 5, 7, 9, 10],
    root: 50,
    barSeconds: 2.1,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padWave: "triangle",
    padLevel: 0.28,
    melodyWave: "triangle",
    melodyChance: 0.82,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.32,
    melodyOnGrid: true,
    echoTime: 0.22,
    echoFeedback: 0.2,
    brightness: 2900,
    droneLevel: 0,
    bassPattern: [0, 0.375, 0.5, 0.75],
    bassWave: "triangle",
    bassLevel: 0.42,
    bassDecay: 0.2,
    pulseBeats: 4,
    pulseLevel: 0.38,
    percHz: 380,
  },
  "fort-kochi": {
    id: "fort-kochi",
    motif: [0, 4, 7, 4],
    scale: [0, 2, 4, 7, 9],
    root: 58,
    barSeconds: 2.0,
    chords: [[0, 2, 4], [2, 4, 6], [1, 3, 5], [0, 2, 4]],
    padWave: "sine",
    melodyWave: "triangle",
    padLevel: 0.26,
    melodyChance: 0.84,
    melodyNotes: [1, 2],
    melodyOctave: 2,
    melodyDecay: 0.38,
    melodyOnGrid: true,
    echoTime: 0.28,
    echoFeedback: 0.22,
    brightness: 3100,
    droneLevel: 0,
    bassPattern: [0, 0.5],
    bassWave: "sine",
    bassLevel: 0.32,
    bassDecay: 0.28,
    pulseBeats: 4,
    pulseLevel: 0.28,
    percHz: 650,
  },
  "dadar-chowk": {
    id: "dadar-chowk",
    motif: [0, 2, 4, 5],
    scale: [0, 2, 4, 5, 7, 9, 10],
    root: 52,
    barSeconds: 1.9,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padWave: "sawtooth",
    padLevel: 0.24,
    melodyWave: "square",
    melodyChance: 0.78,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.26,
    melodyOnGrid: true,
    echoTime: 0.2,
    echoFeedback: 0.18,
    brightness: 2950,
    droneLevel: 0,
    bassPattern: [0, 0.25, 0.5, 0.75],
    bassWave: "square",
    bassLevel: 0.48,
    bassDecay: 0.15,
    pulseBeats: 4,
    pulseLevel: 0.42,
    percHz: 280,
  },
  "manek-chowk": {
    id: "manek-chowk",
    motif: [0, 2, 4, 2],
    scale: [0, 2, 4, 6, 7, 9, 11],
    root: 47,
    barSeconds: 2.15,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padWave: "triangle",
    padLevel: 0.3,
    melodyWave: "triangle",
    melodyChance: 0.8,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.34,
    melodyOnGrid: true,
    echoTime: 0.24,
    echoFeedback: 0.21,
    brightness: 2750,
    droneLevel: 0,
    bassPattern: [0, 0.5, 0.75],
    bassWave: "triangle",
    bassLevel: 0.4,
    bassDecay: 0.25,
    pulseBeats: 4,
    pulseLevel: 0.36,
    percHz: 360,
  },
  "hall-bazaar": {
    id: "hall-bazaar",
    motif: [0, 2, 4, 7],
    scale: [0, 2, 4, 5, 7, 9, 11],
    root: 46,
    barSeconds: 2.3,
    chords: [[0, 2, 4], [4, 6, 8], [3, 5, 7], [0, 2, 4]],
    padWave: "triangle",
    padLevel: 0.32,
    melodyWave: "triangle",
    melodyChance: 0.75,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.42,
    melodyOnGrid: true,
    echoTime: 0.32,
    echoFeedback: 0.26,
    brightness: 2500,
    droneLevel: 0,
    bassPattern: [0, 0.5, 0.75],
    bassWave: "triangle",
    bassLevel: 0.38,
    bassDecay: 0.32,
    pulseBeats: 4,
    pulseLevel: 0.32,
    percHz: 300,
  },
  "lingaraj-lane": {
    id: "lingaraj-lane",
    motif: [0, 2, 4, 2],
    scale: [0, 2, 4, 5, 7, 9, 11],
    root: 44,
    barSeconds: 2.35,
    chords: [[0, 2, 4], [4, 6, 8], [3, 5, 7], [0, 2, 4]],
    padWave: "triangle",
    padLevel: 0.29,
    melodyWave: "triangle",
    melodyChance: 0.77,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.4,
    melodyOnGrid: true,
    echoTime: 0.3,
    echoFeedback: 0.24,
    brightness: 2650,
    droneLevel: 0,
    bassPattern: [0, 0.5, 0.75],
    bassWave: "triangle",
    bassLevel: 0.37,
    bassDecay: 0.3,
    pulseBeats: 4,
    pulseLevel: 0.34,
    percHz: 320,
  },
};

/** MIDI note number → frequency in Hz. */
function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Resolve a scale-degree index (any octave) to a MIDI note. */
function degreeToMidi(theme: MusicTheme, degree: number): number {
  const n = theme.scale.length;
  const octave = Math.floor(degree / n);
  const step = theme.scale[((degree % n) + n) % n];
  return theme.root + octave * 12 + step;
}

/** Overall music level: audible character, but still under the voice. */
const MASTER_LEVEL = 0.22;
/** Seconds to fade to silence when ducked (muted, or NPC/mic active). */
const DUCK_FADE = 0.35;
/** Seconds to fade back in once ducking ends. */
const RESUME_FADE = 1.4;

/**
 * Tiny generative Web Audio performer for a {@link MusicTheme}.
 *
 * Per bar: a swelling pad chord, an optional melody phrase (echoed), an
 * optional hand-drum pulse, plus a continuous root drone, all through a
 * low-pass filter that sets the theme's brightness. Safe to construct
 * during SSR, since it only touches Web Audio on `start()`.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Duck/mute stage, ramped to 0 while muted or the NPC/mic is active. */
  private duck: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private theme: MusicTheme | null = null;
  private bar = 0;
  private muted = false;
  private ducked = false;
  private disposed = false;

  /**
   * Begin (or switch to) a theme. Idempotent for the same theme id — with
   * `reactStrictMode: false` this project's effects don't double-fire in
   * dev, but `start()` must not rely on that, since a district re-render
   * (comfort level change, etc.) can call it again with the same theme.
   */
  start(theme: MusicTheme): void {
    if (this.disposed || typeof window === "undefined") return;
    if (this.theme?.id === theme.id && this.timer !== null) return;
    this.ensureGraph();
    if (!this.ctx) return;

    this.theme = theme;
    this.bar = 0;
    const t = this.ctx.currentTime;
    this.filter!.frequency.setTargetAtTime(theme.brightness, t, 0.5);
    this.delay!.delayTime.setTargetAtTime(theme.echoTime, t, 0.5);
    this.feedback!.gain.setTargetAtTime(theme.echoFeedback, t, 0.5);
    this.restartDrone(theme);
    if (this.timer !== null) clearTimeout(this.timer);
    this.scheduleLoop();
  }

  /** Music toggle from the HUD/pause menu. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyDuck();
  }

  /** Fade out while an NPC line plays or the mic is held; fade back in after. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyDuck();
  }

  /**
   * Leave a district: stop scheduling new bars and fade to silence via the
   * duck stage (not `master`, which is a fixed level set once in
   * `ensureGraph` and never touched again — silencing it here would leave
   * the mix muted forever, since nothing restores it on the next `start`).
   * Keeps the audio context/graph alive so re-entering another district
   * starts instantly instead of rebuilding everything from scratch. The next
   * `start()` is always paired with a `setMuted`/`setDucked` call, which
   * re-applies the duck stage via `applyDuck`.
   */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.theme = null;
    if (this.ctx && this.duck) {
      this.duck.gain.cancelScheduledValues(this.ctx.currentTime);
      this.duck.gain.setTargetAtTime(0, this.ctx.currentTime, DUCK_FADE);
    }
    if (this.ctx && this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }
  }

  /** Stop playback and release the audio context. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.1);
      const ctx = this.ctx;
      setTimeout(() => void ctx.close().catch(() => {}), 500);
    }
    this.ctx = null;
  }

  /** Lazily build the shared node graph and unlock autoplay. */
  private ensureGraph(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // no Web Audio, music silently unavailable
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = MASTER_LEVEL;
    this.master.connect(ctx.destination);

    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.connect(this.duck);

    // Feedback delay gives melody notes a soft, spacious echo tail.
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.45;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.35;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.duck);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(this.delay);

    // Browsers block audio until a user gesture; the game is driven by
    // keyboard/pointer input, so resume on the first interaction.
    if (ctx.state === "suspended") {
      const unlock = () => {
        void ctx.resume().catch(() => {});
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    }
  }

  /** Swap the continuous root drone when the theme changes. */
  private restartDrone(theme: MusicTheme): void {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    if (this.drone && this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.5);
      this.drone.stop(t + 2);
    }
    if (theme.droneLevel <= 0) {
      this.drone = null;
      this.droneGain = null;
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(theme.root - 12);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(theme.droneLevel * 0.2, t, 2);
    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(t);
    this.drone = osc;
    this.droneGain = gain;
  }

  /** Schedule the current bar, then re-arm for the next one. */
  private scheduleLoop(): void {
    if (this.disposed || !this.ctx || !this.theme) return;
    this.playBar(this.ctx.currentTime + 0.05);
    this.bar += 1;
    this.timer = setTimeout(() => this.scheduleLoop(), this.theme.barSeconds * 1000);
  }

  /** Perform one bar: pad chord, signature motif, optional phrase + pulse. */
  private playBar(t: number): void {
    const { ctx, theme, filter } = this;
    if (!ctx || !theme || !filter) return;
    const barLen = theme.barSeconds;
    const chord = theme.chords[this.bar % theme.chords.length];

    for (const degree of chord) {
      const osc = ctx.createOscillator();
      osc.type = theme.padWave;
      osc.frequency.value = midiToHz(degreeToMidi(theme, degree));
      const gain = ctx.createGain();
      const peak = (0.32 * theme.padLevel) / chord.length;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + barLen * 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, t + barLen * 1.3);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(t);
      osc.stop(t + barLen * 1.4);
    }

    // The signature motif plays EVERY bar, the unmistakable identity of
    // the track. Fast themes get short plucks, slow themes long rings.
    const stepLen = barLen / theme.motif.length;
    theme.motif.forEach((motifDegree, i) => {
      const at = t + i * stepLen;
      const osc = ctx.createOscillator();
      osc.type = theme.melodyWave;
      osc.frequency.value = midiToHz(
        degreeToMidi(theme, motifDegree + theme.scale.length * theme.melodyOctave)
      );
      const decay = Math.min(theme.melodyDecay, stepLen * 1.8);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(gain);
      gain.connect(filter);
      if (this.delaySend) gain.connect(this.delaySend);
      osc.start(at);
      osc.stop(at + decay + 0.2);
    });

    if (Math.random() < theme.melodyChance) {
      const [min, max] = theme.melodyNotes;
      const notes = min + Math.floor(Math.random() * (max - min + 1));
      for (let i = 0; i < notes; i++) {
        // Rhythmic themes snap notes onto an 8th-note grid; ambient ones float.
        const at = theme.melodyOnGrid
          ? t + (Math.floor(Math.random() * 8) * barLen) / 8
          : t + Math.random() * barLen * 0.7;
        const degree =
          chord[Math.floor(Math.random() * chord.length)] + theme.scale.length * theme.melodyOctave;
        const osc = ctx.createOscillator();
        osc.type = theme.melodyWave;
        osc.frequency.value = midiToHz(degreeToMidi(theme, degree));
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.14, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + theme.melodyDecay);
        osc.connect(gain);
        gain.connect(filter);
        if (this.delaySend) gain.connect(this.delaySend);
        osc.start(at);
        osc.stop(at + theme.melodyDecay + 0.2);
      }
    }

    // Hand-drum pulse: a short pitch-dropping thump on each beat, tone set
    // per theme (high tabla-ish tick vs deep dhol boom) so the four themes
    // don't share a drum sound even where their rhythms overlap.
    if (theme.pulseBeats > 0 && theme.pulseLevel > 0) {
      for (let b = 0; b < theme.pulseBeats; b++) {
        const at = t + (b * barLen) / theme.pulseBeats;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(theme.percHz, at);
        osc.frequency.exponentialRampToValueAtTime(theme.percHz * 0.36, at + 0.09);
        const gain = ctx.createGain();
        // Off-beats land softer for a dha-ti feel instead of a metronome.
        const level = 0.5 * theme.pulseLevel * (b % 2 === 0 ? 1 : 0.55);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain);
        gain.connect(this.duck!);
        osc.start(at);
        osc.stop(at + 0.2);
      }
    }

    // Rhythmic bass, one octave below the pad root. This is the strongest
    // differentiator between themes — a syncopated groove (Delhi) reads as
    // completely different from a driving four-on-the-floor (Bangalore)
    // even over similar harmony, far more than scale choice alone does.
    for (const frac of theme.bassPattern) {
      const at = t + frac * barLen;
      const osc = ctx.createOscillator();
      osc.type = theme.bassWave;
      osc.frequency.value = midiToHz(theme.root - 12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.3 * theme.bassLevel, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + theme.bassDecay);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(at);
      osc.stop(at + theme.bassDecay + 0.2);
    }
  }

  /** Ramp the duck stage toward its target (mute and duck share it). */
  private applyDuck(): void {
    if (!this.ctx || !this.duck) return;
    const silent = this.muted || this.ducked;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(silent ? 0 : 1, t, silent ? DUCK_FADE : RESUME_FADE);
  }
}
