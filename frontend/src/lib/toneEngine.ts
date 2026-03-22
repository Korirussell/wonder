/**
 * Tone.js Audio Engine for Wonder
 *
 * Signal chain per stem: Player → EQ3 → Reverb → Channel → masterVolume
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

export type DrumSlot = keyof DrumKit;

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
  eq: Tone.EQ3;
  reverb: Tone.Reverb;
  channel: Tone.Channel;
}

// ─── Singleton Engine ────────────────────────────────────────────────────────

class ToneEngine {
  private initialized = false;
  private drumKit: DrumKit = { kick: null, snare: null, hihat: null, openHat: null };
  private drumSampleNames: Record<DrumSlot, string | null> = { kick: null, snare: null, hihat: null, openHat: null };
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

  // ─── Guitar Amp Chain ─────────────────────────────────────────────────────
  private amp: {
    input:      Tone.UserMedia;
    gain:       Tone.Gain;
    distortion: Tone.Distortion;
    eq:         Tone.EQ3;
    cab:        Tone.Filter;       // cabinet hi-cut simulation
    reverb:     Tone.Reverb;       // spring reverb
    volume:     Tone.Volume;
    meter:      Tone.Meter;
    waveform:   Tone.Waveform;
  } | null = null;
  private ampActive = false;

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

  async loadDrumSample(slot: DrumSlot, url: string, name?: string): Promise<void> {
    if (!this.initialized) await this.init();

    const player = new Tone.Player({
      url,
      loop: false,
      autostart: false,
    }).connect(this.masterVolume!);
    await Tone.loaded();

    if (this.drumKit[slot]) {
      this.drumKit[slot]!.dispose();
    }
    this.drumKit[slot] = player;
    this.drumSampleNames[slot] = name ?? null;
    console.log(`[ToneEngine] Loaded drum: ${slot} → ${name ?? url}`);
  }

  async loadDrumSampleFromBlob(slot: DrumSlot, blob: Blob, name: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    await this.loadDrumSample(slot, url, name);
  }

  getSampleName(slot: DrumSlot): string | null {
    return this.drumSampleNames[slot];
  }

  getAllSampleNames(): Record<DrumSlot, string | null> {
    return { ...this.drumSampleNames };
  }

  triggerDrumPad(slot: DrumSlot): void {
    const player = this.drumKit[slot];
    if (!player || !player.loaded) return;
    try { player.stop(); } catch { /* not started yet */ }
    player.start();
  }

  setDrumPattern(pattern: Partial<DrumPattern>): void {
    if (pattern.kick)    this.drumPattern.kick    = pattern.kick;
    if (pattern.snare)   this.drumPattern.snare   = pattern.snare;
    if (pattern.hihat)   this.drumPattern.hihat   = pattern.hihat;
    if (pattern.openHat) this.drumPattern.openHat = pattern.openHat;
    this.rebuildDrumSequence();
  }

  getDrumPattern(): DrumPattern {
    return { ...this.drumPattern };
  }

  private rebuildDrumSequence(): void {
    if (this.drumSequence) this.drumSequence.dispose();

    const steps = Array.from({ length: 16 }, (_, i) => i);

    this.drumSequence = new Tone.Sequence(
      (time, step) => {
        if (this.drumPattern.kick[step]    && this.drumKit.kick)    this.drumKit.kick.start(time);
        if (this.drumPattern.snare[step]   && this.drumKit.snare)   this.drumKit.snare.start(time);
        if (this.drumPattern.hihat[step]   && this.drumKit.hihat)   this.drumKit.hihat.start(time);
        if (this.drumPattern.openHat[step] && this.drumKit.openHat) this.drumKit.openHat.start(time);

        if (this.metronomeEnabled && this.metronome && step % 4 === 0) {
          this.metronome.triggerAttackRelease(step === 0 ? "C5" : "C4", "16n", time);
        }
      },
      steps,
      "16n",
    );

    this.drumSequence.start(0);
  }

  // ─── Stem Players ─────────────────────────────────────────────────────────
  //
  // Signal chain: Player → EQ3 → Reverb → Channel → masterVolume

  async loadStem(
    id: string,
    name: string,
    url: string,
    loopConfig?: { loop: boolean; durationSeconds?: number },
  ): Promise<void> {
    if (!this.initialized) await this.init();

    // Dispose previous nodes for this id
    const existing = this.stems.get(id);
    if (existing) {
      existing.player.dispose();
      existing.eq.dispose();
      existing.reverb.dispose();
      existing.channel.dispose();
    }

    const shouldLoop = loopConfig?.loop ?? false;

    // Build the FX chain (no connections yet — chain() will wire them)
    const channel = new Tone.Channel({ volume: 0 }).connect(this.masterVolume!);

    const reverb = new Tone.Reverb({ decay: 2.5 });
    reverb.wet.value = 0; // start dry; user can increase
    await reverb.generate();   // CRITICAL: must call before audio passes through
    reverb.connect(channel);

    const eq = new Tone.EQ3(0, 0, 0);
    eq.connect(reverb);

    const player = new Tone.Player({
      url,
      loop: shouldLoop,
      autostart: false,
      onload: () => {
        if (shouldLoop) {
          player.loopStart = 0;
          player.loopEnd = loopConfig?.durationSeconds ?? player.buffer.duration;
        }
      },
    });
    player.connect(eq);
    await Tone.loaded();

    this.stems.set(id, { id, name, player, eq, reverb, channel });
    console.log(`[ToneEngine] Loaded stem: ${name} (${id})${shouldLoop ? " [loop]" : ""}`);
  }

  async loadStemFromBlob(
    id: string,
    name: string,
    blob: Blob,
    loopConfig?: { loop: boolean; durationSeconds?: number },
  ): Promise<void> {
    const url = URL.createObjectURL(blob);
    await this.loadStem(id, name, url, loopConfig);
  }

  removeStem(id: string): void {
    const stem = this.stems.get(id);
    if (!stem) return;
    stem.player.dispose();
    stem.eq.dispose();
    stem.reverb.dispose();
    stem.channel.dispose();
    this.stems.delete(id);
  }

  /**
   * Schedule a stem to play at a specific transport position.
   * @param id          Stem / track ID
   * @param transportStartSec  When (in transport seconds) this block starts
   * @param bufferOffsetSec    Where in the audio file to begin (0 = from beginning)
   * @param durationSec        How many seconds to play before stopping (undefined = until EOF)
   * @param firstBlock         Pass `false` for 2nd+ blocks on the same track — skips unsync/resync
   *                           so multiple .start() calls stack on the same synced player
   */
  playStem(
    id: string,
    transportStartSec = 0,
    bufferOffsetSec = 0,
    durationSec?: number,
    firstBlock = true,
  ): void {
    const stem = this.stems.get(id);
    if (!stem || !stem.player.loaded) return;
    if (firstBlock) {
      stem.player.unsync();
      stem.player.sync();
    }
    stem.player.start(transportStartSec, bufferOffsetSec, durationSec);
  }

  stopStem(id: string): void {
    const stem = this.stems.get(id);
    if (stem) {
      stem.player.unsync().stop();
    }
  }

  // Volume: maps the 0-100 UI slider to dB (-12 → 0)
  setStemVolume(id: string, db: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.volume.value = db;
  }

  rampStemVolume(id: string, db: number, seconds: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.volume.rampTo(db, seconds);
  }

  setStemPan(id: string, pan: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.pan.value = pan;
  }

  rampStemPan(id: string, pan: number, seconds: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.pan.rampTo(pan, seconds);
  }

  muteStem(id: string, muted: boolean): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.mute = muted;
  }

  setStemSolo(id: string, solo: boolean): void {
    const stem = this.stems.get(id);
    if (stem) stem.channel.solo = solo;
  }

  setStemEQ(id: string, low: number, mid: number, high: number): void {
    const stem = this.stems.get(id);
    if (!stem) return;
    stem.eq.low.value  = low;
    stem.eq.mid.value  = mid;
    stem.eq.high.value = high;
  }

  setStemReverb(id: string, wet: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.reverb.wet.value = Math.max(0, Math.min(1, wet));
  }

  getStemDuration(id: string): number | null {
    const stem = this.stems.get(id);
    if (!stem || !stem.player.loaded) return null;
    return stem.player.buffer.duration;
  }

  // ─── One-Shot Player ──────────────────────────────────────────────────────

  async playOneShot(url: string): Promise<void> {
    if (!this.initialized) await this.init();
    const player = new Tone.Player({
      url,
      loop: false,
      autostart: false,
    }).connect(this.masterVolume!);
    await Tone.loaded();
    player.start();
    player.onstop = () => player.dispose();
  }

  async playOneShotFromBlob(blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    const player = new Tone.Player({
      url,
      loop: false,
      autostart: false,
    }).connect(this.masterVolume!);
    await Tone.loaded();
    player.start();
    player.onstop = () => {
      player.dispose();
      URL.revokeObjectURL(url);
    };
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
    if (this.masterVolume) this.masterVolume.volume.value = db;
  }

  // ─── Guitar Amp Methods ────────────────────────────────────────────────────

  async startAmp(): Promise<void> {
    if (!this.initialized) await this.init();
    if (this.ampActive) return;

    const input      = new Tone.UserMedia();
    await input.open();   // triggers browser mic/instrument permission prompt

    const gain       = new Tone.Gain(1);
    const distortion = new Tone.Distortion(0);
    const eq         = new Tone.EQ3(0, 0, 0);
    const cab        = new Tone.Filter({ frequency: 5000, type: "lowpass", rolloff: -24 });
    const reverb     = new Tone.Reverb({ decay: 1.8 });
    reverb.wet.value = 0;
    await reverb.generate();
    const volume   = new Tone.Volume(-6);
    const meter    = new Tone.Meter();
    const waveform = new Tone.Waveform(512);

    // Signal chain: input → gain → distortion → EQ → cab → reverb → volume → master
    input.connect(gain);
    gain.connect(distortion);
    distortion.connect(eq);
    eq.connect(cab);
    cab.connect(reverb);
    reverb.connect(volume);
    volume.connect(this.masterVolume!);
    volume.connect(meter);
    volume.connect(waveform);

    this.amp       = { input, gain, distortion, eq, cab, reverb, volume, meter, waveform };
    this.ampActive = true;
    console.log("[ToneEngine] Amp started");
  }

  stopAmp(): void {
    if (!this.amp) return;
    try { this.amp.input.close(); } catch { /* ignore */ }
    this.amp.gain.dispose();
    this.amp.distortion.dispose();
    this.amp.eq.dispose();
    this.amp.cab.dispose();
    this.amp.reverb.dispose();
    this.amp.volume.dispose();
    this.amp.meter.dispose();
    this.amp.waveform.dispose();
    this.amp       = null;
    this.ampActive = false;
    console.log("[ToneEngine] Amp stopped");
  }

  setAmpGain(v: number): void {          // 0.5–8 preamp gain
    if (this.amp) this.amp.gain.gain.value = v;
  }
  setAmpDistortion(v: number): void {    // 0–1 overdrive amount
    if (this.amp) this.amp.distortion.distortion = v;
  }
  setAmpEQ(low: number, mid: number, high: number): void {  // dB each
    if (!this.amp) return;
    this.amp.eq.low.value  = low;
    this.amp.eq.mid.value  = mid;
    this.amp.eq.high.value = high;
  }
  setAmpPresence(freq: number): void {   // cab sim cutoff 2 000–9 000 Hz
    if (this.amp) this.amp.cab.frequency.value = freq;
  }
  setAmpReverb(wet: number): void {      // 0–1
    if (this.amp) this.amp.reverb.wet.value = Math.max(0, Math.min(1, wet));
  }
  setAmpMasterVolume(db: number): void { // −30–0 dB
    if (this.amp) this.amp.volume.volume.value = db;
  }
  getAmpMeterValue(): number {
    if (!this.amp) return -Infinity;
    const v = this.amp.meter.getValue();
    return typeof v === "number" ? v : -Infinity;
  }
  getAmpWaveform(): Float32Array {
    if (!this.amp) return new Float32Array(512);
    return this.amp.waveform.getValue();
  }
  isAmpActive(): boolean { return this.ampActive; }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.stopAmp();
    this.drumSequence?.dispose();
    Object.values(this.drumKit).forEach((p) => p?.dispose());
    this.stems.forEach((s) => {
      s.player.dispose();
      s.eq.dispose();
      s.reverb.dispose();
      s.channel.dispose();
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
