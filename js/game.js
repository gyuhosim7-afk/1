/* ============================================================
   게임 코어: 상태, 로직, 렌더링
   ============================================================ */
const Game = {
  canvas: null, ctx: null, mini: null, mctx: null,
  W: 0, H: 0,
  state: 'menu',              // menu | playing | over
  chars: [], bullets: [], pickups: [], particles: [], floaters: [],
  killfeed: [],
  player: null,
  zone: null,
  cam: { x: 0, y: 0 },
  shake: 0,
  time: 0,
  result: null,
  input: { up: 0, down: 0, left: 0, right: 0, sprint: 0, shoot: 0, mx: 0, my: 0 },

  /* ---------- 초기화 ---------- */
  setup(canvas, mini) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.mini = mini; this.mctx = mini.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.W = this.canvas.width = window.innerWidth;
    this.H = this.canvas.height = window.innerHeight;
  },

  start(botCount) {
    World.generate();
    this.chars = []; this.bullets = []; this.pickups = [];
    this.particles = []; this.floaters = []; this.killfeed = [];
    this.time = 0; this.shake = 0; this.result = null;

    // 자기장
    const R0 = World.size * 0.72;
    this.zone = {
      x: World.size / 2, y: World.size / 2, r: R0, R0: R0,
      sx: World.size / 2, sy: World.size / 2, sr: R0,
      tx: World.size / 2, ty: World.size / 2, tr: R0,
      phase: 0, timer: ZONE_PHASES[0].wait, shrinking: false, dps: ZONE_PHASES[0].dps
    };

    // 플레이어
    const ps = World.freeSpot(18);
    this.player = new Character(ps.x, ps.y, true, '나');
    this.chars.push(this.player);

    // 봇 (서로, 그리고 플레이어와 충분히 떨어뜨려 배치)
    const names = BOT_NAMES.slice();
    for (let i = 0; i < botCount; i++) {
      const s = this.spawnSpot();
      const nm = names.length ? names.splice(U.randInt(0, names.length - 1), 1)[0] : '봇' + i;
      const b = new Character(s.x, s.y, false, nm);
      // 봇은 예비 탄약을 넉넉히 (교전이 이어지도록)
      for (const k of Object.keys(WEAPONS)) b.reserve[k] = 60;
      if (Math.random() < 0.25) b.giveWeapon(U.choice(LOOT_TABLE), 60);
      this.chars.push(b);
    }

    this.spawnLoot();
    this.cam.x = this.player.x - this.W / 2;
    this.cam.y = this.player.y - this.H / 2;
    this.state = 'playing';
    this.pushFeed('전투 시작! 생존자 ' + this.chars.length + '명');
  },

  /* 다른 생존자와 겹치지 않는 시작 위치 (플레이어와는 더 멀리) */
  spawnSpot() {
    let best = null, bestScore = -1;
    for (let i = 0; i < 260; i++) {
      const s = World.freeSpot(18);
      let near = Infinity;
      for (const c of this.chars) {
        const d = U.dist(s.x, s.y, c.x, c.y) * (c.isPlayer ? 0.55 : 1);
        if (d < near) near = d;
      }
      if (near > 620) return s;
      if (near > bestScore) { bestScore = near; best = s; }
    }
    return best;
  },

  spawnLoot() {
    // 마을 주변에 집중 배치
    for (const z of World.zones) {
      for (let i = 0; i < 16; i++) {
        const s = World.freeSpot(12, z, 420);
        this.pickups.push(this.randomPickup(s.x, s.y));
      }
    }
    // 벌판에 산개
    for (let i = 0; i < 70; i++) {
      const s = World.freeSpot(12);
      this.pickups.push(this.randomPickup(s.x, s.y));
    }
  },

  randomPickup(x, y) {
    const roll = Math.random();
    if (roll < 0.42) {
      const w = U.choice(LOOT_TABLE);
      return new Pickup(x, y, 'weapon', w, WEAPONS[w].ammoPer);
    } else if (roll < 0.78) {
      const w = U.choice(LOOT_TABLE);
      return new Pickup(x, y, 'ammo', w, Math.round(WEAPONS[w].ammoPer * 0.6));
    }
    return new Pickup(x, y, 'med', null, 1);
  },

  get alive() { return this.chars.reduce((n, c) => n + (c.dead ? 0 : 1), 0); },

  /* ---------- 업데이트 ---------- */
  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    this.updateZone(dt);

    // 플레이어 조작
    if (!this.player.dead) this.updatePlayer(dt);

    for (const c of this.chars) {
      if (c.dead) continue;
      // 타이머류
      if (c.cooldown > 0) c.cooldown -= dt;
      if (c.recoil > 0) c.recoil -= dt * 6;
      if (c.hitFlash > 0) c.hitFlash -= dt;
      if (c.reloading > 0) {
        c.reloading -= dt;
        if (c.reloading <= 0) { c.finishReload(); if (c === this.player) Sfx.reload(); }
      }
      if (c.healing > 0) {
        c.healing -= dt;
        if (c.healing <= 0) {
          c.meds--;
          c.hp = Math.min(c.maxHp, c.hp + CONFIG.HEAL_AMOUNT);
          this.floaters.push({ x: c.x, y: c.y - 20, text: '+' + CONFIG.HEAL_AMOUNT, life: 1, color: '#7ee787' });
        }
      }
      // 봇 AI
      if (!c.isPlayer) AI.update(c, dt, this);

      // 자기장 피해
      const dz = U.dist(c.x, c.y, this.zone.x, this.zone.y);
      if (dz > this.zone.r) {
        this.damage(c, this.zone.dps * dt, null, true);
      }
    }

    this.updateBullets(dt);

    // 파티클
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= 26 * dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    this.pickups = this.pickups.filter(p => !p.dead);
    for (const k of this.killfeed) k.life -= dt;
    this.killfeed = this.killfeed.filter(k => k.life > 0).slice(-6);

    if (this.shake > 0) this.shake -= dt * 12;

    // 카메라
    const tx = U.clamp(this.player.x - this.W / 2, -80, World.size - this.W + 80);
    const ty = U.clamp(this.player.y - this.H / 2, -80, World.size - this.H + 80);
    this.cam.x = U.lerp(this.cam.x, this.W > World.size ? (World.size - this.W) / 2 : tx, Math.min(1, dt * 9));
    this.cam.y = U.lerp(this.cam.y, this.H > World.size ? (World.size - this.H) / 2 : ty, Math.min(1, dt * 9));

    // 종료 판정
    const alive = this.alive;
    if (this.player.dead) this.finish(false);
    else if (alive <= 1) this.finish(true);
  },

  updatePlayer(dt) {
    const p = this.player, i = this.input;
    let mx = (i.right - i.left), my = (i.down - i.up);
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    const sprint = (i.sprint && p.healing <= 0) ? CONFIG.SPRINT : 1;
    this.moveChar(p, mx, my, dt, sprint);

    // 조준 (마우스)
    const sx = p.x - this.cam.x, sy = p.y - this.cam.y;
    p.angle = U.angle(sx, sy, i.mx, i.my);

    // 사격
    if (i.shoot) {
      if (p.canShoot()) {
        this.fire(p, p.angle);
        if (!p.spec.auto) i.shoot = 0;
      } else if (p.weapon && p.mag <= 0 && p.reloading <= 0) {
        p.startReload();
      }
    }
  },

  updateZone(dt) {
    const z = this.zone;
    z.timer -= dt;
    if (!z.shrinking) {
      if (z.timer <= 0 && z.phase < ZONE_PHASES.length) {
        const ph = ZONE_PHASES[z.phase];
        const tr = z.R0 * ph.f;
        const maxOff = Math.max(0, z.r - tr) * 0.8;
        const ang = U.rand(-Math.PI, Math.PI), off = U.rand(0, maxOff);
        z.sx = z.x; z.sy = z.y; z.sr = z.r;
        z.tx = U.clamp(z.x + Math.cos(ang) * off, tr, World.size - tr);
        z.ty = U.clamp(z.y + Math.sin(ang) * off, tr, World.size - tr);
        z.tr = tr;
        z.shrinking = true;
        z.timer = ph.shrink;
        z.total = ph.shrink;
        z.dps = ph.dps;
        this.pushFeed('자기장이 줄어듭니다! (' + (z.phase + 1) + '단계)');
      }
    } else {
      const ph = ZONE_PHASES[z.phase];
      const t = 1 - U.clamp(z.timer / ph.shrink, 0, 1);
      z.x = U.lerp(z.sx, z.tx, t);
      z.y = U.lerp(z.sy, z.ty, t);
      z.r = U.lerp(z.sr, z.tr, t);
      if (z.timer <= 0) {
        z.x = z.tx; z.y = z.ty; z.r = z.tr;
        z.shrinking = false;
        z.phase++;
        z.timer = z.phase < ZONE_PHASES.length ? ZONE_PHASES[z.phase].wait : 9999;
      }
    }
  },

  updateBullets(dt) {
    const SUB = 3;
    const sdt = dt / SUB;
    for (const b of this.bullets) {
      for (let s = 0; s < SUB && !b.dead; s++) {
        b.px = b.x; b.py = b.y;
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        b.left -= Math.hypot(b.vx, b.vy) * sdt;
        if (b.left <= 0) { b.dead = true; break; }
        if (World.hitsSolid(b.x, b.y)) {
          b.dead = true;
          this.spark(b.x, b.y, '#8b949e', 5);
          break;
        }
        for (const c of this.chars) {
          if (c.dead || c === b.owner) continue;
          if (U.dist2(b.x, b.y, c.x, c.y) < c.r * c.r) {
            b.dead = true;
            this.damage(c, b.dmg, b.owner, false);
            this.spark(b.x, b.y, '#ff7b72', 6);
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  },

  /* ---------- 행동 ---------- */
  moveChar(c, mx, my, dt, mult) {
    if (mx === 0 && my === 0) return;
    let sp = c.speed * (mult || 1);
    if (c.healing > 0) sp *= 0.5;
    if (c.reloading > 0) sp *= 0.85;
    const nx = c.x + mx * sp * dt;
    const ny = c.y + my * sp * dt;
    if (!World.blocked(nx, c.y, c.r)) c.x = nx;
    if (!World.blocked(c.x, ny, c.r)) c.y = ny;
    c.x = U.clamp(c.x, c.r, World.size - c.r);
    c.y = U.clamp(c.y, c.r, World.size - c.r);
  },

  fire(c, angle) {
    if (!c.canShoot()) return;
    const spec = c.spec;
    c.cooldown = spec.rate;
    c.mag--;
    c.recoil = 1;
    const bx = c.x + Math.cos(angle) * (c.r + 12);
    const by = c.y + Math.sin(angle) * (c.r + 12);
    for (let i = 0; i < spec.pellets; i++) {
      const a = angle + U.rand(-spec.spread, spec.spread);
      this.bullets.push(new Bullet(c, bx, by, a, c.weapon));
    }
    this.spark(bx, by, '#ffd166', 4);
    if (c.isPlayer) { this.shake = 3; Sfx.shot(c.weapon); }
    else if (U.dist(c.x, c.y, this.player.x, this.player.y) < 1100) Sfx.shot(c.weapon);
    if (c.mag <= 0) c.startReload();
  },

  damage(c, amount, src, isZone) {
    if (c.dead) return;
    c.hp -= amount;
    if (!isZone) {
      c.hitFlash = 0.16;
      this.spark(c.x, c.y, '#ff6b6b', 3);
      if (src === this.player) {
        this.floaters.push({ x: c.x, y: c.y - 22, text: Math.round(amount), life: 0.8, color: '#ffd166' });
        Sfx.hit();
      }
      if (c === this.player) { this.shake = 6; Sfx.hurt(); }
    }
    if (c.hp <= 0) this.kill(c, src, isZone);
  },

  kill(c, src, isZone) {
    if (c.dead) return;
    c.dead = true;
    c.hp = 0;
    c.rank = this.alive + 1;
    if (src && src !== c) { src.kills++; if (src === this.player) Sfx.kill(); }
    this.spark(c.x, c.y, '#ff6b6b', 22);
    this.dropLoot(c);
    if (isZone) this.pushFeed(c.name + ' 님이 자기장에 쓰러졌습니다');
    else this.pushFeed((src ? src.name : '???') + ' → ' + c.name);
  },

  dropLoot(c) {
    if (c.weapon) {
      const s = World.freeSpot(12, c, 40);
      this.pickups.push(new Pickup(s.x, s.y, 'weapon', c.weapon, Math.max(10, c.mag + (c.reserve[c.weapon] || 0))));
    }
    if (c.meds > 0) {
      const s = World.freeSpot(12, c, 55);
      this.pickups.push(new Pickup(s.x, s.y, 'med', null, 1));
    }
  },

  /* 아이템 획득 */
  pickUp(c, p) {
    if (p.dead) return false;
    if (p.kind === 'weapon') {
      if (c.weapon === p.weapon) {
        // 같은 무기면 탄약만 흡수
        c.reserve[p.weapon] = (c.reserve[p.weapon] || 0) + p.amount;
      } else {
        const old = c.weapon, oldAmmo = old ? (c.mag + (c.reserve[old] || 0)) : 0;
        c.giveWeapon(p.weapon, p.amount);
        if (old) {
          c.reserve[old] = 0;
          this.pickups.push(new Pickup(p.x + U.rand(-24, 24), p.y + U.rand(-24, 24), 'weapon', old, Math.max(8, oldAmmo)));
        }
      }
      if (c === this.player) this.pushFeed(WEAPONS[p.weapon].name + ' 획득');
    } else if (p.kind === 'ammo') {
      if (!c.weapon) return false;
      c.reserve[p.weapon] = (c.reserve[p.weapon] || 0) + p.amount;
      if (c === this.player) this.pushFeed(WEAPONS[p.weapon].short + ' 탄약 +' + p.amount);
    } else {
      if (c.meds >= CONFIG.MAX_MEDS) return false;
      c.meds++;
      if (c === this.player) this.pushFeed('구급킷 획득');
    }
    p.dead = true;
    if (c === this.player) Sfx.pick();
    return true;
  },

  nearestPickup(c) {
    let best = null, bd = CONFIG.PICKUP_RANGE * CONFIG.PICKUP_RANGE;
    for (const p of this.pickups) {
      if (p.dead) continue;
      const d = U.dist2(c.x, c.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  },

  spark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(-Math.PI, Math.PI), s = U.rand(40, 260);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.15, 0.5), color, r: U.rand(1.5, 3.5) });
    }
  },

  pushFeed(text) { this.killfeed.push({ text, life: 5 }); },

  finish(won) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    const p = this.player;
    this.result = {
      won,
      rank: won ? 1 : (p.rank || this.alive + 1),
      kills: p.kills,
      time: this.time,
      total: this.chars.length
    };
    UI.showResult(this.result);
  },

  /* ---------- 렌더링 ---------- */
  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1017';
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.state === 'menu') return;

    const shx = this.shake > 0 ? U.rand(-this.shake, this.shake) : 0;
    const shy = this.shake > 0 ? U.rand(-this.shake, this.shake) : 0;
    ctx.save();
    ctx.translate(-this.cam.x + shx, -this.cam.y + shy);

    const view = { x: this.cam.x - 60, y: this.cam.y - 60, w: this.W + 120, h: this.H + 120 };
    const inView = (x, y, r) => x + r > view.x && x - r < view.x + view.w && y + r > view.y && y - r < view.y + view.h;

    this.drawGround(ctx, view);

    // 수풀
    for (const b of World.bushes) {
      if (!inView(b.x, b.y, b.r)) continue;
      ctx.fillStyle = 'rgba(46,110,64,0.55)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }

    // 아이템
    for (const p of this.pickups) {
      if (!inView(p.x, p.y, 20)) continue;
      const bob = Math.sin(this.time * 3 + p.bob) * 2;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
      if (p.kind === 'weapon') { ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8); }
      else if (p.kind === 'ammo') { ctx.fillRect(-7, -6, 14, 12); ctx.strokeRect(-7, -6, 14, 12); }
      else {
        ctx.fillRect(-8, -8, 16, 16); ctx.strokeRect(-8, -8, 16, 16);
        ctx.fillStyle = '#fff'; ctx.fillRect(-5, -1.5, 10, 3); ctx.fillRect(-1.5, -5, 3, 10);
      }
      ctx.restore();
    }

    // 바위
    for (const o of World.rocks) {
      if (!inView(o.x, o.y, o.r)) continue;
      ctx.fillStyle = '#3b444f';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#232a33'; ctx.lineWidth = 3; ctx.stroke();
    }

    // 총알
    for (const b of this.bullets) {
      ctx.strokeStyle = b.color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // 캐릭터
    for (const c of this.chars) {
      if (c.dead || !inView(c.x, c.y, 40)) continue;
      this.drawChar(ctx, c);
    }

    // 건물 (캐릭터 위로 그려 엄폐감)
    for (const w of World.walls) {
      if (!inView(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) continue;
      ctx.fillStyle = '#2b3440';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#414d5c'; ctx.lineWidth = 3;
      ctx.strokeRect(w.x + 1.5, w.y + 1.5, w.w - 3, w.h - 3);
    }

    // 파티클 / 데미지 표시
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    this.drawZone(ctx, view);
    ctx.restore();

    this.drawMinimap();
  },

  drawGround(ctx, view) {
    ctx.fillStyle = '#16202b';
    ctx.fillRect(0, 0, World.size, World.size);
    // 격자
    const g = 200;
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor(view.x / g) * g), x1 = Math.min(World.size, view.x + view.w);
    const y0 = Math.max(0, Math.floor(view.y / g) * g), y1 = Math.min(World.size, view.y + view.h);
    for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    // 지역명
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (const z of World.zones) ctx.fillText(z.name, z.x, z.y);
  },

  drawChar(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 5, c.r, c.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(c.angle);
    // 총
    if (c.weapon) {
      const kick = c.recoil > 0 ? c.recoil * 4 : 0;
      ctx.fillStyle = '#20262e';
      ctx.fillRect(c.r - 4 - kick, -3.5, 22, 7);
      ctx.fillStyle = WEAPONS[c.weapon].color;
      ctx.fillRect(c.r + 10 - kick, -2, 8, 4);
    }
    // 몸
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.hitFlash > 0 ? '#ffffff' : c.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.isPlayer ? '#1f6feb' : '#8b2b2b';
    ctx.stroke();
    // 시선 방향
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(c.r * 0.45, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 체력바 + 이름
    const showInfo = c.isPlayer || U.dist2(c.x, c.y, this.player.x, this.player.y) < 700 * 700;
    if (showInfo) {
      const w = 40, hp = U.clamp(c.hp / c.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(c.x - w / 2, c.y - c.r - 16, w, 5);
      ctx.fillStyle = hp > 0.5 ? '#7ee787' : (hp > 0.25 ? '#e3b341' : '#ff6b6b');
      ctx.fillRect(c.x - w / 2, c.y - c.r - 16, w * hp, 5);
      if (!c.isPlayer) {
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(c.name, c.x, c.y - c.r - 20);
      }
      if (c.reloading > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        const t = 1 - c.reloading / c.spec.reload;
        ctx.fillRect(c.x - w / 2, c.y + c.r + 8, w * t, 3);
      }
      if (c.healing > 0) {
        ctx.fillStyle = '#7ee787';
        const t = 1 - c.healing / CONFIG.HEAL_TIME;
        ctx.fillRect(c.x - w / 2, c.y + c.r + 8, w * t, 3);
      }
    }
  },

  drawZone(ctx, view) {
    const z = this.zone;
    // 자기장 밖 붉은 영역
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x - 3000, view.y - 3000, view.w + 6000, view.h + 6000);
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255,60,60,0.16)';
    ctx.fill('evenodd');
    ctx.restore();
    // 현재 원
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 4; ctx.stroke();
    // 다음 원
    if (z.shrinking || z.phase < ZONE_PHASES.length) {
      const nr = z.shrinking ? z.tr : z.R0 * ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)].f;
      const nx = z.shrinking ? z.tx : z.x, ny = z.shrinking ? z.ty : z.y;
      if (z.shrinking) {
        ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },

  drawMinimap() {
    const m = this.mctx, size = this.mini.width;
    const s = size / World.size;
    m.clearRect(0, 0, size, size);
    m.fillStyle = '#0d1117'; m.fillRect(0, 0, size, size);
    m.fillStyle = '#1c2733';
    for (const w of World.walls) m.fillRect(w.x * s, w.y * s, Math.max(1, w.w * s), Math.max(1, w.h * s));

    const z = this.zone;
    // 자기장
    m.save();
    m.beginPath();
    m.rect(0, 0, size, size);
    m.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2, true);
    m.fillStyle = 'rgba(255,60,60,0.28)'; m.fill('evenodd');
    m.restore();
    m.beginPath(); m.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2);
    m.strokeStyle = '#78c8ff'; m.lineWidth = 1.5; m.stroke();
    if (z.shrinking) {
      m.setLineDash([3, 3]);
      m.beginPath(); m.arc(z.tx * s, z.ty * s, z.tr * s, 0, Math.PI * 2);
      m.strokeStyle = '#ffffff'; m.lineWidth = 1; m.stroke();
      m.setLineDash([]);
    }
    // 근처 적
    for (const c of this.chars) {
      if (c.dead || c.isPlayer) continue;
      if (U.dist2(c.x, c.y, this.player.x, this.player.y) > 800 * 800) continue;
      m.fillStyle = '#ff6b6b';
      m.beginPath(); m.arc(c.x * s, c.y * s, 2.2, 0, Math.PI * 2); m.fill();
    }
    // 플레이어
    const p = this.player;
    m.fillStyle = '#58a6ff';
    m.beginPath(); m.arc(p.x * s, p.y * s, 3.2, 0, Math.PI * 2); m.fill();
  }
};
