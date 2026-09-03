/* ============================================================
   효과음, HUD, 입력, 메인 루프
   ============================================================ */
const Sfx = {
  ctx: null, enabled: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.enabled = false; }
  },
  tone(freq, dur, type, vol) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.35), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  shot(dist, gun) {
    const far = Math.max(0, 1 - dist / 220);
    if (far <= 0.02) return;
    const base = gun === 'sniper' ? 130 : (gun === 'shotgun' ? 110 : 240);
    this.tone(base, 0.09 + far * 0.05, 'square', 0.05 * far * far + 0.004);
  },
  hit(head) { this.tone(head ? 1100 : 720, 0.06, 'triangle', 0.06); },
  hurt() { this.tone(140, 0.2, 'sawtooth', 0.07); },
  pick() { this.tone(880, 0.07, 'triangle', 0.05); },
  kill() { this.tone(520, 0.25, 'triangle', 0.07); },
  reload() { this.tone(300, 0.07, 'triangle', 0.04); }
};

const UI = {
  el: {},
  init() {
    const ids = ['menu', 'over', 'hud', 'hp', 'hpText', 'gunName', 'ammo', 'meds', 'alive',
      'kills', 'zoneText', 'zoneLabel', 'feed', 'prompt', 'result', 'resultSub', 'resultStats',
      'startBtn', 'againBtn', 'botCount', 'cross', 'hitmark', 'hurt', 'minimap', 'compass',
      'bigmap', 'bigmapCanvas', 'dmgDir', 'pause', 'lockHint', 'healBar', 'healFill'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mctx = this.el.minimap.getContext('2d');
    this.cctx = this.el.compass.getContext('2d');
    this.bctx = this.el.bigmapCanvas.getContext('2d');
  },
  showMenu() { this.el.menu.classList.remove('hidden'); this.el.over.classList.add('hidden'); this.el.hud.classList.add('hidden'); },
  showGame() { this.el.menu.classList.add('hidden'); this.el.over.classList.add('hidden'); this.el.hud.classList.remove('hidden'); },
  showResult(r) {
    this.el.over.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.result.textContent = r.won ? '치킨 디너!' : '탈락';
    this.el.result.className = r.won ? 'win' : 'lose';
    this.el.resultSub.textContent = r.won ? '마지막까지 살아남았습니다' : r.rank + '위 / ' + r.total + '명';
    this.el.resultStats.innerHTML =
      '<div><b>' + r.kills + '</b><span>처치</span></div>' +
      '<div><b>#' + r.rank + '</b><span>순위</span></div>' +
      '<div><b>' + this.time(r.time) + '</b><span>생존</span></div>';
    document.exitPointerLock && document.exitPointerLock();
  },
  time(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  },

  update(g, dt) {
    const p = g.player;
    const hp = Math.max(0, p.hp) / p.maxHp;
    this.el.hp.style.width = (hp * 100) + '%';
    this.el.hp.style.background = hp > 0.5 ? '#3fb950' : (hp > 0.25 ? '#d29922' : '#f85149');
    this.el.hpText.textContent = Math.max(0, Math.ceil(p.hp));

    if (p.gun) {
      this.el.gunName.textContent = GUNS[p.gun].short;
      this.el.ammo.textContent = p.reloading > 0 ? '재장전' : (p.mag + ' / ' + p.reserveAmmo);
    } else {
      this.el.gunName.textContent = '맨손';
      this.el.ammo.textContent = '무기를 찾으세요';
    }
    this.el.meds.textContent = p.meds;
    this.el.alive.textContent = g.alive;
    this.el.kills.textContent = p.kills;

    const z = g.zone;
    this.el.zoneLabel.textContent = z.shrinking ? '자기장 축소 중' : '다음 자기장';
    this.el.zoneText.textContent = z.phase >= PHASES.length && !z.shrinking ? '최종' : this.time(z.timer);
    this.el.zoneText.style.color = z.shrinking ? '#f85149' : '#e6edf3';

    this.el.feed.innerHTML = g.feed.map(f =>
      '<div style="opacity:' + Math.max(0, Math.min(1, f.life)) + '">' + f.text + '</div>').join('');

    const near = g.nearestLoot(p);
    if (near && !p.dead) {
      this.el.prompt.classList.remove('hidden');
      this.el.prompt.innerHTML = '<kbd>F</kbd> ' + near.label;
    } else this.el.prompt.classList.add('hidden');

    // 조준선: 이동 중이면 벌어짐
    const spread = p.gun ? (Game.ads ? GUNS[p.gun].adsSpread : GUNS[p.gun].spread) : 0.05;
    const gapPx = 4 + spread * 460 * (p.speedNow > 2.5 ? 1.7 : 1);
    this.el.cross.style.setProperty('--gap', gapPx.toFixed(1) + 'px');
    this.el.cross.style.opacity = Game.ads && p.gun && (p.gun === 'sniper' || p.gun === 'dmr') ? 0.25 : 1;

    this.el.hitmark.style.opacity = Math.max(0, g.hitMarker * 4);

    // 자기장 밖 경고 + 체력 낮을 때 붉은 화면
    const dz = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    const outside = dz > z.r;
    this.el.hurt.style.opacity = Math.min(0.55, (outside ? 0.25 : 0) + (1 - hp) * 0.42);

    // 피격 방향 표시
    if (g.damageDir) {
      const rel = g.damageDir.yaw - Game.look.yaw;
      this.el.dmgDir.style.opacity = Math.min(1, g.damageDir.life);
      this.el.dmgDir.style.transform = 'rotate(' + (-rel * 180 / Math.PI) + 'deg)';
    } else this.el.dmgDir.style.opacity = 0;

    // 치료 진행
    if (p.healing > 0) {
      this.el.healBar.classList.remove('hidden');
      this.el.healFill.style.width = ((1 - p.healing / CFG.HEAL_TIME) * 100) + '%';
    } else this.el.healBar.classList.add('hidden');

    this.drawCompass(Game.look.yaw);
    this.drawMinimap(g);
    if (!this.el.bigmap.classList.contains('hidden')) this.drawBigMap(g);
  },

  drawCompass(yaw) {
    const c = this.cctx, w = this.el.compass.width, h = this.el.compass.height;
    c.clearRect(0, 0, w, h);
    // 지도 기준으로 위쪽이 북(-Z), 오른쪽이 동(+X). 시선 yaw 를 방위각으로 바꿉니다
    const deg = ((180 - yaw * 180 / Math.PI) % 360 + 360) % 360;
    const pxPerDeg = w / 140;
    c.font = '600 12px "IBM Plex Sans KR", system-ui, sans-serif';
    c.textAlign = 'center';
    const marks = { 0: '북', 45: '북동', 90: '동', 135: '남동', 180: '남', 225: '남서', 270: '서', 315: '북서' };
    for (let d = -80; d <= 80; d += 5) {
      const abs = ((Math.round(deg + d) % 360) + 360) % 360;
      const x = w / 2 + d * pxPerDeg;
      if (x < 0 || x > w) continue;
      const major = abs % 45 === 0;
      c.fillStyle = major ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)';
      c.fillRect(x, major ? 4 : 8, 1.5, major ? 8 : 4);
      if (major && marks[abs]) c.fillText(marks[abs], x, h - 3);
    }
    c.fillStyle = '#ffd166';
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2 - 5, 6); c.lineTo(w / 2 + 5, 6); c.fill();
  },

  drawMinimap(g) {
    const c = this.mctx, S = this.el.minimap.width;
    const span = 210;                                   // 미니맵에 보이는 실제 거리(m)
    const p = g.player;
    const src = g.minimapImg;
    const scale = src.width / World.size;
    const sx = (p.pos.x + World.half - span / 2) * scale;
    const sy = (p.pos.z + World.half - span / 2) * scale;
    const sw = span * scale;
    c.fillStyle = '#0d1117';
    c.fillRect(0, 0, S, S);
    c.drawImage(src, sx, sy, sw, sw, 0, 0, S, S);

    const toPx = (x, z) => [((x - p.pos.x) / span + 0.5) * S, ((z - p.pos.z) / span + 0.5) * S];
    const z = g.zone;

    // 자기장
    c.save();
    c.beginPath(); c.rect(0, 0, S, S);
    const zc = toPx(z.x, z.z);
    c.arc(zc[0], zc[1], (z.r / span) * S, 0, Math.PI * 2, true);
    c.fillStyle = 'rgba(255,70,70,0.3)'; c.fill('evenodd');
    c.restore();
    c.beginPath(); c.arc(zc[0], zc[1], (z.r / span) * S, 0, Math.PI * 2);
    c.strokeStyle = '#59b6ff'; c.lineWidth = 1.6; c.stroke();
    if (z.shrinking) {
      const tc = toPx(z.tx, z.tz);
      c.setLineDash([4, 4]);
      c.beginPath(); c.arc(tc[0], tc[1], (z.tr / span) * S, 0, Math.PI * 2);
      c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
      c.setLineDash([]);
    }

    // 근처 적
    for (const ch of g.chars) {
      if (ch.dead || ch.isPlayer) continue;
      if (p.pos.distanceTo(ch.pos) > 70) continue;
      const q = toPx(ch.pos.x, ch.pos.z);
      c.fillStyle = '#ff6b6b';
      c.beginPath(); c.arc(q[0], q[1], 2.6, 0, Math.PI * 2); c.fill();
    }

    // 플레이어 (시야 방향 삼각형)
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(Math.PI - Game.look.yaw);   // 지도 위쪽이 북이므로 시선 방향으로 돌립니다
    c.fillStyle = '#58a6ff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
    c.restore();
  },

  drawBigMap(g) {
    const c = this.bctx, S = this.el.bigmapCanvas.width;
    c.fillStyle = '#0d1117'; c.fillRect(0, 0, S, S);
    c.drawImage(g.minimapImg, 0, 0, S, S);
    const toPx = (x, z) => [((x + World.half) / World.size) * S, ((z + World.half) / World.size) * S];
    const z = g.zone, zc = toPx(z.x, z.z), rr = (z.r / World.size) * S;
    c.save();
    c.beginPath(); c.rect(0, 0, S, S); c.arc(zc[0], zc[1], rr, 0, Math.PI * 2, true);
    c.fillStyle = 'rgba(255,70,70,0.28)'; c.fill('evenodd');
    c.restore();
    c.beginPath(); c.arc(zc[0], zc[1], rr, 0, Math.PI * 2);
    c.strokeStyle = '#59b6ff'; c.lineWidth = 2; c.stroke();
    if (z.shrinking) {
      const tc = toPx(z.tx, z.tz);
      c.setLineDash([6, 5]);
      c.beginPath(); c.arc(tc[0], tc[1], (z.tr / World.size) * S, 0, Math.PI * 2);
      c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.stroke();
      c.setLineDash([]);
    }
    c.font = '600 12px "IBM Plex Sans KR", system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.textAlign = 'center';
    for (const t of World.towns) { const q = toPx(t.x, t.z); c.fillText(t.name, q[0], q[1]); }
    const pp = toPx(g.player.pos.x, g.player.pos.z);
    c.save(); c.translate(pp[0], pp[1]); c.rotate(Math.PI - Game.look.yaw);
    c.fillStyle = '#58a6ff';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
  }
};

const Input = {
  keys: {}, dx: 0, dy: 0,
  fwd: false, back: false, left: false, right: false,
  sprint: false, crouch: false, jump: false, fire: false, ads: false,
  ax: 0, az: 0,
  mode: 'lock',              // lock: 마우스 잠금 / edge: 화면 가장자리로 시점 회전
  locked: false,
  mouseX: 0, mouseY: 0, inside: false,

  init(canvas) {
    this.canvas = canvas;

    canvas.addEventListener('click', () => {
      Sfx.init();
      if (Game.state === 'playing' && this.mode === 'lock' && !this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.ads = false; }
    });
    document.addEventListener('pointerlockerror', () => this.fallbackToEdge());

    window.addEventListener('mousemove', e => {
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
      this.mouseX = e.clientX; this.mouseY = e.clientY; this.inside = true;
    });
    window.addEventListener('mousedown', e => {
      if (Game.state !== 'playing') return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.ads = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.ads = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { this.keys = {}; this.fire = false; this.ads = false; });

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys[k]) return;                    // 키 반복 무시
      this.keys[k] = true;
      if (Game.state !== 'playing') { if (k === 'enter') Main.startGame(); return; }
      if (k === ' ') this.jump = true;
      if (k === 'r') Game.player.startReload();
      if (k === 'f' || k === 'e') Game.tryPickup();
      if (k === 'q') Game.player.startHeal();
      if (k === 'tab') UI.el.bigmap.classList.toggle('hidden');
      if (k === 'm') { Sfx.enabled = !Sfx.enabled; Game.pushFeed('소리 ' + (Sfx.enabled ? '켜짐' : '꺼짐')); }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  },

  /* 마우스 잠금을 쓸 수 없는 브라우저에서는 화면 가장자리로 시점을 돌립니다 */
  fallbackToEdge() {
    if (this.mode !== 'lock') return;
    this.mode = 'edge';
    UI.el.pause.classList.add('hidden');
    UI.el.lockHint.classList.remove('hidden');
    setTimeout(() => UI.el.lockHint.classList.add('hidden'), 6000);
  },

  poll() {
    const k = this.keys;
    this.fwd = !!(k['w'] || k['arrowup']);
    this.back = !!(k['s'] || k['arrowdown']);
    this.left = !!(k['a'] || k['arrowleft']);
    this.right = !!(k['d'] || k['arrowright']);
    this.sprint = !!k['shift'];
    this.crouch = !!(k['c'] || k['control']);

    if (this.mode === 'edge' && this.inside) {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const ox = this.mouseX - cx, oy = this.mouseY - cy;
      const dead = 60;
      if (Math.abs(ox) > dead) this.dx += (ox - Math.sign(ox) * dead) * 0.055;
      if (Math.abs(oy) > dead) this.dy += (oy - Math.sign(oy) * dead) * 0.04;
    }
  }
};

const Main = {
  last: 0,
  init() {
    UI.init();
    const canvas = document.getElementById('scene');
    Game.init(canvas);
    Input.init(canvas);
    UI.el.startBtn.addEventListener('click', () => this.startGame());
    UI.el.againBtn.addEventListener('click', () => this.startGame());
    UI.showMenu();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  startGame() {
    Sfx.init();
    UI.el.bigmap.classList.add('hidden');
    const n = Math.max(4, Math.min(59, parseInt(UI.el.botCount.value, 10) || CFG.BOTS));
    UI.showGame();
    Game.start(n);
    if (Input.mode === 'lock') {
      Game.renderer.domElement.requestPointerLock();
      // 잠금이 조용히 무시되는 브라우저에서는 대체 조작으로 넘어갑니다
      setTimeout(() => { if (!Input.locked) Input.fallbackToEdge(); }, 900);
    }
  },

  loop(t) {
    const dt = Math.min(CFG.MAX_DT, (t - this.last) / 1000);
    this.last = t;
    if (Game.state === 'playing') {
      const paused = Input.mode === 'lock' && !Input.locked;
      UI.el.pause.classList.toggle('hidden', !paused);
      if (!paused) {
        Input.poll();
        Game.update(dt, Input);
        UI.update(Game, dt);
      }
      Game.render();
    } else if (Game.scene && Game.player) {
      UI.el.pause.classList.add('hidden');
      Game.render();
    }
    requestAnimationFrame(nt => this.loop(nt));
  }
};

window.addEventListener('DOMContentLoaded', () => Main.init());
