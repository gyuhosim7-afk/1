/* ============================================================
   소리
   외부 음원 파일 없이 웹오디오로 직접 합성합니다.
   핵심은 세 가지입니다.
   1) 잡음(노이즈)을 필터로 깎아 총성·발소리·바람을 만듭니다.
      단순 사각파 '삐' 소리와 달리 실제 소리는 대부분 잡음 성분입니다.
   2) 거리에 따라 소리가 작아질 뿐 아니라 고음이 먼저 사라지고,
      소리가 도착하는 데 시간이 걸립니다(음속 340m/s).
      멀리서 나는 총성이 '퍽' 하고 둔하게 들리는 이유입니다.
   3) 짧은 반사음(꼬리)을 붙여 벌판의 울림을 흉내 냅니다.
   ============================================================ */
const Sfx = {
  ctx: null, master: null, comp: null, noiseBuf: null,
  enabled: true, volume: 0.8, ready: false,
  _engine: null, _wind: null,

  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      const ctx = this.ctx = new AC();

      // 여러 소리가 겹쳐도 찢어지지 않도록 압축기를 겁니다
      const comp = this.comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20;
      comp.ratio.value = 9; comp.attack.value = 0.003; comp.release.value = 0.16;

      const master = this.master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(comp); comp.connect(ctx.destination);

      // 2초짜리 흰 잡음 (모든 잡음 계열 소리의 재료)
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.ready = true;
    } catch (e) { this.enabled = false; }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  },

  get t() { return this.ctx.currentTime; },
  ok() { return this.enabled && this.ready && this.ctx; },

  /* ---------- 재료 ---------- */

  /* 잡음 한 조각.
     type/freq/q 로 음색을 깎고, atk~dec 로 세기를 그립니다. */
  noise(o) {
    const c = this.ctx, t0 = this.t + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    // 매번 다른 구간을 써야 같은 소리가 반복되지 않습니다
    const off = Math.random() * 1.5;

    const filt = c.createBiquadFilter();
    filt.type = o.type || 'lowpass';
    filt.frequency.setValueAtTime(o.freq, t0);
    if (o.freqTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t0 + o.dec);
    filt.Q.value = o.q == null ? 0.7 : o.q;

    const g = c.createGain();
    const atk = o.atk == null ? 0.002 : o.atk;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + o.dec);

    let node = filt;
    src.connect(filt);
    if (o.hp) {                                   // 저역을 잘라 '탁' 하는 느낌
      const hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = o.hp;
      filt.connect(hp); node = hp;
    }
    node.connect(g);
    g.connect(o.dest || this.master);
    src.start(t0, off);
    src.stop(t0 + atk + o.dec + 0.05);
    return g;
  },

  /* 사인/삼각파 한 조각 (총성의 저음, 금속 울림 등) */
  tone(o) {
    const c = this.ctx, t0 = this.t + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), t0 + o.dec);
    const g = c.createGain();
    const atk = o.atk == null ? 0.002 : o.atk;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + o.dec);
    osc.connect(g); g.connect(o.dest || this.master);
    osc.start(t0); osc.stop(t0 + atk + o.dec + 0.05);
    return g;
  },

  /* 거리에 따른 감쇠·저역화·지연을 한 번에 계산합니다 */
  dist(d) {
    const far = Math.min(1, d / 300);
    return {
      gain: 1 / (1 + d / 22),                 // 거리 감쇠
      cut: 16000 * Math.pow(0.06, far) + 260, // 멀수록 고음이 사라짐
      delay: Math.min(1.2, d / 340)           // 음속만큼 늦게 도착
    };
  },

  /* ---------- 총성 ---------- */
  /* 총마다 저음/파열음/꼬리 길이를 달리해 성격을 나눕니다 */
  GUN: {
    pistol:  { low: 150, body: 1700, dec: 0.10, tail: 0.28, vol: 0.55, crack: 0.7 },
    smg:     { low: 165, body: 2100, dec: 0.075, tail: 0.22, vol: 0.5,  crack: 0.7 },
    shotgun: { low: 95,  body: 1100, dec: 0.16, tail: 0.42, vol: 0.9,  crack: 0.3 },
    rifle:   { low: 125, body: 1900, dec: 0.11, tail: 0.34, vol: 0.7,  crack: 0.9 },
    dmr:     { low: 105, body: 1600, dec: 0.14, tail: 0.44, vol: 0.85, crack: 1.0 },
    sniper:  { low: 78,  body: 1250, dec: 0.20, tail: 0.62, vol: 1.0,  crack: 1.2 }
  },

  shot(d, gun, indoors) {
    if (!this.ok()) return;
    this.resume();
    const S = this.GUN[gun] || this.GUN.rifle;
    const D = this.dist(d);
    if (D.gain < 0.01) return;
    const v = S.vol * D.gain * 0.9;
    const near = Math.max(0, 1 - d / 120);      // 가까울수록 파열음이 살아 있습니다

    // 1) 격발 순간의 날카로운 파열
    this.noise({ freq: Math.min(D.cut, S.body * 2.2), type: 'lowpass', hp: 900 * near + 120,
                 vol: v * 0.9 * (0.25 + 0.75 * near), atk: 0.0012, dec: 0.022, delay: D.delay });
    // 2) 몸통 — 총성의 '탕'
    this.noise({ freq: Math.min(D.cut, S.body), freqTo: Math.min(D.cut, S.body * 0.25),
                 type: 'lowpass', q: 1.1, vol: v, atk: 0.002, dec: S.dec, delay: D.delay });
    // 3) 저음 — 무게감
    this.tone({ freq: S.low, freqTo: S.low * 0.55, type: 'sine',
                vol: v * 0.85, atk: 0.004, dec: S.dec * 1.5, delay: D.delay });
    // 4) 꼬리 — 벌판/실내 반사음
    const tail = S.tail * (indoors ? 0.55 : 1) * (0.6 + 0.8 * Math.min(1, d / 90));
    this.noise({ freq: Math.min(D.cut, indoors ? 2400 : 900), freqTo: 240, type: 'lowpass',
                 vol: v * (indoors ? 0.5 : 0.34), atk: 0.02, dec: tail, delay: D.delay + 0.03 });
    if (indoors) {   // 실내는 짧고 날카로운 반사가 한 번 더
      this.noise({ freq: Math.min(D.cut, 3600), type: 'bandpass', q: 1.6,
                   vol: v * 0.3, atk: 0.006, dec: 0.16, delay: D.delay + 0.012 });
    }
  },

  /* 총알이 귓가를 스칠 때 나는 초음속 파열음. 총성보다 먼저 도착합니다 */
  crack(missDist, gun) {
    if (!this.ok()) return;
    const S = this.GUN[gun] || this.GUN.rifle;
    const v = Math.max(0, 1 - missDist / 7) * 0.5 * S.crack;
    if (v < 0.02) return;
    this.noise({ freq: 7000, freqTo: 1400, type: 'bandpass', q: 0.8, hp: 1200,
                 vol: v, atk: 0.0008, dec: 0.045 });
  },

  /* 탄착: 흙 / 나무 / 금속 / 살 */
  impact(d, kind) {
    if (!this.ok()) return;
    const D = this.dist(d);
    const v = D.gain * 0.5;
    if (v < 0.008) return;
    if (kind === 'flesh') {
      this.noise({ freq: Math.min(D.cut, 900), freqTo: 200, type: 'lowpass',
                   vol: v * 1.1, atk: 0.001, dec: 0.09, delay: D.delay });
      this.tone({ freq: 110, freqTo: 60, vol: v * 0.5, dec: 0.07, delay: D.delay });
    } else if (kind === 'metal') {
      this.noise({ freq: Math.min(D.cut, 5200), type: 'bandpass', q: 2.4,
                   vol: v, atk: 0.001, dec: 0.13, delay: D.delay });
      this.tone({ freq: 2100, freqTo: 1500, type: 'triangle', vol: v * 0.35, dec: 0.2, delay: D.delay });
    } else if (kind === 'wood') {
      this.noise({ freq: Math.min(D.cut, 2200), freqTo: 500, type: 'lowpass', q: 1.2,
                   vol: v, atk: 0.001, dec: 0.11, delay: D.delay });
    } else {                                      // 흙·돌
      this.noise({ freq: Math.min(D.cut, 1500), freqTo: 320, type: 'lowpass',
                   vol: v * 0.9, atk: 0.001, dec: 0.14, delay: D.delay });
    }
  },

  /* ---------- 피격 ---------- */
  hit(head) {
    if (!this.ok()) return;
    // 맞았다는 신호음: 머리는 높고 짧게
    this.tone({ freq: head ? 1750 : 1150, freqTo: head ? 1300 : 900, type: 'triangle',
                vol: head ? 0.3 : 0.2, atk: 0.001, dec: head ? 0.09 : 0.06 });
    if (head) this.tone({ freq: 2600, type: 'sine', vol: 0.16, atk: 0.001, dec: 0.12, delay: 0.02 });
  },

  hurt() {
    if (!this.ok()) return;
    this.noise({ freq: 700, freqTo: 180, type: 'lowpass', vol: 0.5, atk: 0.002, dec: 0.22 });
    this.tone({ freq: 90, freqTo: 55, vol: 0.35, dec: 0.28 });
  },

  kill() {
    if (!this.ok()) return;
    this.tone({ freq: 660, type: 'triangle', vol: 0.22, dec: 0.1 });
    this.tone({ freq: 990, type: 'triangle', vol: 0.18, dec: 0.16, delay: 0.07 });
  },

  /* ---------- 장비 ---------- */
  /* 금속 부품이 맞물리는 짧은 딸깍 */
  click(o) {
    o = o || {};
    this.noise({ freq: o.freq || 3200, type: 'bandpass', q: o.q || 3.2,
                 vol: o.vol || 0.28, atk: 0.0008, dec: o.dec || 0.035, delay: o.delay || 0 });
    this.tone({ freq: (o.freq || 3200) * 0.55, type: 'square', vol: (o.vol || 0.28) * 0.25,
                atk: 0.0008, dec: 0.02, delay: o.delay || 0 });
  },

  reload() {                       // 재장전 시작: 탄창 빼는 소리
    if (!this.ok()) return;
    this.click({ freq: 2400, vol: 0.3, dec: 0.05 });
    this.click({ freq: 1500, vol: 0.24, dec: 0.06, delay: 0.13 });
  },

  reloadDone() {                   // 재장전 끝: 탄창 삽입 + 노리쇠
    if (!this.ok()) return;
    this.click({ freq: 1200, q: 2.2, vol: 0.34, dec: 0.07 });
    this.click({ freq: 3400, q: 3.6, vol: 0.3, dec: 0.05, delay: 0.11 });
    this.tone({ freq: 900, freqTo: 600, type: 'triangle', vol: 0.12, dec: 0.09, delay: 0.11 });
  },

  swap() {                         // 무기 교체
    if (!this.ok()) return;
    this.noise({ freq: 1800, type: 'bandpass', q: 1.4, vol: 0.22, atk: 0.004, dec: 0.09 });
    this.click({ freq: 2600, vol: 0.2, dec: 0.04, delay: 0.08 });
  },

  pick() {                         // 아이템 획득
    if (!this.ok()) return;
    this.noise({ freq: 2600, type: 'bandpass', q: 2.0, vol: 0.2, atk: 0.003, dec: 0.06 });
    this.tone({ freq: 1320, type: 'triangle', vol: 0.12, dec: 0.07, delay: 0.03 });
  },

  heal() {
    if (!this.ok()) return;
    this.noise({ freq: 1400, freqTo: 3000, type: 'bandpass', q: 1.1, vol: 0.16, atk: 0.05, dec: 0.4 });
  },

  /* ---------- 몸 ---------- */
  step(speed, hard) {
    if (!this.ok()) return;
    const v = Math.min(0.24, 0.05 + speed * 0.022);
    this.noise({ freq: hard ? 2600 : 1500, freqTo: hard ? 700 : 320, type: 'lowpass', q: 1.0,
                 vol: v, atk: 0.001, dec: hard ? 0.07 : 0.1, rate: 0.9 + Math.random() * 0.3 });
    if (hard) this.click({ freq: 4200, q: 4, vol: v * 0.4, dec: 0.02 });
  },

  land(fall) {                     // 착지 (fall: 낙하 세기 0~1)
    if (!this.ok()) return;
    const v = 0.25 + fall * 0.4;
    this.noise({ freq: 900, freqTo: 160, type: 'lowpass', vol: v, atk: 0.002, dec: 0.16 });
    this.tone({ freq: 80, freqTo: 45, vol: v * 0.7, dec: 0.22 });
  },

  vault() {                        // 넘어오르기
    if (!this.ok()) return;
    this.noise({ freq: 2400, freqTo: 600, type: 'lowpass', vol: 0.2, atk: 0.01, dec: 0.22 });
    this.noise({ freq: 1100, freqTo: 300, type: 'lowpass', vol: 0.22, atk: 0.002, dec: 0.12, delay: 0.28 });
  },

  chute() {                        // 낙하산이 펴질 때
    if (!this.ok()) return;
    this.noise({ freq: 2800, freqTo: 500, type: 'lowpass', vol: 0.55, atk: 0.012, dec: 0.5 });
    this.tone({ freq: 150, freqTo: 70, vol: 0.2, dec: 0.4 });
  },

  /* 자유낙하·낙하산 바람. level 0 이면 멈춥니다 */
  wind(level) {
    if (!this.ok()) { return; }
    if (level <= 0.001) {
      if (this._wind) { try { this._wind.src.stop(); } catch (e) { /* 무시 */ } this._wind = null; }
      return;
    }
    if (!this._wind) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(0, Math.random());
      this._wind = { src, g, lp };
    }
    const w = this._wind, t = this.t;
    w.g.gain.setTargetAtTime(Math.min(0.5, level * 0.42), t, 0.15);
    w.lp.frequency.setTargetAtTime(500 + level * 1900, t, 0.2);
  },

  /* ---------- 차량 ---------- */
  /* 엔진: 낮은 톱니 두 개를 살짝 어긋나게 겹치고 잡음을 섞습니다 */
  engine(on, speed, maxSpeed, throttle) {
    if (!this.ok()) return;
    if (!on) {
      if (this._engine) {
        const e = this._engine;
        e.g.gain.setTargetAtTime(0.0001, this.t, 0.08);
        setTimeout(() => { try { e.a.stop(); e.b.stop(); e.n.stop(); } catch (err) { /* 무시 */ } }, 400);
        this._engine = null;
      }
      return;
    }
    if (!this._engine) {
      const c = this.ctx;
      const a = c.createOscillator(), b = c.createOscillator();
      a.type = 'sawtooth'; b.type = 'sawtooth';
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const ng = c.createGain(); ng.gain.value = 0.12;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = 0.0001;
      a.connect(lp); b.connect(lp); n.connect(ng); ng.connect(lp);
      lp.connect(g); g.connect(this.master);
      a.start(); b.start(); n.start(0, Math.random());
      this._engine = { a, b, n, lp, g };
    }
    const e = this._engine, t = this.t;
    const rev = 0.18 + Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed)) * 0.82;
    const f = 38 + rev * 116;
    e.a.frequency.setTargetAtTime(f, t, 0.06);
    e.b.frequency.setTargetAtTime(f * 1.007, t, 0.06);
    e.lp.frequency.setTargetAtTime(320 + rev * 1500, t, 0.08);
    e.g.gain.setTargetAtTime(0.10 + rev * 0.12 + (throttle > 0.2 ? 0.05 : 0), t, 0.07);
  },

  /* ---------- 상황 ---------- */
  zone() {                         // 자기장 축소 시작 경보
    if (!this.ok()) return;
    this.tone({ freq: 320, freqTo: 240, type: 'sine', vol: 0.18, atk: 0.05, dec: 0.6 });
    this.noise({ freq: 400, freqTo: 150, type: 'lowpass', vol: 0.12, atk: 0.1, dec: 0.9 });
  },

  drop() {                         // 보급 투하 (비행기 지나가는 소리)
    if (!this.ok()) return;
    this.noise({ freq: 300, freqTo: 900, type: 'lowpass', vol: 0.16, atk: 0.9, dec: 1.6 });
    this.tone({ freq: 62, freqTo: 78, vol: 0.12, atk: 0.8, dec: 1.8 });
  },

  win() {
    if (!this.ok()) return;
    [[392, 0], [523, 0.14], [659, 0.28], [784, 0.42]].forEach(([f, d], i) => {
      this.tone({ freq: f, type: 'triangle', vol: 0.2, atk: 0.01, dec: i === 3 ? 0.8 : 0.3, delay: d });
      this.tone({ freq: f * 2, type: 'sine', vol: 0.07, atk: 0.01, dec: 0.25, delay: d });
    });
  }
};
