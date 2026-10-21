/**
 * Banda sonora procedural tecno-noir / synth electrónico (Web Audio API).
 * Estética de género: arpegios rápidos, bajo impulsivo, pads — inspiración de estilo,
 * NO una reproducción de "The Son of Flynn" ni de ninguna pista con derechos de autor.
 */

export class AudioDirector {
  constructor(config = {}) {
    this.enabled = true;
    this.volume = (config.volumes && config.volumes.music != null) ? config.volumes.music : 0.5;
    this.ctx = null;
    this.master = null;
    this.filterBus = null;
    this.started = false;
    this.nodes = [];
    this.timers = [];
    this.phase = "explore";
    this.step = 0;
    this.bpm = 108;
  }

  async ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return;
    }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.filterBus = this.ctx.createBiquadFilter();
    this.filterBus.type = "lowpass";
    this.filterBus.frequency.value = 5200;
    this.filterBus.Q.value = 0.6;
    this.filterBus.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    await this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch (_) {}
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  stopAll() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const n of this.nodes) {
      try { n.stop?.(); n.disconnect?.(); } catch (_) {}
    }
    this.nodes = [];
    this.started = false;
    this.step = 0;
  }

  async startAmbient(kind = "explore") {
    await this.resume();
    if (!this.enabled || !this.ctx) return;
    this.stopAll();
    this.started = true;
    this.phase = kind;
    this.step = 0;

    this.bpm = kind === "alert" ? 128 : kind === "judgment" ? 92 : 108;
    const beatMs = 60000 / this.bpm;
    const now = this.ctx.currentTime;

    const root = kind === "judgment" ? 55 : kind === "alert" ? 61.74 : 58.27;
    this._sustainedPad(root, 0.07, now);
    this._sustainedPad(root * 1.5, 0.045, now);
    this._sustainedPad(root * 2, 0.03, now);

    const arpExplore = [0, 3, 7, 10, 12, 10, 7, 3, 0, 7, 12, 15, 12, 7, 3, 0];
    const arpAlert = [0, 1, 3, 7, 8, 7, 3, 1, 0, 3, 7, 12, 15, 12, 7, 3];
    const arpJudge = [0, 5, 7, 12, 7, 5, 0, 7, 12, 16, 12, 7, 5, 0, 5, 12];
    const pattern = kind === "alert" ? arpAlert : kind === "judgment" ? arpJudge : arpExplore;
    const baseFreq = kind === "judgment" ? 110 : kind === "alert" ? 146.83 : 130.81;

    const bassPattern = kind === "alert"
      ? [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0]
      : [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0];

    const stepMs = beatMs / 2;
    const timer = setInterval(() => {
      if (!this.ctx || !this.started) return;
      const i = this.step % 16;
      const semitones = pattern[i];
      const freq = baseFreq * Math.pow(2, semitones / 12);

      this._arpNote(freq, kind === "alert" ? 0.055 : 0.04, kind);
      if (i % 4 === 0) this._arpNote(freq * 2, 0.02, kind, 0.03);

      if (bassPattern[i]) {
        const bassF = root * (i % 8 < 4 ? 1 : 0.75);
        this._bassHit(bassF, kind === "alert" ? 0.18 : 0.14);
      }
      if (i % 2 === 1) this._hat(0.025);
      if (i === 0 || i === 8) this._kick(kind === "alert" ? 0.16 : 0.12);

      this.step++;
    }, stepMs);
    this.timers.push(timer);
    this._noiseBed(kind === "judgment" ? 0.012 : 0.016);
  }

  setPhase(phase) {
    if (phase === this.phase && this.started) return;
    this.startAmbient(phase);
  }

  _sustainedPad(freq, gain, when) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc1.type = "sawtooth";
    osc2.type = "sawtooth";
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.005;
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 0.8;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 2);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.filterBus || this.master);
    osc1.start(when);
    osc2.start(when);
    this.nodes.push(osc1, osc2, g, filter);
  }

  _arpNote(freq, gain, kind, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = kind === "judgment" ? "triangle" : "square";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 4, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.filterBus || this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  _bassHit(freq, gain) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.65), t + 0.2);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g);
    g.connect(this.filterBus || this.master);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  _kick(gain) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(this.filterBus || this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  _hat(gain) {
    const t = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.filterBus || this.master);
    src.start(t);
    src.stop(t + 0.05);
  }

  _noiseBed(gain) {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.filterBus || this.master);
    noise.start();
    this.nodes.push(noise, g, filter);
  }

  uiClick() {
    if (!this.ctx || !this.started) return;
    this._arpNote(988, 0.04, "explore");
  }

  captureSting() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.7);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.8);
  }
}
