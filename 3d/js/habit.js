/* ============================================================
   습관 기억 — 결투장 봇이 사람의 버릇을 익힙니다

   무엇을 익히나
   - 결투장을 5×5 칸으로 나누고(맵 격자선과 같은 자리), 사람이 어느 칸에
     머무는지 세어 둡니다. 라운드마다 '처음 나타난 칸' 도 따로 셉니다.
   - 쌓인 통계로 봇이 라운드 시작에 갈 자리를 고릅니다. 사람이 자주 지나는
     길목으로 미리 가서 기다리는 것 — 사람이 "이 사람 맨날 A로 가네" 하고
     읽는 것과 같습니다.

   공정선 (이게 이 파일의 핵심입니다)
   - 봇이 '실제로 인지할 수 있었던 순간' 만 기록합니다. 즉
       · 봇 시야(BOT_FOV) 안에 들어와 눈으로 봤을 때
       · 봇 근처(BOT_HEAR) 라 발소리로 알 수 있었을 때
       · 사람이 총을 쏴서 총성으로 알 수 있었을 때
     이 셋 중 하나일 때만 셉니다. 안 보이는 사람의 위치를 몰래 적어 두면
     그건 방금 없앤 '등 뒤 165m 투시' 와 같은 반칙이 됩니다.
   - 기억은 지난 라운드들의 통계일 뿐입니다. 지금 어디 있는지는 절대
     들여다보지 않습니다.

   시작 방은 노리지 않습니다 — 거기서 기다리면 스폰 사냥이 됩니다.
   ============================================================ */
const Habit = {
  KEY: 'lastSurvivor3d.habit',
  N: 5,                      // 5×5 칸
  MIN_ROUNDS: 3,             // 이만큼 쌓이기 전에는 쓰지 않습니다
  /* 익혔다고 매 라운드 길목을 지키면 너무 뻔하고 역이용하기도 쉽습니다.
     사람도 읽은 대로만 움직이지는 않으므로, 이 확률로만 읽기를 씁니다. */
  USE_P: 0.65,
  data: null,
  usedRoom: -1,              // 이번 라운드에 봇이 고른 길목 (표시용)
  _roundSeen: false,         // 이번 라운드에 처음 인지했는가

  get on() { return Settings.data.learn !== false; },

  /* ---------- 저장 ---------- */
  blank() {
    const n = this.N * this.N;
    return { v: 1, rounds: 0, frames: 0, crouch: 0,
             seen: new Array(n).fill(0), first: new Array(n).fill(0) };
  },
  load() {
    this.data = this.blank();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || !Array.isArray(d.seen)) return;   // 형식이 다르면 새로 시작
      const n = this.N * this.N;
      if (d.seen.length !== n || d.first.length !== n) return;
      this.data = d;
    } catch (e) { /* 저장소를 못 쓰면 이번 판만 기억합니다 */ }
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ }
  },
  reset() { this.data = this.blank(); this.save(); },

  /* ---------- 칸 ---------- */
  /* 맵을 5×5 로 나눕니다. 경계는 아레나 격자선(x ±29 ±11, z ±21 ±9)과
     같은 자리라, 한 칸이 대체로 방 하나에 해당합니다. */
  col(x) { return x < -29 ? 0 : x < -11 ? 1 : x < 11 ? 2 : x < 29 ? 3 : 4; },
  row(z) { return z < -21 ? 0 : z < -9 ? 1 : z < 9 ? 2 : z < 21 ? 3 : 4; },
  roomOf(x, z) { return this.row(z) * this.N + this.col(x); },

  /* 시작 방 두 곳 (가운데 열의 맨 위·맨 아래) */
  isSpawnRoom(r) { return r === 2 || r === 4 * this.N + 2; },

  /* 그 칸에서 서 있을 수 있는 자리. 칸 가운데가 엄폐물에 막혀 있으면
     둘레를 조금 훑어 빈 곳을 찾습니다. */
  spotOf(r) {
    const XS = [-36.5, -20, 0, 20, 36.5];
    const ZS = [-26.5, -15, 0, 15, 26.5];
    const cx = XS[r % this.N], cz = ZS[Math.floor(r / this.N)];
    if (!World.blocked(cx, cz, CFG.BODY_R, 0.05, 1.8)) return { x: cx, z: cz };
    for (let ring = 1; ring <= 3; ring++) {
      for (let a = 0; a < 8; a++) {
        const th = a / 8 * Math.PI * 2;
        const x = cx + Math.cos(th) * ring * 2.5, z = cz + Math.sin(th) * ring * 2.5;
        if (!World.blocked(x, z, CFG.BODY_R, 0.05, 1.8)) return { x, z };
      }
    }
    return { x: cx, z: cz };
  },

  /* ---------- 관찰 ----------
     매 프레임 불립니다. 봇이 인지할 수 있었던 순간만 셉니다. */
  observe(game, dt) {
    if (!this.on || !this.data) return;
    const p = game.player, foe = game.foe;
    if (!p || !foe || p.dead || foe.dead || p.flying) return;

    const d = Math.hypot(p.pos.x - foe.pos.x, p.pos.z - foe.pos.z);
    const saw = foe.ai && foe.ai.target === p;                    // 눈으로 봄
    const heard = d < CFG.BOT_HEAR;                               // 발소리
    const shot = p.lastShotT != null && game.time - p.lastShotT < 1.5
              && d < CFG.BOT_GUNSHOT;                             // 총성
    if (!saw && !heard && !shot) return;                          // 알 수 없었던 순간은 버립니다

    const r = this.roomOf(p.pos.x, p.pos.z);
    this.data.seen[r] += dt;
    this.data.frames += dt;
    if (p.crouch) this.data.crouch += dt;
    if (!this._roundSeen) { this._roundSeen = true; this.data.first[r] += 1; }
  },

  /* 라운드가 시작될 때 */
  beginRound() { this._roundSeen = false; this.usedRoom = -1; },

  /* 한 판이 끝나면 (결과 화면으로 갈 때) 저장합니다.
     매 프레임 저장하면 localStorage 쓰기가 초당 수십 번 일어납니다. */
  endMatch() {
    if (!this.data) return;
    this.data.rounds++;
    this.save();
  },

  /* 끄면 쌓아 둔 것이 있어도 쓰지 않습니다 */
  get ready() {
    return this.on && !!this.data && this.data.rounds >= this.MIN_ROUNDS && this.data.frames > 5;
  },

  /* ---------- 쓰기 ----------
     사람이 자주 있던 칸을 확률로 뽑습니다. 늘 1등만 고르면 봇이 너무
     읽히므로 가중 추첨으로 하고, 시작 방은 제외합니다. */
  pickRoom() {
    if (!this.ready) return -1;
    const d = this.data, n = this.N * this.N;
    let total = 0;
    const w = new Array(n).fill(0);
    for (let r = 0; r < n; r++) {
      if (this.isSpawnRoom(r)) continue;                 // 스폰 사냥 금지
      // 머문 시간 + 라운드 시작에 처음 나타난 횟수 (길목을 더 무겁게)
      w[r] = d.seen[r] + d.first[r] * 2;
      total += w[r];
    }
    if (total <= 0) return -1;
    let t = Math.random() * total;
    for (let r = 0; r < n; r++) { t -= w[r]; if (t <= 0) return r; }
    return -1;
  },

  /* 봇이 이번 라운드에 갈 자리. 익힌 게 없으면 null 을 돌려주고,
     그때는 봇이 원래대로 아무 데나 돌아다닙니다. */
  ambush() {
    if (Math.random() > this.USE_P) return null;      // 이번 라운드는 읽지 않습니다
    const r = this.pickRoom();
    if (r < 0) return null;
    this.usedRoom = r;
    return this.spotOf(r);
  },

  /* 로비·HUD 에 보여 줄 요약 */
  summary() {
    if (!this.data) return { rounds: 0, ready: false, top: null };
    const d = this.data, n = this.N * this.N;
    let best = -1, bv = 0;
    for (let r = 0; r < n; r++) {
      if (this.isSpawnRoom(r)) continue;
      const v = d.seen[r] + d.first[r] * 2;
      if (v > bv) { bv = v; best = r; }
    }
    return { rounds: d.rounds, ready: this.ready, top: best,
             crouchPct: d.frames > 0 ? Math.round(d.crouch / d.frames * 100) : 0 };
  },

  /* 칸 이름 (표시용) */
  NAMES: ['왼쪽 뒤', '왼쪽 통로', '시작 앞', '오른 통로', '오른쪽 뒤'],
  nameOf(r) {
    if (r < 0) return '-';
    const col = r % this.N, row = Math.floor(r / this.N);
    const rows = ['아래쪽', '아래 중간', '가운데', '위 중간', '위쪽'];
    return rows[row] + ' ' + this.NAMES[col];
  }
};
