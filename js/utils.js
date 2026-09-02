/* ============================================================
   공용 유틸리티
   ============================================================ */
const U = {
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  dist(x1, y1, x2, y2) { return Math.sqrt(U.dist2(x1, y1, x2, y2)); },
  angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },

  /* 각도 차이를 -PI ~ PI 범위로 */
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },

  /* 각도를 목표 쪽으로 최대 step 만큼 회전 */
  approachAngle(a, b, step) {
    const d = U.angleDiff(a, b);
    if (Math.abs(d) <= step) return b;
    return a + Math.sign(d) * step;
  },

  pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },

  circleHitsRect(x, y, rad, r) {
    const nx = U.clamp(x, r.x, r.x + r.w);
    const ny = U.clamp(y, r.y, r.y + r.h);
    return U.dist2(x, y, nx, ny) < rad * rad;
  },

  rectsOverlap(a, b, pad) {
    pad = pad || 0;
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
             a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
  },

  /* 부드러운 숫자 포맷 */
  time(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
};

/* 간단한 효과음 (WebAudio) */
const Sfx = {
  ctx: null,
  enabled: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.enabled = false; }
  },
  blip(freq, dur, type, vol) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), t + dur);
    gain.gain.setValueAtTime(vol == null ? 0.05 : vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  shot(w) { this.blip(w === 'sniper' ? 180 : (w === 'shotgun' ? 140 : 320), 0.09, 'square', 0.045); },
  hit() { this.blip(620, 0.05, 'sawtooth', 0.05); },
  hurt() { this.blip(150, 0.18, 'sawtooth', 0.07); },
  pick() { this.blip(880, 0.07, 'triangle', 0.05); },
  kill() { this.blip(520, 0.22, 'triangle', 0.07); },
  reload() { this.blip(260, 0.06, 'triangle', 0.04); }
};
