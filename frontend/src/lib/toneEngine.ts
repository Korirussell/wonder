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
  // Amp sim chain (before user EQ): Player → ampDrive → ampTone → cabSim → eq → reverb → channel
  ampDrive: Tone.Distortion;
  ampTone: Tone.EQ3;
  cabSim: Tone.Filter;
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
      existing.ampDrive.dispose();
      existing.ampTone.dispose();
      existing.cabSim.dispose();
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

    // ── Amp sim chain (bypassed by default) ──────────────────────────────────
    // Cabinet sim: lowpass at ~4500 Hz simulates speaker; 20000 = open/bypassed
    const cabSim = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -12 });
    cabSim.connect(eq);

    // Amp tone stack (independent from user EQ)
    const ampTone = new Tone.EQ3(0, 0, 0);
    ampTone.connect(cabSim);

    // Preamp drive — wet=0 means fully dry (bypassed) until enabled
    const ampDrive = new Tone.Distortion({ distortion: 0.5, wet: 0, oversample: "2x" });
    ampDrive.connect(ampTone);

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
    player.connect(ampDrive);
    await Tone.loaded();

    this.stems.set(id, { id, name, player, ampDrive, ampTone, cabSim, eq, reverb, channel });
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
    stem.ampDrive.dispose();
    stem.ampTone.dispose();
    stem.cabSim.dispose();
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

  // ─── Amp Simulator ────────────────────────────────────────────────────────

  /** Enable/disable amp sim (wet=1 routes through distortion, 0 = dry bypass) */
  setStemAmpEnabled(id: string, enabled: boolean): void {
    const stem = this.stems.get(id);
    if (stem) stem.ampDrive.wet.value = enabled ? 1 : 0;
  }

  /** Drive amount 0–1 (preamp distortion) */
  setStemAmpDrive(id: string, drive: number): void {
    const stem = this.stems.get(id);
    if (stem) stem.ampDrive.distortion = Math.max(0, Math.min(1, drive));
  }

  /** Amp tone stack — bass/mid/treble in dB */
  setStemAmpTone(id: string, bass: number, mid: number, treble: number): void {
    const stem = this.stems.get(id);
    if (!stem) return;
    stem.ampTone.low.value = bass;
    stem.ampTone.mid.value = mid;
    stem.ampTone.high.value = treble;
  }

  /** Cabinet sim — true = lowpass at ~4500 Hz (speaker roll-off), false = open */
  setStemAmpCabinet(id: string, enabled: boolean): void {
    const stem = this.stems.get(id);
    if (stem) stem.cabSim.frequency.value = enabled ? 4500 : 20000;
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

  /** Enumerate audio input devices. Requires mic permission — call after first getUserMedia grant. */
  async listAudioInputs(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  async startAmp(deviceId?: string): Promise<void> {
    if (!this.initialized) await this.init();
    if (this.ampActive) return;

    const input      = new Tone.UserMedia();
    // Pass deviceId so the user can pick a specific input (e.g. line 2 on an interface)
    await input.open(deviceId);   // triggers browser mic/instrument permission prompt

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

  // ─── Loopback Latency Calibration ────────────────────────────────────────
  //
  // Plays a short impulse through the output, records the mic simultaneously,
  // then finds the peak in the recorded buffer to measure round-trip latency.
  // Requires: mic permission + audio playing through speakers (not headphones
  // will work but loopback through the same interface input is most accurate).
  //
  // Returns latency in seconds, or throws on error.

  async measureRecordingLatency(): Promise<number> {
    if (!this.initialized) await this.init();

    const RECORD_DURATION_MS = 600;
    const CLICK_OFFSET_MS    = 50;  // small gap before the click fires

    // Open mic
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    const ctx = new AudioContext();

    // Build a short impulsive click buffer (1ms single-sample spike)
    const clickBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.001), ctx.sampleRate);
    clickBuf.getChannelData(0)[0] = 1.0;

    // Record everything coming in from the mic
    const micSrc   = ctx.createMediaStreamSource(stream);
    const recorder = ctx.createScriptProcessor(4096, 1, 1);
    const recorded: Float32Array[] = [];
    recorder.onaudioprocess = (e) => {
      recorded.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    micSrc.connect(recorder);
    recorder.connect(ctx.destination);   // must be connected to run

    // Wait a bit then fire the click
    await new Promise<void>((r) => setTimeout(r, CLICK_OFFSET_MS));
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    clickSrc.connect(ctx.destination);
    const clickFiredAt = ctx.currentTime;
    clickSrc.start();

    // Record for RECORD_DURATION_MS
    await new Promise<void>((r) => setTimeout(r, RECORD_DURATION_MS));

    // Tear down
    micSrc.disconnect();
    recorder.disconnect();
    stream.getTracks().forEach((t) => t.stop());

    // Flatten recorded chunks into one array
    const totalSamples = recorded.reduce((sum, c) => sum + c.length, 0);
    const flat = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of recorded) { flat.set(chunk, offset); offset += chunk.length; }

    // Find the sample index with maximum absolute amplitude (the click echo)
    let peakIdx = 0;
    let peakAmp = 0;
    for (let i = 0; i < flat.length; i++) {
      const v = Math.abs(flat[i]);
      if (v > peakAmp) { peakAmp = v; peakIdx = i; }
    }

    await ctx.close();

    if (peakAmp < 0.01) {
      // Nothing detected — mic not picking up output (headphones / different device)
      throw new Error("No loopback signal detected — make sure speakers are on and mic can hear them");
    }

    // Time from click fire → peak arrival
    const clickFiredSample = Math.round(clickFiredAt * ctx.sampleRate);
    const latencySamples   = peakIdx - clickFiredSample;
    const latencySec       = Math.max(0, latencySamples / ctx.sampleRate);

    console.log(`[ToneEngine] Loopback latency measured: ${(latencySec * 1000).toFixed(1)} ms (peak amp ${peakAmp.toFixed(3)})`);
    return latencySec;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.stopAmp();
    this.drumSequence?.dispose();
    Object.values(this.drumKit).forEach((p) => p?.dispose());
    this.stems.forEach((s) => {
      s.player.dispose();
      s.ampDrive.dispose();
      s.ampTone.dispose();
      s.cabSim.dispose();
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
