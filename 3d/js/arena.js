/* ============================================================
   1대1 결투장 (아레나)

   배틀로얄과 달리 지형·전리품·자기장이 없습니다. 궤도 정거장 안의
   좁은 밀폐 투기장에서 둘이 정해진 무기로만 싸웁니다.

   설계 규칙
   - 모든 상자는 축에 나란합니다(yaw 0). 회전을 쓰면 화면 상자와 충돌
     상자의 회전 방향이 반대라 '벽이 없는데 막히는' 어긋남이 생기기 쉬운데,
     이 맵은 회전이 필요 없으므로 그 위험을 아예 없앴습니다.
   - 맵은 원점 기준 180° 회전 대칭입니다. 한쪽만 적어 두고 부호를 뒤집어
     복사하므로, 두 사람이 완전히 같은 조건에서 싸웁니다.
   - 올라설 것은 계단으로 잇습니다. 봇은 매달려 기어오르지 못하고
     걸음 높이(STEP_UP)만 넘을 수 있기 때문입니다.
   ============================================================ */
const Arena = {
  W: 88,                 // 가로 (X)
  D: 64,                 // 세로 (Z)
  WALL: 9,               // 외벽 높이
  spawns: [],            // [{ x, z, yaw }] — 0 번이 나, 1 번이 상대
  solids: [],            // 미니맵에 그릴 벽·엄폐물 { x, z, sx, sz, h }
  mesh: null,
  glow: null,

  C: {
    floor:   0x6f6a5f,   // 바닥 (따뜻한 회색)
    floorMid:0x5b6169,   // 중앙 광장
    line:    0x9a9488,   // 바닥 유도선
    wall:    0x8d8778,   // 벽
    wallTop: 0x585449,   // 벽 윗동
    trim:    0x2c343d,   // 굽도리
    site:    0xa88a5c,   // 거점 바닥 (모래색)
    crate:   0x77572f,   // 나무 상자
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
    this.slab(0, 0, 30, 26, 0.001, 0.05, this.C.floorMid);          // 중앙 광장 표시

    // 외벽 (네 면) — 밀폐된 투기장
    this.solid(0, -hd - T / 2, this.W + T * 2, T, 0, this.WALL, this.C.wall);
    this.solid(0, hd + T / 2, this.W + T * 2, T, 0, this.WALL, this.C.wall);
    this.solid(-hw - T / 2, 0, T, this.D, 0, this.WALL, this.C.wall);
    this.solid(hw + T / 2, 0, T, this.D, 0, this.WALL, this.C.wall);

    // 한쪽만 적고 180° 돌려 복사합니다
    this.side(1);
    this.side(-1);

    // 중앙 고지: 대칭축 위에 있어 그 자체로 대칭입니다
    this.platform(0, 0, 12, 12, 1.8, this.C.metal, 'x');
    this.solid(0, 0, 3, 3, 1.8, 2.2, this.C.metal);                  // 위쪽 엄폐물
    this.strip(0, 0, 12.4, 12.4, 1.82, 0xff8a3d);

    this.finish(scene);
  },

  /* 한쪽 절반. s = 1 이면 z 가 음수인 쪽(내 진영), -1 이면 반대쪽입니다. */
  side(s) {
    const C = this.C;
    const P = (x, z) => [x * s, z * s];      // 180° 회전 = 두 축 모두 부호 반전

    // --- 시작 지점 ---
    const [spx, spz] = P(0, -27);
    this.spawns.push({ x: spx, z: spz, yaw: s > 0 ? 0 : Math.PI });
    this.strip(spx, spz, 9, 9, 0.06, s > 0 ? 0x2fd3c4 : 0xff5a4a);

    const wall = (x, z, sx, sz, h, col) => {
      const [wx, wz] = P(x, z);
      this.solid(wx, wz, sx, sz, 0, h, col || C.wall);
    };

    // 시작 지점 양옆 (앞쪽 세 갈래로만 나갈 수 있게)
    wall(-8, -27, 2, 10, 5);
    wall(8, -27, 2, 10, 5);

    // 좌우 통로를 가르는 긴 벽
    wall(-19, -21, 2, 22, 6);
    wall(19, -23, 2, 18, 6);

    // 통로 중간의 문틀 (지나가며 몸을 숨길 자리)
    wall(-28, -20, 16, 2, 4.4);
    wall(30, -14, 14, 2, 4.4);

    // --- 거점: 모래색 단 위에 상자 몇 개 ---
    const [ax, az] = P(-31, -5);
    this.platform(ax, az, 20, 18, 1.4, C.site, s > 0 ? 'east' : 'west');
    this.strip(ax, az, 20.4, 18.4, 1.42, 0x2fd3c4);
    // 거점 안쪽 엄폐물
    wall(-24, -11, 3, 3, 2.0, C.crate);
    wall(-37, 1, 3, 3, 2.0, C.crate);
    wall(-31, -5, 4, 2, 3.0, C.metal);

    // --- 중앙으로 나오는 길목의 기둥과 낮은 담 ---
    wall(-11, -6, 2, 2, 6, C.wallTop);
    wall(11, -9, 2, 2, 6, C.wallTop);
    wall(-6, -14, 5, 2, 1.6, C.metal);       // 뛰어넘을 수 있는 낮은 담
    wall(7, -17, 5, 2, 1.6, C.metal);

    // --- 뒤쪽 우회로 ---
    wall(38, -25, 2, 12, 5);
    wall(30, -30, 14, 2, 5);
  },

  /* ---------- 조각 ---------- */

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

  /* 바닥에 깔린 빛나는 유도선 (테두리만) */
  strip(x, z, sx, sz, y, color) {
    const t = 0.5;
    this.lit.push(Build.box(sx, 0.04, t, color, x, y, z - sz / 2));
    this.lit.push(Build.box(sx, 0.04, t, color, x, y, z + sz / 2));
    this.lit.push(Build.box(t, 0.04, sz, color, x - sx / 2, y, z));
    this.lit.push(Build.box(t, 0.04, sz, color, x + sx / 2, y, z));
  },

  /* 올라설 수 있는 단. 봇도 걸어 올라오도록 한쪽에 계단을 붙입니다.
     계단 한 칸은 걸음 높이(STEP_UP)를 넘지 않아야 합니다. */
  platform(x, z, sx, sz, h, color, stairSide) {
    this.solid(x, z, sx, sz, 0, h, color);
    if (!stairSide) return;
    const n = Math.max(1, Math.ceil(h / (CFG.STEP_UP * 0.8)));
    const rise = h / n, w = 5;
    for (let i = 0; i < n; i++) {
      const out = (i + 0.5) * 1.3;                    // 단에서 바깥으로 나온 거리
      const sh = h - i * rise;
      if (stairSide === 'x') {                        // 네 방향 모두 (중앙 고지)
        this.solid(x, z - sz / 2 - out, w, 1.3, 0, sh, color);
        this.solid(x, z + sz / 2 + out, w, 1.3, 0, sh, color);
        this.solid(x - sx / 2 - out, z, 1.3, w, 0, sh, color);
        this.solid(x + sx / 2 + out, z, 1.3, w, 0, sh, color);
      } else if (stairSide === 'east') {
        this.solid(x + sx / 2 + out, z, 1.3, w, 0, sh, color);
        this.solid(x, z + sz / 2 + out, w, 1.3, 0, sh, color);
      } else {
        this.solid(x - sx / 2 - out, z, 1.3, w, 0, sh, color);
        this.solid(x, z - sz / 2 - out, w, 1.3, 0, sh, color);
      }
    }
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
     상자 예순 개뿐이라 매 프레임 바로 그리는 편이 간단하고 정확합니다.
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
