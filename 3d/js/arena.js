/* ============================================================
   1대1 결투장 (아레나)

   배틀로얄과 달리 지형·전리품·자기장이 없습니다. 궤도 정거장 안의
   좁은 밀폐 투기장에서 둘이 정해진 무기로만 싸웁니다.

   구성 방식
   - 빈 바닥에 벽을 세우는 대신, '넘어다볼 수 없는 큰 덩이(block)' 를 놓고
     그 사이를 복도로 씁니다. 이렇게 하면 트인 자리가 남지 않아, 어디서든
     시야가 30m 안쪽에서 끊깁니다. 모르는 모서리를 하나씩 까고 나아가는
     긴장감이 여기서 나옵니다.
   - 맵은 원점 기준 180° 회전 대칭입니다. 한쪽만 적어 두고 부호를 뒤집어
     복사하므로 두 사람의 조건이 완전히 같습니다. z=0 을 걸치는 덩이는
     한쪽에 적어도 반대쪽 짝이 생기므로, 가운데를 관통하는 긴 복도가
     생기지 않게 막는 데 씁니다.
   - 모든 상자는 축에 나란합니다(yaw 0). 회전을 쓰면 화면 상자와 충돌
     상자의 회전 방향이 반대라 '벽이 없는데 막히는' 어긋남이 생기기 쉬운데,
     이 맵은 회전이 필요 없으므로 그 위험을 아예 없앴습니다.
   - 올라설 것은 계단으로 잇습니다. 봇은 매달려 기어오르지 못하고
     걸음 높이(STEP_UP)만 넘을 수 있기 때문입니다.
   ============================================================ */
const Arena = {
  W: 88,                 // 가로 (X)
  D: 64,                 // 세로 (Z)
  WALL: 9,               // 벽·덩이 높이 (넘어다볼 수 없는 높이)
  THICK: 6,              // 방을 가르는 벽의 두께 — 두툼해야 '건물 사이 복도' 가 됩니다
  spawns: [],            // [{ x, z, yaw }] — 0 번이 나, 1 번이 상대
  solids: [],            // 미니맵에 그릴 벽·엄폐물 { x, z, sx, sz, h }
  mesh: null,
  glow: null,

  C: {
    floor:   0x6f6a5f,   // 바닥
    floorSite:0xa88a5c,  // 거점 바닥 (모래색)
    floorMid:0x5b6169,   // 가운데 통로 바닥
    block:   0x8d8778,   // 큰 덩이 (건물 벽)
    blockAlt:0x7c8288,   // 색을 조금 달리해 자리를 구분합니다
    trim:    0x2c343d,   // 윗동 띠
    crate:   0x77572f,   // 나무 상자 (낮은 엄폐물)
    metal:   0x5c646d    // 금속 엄폐물
  },

  /* ---------- 만들기 ---------- */
  build(scene) {
    this.spawns = []; this.solids = [];
    this.parts = []; this.lit = [];
    World.resetColliders();
    World.buildings = [];
    World.roads = [];
    World.towns = [];
    this.flatten();

    const hw = this.W / 2, hd = this.D / 2, T = 2;

    // 바닥
    this.slab(0, 0, this.W, this.D, -0.2, 0.2, this.C.floor);

    // 외벽 네 면
    this.solid(0, -hd - T / 2, this.W + T * 2, T, 0, this.WALL, this.C.block);
    this.solid(0, hd + T / 2, this.W + T * 2, T, 0, this.WALL, this.C.block);
    this.solid(-hw - T / 2, 0, T, this.D, 0, this.WALL, this.C.block);
    this.solid(hw + T / 2, 0, T, this.D, 0, this.WALL, this.C.block);

    this.side(1);
    this.side(-1);
    this.centre();
    this.finish(scene);
  },

  /* 한쪽 절반. s = 1 이면 z 가 음수인 쪽(내 진영), -1 이면 반대쪽입니다.

     방을 격자로 나누고, 벽마다 문을 하나씩 어긋나게 뚫었습니다. 방 하나가
     가장 커도 22×18m 이므로 어디를 봐도 시야가 30m 안쪽에서 끊기고,
     문이 서로 어긋나 있어 두 방을 관통해서 보이지도 않습니다.

     격자선   x = ±29, ±11      z = ±21, ±9
     방 배치 (내 쪽, z 가 음수)
       뒤     왼쪽방 · 왼통로 · 시작방 · 오른통로 · 오른쪽방
       중간   A거점  · A홀    · 중앙홀 · 오른통로 · 오른방
       가운데 (z -9..9) 는 반대쪽과 이어지는 한 띠입니다 */
  side(s) {
    const C = this.C;
    // 180° 회전 = 두 축 모두 부호 반전
    const bl = (x0, x1, z0, z1, col) => this.block(x0 * s, x1 * s, z0 * s, z1 * s, col);
    const cv = (x, z, sx, sz, h, col) => this.solid(x * s, z * s, sx, sz, 0, h, col);
    const fl = (x0, x1, z0, z1, col) => this.floor(x0 * s, x1 * s, z0 * s, z1 * s, col);
    /* 문을 뚫은 벽. gaps 에 적은 구간만 비웁니다.
       벽을 얇게 두면 '격자 미로' 처럼 보이고 걸어 다닐 자리가 너무 넓어집니다.
       두툼하게(T) 세워야 방이 건물이 되고 그 사이가 복도가 됩니다. */
    const T = this.THICK / 2;
    const wz = (x, z0, z1, gaps, col) => {                 // z 축에 나란한 벽
      for (const g of this.spans(z0, z1, gaps)) bl(x - T, x + T, g[0], g[1], col);
    };
    const wx = (z, x0, x1, gaps, col) => {                 // x 축에 나란한 벽
      for (const g of this.spans(x0, x1, gaps)) bl(g[0], g[1], z - T, z + T, col);
    };

    /* ---------- 시작 지점 ----------
       세 면이 막힌 방입니다. 앞문 하나로만 나갑니다. */
    this.spawns.push({ x: 0, z: -26 * s, yaw: s > 0 ? 0 : Math.PI });
    this.strip(0, -26 * s, 9, 7, 0.06, s > 0 ? 0x2fd3c4 : 0xff5a4a);

    /* ---------- 뒤쪽 줄의 세로 벽 ----------
       외벽(±32, ±44)까지 딱 붙입니다. 1m라도 틈을 남기면 그 틈을 타고
       맵을 가로질러 끝까지 보이는 자리가 생깁니다. */
    wz(-29, -32, -21, [[-28, -24]]);
    wz(-11, -32, -21, []);                 // 시작 방 왼쪽 (문 없음)
    wz(11, -32, -21, []);                  // 시작 방 오른쪽 (문 없음)
    wz(29, -32, -21, [[-28, -24]]);

    /* ---------- 뒤쪽 줄과 중간 줄을 가르는 가로 벽 ---------- */
    wx(-21, -44, 44, [[-38, -34], [-24, -20], [-3, 3], [20, 24], [34, 38]]);

    /* ---------- 중간 줄의 세로 벽 (문 위치를 서로 어긋나게) ---------- */
    wz(-29, -21, -9, [[-17, -13]], C.blockAlt);
    wz(-11, -21, -9, [[-20, -16]], C.blockAlt);
    wz(11, -21, -9, [[-14, -10]], C.blockAlt);
    wz(29, -21, -9, [[-19, -15]], C.blockAlt);

    /* ---------- 중간 줄과 가운데 띠를 가르는 가로 벽 ---------- */
    wx(-9, -44, 44, [[-40, -36], [-26, -22], [2, 6], [14, 18], [32, 36]]);

    /* ---------- 가운데 띠의 세로 벽 ----------
       z=0 을 걸치므로 여기 하나만 적으면 반대쪽에 짝이 생깁니다.
       이 벽이 없으면 가운데가 맵을 관통하는 86m 복도가 됩니다. */
    wz(-29, -9, 9, [[-2, 2]], C.blockAlt);
    wz(-11, -9, 9, [[-9, -5]], C.blockAlt);

    /* ---------- A 거점 (왼쪽 중간 방) ---------- */
    fl(-42, -30, -20, -10, C.floorSite);
    cv(-38, -18, 3, 3, 1.9, C.crate);
    cv(-32, -12, 3, 3, 1.9, C.crate);
    cv(-36, -14, 6, 2, 1.4, C.metal);      // 숙여 쓰는 낮은 담

    /* ---------- 방마다 엄폐물 ---------- */
    cv(-20, -15, 3, 3, 1.9, C.crate);      // A 홀
    cv(-24, -12, 2, 5, 1.4, C.metal);
    cv(0, -16, 6, 2, 1.4, C.metal);        // 중앙 홀 (시작 앞)
    cv(-6, -12, 3, 3, 1.9, C.crate);
    cv(20, -16, 3, 3, 1.9, C.crate);       // 오른쪽 통로
    cv(24, -12, 2, 5, 1.4, C.metal);
    cv(40, -13, 3, 3, 1.9, C.crate);       // 오른쪽 방
    /* 엄폐물은 문 앞을 막지 않도록 방 안쪽에 둡니다.
       문(4m)에 3m 상자를 붙여 두면 남는 폭이 몸 반지름보다 좁아져
       길이 아예 끊깁니다 — 실제로 그렇게 막혀 있었습니다. */
    cv(-39, -28, 3, 3, 1.9, C.crate);      // 왼쪽 뒤방
    cv(39, -28, 3, 3, 1.9, C.crate);       // 오른쪽 뒤방
  },

  /* 가운데 방. 대칭축 위에 있어 그 자체로 대칭입니다. */
  centre() {
    const C = this.C;
    this.floor(-10, 10, -8, 8, C.floorMid);
    this.block(-4, 4, -4, 4, C.blockAlt);          // 가운데 기둥 덩이
    this.strip(0, 0, 20, 16, 0.05, 0xff8a3d);
    this.solid(-8, 0, 2, 5, 0, 1.4, C.metal);      // 기둥 양옆 낮은 엄폐물
    this.solid(8, 0, 2, 5, 0, 1.4, C.metal);
  },

  /* from..to 구간에서 gaps(문) 를 뺀 '벽이 남는 조각들' 을 돌려줍니다 */
  spans(from, to, gaps) {
    const holes = (gaps || []).slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    let at = from;
    for (const h of holes) {
      const a = Math.max(from, Math.min(to, h[0]));
      const b = Math.max(from, Math.min(to, h[1]));
      if (a > at) out.push([at, a]);
      at = Math.max(at, b);
    }
    if (to > at) out.push([at, to]);
    return out;
  },

  /* ---------- 조각 ---------- */

  /* 넘어다볼 수 없는 큰 덩이. 범위(x0..x1, z0..z1) 로 적습니다 —
     복도 폭을 눈으로 계산하기 쉬워서, 자리 잡는 실수가 줄어듭니다. */
  block(x0, x1, z0, z1, color) {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    this.solid(x, z, Math.abs(x1 - x0), Math.abs(z1 - z0), 0, this.WALL, color || this.C.block);
  },

  /* 벽·엄폐물: 화면 상자와 충돌 상자를 같은 값으로 함께 만듭니다 */
  solid(x, z, sx, sz, y0, h, color) {
    this.parts.push(Build.box(sx, h, sz, color, x, y0 + h / 2, z));
    // 윗면에 어두운 띠를 둘러 높이를 눈으로 읽을 수 있게 합니다
    if (h > 2.5) this.parts.push(Build.box(sx + 0.3, 0.35, sz + 0.3, this.C.trim, x, y0 + h, z));
    World.addBox({
      x, y: y0 + h / 2, z, hx: sx / 2, hy: h / 2, hz: sz / 2,
      yaw: 0, cos: 1, sin: 0, top: y0 + h, bottom: y0, ramp: false
    });
    this.solids.push({ x, z, sx, sz, h });
  },

  /* 장식용 판 (충돌 없음) */
  slab(x, z, sx, sz, y0, h, color) {
    this.parts.push(Build.box(sx, h, sz, color, x, y0 + h / 2, z));
  },

  /* 바닥 색만 달리 깔아 자리를 구분합니다 (거점·가운데) */
  floor(x0, x1, z0, z1, color) {
    this.slab((x0 + x1) / 2, (z0 + z1) / 2,
              Math.abs(x1 - x0), Math.abs(z1 - z0), 0.001, 0.05, color);
  },

  /* 바닥에 깔린 빛나는 유도선 (테두리만) */
  strip(x, z, sx, sz, y, color) {
    const t = 0.5;
    this.lit.push(Build.box(sx, 0.04, t, color, x, y, z - sz / 2));
    this.lit.push(Build.box(sx, 0.04, t, color, x, y, z + sz / 2));
    this.lit.push(Build.box(t, 0.04, sz, color, x - sx / 2, y, z));
    this.lit.push(Build.box(t, 0.04, sz, color, x + sx / 2, y, z));
  },

  /* 지형을 완전히 평평하게 (이 맵은 높낮이를 상자로만 만듭니다) */
  flatten() {
    const n = World.seg + 1;
    if (!World.heights || World.heights.length !== n * n) World.heights = new Float32Array(n * n);
    World.heights.fill(0);
    World.waterY = -80;            // 물은 쓰지 않습니다 (바닥 아래로 내려 둡니다)
  },

  finish(scene) {
    this.dispose(scene);
    this.mesh = new THREE.Mesh(Build.merge(this.parts),
      Mats.vc({ roughness: 0.82, metalness: 0.06 }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    /* 유도선은 조명을 아예 받지 않는 재질로 그립니다. 발광(emissive)은
       재질 하나에 한 색만 걸 수 있어 정점 색이 안 살지만, 이 재질은
       정점 색을 그대로 뿌려 주므로 선 색이 자리마다 달라도 다 살아납니다. */
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.glow = new THREE.Mesh(Build.merge(this.lit), gm);
    scene.add(this.glow);

    this.parts = null; this.lit = null;
  },

  dispose(scene) {
    for (const k of ['mesh', 'glow']) {
      if (!this[k]) continue;
      scene.remove(this[k]);
      this[k].geometry.dispose();
      this[k] = null;
    }
  },

  /* 미니맵. 배틀로얄은 미리 그려 둔 지형 그림을 잘라 쓰지만, 이 맵은
     상자 수십 개뿐이라 매 프레임 바로 그리는 편이 간단하고 정확합니다.
     span 은 화면에 담을 실제 거리(m), (px,pz) 는 화면 중심이 될 자리입니다. */
  drawMini(c, S, px, pz, span) {
    const k = S / span;
    const tx = x => (x - px) * k + S / 2;
    const tz = z => (z - pz) * k + S / 2;
    c.fillStyle = '#12161c'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#3a3d42';
    c.fillRect(tx(-this.W / 2), tz(-this.D / 2), this.W * k, this.D * k);
    for (const s of this.solids) {
      c.fillStyle = s.h > 2.5 ? '#8b8578' : '#6a6f76';
      c.fillRect(tx(s.x - s.sx / 2), tz(s.z - s.sz / 2), s.sx * k, s.sz * k);
    }
  }
};
