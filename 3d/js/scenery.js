/* ============================================================
   지형 메시, 물, 건물, 나무, 바위 배치
   모든 상자·나무는 InstancedMesh 로 묶어 드로우콜을 줄입니다.
   ============================================================ */
const Scenery = {
  boxDefs: [],   // { x,y,z, sx,sy,sz, yaw, color, solid }
  trees: [], rocks: [], bushes: [], grass: [],
  meshes: [],

  build(scene) {
    this.boxDefs = []; this.trees = []; this.rocks = []; this.bushes = []; this.grass = [];
    this.lootSpots = []; this.stairSpots = [];
    World.resetColliders();
    World.buildings = [];
    World.roads = [];
    World.buildHeights();

    // --- 마을 자리 선정 후 평탄화 ---
    const towns = [];
    const lim = World.half * 0.68;
    const names = ['소치', '게오르고폴', '포친키', '야스나야', '로조크', '프리모스크',
                   '밀타 베이스', '스톨니', '리포프카', '가트카', '마일타', '셰프카'];
    for (let i = 0; i < names.length; i++) {
      for (let t = 0; t < 400; t++) {
        const x = (rnd() * 2 - 1) * lim, z = (rnd() * 2 - 1) * lim;
        if (World.height(x, z) < World.waterY + 2.5) continue;
        if (towns.some(o => Math.hypot(o.x - x, o.z - z) < 150)) continue;
        towns.push({ x, z, name: names[i], r: 46 + rnd() * 22 });
        break;
      }
    }
    for (const t of towns) World.flatten(t.x, t.z, t.r + 26);
    World.towns = towns;

    // --- 도로: 마을을 최소 신장 트리로 이어 줍니다 (차량 이동로) ---
    this.layRoads(towns);

    /* --- 건물 배치 ---
       먼저 자리만 정해 터를 평탄하게 만든 다음, 지형 메시를 만들고,
       그 위에 건물을 세웁니다. 실내 바닥이 울퉁불퉁하면 계단 첫 칸이
       걸음 높이를 넘어가 못 올라가는 자리가 생기기 때문입니다. */
    const FOOT = { warehouse: 17, apartment: 13, tower: 16, house: 10, shed: 6, container: 4,
                   ruin: 9, waterTower: 6, rockPile: 0, mast: 0, haystack: 0, fence: 0 };
    const plan = [];
    const put = (kind, x, z, yaw) => plan.push({ kind, x, z, yaw });

    for (const t of towns) {
      const count = 6 + Math.floor(rnd() * 5);
      const placed = [];
      let bigOne = rnd() < 0.7;                  // 마을마다 아파트 한 채
      for (let i = 0; i < count; i++) {
        for (let a = 0; a < 50; a++) {
          const ang = rnd() * Math.PI * 2, rad = rnd() * t.r;
          const x = t.x + Math.cos(ang) * rad, z = t.z + Math.sin(ang) * rad;
          if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 32)) continue;
          placed.push({ x, z });
          const yaw = Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.2;
          if (bigOne) { bigOne = false; put(rnd() < 0.35 ? 'tower' : 'apartment', x, z, yaw); break; }
          const roll = rnd();
          if (roll < 0.30) put('warehouse', x, z, yaw);
          else if (roll < 0.80) put('house', x, z, yaw);
          else put('shed', x, z, yaw);
          break;
        }
      }
      for (let i = 0; i < 6; i++) {
        const ang = rnd() * Math.PI * 2, rad = t.r * (0.4 + rnd() * 0.7);
        put('container', t.x + Math.cos(ang) * rad, t.z + Math.sin(ang) * rad, rnd() * Math.PI);
      }
    }

    for (let i = 0; i < 30; i++) {
      const sp = World.freeSpot(20);
      const r = rnd(), yaw = rnd() * Math.PI * 2;
      if (r < 0.34) put('shed', sp.x, sp.z, yaw);
      else if (r < 0.50) put('house', sp.x, sp.z, yaw);
      else if (r < 0.60) put('warehouse', sp.x, sp.z, yaw);
      else if (r < 0.76) put('ruin', sp.x, sp.z, yaw);
      else put('container', sp.x, sp.z, yaw);
    }

    // 벌판을 채우는 지형지물
    for (let i = 0; i < 8; i++) { const sp = World.freeSpot(12); put('waterTower', sp.x, sp.z, 0); }
    for (let i = 0; i < 5; i++) { const sp = World.freeSpot(14); put('mast', sp.x, sp.z, 0); }
    for (let i = 0; i < 34; i++) { const sp = World.freeSpot(8); put('rockPile', sp.x, sp.z, 0); }
    for (let i = 0; i < 26; i++) { const sp = World.freeSpot(4); put('haystack', sp.x, sp.z, 0); }
    // 담장: 마을 언저리와 벌판에 길게 (뛰어넘는 재미)
    for (let i = 0; i < 40; i++) {
      const sp = World.freeSpot(6);
      plan.push({ kind: 'fence', x: sp.x, z: sp.z, yaw: rnd() * Math.PI * 2, len: 10 + rnd() * 16 });
    }

    // 건물이 앉을 터를 평탄하게 (문턱과 계단이 지형에 묻히지 않도록)
    for (const b of plan) { const f = FOOT[b.kind]; if (f) World.flatten(b.x, b.z, f + 5); }

    this.buildTerrain(scene);
    this.buildWater(scene);

    for (const b of plan) {
      if (b.kind === 'fence') this.fence(b.x, b.z, b.yaw, b.len);
      else this[b.kind](b.x, b.z, b.yaw);
    }

    this.scatterNature(towns);
    this.buildInstances(scene);
  },

  /* 마을을 잇는 도로. 가장 가까운 마을끼리 차례로 연결합니다(프림 알고리즘). */
  layRoads(towns) {
    if (towns.length < 2) return;
    const inTree = [0], rest = towns.map((_, i) => i).slice(1);
    while (rest.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (const i of inTree) for (let k = 0; k < rest.length; k++) {
        const j = rest[k];
        const d = Math.hypot(towns[i].x - towns[j].x, towns[i].z - towns[j].z);
        if (d < bd) { bd = d; bi = i; bj = k; }
      }
      const j = rest.splice(bj, 1)[0];
      World.roads.push({ x1: towns[bi].x, z1: towns[bi].z, x2: towns[j].x, z2: towns[j].z, w: 7 });
      inTree.push(j);
    }
    for (const r of World.roads) World.flattenLine(r.x1, r.z1, r.x2, r.z2, r.w + 5);
  },

  /* ---------- 지형 메시 ---------- */
  buildTerrain(scene) {
    const n = World.seg + 1;
    const geo = new THREE.PlaneGeometry(World.size, World.size, World.seg, World.seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = srgb(0x53713a), cGrass2 = srgb(0x6c8447);
    const cRock = srgb(0x6d6a63), cSand = srgb(0xb9ac86), cRoad = srgb(0x8a7f6b);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = World.height(x, z);
      pos.setY(i, h);
      const hx = World.height(x + 2, z) - World.height(x - 2, z);
      const hz = World.height(x, z + 2) - World.height(x, z - 2);
      const slope = Math.min(1, Math.hypot(hx, hz) / 5.5);
      const v1 = valueNoise(x / 26, z / 26), v2 = valueNoise(x / 7 + 40, z / 7 + 90);
      tmp.copy(cGrass).lerp(cGrass2, v1 * 0.75 + v2 * 0.25);
      tmp.multiplyScalar(0.88 + v2 * 0.26);
      if (slope > 0.42) tmp.lerp(cRock, Math.min(1, (slope - 0.42) / 0.4));
      // 도로: 중심선 근처는 흙길 색으로 덮습니다
      const rd = World.roadDist(x, z);
      if (rd < 3.5) tmp.lerp(cRoad, 1 - Math.max(0, rd) / 3.5);
      if (h < World.waterY + 1.6) tmp.lerp(cSand, Math.min(1, (World.waterY + 1.6 - h) / 2.2));
      // (색은 이미 선형 공간)
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0,
      map: this.groundTexture()
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.terrain = mesh;
  },

  /* 잔디 질감용 절차적 텍스처 */
  groundTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + Math.floor(rnd() * 55);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.65)';
      const x = rnd() * 128, y = rnd() * 128;
      g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(90, 90);
    tex.anisotropy = 4;
    return tex;
  },

  buildWater(scene) {
    const geo = new THREE.PlaneGeometry(World.size * 1.25, World.size * 1.25, 32, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: srgb(0x2b5b76), transparent: true, opacity: 0.86,
      roughness: 0.12, metalness: 0.4, flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = World.waterY;
    scene.add(mesh);
    this.water = mesh;
  },

  /* ---------- 건물 조각 ---------- */
  /* ramp 가 true 면 '올라설 수만 있는' 조각이 됩니다.
     계단은 벽처럼 밀어내면 오를 수 없으므로 밀어내기 판정에서 빼고,
     발밑 지지(groundY)와 총알 판정에서만 씁니다. */
  box(x, y, z, sx, sy, sz, yaw, color, solid, ramp) {
    this.boxDefs.push({ x, y, z, sx, sy, sz, yaw, color, solid: solid !== false });
    if (solid !== false) {
      World.addBox({
        x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw,
        cos: Math.cos(yaw), sin: Math.sin(yaw),
        top: y + sy / 2, bottom: y - sy / 2, ramp: !!ramp
      });
    }
  },

  /* 회전된 로컬 좌표를 월드로 */
  local(cx, cz, yaw, lx, lz) {
    return [cx + lx * Math.cos(yaw) - lz * Math.sin(yaw), cz + lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  },

  /* 사방 벽. doors 에 적은 면은 가운데를 비워 출입구로 만듭니다.
     면 이름: 'front'(-z) 'back'(+z) 'left'(-x) 'right'(+x) */
  walls(cx, cz, yaw, w, d, h, thick, base, color, doors, doorW) {
    doors = doors || ['front'];
    doorW = doorW || 2.2;
    const wallRun = (lx, lz, len, along, hasDoor) => {
      // along: 'x' 면 벽이 x 축으로 뻗고, 'z' 면 z 축으로 뻗습니다
      if (!hasDoor) {
        const [x, z] = this.local(cx, cz, yaw, lx, lz);
        if (along === 'x') this.box(x, base + h / 2, z, len, h, thick, yaw, color);
        else this.box(x, base + h / 2, z, thick, h, len, yaw, color);
        return;
      }
      const seg = (len - doorW) / 2;
      if (seg <= 0.2) return;
      for (const s of [-1, 1]) {
        const ox = along === 'x' ? s * (doorW / 2 + seg / 2) : 0;
        const oz = along === 'x' ? 0 : s * (doorW / 2 + seg / 2);
        const [x, z] = this.local(cx, cz, yaw, lx + ox, lz + oz);
        if (along === 'x') this.box(x, base + h / 2, z, seg, h, thick, yaw, color);
        else this.box(x, base + h / 2, z, thick, h, seg, yaw, color);
      }
      // 문 위 인방
      const lintel = h - 2.35;
      if (lintel > 0.25) {
        const [x, z] = this.local(cx, cz, yaw, lx, lz);
        if (along === 'x') this.box(x, base + h - lintel / 2, z, doorW, lintel, thick, yaw, color);
        else this.box(x, base + h - lintel / 2, z, thick, lintel, doorW, yaw, color);
      }
    };
    wallRun(0, -d / 2, w, 'x', doors.indexOf('front') >= 0);
    wallRun(0,  d / 2, w, 'x', doors.indexOf('back') >= 0);
    wallRun(-w / 2, 0, d, 'z', doors.indexOf('left') >= 0);
    wallRun( w / 2, 0, d, 'z', doors.indexOf('right') >= 0);
  },

  /* 벽면 장식 (충돌 없음) */
  trim(cx, cz, yaw, lx, ly, lz, w, h, thick, color) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.boxDefs.push({ x, y: ly, z, sx: w, sy: h, sz: thick, yaw, color, solid: false });
  },

  /* 좌우·뒷벽에 창문을 냅니다 (yOff 는 바닥에서 창 중심까지 높이) */
  windows(cx, cz, yaw, w, d, h, base, count, yOff) {
    const glass = 0x38505e;
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1) - 0.5;
      for (const side of [-1, 1]) {
        const [x, z] = this.local(cx, cz, yaw, side * (w / 2 + 0.03), t * d * 0.8);
        this.boxDefs.push({ x, y: base + yOff, z, sx: 0.12, sy: 1.0, sz: 1.3, yaw, color: glass, solid: false });
      }
      const [bx, bz] = this.local(cx, cz, yaw, t * w * 0.8, d / 2 + 0.03);
      this.boxDefs.push({ x: bx, y: base + yOff, z: bz, sx: 1.3, sy: 1.0, sz: 0.12, yaw, color: glass, solid: false });
    }
  },

  /* 바닥판. 윗면이 정확히 y 가 되도록 놓습니다 (그 위를 걸어 다닐 수 있습니다) */
  slab(cx, cz, yaw, lx, lz, w, d, y, color, thick) {
    thick = thick || 0.30;
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.box(x, y - thick / 2, z, w, thick, d, yaw, color);
  },

  /* 건물이 앉을 바닥 높이: 발자국 안에서 가장 높은 지형보다 살짝 위.
     실내가 평평해야 계단 첫 칸이 걸음 높이 안에 들어옵니다. */
  padY(cx, cz, w, d, yaw) {
    let h = World.height(cx, cz);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const [x, z] = this.local(cx, cz, yaw, i * w * 0.5, j * d * 0.5);
        h = Math.max(h, World.height(x, z));
      }
    }
    return h + 0.04;
  },

  /* 1층 바닥판. 지형이 조금 기울어 있어도 실내는 평평해집니다. */
  groundFloor(cx, cz, yaw, w, d, base, color) {
    this.slab(cx, cz, yaw, 0, 0, w + 0.5, d + 0.5, base, color || 0x8d8577, 1.4);
  },

  /* 계단. 로컬 (lx,lz) 에서 시작해 dir(+1: +z, -1: -z) 방향으로 올라갑니다.
     한 칸 높이를 0.42m 로 잡아 캐릭터가 걸어서 오를 수 있게 합니다. */
  /* fillFrom 을 주면 계단 밑을 그 높이까지 막습니다.
     계단 아래에 사람 키보다 조금 낮은 빈 공간이 생기면 그 안에 끼기 때문입니다. */
  stairs(cx, cz, yaw, lx, lz, fromY, toY, width, dir, color, fillFrom) {
    const rise = 0.36, run = 0.60;
    const n = Math.max(1, Math.round((toY - fromY) / rise));
    const step = (toY - fromY) / n;
    // 계단 위치를 기록해 두면 봇이 위층으로 올라갈 때 길잡이로 쓸 수 있습니다
    const b0 = this.local(cx, cz, yaw, lx, lz);
    const b1 = this.local(cx, cz, yaw, lx, lz + dir * run * n);
    this.stairSpots.push({ x0: b0[0], z0: b0[1], x1: b1[0], z1: b1[1], y0: fromY, y1: toY });
    for (let i = 0; i < n; i++) {
      const top = fromY + step * (i + 1);
      const lzz = lz + dir * (run * (i + 0.5));
      const [x, z] = this.local(cx, cz, yaw, lx, lzz);
      // 각 단은 바닥까지 채워 옆에서 봐도 계단처럼 보입니다
      this.box(x, (fromY + top) / 2, z, width, top - fromY, run, yaw, color, true, true);
    }
    if (fillFrom != null && fillFrom < fromY - 0.05) {
      const [fx, fz] = this.local(cx, cz, yaw, lx, lz + dir * (run * n) / 2);
      this.box(fx, (fillFrom + fromY) / 2, fz, width, fromY - fillFrom, run * n, yaw, color);
    }
    return { len: run * n };
  },

  /* 난간 (충돌 있음 — 2층에서 떨어지지 않도록) */
  rail(cx, cz, yaw, lx, lz, w, d, y, color) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.box(x, y + 0.5, z, w, 1.0, d, yaw, color);
  },

  /* 실내 아이템 자리 */
  lootSpot(cx, cz, yaw, lx, lz, y) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.lootSpots.push({ x, y, z });
  },

  /* 실내 잡동사니: 나무 상자, 선반, 드럼통 (엄폐물이면서 올라설 수 있습니다) */
  crateStack(cx, cz, yaw, lx, lz, base) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    // 한 칸씩 딛고 올라설 수 있도록 상자 높이를 걸음 높이보다 낮게 잡습니다
    const n = 1 + Math.floor(rnd() * 3);
    const h = 0.56;
    for (let i = 0; i < n; i++) {
      const s = 0.98 - i * 0.07;
      this.box(x + (rnd() - 0.5) * 0.2, base + h / 2 + i * h, z + (rnd() - 0.5) * 0.2,
               s, h, s, yaw + (rnd() - 0.5) * 0.5, rnd() < 0.5 ? 0x8a6a42 : 0x9a7a4a);
    }
  },
  shelf(cx, cz, yaw, lx, lz, base, len) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.box(x, base + 1.1, z, len, 2.2, 0.55, yaw, 0x585c5f);
    for (const h of [0.55, 1.25, 1.95]) {
      this.trim(cx, cz, yaw, lx, base + h, lz, len + 0.1, 0.07, 0.66, 0x7c8288);
    }
  },
  drum(cx, cz, yaw, lx, lz, base) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.box(x, base + 0.55, z, 0.72, 1.1, 0.72, yaw, rnd() < 0.5 ? 0xb2553f : 0x4a6b3a);
  },

  /* ---------- 큰 창고: 2층 통로가 있고 안에서 파밍할 수 있습니다 ---------- */
  warehouse(cx, cz, yaw) {
    const w = 26, d = 18, fh = 4.6;            // 층높이
    const base = this.padY(cx, cz, w, d, yaw);
    const wall = 0xb9b2a3, floorC = 0x8d8577, steel = 0x6f7378;
    const y2 = base + fh;
    this.groundFloor(cx, cz, yaw, w, d, base, 0x9a938a);

    this.walls(cx, cz, yaw, w, d, fh * 2, 0.36, base, wall, ['front', 'back'], 3.4);
    this.windows(cx, cz, yaw, w, d, fh, base, 4, 3.2);
    this.windows(cx, cz, yaw, w, d, fh, base, 4, fh + 3.2);
    this.trim(cx, cz, yaw, 0, base + 1.6, -d / 2 - 0.03, 3.6, 3.2, 0.1, 0x5c5f63);

    // 2층 통로: 뒤쪽 절반을 덮고, 가운데 계단이 올라오는 자리만 비워 둡니다
    const mezD = d * 0.46;
    const mezFront = d / 2 - mezD;                  // 통로 앞쪽 끝 (z)
    this.slab(cx, cz, yaw, 0, d / 2 - mezD / 2, w - 0.7, mezD, y2, floorC, 0.34);
    // 앞쪽 난간 — 계단이 닿는 가운데 3.4m 는 열어 둡니다
    for (const s of [-1, 1]) {
      const seg = (w - 0.7 - 3.4) / 2;
      this.rail(cx, cz, yaw, s * (3.4 / 2 + seg / 2), mezFront - 0.1, seg, 0.16, y2, steel);
    }
    // 좌우로 이어지는 좁은 통로
    for (const s of [-1, 1]) {
      this.slab(cx, cz, yaw, s * (w / 2 - 1.6), 0, 3.0, d - 0.7, y2, floorC, 0.34);
      this.rail(cx, cz, yaw, s * (w / 2 - 3.2), 0, 0.16, d - 0.7, y2, steel);
    }

    // 계단: 정면 출입구에서 가운데로 곧장 올라갑니다 (위에 아무것도 없어야 걸리지 않습니다)
    const st = this.stairs(cx, cz, yaw, 0, -d / 2 + 1.2, base, y2, 2.6, 1, 0xa79f92);
    const topZ = -d / 2 + 1.2 + st.len;             // 마지막 단이 끝나는 z
    this.slab(cx, cz, yaw, 0, (topZ + mezFront + 0.2) / 2, 3.2,
              Math.max(1.2, mezFront + 0.2 - topZ), y2, floorC, 0.32);   // 계단 참

    // 지붕
    this.box(cx, base + fh * 2 + 0.25, cz, w + 0.7, 0.5, d + 0.7, yaw, 0x8a5b47);
    this.trim(cx, cz, yaw, 0, base + fh * 2 + 0.6, 0, w + 0.8, 0.18, d + 0.8, 0x6d4638);

    // 기둥
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [x, z] = this.local(cx, cz, yaw, sx * 7.5, sz * 4.6);
      this.box(x, base + fh, z, 0.55, fh * 2, 0.55, yaw, 0xa79f92);
    }

    // 실내 배치와 아이템 자리
    this.shelf(cx, cz, yaw, -w / 2 + 5.5, d / 2 - 1.1, base, 8);
    this.shelf(cx, cz, yaw, w / 2 - 5.5, d / 2 - 1.1, base, 8);
    for (let i = 0; i < 5; i++) {
      const lx = (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd() * (w / 2 - 4.5));
      this.crateStack(cx, cz, yaw, lx, (rnd() - 0.5) * (d - 7), base);
    }
    for (let i = 0; i < 3; i++) {
      const lx = (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd() * (w / 2 - 4));
      this.drum(cx, cz, yaw, lx, (rnd() - 0.5) * (d - 5), base);
    }

    for (let i = 0; i < 5; i++) {
      this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * (w - 5), (rnd() - 0.5) * (d - 5), base + 0.05);
    }
    for (let i = 0; i < 3; i++) {
      this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * (w - 6), d / 2 - 1.5 - rnd() * (mezD - 2), y2 + 0.05);
    }
    World.buildings.push({ x: cx, z: cz, kind: 'warehouse', r: Math.max(w, d) / 2 });
  },

  /* ---------- 2층 주택 ---------- */
  house(cx, cz, yaw) {
    const w = 14, d = 11, fh = 2.95;
    const base = this.padY(cx, cz, w, d, yaw);
    const wall = rnd() < 0.5 ? 0xd8cfbc : 0xc3b8a2;
    const floorC = 0x9a8b74;
    const y2 = base + fh;
    this.groundFloor(cx, cz, yaw, w, d, base, floorC);

    this.walls(cx, cz, yaw, w, d, fh * 2, 0.32, base, wall, ['front', 'right'], 2.1);
    this.windows(cx, cz, yaw, w, d, fh, base, 3, 1.9);
    this.windows(cx, cz, yaw, w, d, fh, base, 3, fh + 1.9);
    this.trim(cx, cz, yaw, 0, base + 1.15, -d / 2 - 0.03, 2.3, 2.3, 0.1, 0x6b5a48);

    // 1층 칸막이 (가운데에 문 하나)
    for (const s of [-1, 1]) {
      const seg = (d - 2.2) / 2;
      const [x, z] = this.local(cx, cz, yaw, 1.2, s * (1.1 + seg / 2));
      this.box(x, base + fh / 2, z, 0.26, fh, seg, yaw, wall);
    }

    // 2층 바닥 — 왼쪽 앞의 계단실만 비워 둡니다
    const holeW = 3.4, holeD = 5.4;
    this.slab(cx, cz, yaw, -w / 2 + holeW + (w - holeW) / 2, 0, w - holeW - 0.3, d - 0.6, y2, floorC, 0.30);
    this.slab(cx, cz, yaw, -w / 2 + holeW / 2, -d / 2 + holeD + (d - holeD) / 2, holeW, d - holeD, y2, floorC, 0.30);

    // 계단 (왼쪽 앞에서 뒤로 올라갑니다)
    this.stairs(cx, cz, yaw, -w / 2 + 1.6, -d / 2 + 0.9, base, y2, 2.0, 1, 0xa08a6c);
    this.rail(cx, cz, yaw, -w / 2 + holeW + 0.1, -d / 2 + 1.2, 0.16, holeD - 1.2, y2, wall);

    // 지붕
    this.box(cx, base + fh * 2 + 0.16, cz, w + 0.5, 0.32, d + 0.5, yaw, 0x8f6b52);
    const roof = 0x7d4b3a;
    for (const s of [-1, 1]) {
      const [x, z] = this.local(cx, cz, yaw, 0, s * d / 4);
      this.boxDefs.push({
        x, y: base + fh * 2 + 1.05, z, sx: w + 0.8, sy: 0.28, sz: d / 2 + 0.6,
        yaw, color: roof, solid: false, tilt: -s * 0.62
      });
    }
    const [px, pz] = this.local(cx, cz, yaw, w * 0.3, 0);
    this.box(px, base + fh * 2 + 1.7, pz, 0.7, 1.7, 0.7, yaw, 0x8b7f70);

    // 가구와 아이템
    this.crateStack(cx, cz, yaw, w / 2 - 2.5, -d / 2 + 2.2, base);
    this.shelf(cx, cz, yaw, -w / 2 + 3.4, d / 2 - 1.0, base, 4);
    for (let i = 0; i < 3; i++) this.lootSpot(cx, cz, yaw, (rnd() - 0.4) * (w - 5), (rnd() - 0.5) * (d - 4), base + 0.05);
    for (let i = 0; i < 2; i++) this.lootSpot(cx, cz, yaw, holeW + rnd() * (w - holeW - 3) - w / 2 + 1.5, (rnd() - 0.5) * (d - 4), y2 + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'house', r: Math.max(w, d) / 2 });
  },

  /* ---------- 3층 아파트: 마을의 랜드마크 ---------- */
  /* 층수와 크기를 받아 아파트/고층 빌딩을 같은 방식으로 세웁니다 */
  apartment(cx, cz, yaw, opt) {
    opt = opt || {};
    const floors = opt.floors || 3;
    const w = opt.w || 19, d = opt.d || 14, fh = 3.3;   // 층높이 (계단 참 위 머리 공간 확보)
    const base = this.padY(cx, cz, w, d, yaw);
    const wall = opt.wall || 0xcfc5b1, floorC = 0x9a9382, steel = 0x6f7378;
    const holeW = 3.6;
    this.groundFloor(cx, cz, yaw, w, d, base, floorC);

    this.walls(cx, cz, yaw, w, d, fh * floors, 0.34, base, wall, ['front', 'back'], 2.4);
    for (let f = 0; f < floors; f++) this.windows(cx, cz, yaw, w, d, fh, base, opt.win || 4, fh * f + 1.9);
    this.trim(cx, cz, yaw, 0, base + 1.2, -d / 2 - 0.03, 2.6, 2.4, 0.1, 0x5c5f63);

    /* 계단실: 한 층에 곧은 계단 한 줄씩.
       층마다 좌우 두 줄(레인)을 번갈아 쓰고 방향도 뒤집습니다.
       그래서 계단을 다 오른 자리에서 옆으로 한 걸음만 옮기면
       바로 다음 층 계단의 첫 단입니다 (꺾어 오르는 실제 계단실과 같습니다).

       각 층 바닥은 '그 층으로 올라온 계단이 지나는 줄' 만 뚫어 둡니다.
       계단 단은 아래가 꽉 찬 덩어리라서 계단 밑에 끼는 빈 공간이 생기지 않고,
       머리 위로는 두 층 위 바닥까지 2.9m 가 비어 있어 어디서도 끼지 않습니다. */
    const rise = 0.33, run = 0.60;
    const nStep = Math.max(6, Math.round(fh / rise));
    const runLen = run * nStep;                        // 한 층 계단 길이
    const laneW = 1.5;                                 // 계단 폭
    const lane = [-w / 2 + 0.95, -w / 2 + 2.65];       // 0 = 바깥벽쪽, 1 = 안쪽
    const midX = -w / 2 + holeW / 2;                   // 두 줄을 가르는 선
    // 계단을 건물 깊이 한가운데에 두어 앞뒤 참을 넉넉하게 잡습니다
    const zF = -d / 2 + Math.max(1.2, (d - runLen) / 2);   // 계단 앞쪽 끝
    const zK = zF + runLen;                                // 계단 뒤쪽 끝
    for (let f = 0; f < floors; f++) {
      const y = base + fh * f;
      const dir = f % 2 === 0 ? 1 : -1;                // 짝수 층은 뒤로, 홀수 층은 앞으로
      this.stairs(cx, cz, yaw, lane[f % 2], dir > 0 ? zF : zK, y, y + fh, laneW, dir, 0xa79f92);
    }
    /* 층 바닥. f = floors 는 옥상 바닥이 됩니다.
       계단이 지나는 구간은 폭 전체를 뚫어 하나의 통짜 계단실로 만듭니다.
       (한쪽 줄만 뚫으면 주 바닥 바로 옆에 좁고 긴 구멍이 생겨 빠지기 쉽습니다.)
       앞뒤 참은 폭 전체가 단단한 바닥이라 여기서 줄을 갈아탑니다. */
    const shaft0 = zF + 0.6, shaft1 = zK - 0.6;   // 마지막 단까지 참을 붙입니다
    for (let f = 1; f <= floors; f++) {
      const y = base + fh * f;
      const c = f === floors ? 0x8a8578 : floorC;
      // 계단실 바깥의 큰 바닥
      this.slab(cx, cz, yaw, -w / 2 + holeW + (w - holeW) / 2, 0, w - holeW + 0.4, d + 0.4, y, c, 0.34);
      // 앞 참 / 뒤 참
      this.slab(cx, cz, yaw, -w / 2 + holeW / 2, (-d / 2 - 0.2 + shaft0) / 2,
                holeW + 0.4, shaft0 + d / 2 + 0.2, y, c, 0.34);
      this.slab(cx, cz, yaw, -w / 2 + holeW / 2, (shaft1 + d / 2 + 0.2) / 2,
                holeW + 0.4, d / 2 + 0.2 - shaft1, y, c, 0.34);
      // 주 바닥 쪽 난간: 계단실 구멍 길이만큼. 참(앞뒤 끝)은 트여 있어 드나듭니다.
      this.rail(cx, cz, yaw, -w / 2 + holeW, (shaft0 + shaft1) / 2, 0.16, shaft1 - shaft0, y, steel);
      // 계단이 드나들지 않는 쪽 참 가장자리에도 난간을 둡니다
      this.rail(cx, cz, yaw, -w / 2 + holeW / 2, f % 2 === 0 ? shaft1 : shaft0, holeW, 0.16, y, steel);
      if (f === floors) {
        // 옥상: 올라온 계단이 쓰지 않는 반쪽도 막아 둡니다
        const capX = (f - 1) % 2 === 0 ? -w / 2 + holeW * 0.75 : -w / 2 + holeW * 0.25;
        this.rail(cx, cz, yaw, capX, f % 2 === 0 ? shaft0 : shaft1, holeW / 2, 0.16, y, steel);
      }
    }

    // 옥상 난간과 처마
    const ry = base + fh * floors;
    for (const s of [-1, 1]) {
      this.rail(cx, cz, yaw, s * (w / 2 + 0.12), 0, 0.22, d + 0.7, ry, steel);
      this.rail(cx, cz, yaw, 0, s * (d / 2 + 0.12), w + 0.7, 0.22, ry, steel);
    }
    this.trim(cx, cz, yaw, 0, ry - 0.28, 0, w + 0.9, 0.2, d + 0.9, 0x6f6a60);

    for (let f = 0; f < floors; f++) {
      const y = base + fh * f + 0.05;
      if (f === 0) {
        this.shelf(cx, cz, yaw, 0, d / 2 - 1.0, base, 6);
        for (let i = 0; i < 2; i++) this.crateStack(cx, cz, yaw, (rnd() - 0.3) * (w - 8), (rnd() - 0.5) * (d - 5), base);
      }
      for (let i = 0; i < 3; i++) {
        this.lootSpot(cx, cz, yaw, holeW + 1 - w / 2 + rnd() * (w - holeW - 3), (rnd() - 0.5) * (d - 4), y);
      }
    }
    World.buildings.push({ x: cx, z: cz, kind: opt.kind || 'apartment', r: Math.max(w, d) / 2 });
  },

  /* 마을의 랜드마크가 되는 고층 빌딩. 12층 36m 이고 옥상까지 걸어 올라갑니다 */
  tower(cx, cz, yaw) {
    this.apartment(cx, cz, yaw, { floors: 12, w: 24, d: 17, win: 5, wall: 0xb9c2cc, kind: 'tower' });
  },

  shed(cx, cz, yaw) {
    const w = 7.4, d = 6.2, h = 3.1;
    const base = this.padY(cx, cz, w, d, yaw);
    this.groundFloor(cx, cz, yaw, w, d, base, 0x8d8577);
    this.walls(cx, cz, yaw, w, d, h, 0.26, base, 0xa9a294, ['front'], 2.0);
    this.box(cx, base + h + 0.14, cz, w + 0.4, 0.3, d + 0.4, yaw, 0x6f6a60);
    if (rnd() < 0.6) this.crateStack(cx, cz, yaw, w / 2 - 1.4, d / 2 - 1.4, base);
    for (let i = 0; i < 2; i++) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * (w - 3), (rnd() - 0.5) * (d - 3), base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'shed', r: Math.max(w, d) / 2 });
  },

  /* ---------- 지형지물 ----------
     걸어 넘거나(담장) 기어올라(바위·건초) 엄폐물로 쓰는 것들입니다. */

  /* 담장: 기둥과 가로대. 1.1m 라서 뛰어넘어야 지나갈 수 있습니다 */
  fence(cx, cz, yaw, len) {
    const post = 0x6b563c, rail = 0x7d6748;
    const n = Math.max(2, Math.round(len / 2.4));
    const seg = len / n;
    for (let i = 0; i <= n; i++) {
      const lx = -len / 2 + seg * i;
      const [x, z] = this.local(cx, cz, yaw, lx, 0);
      const base = World.height(x, z);
      this.boxDefs.push({ x, y: base + 0.62, z, sx: 0.16, sy: 1.24, sz: 0.16, yaw, color: post, solid: false });
    }
    // 가로대 두 줄 (충돌은 이쪽 한 덩어리로 처리)
    const base = World.height(cx, cz);
    this.box(cx, base + 0.62, cz, len, 1.1, 0.16, yaw, rail);
    this.trim(cx, cz, yaw, 0, base + 0.98, 0, len, 0.12, 0.2, post);
  },

  /* 바위 무더기: 계단처럼 딛고 올라설 수 있는 엄폐물 */
  rockPile(cx, cz) {
    const base = World.height(cx, cz);
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 3.4;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const sc = 1.1 + rnd() * 1.5;
      this.rocks.push({ x, y: World.height(x, z), z, s: sc, rot: rnd() * Math.PI * 2 });
      World.addCyl({ x, z, r: 1.45 * sc, top: World.height(x, z) + 1.4 * sc, h: 3 * sc });
    }
    // 가운데에 올라설 수 있는 넓적한 바위
    this.box(cx, base + 0.55, cz, 3.0, 1.1, 2.6, rnd() * Math.PI, 0x7d7a72);
    this.lootSpot(cx, cz, 0, 0, 2.4, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'rocks', r: 5 });
  },

  /* 급수탑: 다리 네 개 위에 물탱크. 사다리 대신 옆 컨테이너를 딛고 오릅니다 */
  waterTower(cx, cz) {
    const base = this.padY(cx, cz, 6, 6, 0);
    const leg = 0x6f6a60, tank = 0x9aa3ab;
    const H = 9.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(cx + sx * 2.2, base + H / 2, cz + sz * 2.2, 0.35, H, 0.35, 0, leg);
      this.trim(cx, cz, 0, sx * 1.1, base + H * 0.45, sz * 1.1, 4.6, 0.16, 4.6, leg);
    }
    this.box(cx, base + H, cz, 6.4, 0.4, 6.4, 0, leg);                 // 발판
    this.box(cx, base + H + 2.1, cz, 5.2, 3.8, 5.2, 0, tank);          // 물탱크
    this.trim(cx, cz, 0, 0, base + H + 4.2, 0, 5.6, 0.5, 5.6, 0x7c8288);
    // 딛고 올라갈 계단 상자
    this.box(cx + 3.4, base + 0.55, cz, 1.6, 1.1, 1.6, 0, 0x8a6a42);
    this.box(cx + 3.4, base + 1.65, cz + 1.7, 1.6, 1.1, 1.6, 0, 0x8a6a42);
    this.lootSpot(cx, cz, 0, 0, 0, base + H + 0.25);
    World.buildings.push({ x: cx, z: cz, kind: 'watertower', r: 4 });
  },

  /* 폐허: 높이가 제각각인 벽 조각들 */
  ruin(cx, cz, yaw) {
    const base = this.padY(cx, cz, 12, 9, yaw);
    const wall = 0xa89f92;
    const segs = [[-5, -4, 6, 3.2], [4.5, -4, 4, 1.4], [-5.5, 3.5, 5, 2.4], [3, 4, 5, 1.1]];
    for (const [lx, lz, len, h] of segs) {
      const [x, z] = this.local(cx, cz, yaw, lx, lz);
      const horiz = Math.abs(lz) > Math.abs(lx) || len > 4;
      this.box(x, base + h / 2, z, horiz ? len : 0.4, h, horiz ? 0.4 : len, yaw, wall);
    }
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2, r = 1 + rnd() * 4;
      this.crateStack(cx, cz, yaw, Math.cos(a) * r, Math.sin(a) * r, base);
    }
    for (let i = 0; i < 2; i++) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * 8, (rnd() - 0.5) * 6, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'ruin', r: 7 });
  },

  /* 송신탑: 멀리서도 보이는 이정표 */
  mast(cx, cz) {
    const base = World.height(cx, cz);
    const steel = 0x8a8f96, red = 0xc23b32;
    const H = 26;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.boxDefs.push({ x: cx + sx * 1.1, y: base + H / 2, z: cz + sz * 1.1,
                          sx: 0.22, sy: H, sz: 0.22, yaw: 0, color: steel, solid: false,
                          tilt: 0, ry: 0, rz: 0 });
    }
    this.box(cx, base + 1.4, cz, 2.8, 2.8, 2.8, 0, steel);             // 아랫부분만 충돌
    for (let i = 1; i < 7; i++) {
      const y = base + i * (H / 7);
      this.trim(cx, cz, 0, 0, y, 0, 2.6, 0.16, 2.6, i % 2 ? steel : red);
    }
    this.trim(cx, cz, 0, 0, base + H + 0.5, 0, 0.5, 1.0, 0.5, red);
  },

  /* 건초 더미: 딛고 올라설 수 있는 부드러운 엄폐물 */
  haystack(cx, cz) {
    const base = World.height(cx, cz);
    const hay = 0xc9a94e;
    this.box(cx, base + 0.55, cz, 2.4, 1.1, 2.4, rnd() * 0.6, hay);
    if (rnd() < 0.6) this.box(cx + 0.3, base + 1.6, cz - 0.2, 2.0, 1.0, 2.0, rnd() * 0.6, 0xbb9c46);
    if (rnd() < 0.4) this.lootSpot(cx, cz, 0, 1.8, 0, base + 0.05);
  },

  container(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const palette = [0xb2553f, 0x3f6b8a, 0x5a7a4a, 0xb08a3c, 0x8a8a8a];
    const color = palette[Math.floor(rnd() * palette.length)];
    this.box(cx, base + 1.3, cz, 6.2, 2.6, 2.5, yaw, color);
    if (rnd() < 0.3) {
      this.box(cx, base + 3.95, cz, 6.2, 2.6, 2.5, yaw + (rnd() - 0.5) * 0.2, color);
    }
    if (rnd() < 0.4) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * 5, 2.2, base + 2.65);
  },
  /* ---------- 자연물 ---------- */
  scatterNature(towns) {
    const nearTown = (x, z, pad) => towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + pad);
    // 벌판에 홀로 선 건물 안이나 문 앞에 나무가 자라지 않도록
    const nearBuilding = (x, z, pad) =>
      World.buildings.some(b => Math.hypot(b.x - x, b.z - z) < b.r + pad);

    const density = Game.low ? 0.6 : 1;
    for (let i = 0; i < Math.round(4400 * density); i++) {
      const lim = World.half * 0.95;
      const x = (rnd() * 2 - 1) * lim, z = (rnd() * 2 - 1) * lim;
      const y = World.height(x, z);
      if (y < World.waterY + 1.2 || nearTown(x, z, 8)) continue;
      if (World.roadDist(x, z) < 4) continue;               // 도로는 비워 둡니다
      if (nearBuilding(x, z, 7)) continue;
      // 숲은 뭉쳐서 자라도록 노이즈로 밀도 조절
      if (valueNoise(x / 55 + 11, z / 55 + 7) < 0.42) continue;
      const pine = rnd() < 0.55;
      const s = 0.8 + rnd() * 0.7;
      this.trees.push({ x, y, z, s, pine, rot: rnd() * Math.PI * 2 });
      World.addCyl({ x, z, r: 0.5 * s, top: y + 8 * s, h: 8 * s });
    }

    for (let i = 0; i < 850; i++) {
      const s0 = World.freeSpot(3);
      const s = 0.7 + rnd() * 1.5;
      this.rocks.push({ x: s0.x, y: s0.y, z: s0.z, s, rot: rnd() * Math.PI * 2 });
      // 보이는 크기(가로 1.5s)에 맞춰 충돌 반지름을 잡아야 1인칭에서 바위에 파묻히지 않습니다
      World.addCyl({ x: s0.x, z: s0.z, r: 1.45 * s, top: s0.y + 1.4 * s, h: 3 * s });
    }

    for (let i = 0; i < Math.round(3400 * density); i++) {
      const lim = World.half * 0.95;
      const x = (rnd() * 2 - 1) * lim, z = (rnd() * 2 - 1) * lim;
      const y = World.height(x, z);
      if (y < World.waterY + 0.8) continue;
      if (World.roadDist(x, z) < 3) continue;
      if (nearBuilding(x, z, 3)) continue;
      const r = rnd();
      const s = r < 0.6 ? 0.22 + rnd() * 0.28      // 잡초
                        : 0.6 + rnd() * 0.85;      // 수풀
      this.bushes.push({ x, y, z, s, rot: rnd() * Math.PI * 2, tall: r >= 0.6 });
    }
  },

  /* ---------- 인스턴스 메시 생성 ---------- */
  buildInstances(scene) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sv = new THREE.Vector3();
    const col = new THREE.Color();

    // 건물 상자
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02 });
    const boxMesh = new THREE.InstancedMesh(boxGeo, boxMat, this.boxDefs.length);
    boxMesh.castShadow = true; boxMesh.receiveShadow = true;
    this.boxDefs.forEach((b, i) => {
      e.set(b.tilt || 0, b.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(v.set(b.x, b.y, b.z), q, sv.set(b.sx, b.sy, b.sz));
      boxMesh.setMatrixAt(i, m);
      boxMesh.setColorAt(i, col.setHex(b.color).convertSRGBToLinear());
    });
    boxMesh.instanceMatrix.needsUpdate = true;
    if (boxMesh.instanceColor) boxMesh.instanceColor.needsUpdate = true;
    scene.add(boxMesh);

    // 나무 줄기
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: srgb(0x5b4433), roughness: 1 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, this.trees.length);
    trunkMesh.castShadow = true;

    // 침엽수 잎: 원뿔 세 단
    const pines = this.trees.filter(t => t.pine), leafs = this.trees.filter(t => !t.pine);
    const B = Build;
    const pineGeo = B.merge([
      B.cone(1.00, 2.30, 0x2c4d31, 0, 0.95, 0),
      B.cone(0.78, 1.90, 0x35583a, 0, 1.95, 0),
      B.cone(0.54, 1.55, 0x3d6442, 0, 2.85, 0)
    ]);
    const foliageMat = Mats.vc({ roughness: 0.95, metalness: 0, flatShading: true });
    const pineMesh = new THREE.InstancedMesh(pineGeo, foliageMat, Math.max(1, pines.length));
    pineMesh.castShadow = true;

    // 활엽수 잎: 덩어리 여러 개
    const leafGeo = B.merge([
      B.ico(1.08, 0x47692f, 0, 0, 0),
      B.ico(0.80, 0x51763a, 0.82, 0.30, 0.18),
      B.ico(0.72, 0x3f5e2b, -0.70, 0.20, -0.32)
    ]);
    const leafMesh = new THREE.InstancedMesh(leafGeo, foliageMat, Math.max(1, leafs.length));
    leafMesh.castShadow = true;

    this.trees.forEach((t, i) => {
      const th = 5.5 * t.s;
      e.set(0, t.rot, 0); q.setFromEuler(e);
      m.compose(v.set(t.x, t.y, t.z), q, sv.set(t.s, th, t.s));
      trunkMesh.setMatrixAt(i, m);
    });
    pines.forEach((t, i) => {
      e.set(0, t.rot, 0); q.setFromEuler(e);
      const k = 2.0 * t.s;
      m.compose(v.set(t.x, t.y + 2.2 * t.s, t.z), q, sv.set(k, k * 1.15, k));
      pineMesh.setMatrixAt(i, m);
    });
    leafs.forEach((t, i) => {
      e.set(0, t.rot, 0); q.setFromEuler(e);
      const r = 1.9 * t.s;
      m.compose(v.set(t.x, t.y + 5.4 * t.s, t.z), q, sv.set(r, r * 0.92, r));
      leafMesh.setMatrixAt(i, m);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    pineMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    scene.add(trunkMesh); scene.add(pineMesh); scene.add(leafMesh);

    // 바위
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: srgb(0x7d7a72), roughness: 1, flatShading: true });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, this.rocks.length));
    rockMesh.castShadow = false; rockMesh.receiveShadow = true;
    this.rocks.forEach((r, i) => {
      e.set(rnd() * 0.6, r.rot, rnd() * 0.6); q.setFromEuler(e);
      m.compose(v.set(r.x, r.y + 0.6 * r.s, r.z), q, sv.set(1.5 * r.s, 1.2 * r.s, 1.4 * r.s));
      rockMesh.setMatrixAt(i, m);
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    scene.add(rockMesh);

    // 수풀
    const bushGeo = Build.merge([
      Build.ico(0.98, 0x3f5b2e, 0, 0, 0),
      Build.ico(0.68, 0x496a35, 0.60, 0.10, 0.18)
    ]);
    const bushMat = Mats.vc({ roughness: 1, metalness: 0, flatShading: true });
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(1, this.bushes.length));
    bushMesh.castShadow = false;
    this.bushes.forEach((b, i) => {
      e.set(0, b.rot, 0); q.setFromEuler(e);
      const h = b.tall ? 0.8 : 0.55;
      m.compose(v.set(b.x, b.y + 0.3 * b.s, b.z), q, sv.set(1.1 * b.s, h * b.s, 1.1 * b.s));
      bushMesh.setMatrixAt(i, m);
    });
    bushMesh.instanceMatrix.needsUpdate = true;
    scene.add(bushMesh);

    this.meshes = [boxMesh, trunkMesh, pineMesh, leafMesh, rockMesh, bushMesh];
  },

  dispose(scene) {
    if (this.terrain) { scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    if (this.water) { scene.remove(this.water); this.water.geometry.dispose(); }
    for (const m of this.meshes) { scene.remove(m); m.geometry.dispose(); }
    this.meshes = [];
  }
};
