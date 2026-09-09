/* ============================================================
   HUD, 입력, 메인 루프  (소리는 sfx.js)
   ============================================================ */

/* ============================================================
   사용자 설정 (마우스 감도 등) — 브라우저에 저장됩니다
   ============================================================ */
const Settings = {
  KEY: 'lastSurvivor3d.settings',
  /* fpv 는 '지금 쓰는 시점' 이고, fpvBr / fpvDuel 은 모드별로 기억해 두는
     값입니다. 결투는 좁은 실내라 1인칭이 기본이고, 배틀로얄에서 3인칭으로
     바꿔 두어도 결투에 끌려오지 않습니다. */
  data: { sens: 1.0, ads: 0.65, invert: false, edge: false, fpv: true, vol: 0.8, mode: 'br',
          fpvBr: true, fpvDuel: true },
  controls: [],

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* 저장소를 못 쓰는 환경이면 기본값을 씁니다 */ }
    this.clamp();
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ } },
  clamp() {
    this.data.sens = Math.max(0.2, Math.min(4, +this.data.sens || 1));
    this.data.ads = Math.max(0.2, Math.min(1.5, +this.data.ads || 0.65));
    this.data.invert = !!this.data.invert;
    this.data.edge = !!this.data.edge;      // 기본은 끔 (켜면 화면 끝에서 계속 돌아갑니다)
    this.data.fpv = this.data.fpv !== false;
    this.data.fpvBr = this.data.fpvBr !== false;
    this.data.fpvDuel = this.data.fpvDuel !== false;     // 결투는 1인칭이 기본
    this.data.vol = Math.max(0, Math.min(1, this.data.vol == null ? 0.8 : +this.data.vol));
    this.data.mode = this.data.mode === 'duel' ? 'duel' : 'br';
  },

  /* 이 모드에서 쓸 시점을 꺼내 지금 값으로 세웁니다 */
  useMode(mode) {
    this.data.fpv = mode === 'duel' ? this.data.fpvDuel : this.data.fpvBr;
    return this.data.fpv;
  },
  /* 시점을 바꿨을 때, 지금 모드 쪽에 기억해 둡니다 */
  setFpv(on, mode) {
    this.data.fpv = !!on;
    if ((mode || this.data.mode) === 'duel') this.data.fpvDuel = !!on;
    else this.data.fpvBr = !!on;
    this.save(); this.sync();
    Sfx.setVolume(this.data.vol);
  },

  /* data-set 이 붙은 조절기를 모두 연결하고, 값이 바뀌면 서로 맞춰 줍니다 */
  bind() {
    this.controls = Array.from(document.querySelectorAll('[data-set]'));
    for (const el of this.controls) {
      const key = el.dataset.set;
      el.addEventListener('input', () => {
        this.data[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        this.clamp(); this.save(); this.sync();
      });
      // 슬라이더를 만지는 동안 화면이 다시 잠기지 않도록
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => e.stopPropagation());
    }
    this.sync();
  },

  sync() {
    for (const el of this.controls) {
      const key = el.dataset.set;
      if (el.type === 'checkbox') el.checked = !!this.data[key];
      else el.value = this.data[key];
    }
    for (const el of document.querySelectorAll('[data-val]')) {
      el.textContent = (+this.data[el.dataset.val]).toFixed(2);
    }
  }
};

const UI = {
  el: {},
  init() {
    const ids = ['menu', 'over', 'hud', 'hp', 'hpText', 'gunName', 'ammo', 'meds', 'alive',
      'kills', 'zoneText', 'zoneLabel', 'feed', 'prompt', 'result', 'resultSub', 'resultStats',
      'startBtn', 'againBtn', 'cross', 'hitmark', 'hurt', 'minimap', 'compass',
      'bigmap', 'bigmapCanvas', 'dmgDir', 'pause', 'lockHint', 'healBar', 'healFill', 'resumeBtn',
      'scope', 'alt', 'slots', 'winBanner', 'lobbyBtn', 'rewardBox',
      'gear', 'vestTag', 'helmetTag', 'bagTag', 'speedo', 'debug', 'fragTag', 'smokeTag',
      'aliveChip', 'zoneChip', 'duelChip', 'duelScore', 'shieldBox', 'shieldText', 'medbox',
      'adsRet', 'adsVig'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mctx = this.el.minimap.getContext('2d');
    this.cctx = this.el.compass.getContext('2d');
    this.bctx = this.el.bigmapCanvas.getContext('2d');
  },
  showMenu() { document.body.classList.remove('playing'); this.el.menu.classList.remove('hidden'); this.el.over.classList.add('hidden'); this.el.hud.classList.add('hidden'); },
  showGame() {
    this.el.winBanner.classList.add('hidden');
    this.el.menu.classList.add('hidden'); this.el.over.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    document.body.classList.add('playing');
  },
  showResult(r) {
    document.body.classList.remove('playing');
    this.el.winBanner.classList.add('hidden');
    this.el.over.classList.remove('hidden');
    this.el.hud.classList.add('hidden');

    // 보상 지급과 전적 반영
    const rw = Profile.reward(r, r.total);
    this.el.rewardBox.innerHTML =
      '<div class="row"><span>참가 보상</span><b>+' + rw.base + '</b></div>' +
      '<div class="row"><span>처치 ' + r.kills + '명</span><b>+' + rw.kills + '</b></div>' +
      '<div class="row"><span>순위 보너스</span><b>+' + rw.rankBonus + '</b></div>' +
      (rw.win ? '<div class="row"><span>우승 보너스</span><b>+' + rw.win + '</b></div>' : '') +
      '<div class="row total"><span>획득 BP</span><b>+' + rw.total.toLocaleString() + '</b></div>';
    Lobby.refresh();
    Lobby.refreshUI();
    if (r.duel) {
      this.el.result.textContent = r.won ? '결투 승리' : '결투 패배';
      this.el.result.className = r.won ? 'win' : 'lose';
      this.el.resultSub.textContent = r.kills + ' : ' + r.lost;
      this.el.resultStats.innerHTML =
        '<div><b>' + r.kills + '</b><span>내 점수</span></div>' +
        '<div><b>' + r.lost + '</b><span>상대 점수</span></div>' +
        '<div><b>' + this.time(r.time) + '</b><span>경기 시간</span></div>';
    } else {
      this.el.result.textContent = r.won ? '치킨 디너!' : '탈락';
      this.el.result.className = r.won ? 'win' : 'lose';
      this.el.resultSub.textContent = r.won ? '마지막까지 살아남았습니다' : r.rank + '위 / ' + r.total + '명';
      this.el.resultStats.innerHTML =
        '<div><b>' + r.kills + '</b><span>처치</span></div>' +
        '<div><b>#' + r.rank + '</b><span>순위</span></div>' +
        '<div><b>' + this.time(r.time) + '</b><span>생존</span></div>';
    }
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

    // 결투장에는 자가 치료와 투척 무기가 없으므로 그 칸은 감춥니다
    this.el.medbox.classList.toggle('hidden', !!g.duel);
    this.el.gear.classList.toggle('hidden', !!g.duel);

    // 실드는 쓰는 판(결투장)에서만 보여 줍니다
    if (p.shieldMax > 0) {
      this.el.shieldBox.classList.remove('hidden');
      this.el.shieldBox.classList.toggle('empty', p.shield <= 0);
      this.el.shieldText.textContent = Math.max(0, Math.round(p.shield));
    } else this.el.shieldBox.classList.add('hidden');

    if (p.gun) {
      this.el.gunName.textContent = GUNS[p.gun].short
        + (p.zoom > 1 ? ' · ' + SCOPES[p.zoom].label : (p.scopeStowed ? ' · 조준경 분리' : ''));
      this.el.ammo.textContent = p.swap > 0 ? '교체 중'
        : (p.reloading > 0 ? '재장전' : (p.mag + ' / ' + p.reserveAmmo + '  ' + CALIBERS[p.caliber].short));
    } else {
      this.el.gunName.textContent = '맨손';
      this.el.ammo.textContent = '무기를 찾으세요';
    }

    // 무기 두 칸 표시
    for (const el of this.el.slots.children) {
      const i = +el.dataset.slot;
      const key = p.guns[i];
      const lv = p.scopes[i];
      el.querySelector('b').textContent = key
        ? GUNS[key].short + (lv ? ' ' + SCOPES[lv].label : '') : '비어 있음';
      el.classList.toggle('active', i === p.slot && !!key);
      el.classList.toggle('empty', !key);
      el.style.borderColor = key && i === p.slot
        ? '#' + GUNS[key].color.toString(16).padStart(6, '0') : '';
    }

    // 수송기 · 낙하 안내
    if (p.flying === 'plane') {
      const pl = g.plane;
      const wait = pl ? Math.max(0, g.planeDoor - pl.t) : 0;
      const left = Math.max(0, Math.round(g.planeLeft || 0));
      this.el.alt.classList.remove('hidden');
      this.el.alt.querySelector('b').textContent = left;
      this.el.alt.querySelector('span').textContent = '초';
      this.el.alt.querySelector('em').textContent =
        wait > 0.05 ? '문 여는 중…' : 'SPACE 낙하 · 남은 시간';
    } else if (p.flying) {
      const altV = Math.max(0, Math.round(p.pos.y - World.height(p.pos.x, p.pos.z)));
      this.el.alt.classList.remove('hidden');
      this.el.alt.querySelector('b').textContent = altV;
      this.el.alt.querySelector('span').textContent = 'm';
      this.el.alt.querySelector('em').textContent = p.flying === 'chute' ? '낙하산' : '자유낙하';
    } else this.el.alt.classList.add('hidden');

    // 조준경
    const zoom = p.zoom;
    const scoped = Game.ads && zoom >= 4 && !p.flying;
    this.el.scope.classList.toggle('hidden', !scoped);
    if (scoped) this.el.scope.querySelector('.zoom').textContent = SCOPES[zoom].label;
    this.el.meds.textContent = p.meds + ' / ' + p.medCap;

    // 방어구
    const tag = (el, lv, table) => {
      el.className = 'gearTag' + (lv ? ' lv' + lv : ' off');
      el.querySelector('b').textContent = lv ? 'Lv' + lv : '-';
      el.title = lv ? table[lv].name : '없음';
    };
    // 투척 무기 개수
    const thr = (el, n) => {
      el.className = 'gearTag' + (n > 0 ? '' : ' off');
      el.querySelector('b').textContent = n > 0 ? n : '-';
    };
    thr(this.el.fragTag, p.throws.frag);
    thr(this.el.smokeTag, p.throws.smoke);

    tag(this.el.helmetTag, p.helmet, HELMETS);
    tag(this.el.vestTag, p.vest, VESTS);
    tag(this.el.bagTag, p.bag, BAGS);

    // 속도계 (차량 탑승 중에만)
    if (p.vehicle) {
      this.el.speedo.classList.remove('hidden');
      this.el.speedo.querySelector('b').textContent = Math.round(Math.abs(p.vehicle.speed) * 3.6);
      this.el.speedo.querySelector('em').textContent =
        p.vehicle.spec.name + ' · ' + Math.max(0, Math.round(p.vehicle.hp));
    } else this.el.speedo.classList.add('hidden');

    this.el.kills.textContent = p.kills;
    this.el.aliveChip.classList.toggle('hidden', !!g.duel);
    this.el.zoneChip.classList.toggle('hidden', !!g.duel);
    this.el.duelChip.classList.toggle('hidden', !g.duel);

    const z = g.zone;
    if (g.duel) {
      this.el.duelScore.textContent = g.score[0] + ' : ' + g.score[1];
      this.el.duelScore.style.color = g.score[0] >= g.score[1] ? '#7ee787' : '#f85149';
    } else {
      this.el.alive.textContent = g.alive;
      this.el.zoneLabel.textContent = z.shrinking ? '자기장 축소 중' : '다음 자기장';
      this.el.zoneText.textContent = z.phase >= PHASES.length && !z.shrinking ? '최종' : this.time(z.timer);
      this.el.zoneText.style.color = z.shrinking ? '#f85149' : '#e6edf3';
    }

    this.el.feed.innerHTML = g.feed.map(f =>
      '<div style="opacity:' + Math.max(0, Math.min(1, f.life)) + '">' + f.text + '</div>').join('');

    let hint = null;
    if (!p.dead && !p.flying) {
      if (p.vehicle) hint = p.vehicle.spec.name + ' 에서 내리기';
      else {
        const near = g.nearestLoot(p);
        const lootD = near ? Math.hypot(near.pos.x - p.pos.x, near.pos.z - p.pos.z) : Infinity;
        const drop = g.nearestDrop(p);
        const veh = g.nearestVehicle(p);
        if (near && lootD <= CFG.PICK_RANGE) hint = near.label;
        else if (drop) hint = '보급 상자 열기';
        else if (veh) hint = veh.spec.name + ' 탑승';
        else if (near) hint = near.label;
      }
    }
    if (hint) {
      this.el.prompt.classList.remove('hidden');
      this.el.prompt.innerHTML = '<kbd>F</kbd> ' + hint;
    } else this.el.prompt.classList.add('hidden');

    /* 조준선: 평소에는 십자선, 레드도트 조준경으로 정조준할 때만 빨간 점.
       벌어짐은 사격과 똑같은 함수에서 가져오므로, 화면에 보이는 조준선이
       지금 실제 탄퍼짐과 항상 일치합니다(끊어 쏘기로 모인 상태까지). */
    const spread = p.gun ? g.aimSpread(p) : 0.05;
    this.el.cross.style.setProperty('--gap', (4 + spread * 460).toFixed(1) + 'px');
    this.el.cross.style.setProperty('--ring', (14 + spread * 620).toFixed(1) + 'px');
    this.el.cross.classList.toggle('reddot', Game.ads && p.zoom === 2);

    /* 1대1 정조준 조준경. 조준선 대신 육각 브래킷을 띄우고, 탄퍼짐만큼
       벌어지게 해서 지금 총이 얼마나 모여 있는지 그대로 읽히게 합니다. */
    const duelAds = !!g.duel && Game.ads && !p.flying && !p.dead;
    this.el.adsRet.classList.toggle('hidden', !duelAds);
    this.el.adsVig.classList.toggle('hidden', !duelAds);
    if (duelAds) {
      this.el.adsRet.style.transform = 'scale(' + (1 + Math.min(0.7, spread * 13)).toFixed(3) + ')';
    }
    // 1대1 평소 조준선은 발로란트처럼 가운데 점 하나입니다
    this.el.cross.classList.toggle('dotOnly', !!g.duel && !duelAds);
    this.el.cross.style.opacity = (p.flying || scoped || duelAds) ? 0 : 1;

    this.el.hitmark.style.opacity = Math.max(0, g.hitMarker * 4);

    // 자기장 밖 경고 + 체력 낮을 때 붉은 화면
    const dz = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    const outside = !g.duel && dz > z.r;
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
    /* 결투장은 88×64m 밖에 안 되므로 좁게 봐서 맵 전체가 들어오게 합니다 */
    const span = g.duel ? 110 : 280;                    // 미니맵에 보이는 실제 거리(m)
    const p = g.player;
    if (g.duel) {
      Arena.drawMini(c, S, p.pos.x, p.pos.z, span);
    } else {
      const src = g.minimapImg;
      const scale = src.width / World.size;
      const sx = (p.pos.x + World.half - span / 2) * scale;
      const sy = (p.pos.z + World.half - span / 2) * scale;
      const sw = span * scale;
      c.fillStyle = '#0d1117';
      c.fillRect(0, 0, S, S);
      c.drawImage(src, sx, sy, sw, sw, 0, 0, S, S);
    }

    const toPx = (x, z) => [((x - p.pos.x) / span + 0.5) * S, ((z - p.pos.z) / span + 0.5) * S];
    const z = g.zone;

    // 자기장
    if (!g.duel) {
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
    }

    // 차량
    for (const v of g.vehicles) {
      if (v.dead) continue;
      const q = toPx(v.pos.x, v.pos.z);
      if (q[0] < -6 || q[0] > S + 6 || q[1] < -6 || q[1] > S + 6) continue;
      c.fillStyle = v.occupied ? '#ffd166' : '#9fd3ff';
      c.fillRect(q[0] - 2.2, q[1] - 2.2, 4.4, 4.4);
    }

    // 수송기 항로와 현재 위치
    if (g.plane) {
      const a = toPx(g.plane.a.x, g.plane.a.z), b2 = toPx(g.plane.b.x, g.plane.b.z);
      c.save();
      c.setLineDash([6, 5]); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke();
      c.restore();
      const q = toPx(g.plane.pos.x, g.plane.pos.z);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(q[0], q[1], 3.4, 0, Math.PI * 2); c.fill();
    }

    // 지점 표시(핑)
    for (const pg of (g.pings || [])) {
      const q = toPx(pg.pos.x, pg.pos.z);
      this.pingMark(c, q[0], q[1], 6);
    }

    // 보급 상자
    for (const a of g.drops) {
      if (a.dead || a.opened) continue;
      const q = toPx(a.pos.x, a.pos.z);
      this.dropMark(c, q[0], q[1], a.landed, 7);
    }

    /* 근처 적. 결투장에서는 그리지 않습니다 — 상대가 어디 있는지 지도로
       알려 주면 모서리를 까고 나아가는 재미가 사라집니다. */
    if (!g.duel) {
      for (const ch of g.chars) {
        if (ch.dead || ch.isPlayer) continue;
        if (p.pos.distanceTo(ch.pos) > 80) continue;
        const q = toPx(ch.pos.x, ch.pos.z);
        c.fillStyle = '#ff6b6b';
        c.beginPath(); c.arc(q[0], q[1], 2.6, 0, Math.PI * 2); c.fill();
      }
    }

    // 플레이어 (시야 방향 삼각형)
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(Math.PI - Game.look.yaw);   // 지도 위쪽이 북이므로 시선 방향으로 돌립니다
    c.fillStyle = '#58a6ff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
    c.restore();
  },

  /* 지점 표시(핑) 표식: 노란 마름모 */
  pingMark(c, x, y, r) {
    c.save();
    c.fillStyle = '#ffd166'; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + r * 0.72, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.72, y);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
  },

  /* 보급 상자 표시: 낙하 중이면 속이 빈 원, 착지하면 채운 낙하산 표식 */
  dropMark(c, x, y, landed, r) {
    c.save();
    c.strokeStyle = '#ff5a4a'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (landed) { c.fillStyle = 'rgba(255,90,74,0.55)'; c.fill(); }
    c.stroke();
    c.fillStyle = '#fff';
    c.fillRect(x - r * 0.32, y - 1.2, r * 0.64, 2.4);
    c.fillRect(x - 1.2, y - r * 0.32, 2.4, r * 0.64);
    c.restore();
  },

  drawBigMap(g) {
    const c = this.bctx, S = this.el.bigmapCanvas.width;
    if (g.duel) return this.drawBigDuel(g, c, S);
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
    for (const v of g.vehicles) {
      if (v.dead) continue;
      const q = toPx(v.pos.x, v.pos.z);
      c.fillStyle = v.occupied ? '#ffd166' : '#9fd3ff';
      c.fillRect(q[0] - 2, q[1] - 2, 4, 4);
    }
    // 수송기 항로
    if (g.plane) {
      const a = toPx(g.plane.a.x, g.plane.a.z), b2 = toPx(g.plane.b.x, g.plane.b.z);
      c.save();
      c.setLineDash([9, 7]); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke();
      c.restore();
      const q = toPx(g.plane.pos.x, g.plane.pos.z);
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(q[0], q[1], 5, 0, Math.PI * 2); c.fill();
    }
    for (const pg of (g.pings || [])) {
      const q = toPx(pg.pos.x, pg.pos.z);
      this.pingMark(c, q[0], q[1], 9);
    }
    for (const a of g.drops) {
      if (a.dead || a.opened) continue;
      const q = toPx(a.pos.x, a.pos.z);
      this.dropMark(c, q[0], q[1], a.landed, 10);
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
  },

  /* 결투장 전체 지도. 맵이 작아 화면에 그대로 다 들어갑니다. */
  drawBigDuel(g, c, S) {
    const pad = 14, k = Math.min((S - pad * 2) / Arena.W, (S - pad * 2) / Arena.D);
    const tx = x => S / 2 + x * k, tz = z => S / 2 + z * k;
    c.fillStyle = '#0d1117'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#2f3237';
    c.fillRect(tx(-Arena.W / 2), tz(-Arena.D / 2), Arena.W * k, Arena.D * k);
    for (const b of Arena.solids) {
      c.fillStyle = b.h > 2.5 ? '#8b8578' : '#6a6f76';
      c.fillRect(tx(b.x - b.sx / 2), tz(b.z - b.sz / 2), b.sx * k, b.sz * k);
    }
    // 시작 지점
    Arena.spawns.forEach((sp, i) => {
      c.strokeStyle = i === 0 ? '#2fd3c4' : '#ff5a4a';
      c.lineWidth = 2;
      c.strokeRect(tx(sp.x - 4.5), tz(sp.z - 4.5), 9 * k, 9 * k);
    });
    for (const pg of (g.pings || [])) this.pingMark(c, tx(pg.pos.x), tz(pg.pos.z), 9);
    // 나 (시선 방향)
    c.save(); c.translate(tx(g.player.pos.x), tz(g.player.pos.z));
    c.rotate(Math.PI - Game.look.yaw);
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
  mode: 'lock',              // lock: 마우스 잠금 / free: 잠금 없이 움직인 만큼만 회전
  locked: false, settingsOpen: false,
  lockedEver: false,         // 한 번이라도 잠겼다면 이 브라우저는 잠금을 지원합니다
  lockFails: 0,
  mouseX: 0, mouseY: 0, inside: false, edgeX: 0, edgeY: 0, edgeAt: 0,

  init(canvas) {
    this.canvas = canvas;

    canvas.addEventListener('click', () => {
      Sfx.init();
      try { window.focus(); } catch (e) { /* 무시 */ }
      // 잠금 없는 모드로 넘어가 있어도 다시 시도합니다. 성공하면 잠금 모드로 돌아옵니다.
      if (Game.state === 'playing') this.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) {
        this.lockedEver = true; this.lockFails = 0;
        this.dx = this.dy = 0;                  // 다시 잡을 때 쌓인 값으로 화면이 튀지 않게
        if (this.mode === 'free') {             // 잠금이 되는 브라우저였습니다 — 돌아갑니다
          this.mode = 'lock';
          UI.el.lockHint.classList.add('hidden');
        }
      } else { this.fire = false; this.ads = false; }
    });
    /* 탭을 옮겼다 돌아온 직후에는 브라우저가 잠금 요청을 잠깐 거절합니다.
       한 번이라도 잠긴 적이 있으면 지원되는 브라우저이므로, 그 거절 때문에
       조작 방식을 바꾸지 않습니다. 다음 클릭에 다시 시도하면 됩니다. */
    document.addEventListener('pointerlockerror', () => {
      if (this.lockedEver) return;
      if (++this.lockFails >= 3) this.fallbackToFree();
    });

    // 잠금 여부와 상관없이 '움직인 거리'만 반영합니다.
    // 마우스를 멈추면 시점도 곧바로 멈춥니다.
    window.addEventListener('mousemove', e => {
      this.mouseX = e.clientX; this.mouseY = e.clientY; this.inside = true;
      this.moveAt = performance.now();
      if (Game.state !== 'playing' || this.settingsOpen) return;
      const mx = e.movementX, my = e.movementY;
      if (mx === undefined) return;
      // 창을 다시 잡을 때 튀는 큰 값은 버립니다
      if (Math.abs(mx) > 220 || Math.abs(my) > 220) return;
      this.dx += mx; this.dy += my;
    });
    /* 커서가 창 밖으로 나가면 그 즉시 회전을 멈춥니다.
       예전에는 4초 동안 마지막 방향으로 계속 돌아서, 커서가 창을 벗어난 뒤
       가만히 둬도 화면이 빙빙 도는 문제가 있었습니다. */
    const leave = () => { this.inside = false; this.edgeX = this.edgeY = 0; };
    window.addEventListener('mouseout', e => { if (!e.relatedTarget) leave(); });
    document.addEventListener('mouseleave', leave);
    window.addEventListener('mouseleave', leave);
    document.addEventListener('visibilitychange', () => {
      leave();
      /* 다른 창을 보다 돌아오면 눌려 있던 것으로 남은 키와 사격 상태를 지웁니다.
         (탭을 옮기는 사이 keyup 이 오지 않아 계속 달리거나 쏘는 일이 생깁니다) */
      this.keys = {}; this.fire = false; this.ads = false;
      this.dx = this.dy = 0;
    });
    window.addEventListener('mouseover', () => { this.inside = true; });
    window.addEventListener('mousedown', e => {
      if (Game.state !== 'playing') return;
      if (e.button === 0) this.fire = true;
      if (e.button === 1) { e.preventDefault(); Game.placePing(); }
      if (e.button === 2) this.ads = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.ads = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', e => {
      if (Game.state !== 'playing' || this.settingsOpen) return;
      e.preventDefault();
      if (Game.player.swapSlot()) Sfx.swap();
    }, { passive: false });
    window.addEventListener('blur', () => {
      this.keys = {}; this.fire = false; this.ads = false;
      this.edgeX = this.edgeY = 0;        // 창을 벗어나면 회전을 멈춥니다
    });

    // 한글 입력 상태에서도 동작하도록 e.key 가 아니라 물리 키 위치(e.code)를 씁니다.
    // (한글 모드에서는 W 키가 'ㅈ' 으로 들어와 이동이 먹지 않습니다)
    window.addEventListener('keydown', e => {
      const c = e.code || '';
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
      if (this.keys[c]) return;                    // 키 반복 무시
      this.keys[c] = true;
      if (Game.state !== 'playing') { if (c === 'Enter' || c === 'NumpadEnter') Main.startGame(); return; }
      if (c === 'Space') {
        // 수송기 안이면 스페이스로 뛰어내립니다
        if (Game.player && Game.player.flying === 'plane') Game.jumpFromPlane(Game.player);
        else this.jump = true;
      }
      if (c === 'KeyZ') Game.placePing();
      if (c === 'KeyG') Game.throwItem(Game.player, 'frag');
      if (c === 'KeyH') Game.throwItem(Game.player, 'smoke');
      if (c === 'KeyR' && Game.player.startReload()) Sfx.reload();
      if (c === 'KeyF' || c === 'KeyE') Game.tryPickup();
      if (c === 'KeyQ') Game.player.startHeal();
      if (c === 'Tab') UI.el.bigmap.classList.toggle('hidden');
      if (c === 'KeyM') { Sfx.enabled = !Sfx.enabled; Game.pushFeed('소리 ' + (Sfx.enabled ? '켜짐' : '꺼짐')); }
      if (c === 'KeyO') this.toggleSettings();
      if (c === 'KeyP') {
        UI.el.debug.classList.toggle('hidden');
        Game.pushFeed('진단 표시 ' + (UI.el.debug.classList.contains('hidden') ? '끔' : '켬'));
      }
      if (c === 'Digit1' || c === 'Numpad1') { if (Game.player.selectSlot(0)) Sfx.swap(); }
      if (c === 'Digit2' || c === 'Numpad2') { if (Game.player.selectSlot(1)) Sfx.swap(); }
      if (c === 'KeyX') { if (Game.player.swapSlot()) Sfx.swap(); }
      if (c === 'KeyT') {
        const on = Game.player.toggleScope();
        if (on === null) Game.pushFeed('뗄 수 있는 조준경이 없습니다');
        else { Sfx.swap(); Game.pushFeed('조준경 ' + (on ? '장착' : '분리')); }
      }
      if (c === 'KeyV') {
        Settings.setFpv(!Settings.data.fpv, Game.mode);
        Game.pushFeed(Settings.data.fpv ? '1인칭 시점' : '3인칭 시점');
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.code || ''] = false; });
  },

  /* 설정 창 열고 닫기 — 열려 있는 동안 게임은 멈춥니다 */
  toggleSettings(open) {
    this.settingsOpen = open === undefined ? !this.settingsOpen : open;
    if (this.settingsOpen) {
      this.fire = false; this.ads = false;
      if (this.locked) document.exitPointerLock();
    } else if (Game.state === 'playing') {
      this.requestLock();          // 설정을 닫으면 다시 잠급니다 (거절되면 다음 클릭에)
    }
  },

  /* 마우스 잠금을 요청합니다. 거절은 조용히 넘기고 다음 클릭에 다시 시도합니다.
     (크롬은 잠금이 풀린 직후 잠깐 동안 새 요청을 거절합니다) */
  requestLock() {
    if (this.locked || !this.canvas || !this.canvas.requestPointerLock) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { /* 다음 클릭에 다시 */ });
    } catch (e) { /* 무시 */ }
  },

  /* 마우스 잠금을 쓸 수 없는 브라우저에서는 잠금 없이 그대로 진행합니다 */
  fallbackToFree() {
    if (this.mode !== 'lock') return;
    this.mode = 'free';
    UI.el.pause.classList.add('hidden');
    UI.el.lockHint.classList.remove('hidden');
    setTimeout(() => UI.el.lockHint.classList.add('hidden'), 7000);
  },

  poll() {
    const k = this.keys;
    this.fwd = !!(k['KeyW'] || k['ArrowUp']);
    this.back = !!(k['KeyS'] || k['ArrowDown']);
    this.left = !!(k['KeyA'] || k['ArrowLeft']);
    this.right = !!(k['KeyD'] || k['ArrowRight']);
    this.sprint = !!(k['ShiftLeft'] || k['ShiftRight']);
    this.crouch = !!(k['KeyC'] || k['ControlLeft'] || k['ControlRight']);

    if (Game.state !== 'playing' || this.settingsOpen) return;

    // 조준점은 화면 한가운데 고정. 마우스가 시야를 돌립니다.
    // 잠금이 없을 때는 커서가 가장자리에 닿거나 창 밖으로 나가도 같은 속도로 계속 돌아갑니다.
    if (this.locked || !Settings.data.edge) { this.edgeX = this.edgeY = 0; return; }
    const W = window.innerWidth, H = window.innerHeight, band = 110;
    const rate = 8;                        // 프레임당 회전량 (감도 설정이 그대로 곱해집니다)

    /* 커서가 창 안에 있고, 최근에 마우스를 움직였을 때만 돌립니다.
       창 밖으로 나갔거나 2초 넘게 가만히 있으면 곧바로 멈춥니다. */
    if (!this.inside || performance.now() - (this.moveAt || 0) > 2000) {
      this.edgeX = this.edgeY = 0;
      return;
    }
    const x = this.mouseX, y = this.mouseY;
    this.edgeX = x <= band ? -1 : (x >= W - band ? 1 : 0);
    this.edgeY = y <= band ? -1 : (y >= H - band ? 1 : 0);

    if (this.edgeX) this.dx += this.edgeX * rate;
    if (this.edgeY) this.dy += this.edgeY * rate * 0.6;
  }
};

const Main = {
  /* 모델 위치는 스크립트가 실제로 불러와진 자리에서 찾습니다.
     첫 화면(/)과 개발용(/3d/)에서 상대 경로가 다르기 때문입니다. */
  get ASSET_BASE() {
    const tag = document.querySelector('script[src*="vendor/three.min.js"]');
    const src = tag ? tag.getAttribute('src') : '';
    return src.replace(/vendor\/three\.min\.js.*$/, '');
  },
  /* 모델 주소에도 판 딱지를 붙입니다. 안 붙이면 브라우저가 예전에 받아 둔
     모델을 계속 써서, 새 코드에 옛 모델이 물리는 일이 생깁니다.
     (딱지는 빌드가 index.html 에 심어 둡니다. 개발용 /3d/ 에서는 없습니다) */
  get ASSET_TAG() { return window.ASSET_VER ? '?v=' + window.ASSET_VER : ''; },
  get MODEL_URL() { return this.ASSET_BASE + 'models/Soldier.glb' + this.ASSET_TAG; },
  get KIT_URL() { return this.ASSET_BASE + 'models/spacebits.glb' + this.ASSET_TAG; },
  last: 0,
  init() {
    UI.init();
    Settings.load();
    Settings.bind();
    Profile.load();
    Account.load();
    const canvas = document.getElementById('scene');
    Game.init(canvas);
    Input.init(canvas);
    Lobby.init();
    Lobby.refresh();
    Net.connect().then(ok => { if (ok) Lobby.onNetReady(); });
    /* 구글 로그인 준비. 설정이 비어 있으면 아무것도 받지 않고 조용히 지나갑니다.
       게임 시작을 기다리게 하지 않으므로, 로그인이 안 돼도 바로 플레이됩니다. */
    if (typeof Auth !== 'undefined') Auth.init().then(() => Lobby.renderAccount());
    // db 기능이 켜져 있으면 친구 접속 상태까지 실시간으로 보여 줍니다 (없으면 조용히 넘어감)
    Account.connect().then(ok => { if (ok) Lobby.renderFriends(); });
    window.addEventListener('resize', () => Lobby.resize());
    UI.el.startBtn.addEventListener('click', () => this.startGame());
    UI.el.againBtn.addEventListener('click', () => this.startGame());
    UI.el.resumeBtn.addEventListener('click', e => { e.stopPropagation(); Input.toggleSettings(false); });
    UI.el.lobbyBtn.addEventListener('click', () => {
      Game.state = 'menu'; Net.leaveMatch(); UI.showMenu(); Lobby.tab('play');
    });
    /* 캐릭터와 기지 부품은 첫 화면을 띄우면서 곧바로 읽어 둡니다.
       파일(file://)로 직접 열면 브라우저가 모델 읽기를 막습니다. 그때 로비가
       빈 화면으로만 남으면 무엇이 잘못됐는지 알 수 없으므로 이유를 적어 줍니다. */
    Promise.all([
      CharModel.load(this.MODEL_URL).then(ok => { if (Lobby.ready) Lobby.refresh(); return ok; }),
      SpaceKit.load(this.KIT_URL).then(ok => { Lobby.buildBackdrop(); return ok; })
    ]).then(([a, b]) => { if (!a || !b) this.showAssetError(); });
    UI.showMenu();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  /* 모델을 못 읽었을 때 로비에 이유를 적습니다 */
  showAssetError() {
    const el = document.getElementById('shareHint');
    if (!el) return;
    const local = location.protocol === 'file:';
    el.innerHTML = '<b style="color:#ff8b7a">3D 모델을 불러오지 못했습니다.</b><br>' + (local
      ? 'HTML 파일을 직접 열면 브라우저가 모델 읽기를 막습니다.<br>'
        + '<b>python3 -m http.server</b> 로 띄우고 http://localhost:8000 으로 열거나,<br>'
        + '올려 둔 주소로 접속해 주세요.'
      : '새로고침해도 같으면 models/ 폴더가 함께 올라갔는지 확인해 주세요.');
  },

  startGame() {
    /* 모델을 아직 못 읽었으면 다 읽고 시작합니다.
       기지 부품은 섬을 만들 때 크기를 알아야 충돌 상자를 맞출 수 있어서,
       캐릭터와 마찬가지로 시작 전에 반드시 준비되어 있어야 합니다. */
    if (!CharModel.ready || !SpaceKit.ready) {
      Game.pushFeed('섬을 불러오는 중…');
      Promise.all([CharModel.load(Main.MODEL_URL), SpaceKit.load(Main.KIT_URL)]).then(ok => {
        if (ok[0] && ok[1]) this.startGame();
        else alert('모델을 불러오지 못했습니다: ' + (CharModel.error || SpaceKit.error || ''));
      });
      return;
    }
    Sfx.init();
    try { window.focus(); } catch (e) { /* 무시 */ }
    Input.settingsOpen = false;
    UI.el.bigmap.classList.add('hidden');
    const n = CFG.BOTS;          // 참가자 수는 고정입니다 (로비에서 바꿀 수 없습니다)
    const mode = Lobby.mode === 'duel' ? 'duel' : 'br';

    /* 같은 방에 사람이 더 있으면 함께 시작합니다.
       결투는 두 명 전용이므로, 셋 이상이면 시작하지 않고 알려 줍니다. */
    if (Net.online && Net.playerCount > 1) {
      if (mode === 'duel' && Net.playerCount !== 2) {
        Lobby.toast('결투는 두 명일 때만 됩니다 (지금 ' + Net.playerCount + '명)');
        return;
      }
      Net.hostStart(mode);
      Lobby.notifyStarting(mode);
      return;
    }
    this.beginMatch(n, { mode });
  },

  beginMatch(n, opts) {
    Sfx.init();
    // 이 모드에서 쓰던 시점으로 맞춥니다 (결투는 1인칭이 기본)
    Settings.useMode((opts && opts.mode) === 'duel' ? 'duel' : 'br');
    Input.settingsOpen = false;
    UI.el.bigmap.classList.add('hidden');
    UI.showGame();
    Game.start(n, opts || {});
    if (Input.mode === 'lock') {
      Input.requestLock();
      // 잠금이 조용히 무시되는 브라우저에서만 대체 조작으로 넘어갑니다
      setTimeout(() => { if (!Input.locked && !Input.lockedEver) Input.fallbackToFree(); }, 1200);
    }
  },

  /* 한 프레임. 어디서 오류가 나더라도 다음 프레임은 반드시 예약합니다.
     예전에는 오류 한 번에 루프가 끊겨 화면만 남고 조작이 완전히 멎었습니다. */
  loop(t) {
    const dt = Math.min(CFG.MAX_DT, (t - this.last) / 1000);
    this.last = t;
    try {
      this.frame(dt);
    } catch (e) {
      this.onError(e);
    }
    requestAnimationFrame(nt => this.loop(nt));
  },

  frame(dt) {
    Net.tick();
    Net.update(dt);
    if (Game.state === 'playing') {
      // 마우스 잠금이 풀렸다고 게임을 영영 멈추지 않습니다.
      // 잠깐 기다렸다가 잠금 없이 그대로 이어서 진행합니다.
      /* 잠금이 풀렸을 때 잠금 없는 모드로 넘길지 판단합니다.
         한 번이라도 잠긴 적이 있거나(= 지원되는 브라우저) 지금 탭이 숨겨져
         있으면 넘기지 않습니다. 예전에는 다른 탭에 1.2초만 있다 와도 조작이
         잠금 없는 모드로 영구히 바뀌어, 커서가 남고 화면이 저절로 돌았습니다. */
      if (Input.mode === 'lock' && !Input.locked) {
        if (document.hidden || Input.lockedEver) this.unlockAt = 0;
        else if (!this.unlockAt) this.unlockAt = performance.now();
        else if (performance.now() - this.unlockAt > 1200) Input.fallbackToFree();
      } else this.unlockAt = 0;

      const paused = Input.settingsOpen || (Input.mode === 'lock' && !Input.locked);
      UI.el.pause.classList.toggle('hidden', !paused);
      document.body.classList.toggle('paused', paused);
      if (!paused) {
        Input.poll();
        Game.update(dt, Input);
        UI.update(Game, dt);
      }
      Game.render();
    } else if (Game.state === 'menu') {
      UI.el.pause.classList.add('hidden');
      Lobby.update(dt);
      Lobby.render(Game.renderer);
    } else if (Game.scene && Game.player) {
      UI.el.pause.classList.add('hidden');
      Game.render();
    }
    this.stats(dt);
  },

  onError(e) {
    this.errCount = (this.errCount || 0) + 1;
    this.lastErr = (e && e.message ? e.message : String(e));
    if (this.errCount <= 3 && Game.pushFeed) Game.pushFeed('오류가 발생했지만 계속 진행합니다');
    if (this.errCount <= 3) console.error(e);
  },

  /* P 키로 켜는 진단 표시 (프레임·입력·좌표) */
  stats(dt) {
    this.fpsN = (this.fpsN || 0) + 1;
    this.fpsT = (this.fpsT || 0) + dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsN = 0; this.fpsT = 0; }
    const el = UI.el.debug;
    if (!el || el.classList.contains('hidden')) return;
    const p = Game.player;
    el.textContent =
      'FPS ' + (this.fps || 0) + ' · dt ' + dt.toFixed(3) +
      ' · ' + (Input.mode === 'lock' ? (Input.locked ? '마우스잠금' : '잠금대기') : '잠금없음') +
      (Input.settingsOpen ? ' · 설정열림' : '') +
      '\n입력 ' + [Input.fwd ? 'W' : '', Input.back ? 'S' : '', Input.left ? 'A' : '', Input.right ? 'D' : ''].join('') +
      ' · 속도 ' + (p ? p.speedNow.toFixed(1) : '-') +
      ' · ' + (p && p.grounded ? '지면' : '공중') + (p && p.flying ? ' · 낙하중' : '') +
      (p && p.vehicle ? ' · 탑승중' : '') +
      '\n좌표 ' + (p ? [p.pos.x, p.pos.y, p.pos.z].map(v => v.toFixed(1)).join(', ') : '-') +
      ' · 그리기 ' + Game.renderer.info.render.calls +
      '\n오류 ' + (this.errCount || 0) + (this.lastErr ? ' · ' + this.lastErr.slice(0, 70) : '');
  }
};

window.addEventListener('DOMContentLoaded', () => Main.init());
