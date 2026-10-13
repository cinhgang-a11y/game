// Tiny WebAudio synth: engine hum and blips. No asset files needed.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur = 0.15, type = 'square', vol = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(name) {
    switch (name) {
      case 'count': return this.tone(440, 0.18);
      case 'go': return this.tone(880, 0.45);
      case 'boost': return this.tone(200, 0.4, 'sawtooth', 0.15, 900);
      case 'miniturbo': return this.tone(500, 0.2, 'triangle', 0.2, 900);
      case 'miniturbo2': return this.tone(500, 0.35, 'triangle', 0.25, 1400);
      case 'item': return [0, 1, 2].forEach((i) => setTimeout(() => this.tone(600 + i * 200, 0.08, 'triangle', 0.15), i * 60));
      case 'bump': return this.tone(120, 0.12, 'square', 0.12, 60);
      case 'spin': return this.tone(700, 0.6, 'sawtooth', 0.12, 120);
      case 'lap': return [0, 1].forEach((i) => setTimeout(() => this.tone(660 + i * 220, 0.15, 'triangle', 0.2), i * 120));
      case 'finish': return [0, 1, 2, 3].forEach((i) => setTimeout(() => this.tone([523, 659, 784, 1046][i], 0.25, 'triangle', 0.22), i * 140));
      case 'shield': return this.tone(300, 0.3, 'sine', 0.2, 600);
      case 'shieldpop': return this.tone(900, 0.15, 'sine', 0.2, 300);
    }
  }

  setEngine(speed, on) {
    if (!this.ctx) return;
    if (!this.engine) {
      const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth';
      f.type = 'lowpass';
      f.frequency.value = 600;
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      this.engine = { o, g };
    }
    const t = this.ctx.currentTime;
    this.engine.o.frequency.setTargetAtTime(55 + Math.abs(speed) * 4.2, t, 0.05);
    this.engine.g.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.1);
  }
}
