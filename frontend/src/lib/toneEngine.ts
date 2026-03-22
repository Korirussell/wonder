/**
 * Tone.js Audio Engine for Wonder
 * 
 * Wraps Tone.Transport (master clock), Tone.Sampler (drum rack),
 * Tone.Player (stem playback), and Tone.Waveform (visualizer data).
 * 
 * This replaces the raw AudioContext/HTMLAudioElement approach in useDAWEngine.ts
 */

"use client";

import * as Tone from "tone";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DrumKit {
  kick: Tone.Player | null;
  snare: Tone.Player | null;
  hihat: Tone.Player | null;
  openHat: Tone.Player | null;
}

export interface DrumPattern {
  kick: boolean[];
  snare: boolean[];
  hihat: boolean[];
  openHat: boolean[];
}

export interface StemPlayer {
  id: string;
  name: string;
  player: Tone.Player;
  volume: Tone.Volume;
}

// ─── Singleton Engine ────────────────────────────────────────────────────────

class ToneEngine {
  private initialized = false;
  private drumKit: DrumKit = { kick: null, snare: null, hihat: null, openHat: null };
  private drumPattern: DrumPattern = {
    kick:    Array(16).fill(false),
    snare:   Array(16).fill(false),
    hihat:   Array(16).fill(false),
    openHat: Array(16).fill(false),
  };
  private drumSequence: Tone.Sequence | null = null;
  private stems: Map<string, StemPlayer> = new Map();
  private waveform: Tone.Waveform | null = null;
  private fft: Tone.FFT | null = null;
  private masterVolume: Tone.Volume | null = null;
  private metronome: Tone.Synth | null = null;
  private metronomeEnabled = false;

  // ─── Init ──────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;

    await Tone.start();

    this.masterVolume = new Tone.Volume(0).toDestination();
    this.waveform = new Tone.Waveform(1024);
    this.fft = new Tone.FFT(256);
    this.masterVolume.connect(this.waveform);
    this.masterVolume.connect(this.fft);

    this.metronome = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -12,
    }).connect(this.masterVolume);

    this.initialized = true;
    console.log("[ToneEngine] Initialized");
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ─── Transport Controls ────────────────────────────────────────────────────

  setBPM(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  getBPM(): number {
    return Tone.getTransport().bpm.value;
  }

  async play(): Promise<void> {
    if (!this.initialized) await this.init();
    Tone.getTransport().start();
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  getPosition(): string {
    return Tone.getTransport().position as string;
  }

  isPlaying(): boolean {
    return Tone.getTransport().state === "started";
  }

  // ─── Drum Rack (Sampler) ───────────────────────────────────────────────────

  async loadDrumSample(
    slot: keyof DrumKit,
    url: string
  ): Promise<void> {
    if (!this.initialized) await this.init();

    const player = new Tone.Player(url).connect(this.masterVolume!);
    await Tone.loaded();

    if (this.drumKit[slot]) {
      this.drumKit[slot]!.dispose();
    }
    this.drumKit[slot] = player;
    console.log(`[ToneEngine] Loaded drum: ${slot} → ${url}`);
  }

  setDrumPattern(pattern: Partial<DrumPattern>): void {
    if (pattern.kick) this.drumPattern.kick = pattern.kick;
    if (pattern.snare) this.drumPattern.snare = pattern.snare;
    if (pattern.hihat) this.drumPattern.hihat = pattern.hihat;
    if (pattern.openHat) this.drumPattern.openHat = pattern.openHat;

    this.rebuildDrumSequence();
  }

  getDrumPattern(): DrumPattern {
    return { ...this.drumPattern };
  }

  private rebuildDrumSequence(): void {
    if (this.drumSequence) {
      this.drumSequence.dispose();
    }

    const steps = Array.from({ length: 16 }, (_, i) => i);

    this.drumSequence = new Tone.Sequence(
      (time, step) => {
        if (this.drumPattern.kick[step] && this.drumKit.kick) {
          this.drumKit.kick.start(time);
        }
        if (this.drumPattern.snare[step] && this.drumKit.snare) {
          this.drumKit.snare.start(time);
        }
        if (this.drumPattern.hihat[step] && this.drumKit.hihat) {
          this.drumKit.hihat.start(time);
        }
        if (this.drumPattern.openHat[step] && this.drumKit.openHat) {
          this.drumKit.openHat.start(time);
        }

        if (this.metronomeEnabled && this.metronome) {
          if (step % 4 === 0) {
            this.metronome.triggerAttackRelease(step === 0 ? "C5" : "C4", "16n", time);
          }
        }
      },
      steps,
      "16n"
    );

    this.drumSequence.start(0);
  }

  // ─── Stem Players ─────────────────────────────────────────────────────────

  async loadStem(id: string, name: string, url: string): Promise<void> {
    if (!this.initialized) await this.init();

    const existing = this.stems.get(id);
    if (existing) {
      existing.player.dispose();
      existing.volume.dispose();
    }

    const volume = new Tone.Volume(0).connect(this.masterVolume!);
    const player = new Tone.Player(url).connect(volume);
    player.loop = true;
    await Tone.loaded();

    this.stems.set(id, { id, name, player, volume });
    console.log(`[ToneEngine] Loaded stem: ${name} (${id})`);
  }

  async loadStemFromBlob(id: string, name: string, blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    await this.loadStem(id, name, url);
  }

  playStem(id: string): void {
    const stem = this.stems.get(id);
    if (stem && stem.player.loaded) {
      stem.player.sync().start(0);
    }
  }

  stopStem(id: string): void {
    const stem = this.stems.get(id);
    if (stem) {
      stem.player.unsync().stop();
    }
  }

  setStemVolume(id: string, db: number): void {
    const stem = this.stems.get(id);
    if (stem) {
      stem.volume.volume.value = db;
    }
  }

  muteStem(id: string, muted: boolean): void {
    const stem = this.stems.get(id);
    if (stem) {
      stem.volume.mute = muted;
    }
  }

  // ─── One-Shot Player ──────────────────────────────────────────────────────

  async playOneShot(url: string): Promise<void> {
    if (!this.initialized) await this.init();

    const player = new Tone.Player(url).connect(this.masterVolume!);
    await Tone.loaded();
    player.start();
    player.onstop = () => player.dispose();
  }

  async playOneShotFromBlob(blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    await this.playOneShot(url);
  }

  // ─── Visualizer Data ──────────────────────────────────────────────────────

  getWaveformValues(): Float32Array {
    if (!this.waveform) return new Float32Array(1024);
    return this.waveform.getValue();
  }

  getFFTValues(): Float32Array {
    if (!this.fft) return new Float32Array(256);
    return this.fft.getValue() as Float32Array;
  }

  // ─── Metronome ────────────────────────────────────────────────────────────

  setMetronome(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  // ─── Master Volume ────────────────────────────────────────────────────────

  setMasterVolume(db: number): void {
    if (this.masterVolume) {
      this.masterVolume.volume.value = db;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.drumSequence?.dispose();
    Object.values(this.drumKit).forEach((p) => p?.dispose());
    this.stems.forEach((s) => {
      s.player.dispose();
      s.volume.dispose();
    });
    this.stems.clear();
    this.waveform?.dispose();
    this.fft?.dispose();
    this.masterVolume?.dispose();
    this.metronome?.dispose();
    this.initialized = false;
    console.log("[ToneEngine] Disposed");
  }
}

// ─── Export singleton ────────────────────────────────────────────────────────

export const toneEngine = new ToneEngine();
export default toneEngine;
