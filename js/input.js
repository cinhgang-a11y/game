// Keyboard + touch input. `pressed` lets callers detect single taps (items, pause).
export class Input {
  constructor() {
    this.keys = new Set();
    this.taps = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.code)) this.taps.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
  }

  bindTouch() {
    const pad = document.getElementById('touch');
    if (!pad) return;
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    for (const btn of pad.querySelectorAll('[data-k]')) {
      const k = btn.dataset.k;
      const on = (e) => { e.preventDefault(); if (k === 'item' || k === 'pause') this.taps.add(k === 'item' ? 'KeyE' : 'Escape'); else this.touch[k] = true; btn.classList.add('on'); };
      const off = (e) => { e.preventDefault(); if (k in this.touch) this.touch[k] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
  }

  pressed(...codes) {
    return codes.some((c) => this.taps.has(c));
  }

  /** Like pressed(), but each tap is only reported once (physics runs several sub-steps per frame). */
  consume(...codes) {
    let hit = false;
    for (const c of codes) if (this.taps.delete(c)) hit = true;
    return hit;
  }

  endFrame() {
    this.taps.clear();
  }

  read() {
    const k = this.keys, t = this.touch;
    const left = k.has('ArrowLeft') || k.has('KeyA') || t.left;
    const right = k.has('ArrowRight') || k.has('KeyD') || t.right;
    return {
      throttle: k.has('ArrowUp') || k.has('KeyW') || t.gas,
      brake: k.has('ArrowDown') || k.has('KeyS') || t.brake,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      drift: k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || t.drift,
      useItem: this.consume('KeyE', 'KeyX', 'ControlLeft', 'Enter'),
    };
  }
}
