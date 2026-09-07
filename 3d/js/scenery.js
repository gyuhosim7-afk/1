/* ============================================================
   우주 기지 부품 (KayKit Space Base Bits, CC0)
   57 개 모델을 glb 한 개로 합쳐 두었습니다. 텍스처 아틀라스도 한 장뿐이라
   재질을 공유하므로, 같은 모델끼리 InstancedMesh 로 묶으면 종류마다
   드로우콜 하나면 됩니다.
   ============================================================ */
const SpaceKit = {
  ready: false, error: null, mat: null,
  geo: {},          // 이름 → 지오메트리
  box: {},          // 이름 → { sx, sy, sz, minY }  (원래 크기, 배율 1 기준)

  load(url) {
    if (this._p) return this._p;
    this._p = new Promise(resolve => {
      new THREE.GLTFLoader().load(url, g => {
        g.scene.traverse(o => {
          if (!o.isMesh) return;
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          this.geo[o.name] = o.geometry;
          this.box[o.name] = { sx: b.max.x - b.min.x, sy: b.max.y - b.min.y,
                               sz: b.max.z - b.min.z, minY: b.min.y };
          if (!this.mat) {
            this.mat = o.material;
            this.mat.roughness = 0.72;
            this.mat.metalness = 0.06;
          }
        });
        this.ready = true;
        resolve(true);
      }, undefined, err => {
        this.error = err && err.message ? err.message : '기지 부품을 불러오지 못했습니다';
        resolve(false);
      });
    });
    return this._p;
  },

  /* 이 모델을 배율 s 로 놓았을 때의 크기 (충돌 상자를 맞추는 데 씁니다) */
  size(name, s) {
    const b = this.box[name];
    if (!b) return null;
    return { sx: b.sx * s, sy: b.sy * s, sz: b.sz * s, minY: b.minY * s };
  }
};

/* ============================================================
   지형 메시, 물, 건물, 나무, 바위 배치
   모든 상자·나무는 InstancedMesh 로 묶어 드로우콜을 줄입니다.
   ============================================================ */
const Scenery = {
  boxDefs: [],   // { x,y,z, sx,sy,sz, yaw, color, solid }
  props: [],     // 기지 부품 { name, x, y, z, yaw, s }
  trees: [], rocks: [], bushes: [], grass: [],
  meshes: [],

  build(scene) {
    this.boxDefs = []; this.trees = []; this.rocks = []; this.bushes = []; this.grass = [];
    this.props = [];
    this.lootSpots = []; this.stairSpots = [];
    World.resetColliders();
    World.buildings = [];
    World.roads = [];
    World.buildHeights();

    // --- 마을 자리 선정 후 평탄화 ---
    const towns = [];
    const lim = World.half * 0.68;
    const names = ['소치', '게오르고폴', '포친키', '야스나야', '로조크', '프리모스크',
                   '밀타 베이스', '스톨니', '리포프카', '가트카', '마일타', '셰프카',
                   '카멘카', '제르노', '노보', '루비노', '항구 마을'];
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
    const FOOT = { container: 4, ruin: 9, rockPile: 0, mast: 0,
                   haystack: 0, fence: 0, depot: 7, pad: 9, hab: 24, podRow: 20 };
    const plan = [];
    const put = (kind, x, z, yaw) => plan.push({ kind, x, z, yaw });

    /* 마을은 전부 기지 부품으로 짓습니다.
       거주동(캡슐 무리) · 창고동 · 착륙장 · 화물 더미가 섞여 골목을 이룹니다. */
    for (const t of towns) {
      const count = 5 + Math.floor(rnd() * 4);
      const placed = [];
      let bigOne = true;                          // 마을마다 큰 기지 한 곳
      for (let i = 0; i < count; i++) {
        for (let a = 0; a < 50; a++) {
          const ang = rnd() * Math.PI * 2, rad = rnd() * t.r;
          const x = t.x + Math.cos(ang) * rad, z = t.z + Math.sin(ang) * rad;
          if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 40)) continue;
          placed.push({ x, z });
          const yaw = rnd() * Math.PI * 2;
          if (bigOne) { bigOne = false; put('hab', x, z, yaw); break; }
          put(rnd() < 0.55 ? 'podRow' : 'hab', x, z, yaw);
          break;
        }
      }
      for (let i = 0; i < 8; i++) {
        const ang = rnd() * Math.PI * 2, rad = t.r * (0.4 + rnd() * 0.7);
        put('container', t.x + Math.cos(ang) * rad, t.z + Math.sin(ang) * rad, rnd() * Math.PI);
      }
      for (let i = 0; i < 4; i++) {
        const ang = rnd() * Math.PI * 2, rad = t.r * (0.5 + rnd() * 0.6);
        put('depot', t.x + Math.cos(ang) * rad, t.z + Math.sin(ang) * rad, rnd() * Math.PI * 2);
      }
      for (let i = 0; i < 2; i++) {
        put('pad', t.x + (rnd() - 0.5) * t.r * 1.4, t.z + (rnd() - 0.5) * t.r * 1.4, rnd() * Math.PI * 2);
      }
    }

    // 벌판에 흩어진 작은 전초 기지
    for (let i = 0; i < 34; i++) {
      const sp = World.freeSpot(20);
      const r = rnd(), yaw = rnd() * Math.PI * 2;
      if (r < 0.30) put('podRow', sp.x, sp.z, yaw);
      else if (r < 0.46) put('hab', sp.x, sp.z, yaw);
      else if (r < 0.62) put('depot', sp.x, sp.z, yaw);
      else if (r < 0.80) put('ruin', sp.x, sp.z, yaw);
      else put('container', sp.x, sp.z, yaw);
    }

    // 벌판을 채우는 지형지물
    for (let i = 0; i < 8; i++) { const sp = World.freeSpot(12); put('pad', sp.x, sp.z, rnd() * Math.PI * 2); }
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
    const cGrass = srgb(THEME.ground1), cGrass2 = srgb(THEME.ground2);
    const cRock = srgb(THEME.rock), cSand = srgb(THEME.sand), cRoad = srgb(THEME.road);
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
      color: srgb(THEME.water), transparent: true, opacity: 0.86,
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

  /* 우주 기지 부품 하나를 놓습니다.
     y 는 부품이 앉을 바닥 높이입니다. 충돌 상자는 모델의 실제 크기에서
     그대로 뽑아 쓰므로, 보이는 것과 막히는 것이 어긋나지 않습니다.
     solid 가 false 면 장식만 하고 지나갈 수 있습니다. */
  prop(name, x, y, z, yaw, s, solid) {
    const b = SpaceKit.size(name, s);
    if (!b) return null;                       // 모델을 못 읽었으면 조용히 건너뜁니다
    this.props.push({ name, x, y, z, yaw, s });
    if (solid !== false) {
      /* 충돌 상자 바닥은 부품 발자국 안에서 가장 낮은 지면까지 내립니다.
         비탈에 걸친 부품은 한쪽이 땅에서 떠서, 그 틈으로 걸어 들어가
         '보이는데 안 막히는' 자리가 생기기 때문입니다. */
      let low = y + b.minY;
      const hx = b.sx / 2, hz = b.sz / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const ox of [-hx, 0, hx]) {
        for (const oz of [-hz, 0, hz]) {
          low = Math.min(low, World.height(x + ox * c - oz * sn, z + ox * sn + oz * c));
        }
      }
      const top = y + b.minY + b.sy;
      const cy = (top + low) / 2, hy = (top - low) / 2;
      World.addBox({
        x, y: cy, z, hx, hy, hz, yaw,
        cos: c, sin: sn, top, bottom: low, ramp: false
      });
    }
    return b;
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
    /* 창은 일부에만 불이 켜집니다. 켜진 창은 스스로 빛나는 메시로 따로
       그려서, 밤하늘 아래 마을이 멀리서도 눈에 들어오게 합니다. */
    const pane = (x, y, z, sx, sy, sz) => {
      const lit = rnd() < THEME.glassOn;
      this.boxDefs.push({ x, y, z, sx, sy, sz, yaw, solid: false,
        color: lit ? THEME.glassLit : THEME.glass, glow: lit, raw: true });
    };
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1) - 0.5;
      for (const side of [-1, 1]) {
        const [x, z] = this.local(cx, cz, yaw, side * (w / 2 + 0.03), t * d * 0.8);
        pane(x, base + yOff, z, 0.12, 1.0, 1.3);
      }
      const [bx, bz] = this.local(cx, cz, yaw, t * w * 0.8, d / 2 + 0.03);
      pane(bx, base + yOff, bz, 1.3, 1.0, 0.12);
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
    this.prop('rocks_B', cx, base, cz, rnd() * Math.PI * 2, 2.2);
    this.lootSpot(cx, cz, 0, 0, 2.4, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'rocks', r: 5 });
  },

  /* 급수탑: 다리 네 개 위에 물탱크. 사다리 대신 옆 컨테이너를 딛고 오릅니다 */
 /* 착륙선이 내려앉은 자리. 화물이 흩어져 있어 엄폐물이 됩니다. */
  ruin(cx, cz, yaw) {
    const base = this.padY(cx, cz, 12, 9, yaw);
    this.prop('lander_base', cx, base, cz, yaw, 6.5, false);
    this.prop(rnd() < 0.5 ? 'lander_A' : 'lander_B', cx, base, cz, yaw, 6.5);
    // 둘레에 화물과 바위를 흩뿌려 몸을 숨길 데를 만듭니다
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * 4;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      this.prop(rnd() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked',
                x, World.height(x, z), z, rnd() * Math.PI * 2, 2.4);
    }
    for (let i = 0; i < 2; i++) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'ruin', r: 7 });
  },

  /* 거주 구역: 가운데 돔 하나에 캡슐 동 셋을 두고 통로로 잇습니다.
     캡슐은 속이 막힌 모델이라 안에 들어가지는 못하고, 대신 사이사이가
     좁은 골목이 되어 시가전이 벌어지는 자리가 됩니다.
     캡슐마다 제 발밑 높이를 따로 재서 앉힙니다 — 한 높이를 돌려 쓰면
     낮은 쪽 캡슐이 공중에 떠서 그 밑으로 지나가게 됩니다. */
  hab(cx, cz, yaw) {
    const POD = 4.6;                                   // 캡슐 배율 (지름 약 10m)
    const domeBase = this.padY(cx, cz, 12, 12, yaw);
    const dome = this.prop('basemodule_E', cx, domeBase, cz, yaw, POD);
    const kinds = ['basemodule_A', 'basemodule_B', 'basemodule_C', 'basemodule_D'];
    const R = 16, n = 3;
    for (let i = 0; i < n; i++) {
      const a = yaw + i * (Math.PI * 2 / n) + (rnd() - 0.5) * 0.4;
      const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
      const name = kinds[Math.floor(rnd() * kinds.length)];
      const podBase = this.padY(px, pz, 11, 11, a);
      const pb = this.prop(name, px, podBase, pz, a + Math.PI, POD);
      if (!pb) continue;
      // 통로는 두 동의 지붕을 잇습니다 (낮은 쪽 높이에 맞춰 걸칩니다)
      const y = Math.min(domeBase + (dome ? dome.sy : 7), podBase + pb.sy) * 1 - 1.2;
      this.tunnel(cx, cz, y, a, (dome ? dome.sx : 10) * 0.42, R - pb.sx * 0.42);
      this.podSteps(px, pz, a, podBase, pb);
      this.lootSpot(px, pz, 0, 0, pb.sz * 0.66, podBase + 0.05);
      if (rnd() < 0.5) {
        const sx = px + Math.cos(a) * 7, sz = pz + Math.sin(a) * 7;
        this.prop('solarpanel', sx, World.height(sx, sz), sz, a, 4.0, false);
      }
    }
    this.prop('lights', cx + 8, this.padY(cx + 8, cz + 8, 2, 2, 0), cz + 8, rnd() * 6.28, 2.4, false);
    for (let i = 0; i < 2; i++) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * 24, (rnd() - 0.5) * 24, domeBase + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'hab', r: 22 });
  },

  /* 캡슐 옆에 화물을 두 단으로 쌓아 지붕으로 올라가는 길을 냅니다.
     한 번에 오를 수 있는 턱(2m)을 넘지 않도록 낮은 상자 → 높은 상자 →
     지붕 순으로 간격을 벌려 둡니다. */
  podSteps(px, pz, ang, base, pb) {
    const a = ang + Math.PI / 2 + (rnd() - 0.5) * 0.6;
    const r1 = pb.sx * 0.5 + 1.5, r2 = pb.sx * 0.5 + 0.4;
    const x1 = px + Math.cos(a) * r1, z1 = pz + Math.sin(a) * r1;
    const x2 = px + Math.cos(a) * r2, z2 = pz + Math.sin(a) * r2;
    this.prop(rnd() < 0.5 ? 'cargo_A' : 'cargo_B', x1, World.height(x1, z1), z1, rnd() * 6.28, 2.4);
    this.prop(rnd() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked', x2, World.height(x2, z2), z2, rnd() * 6.28, 3.2);
    // 지붕 위에도 주울 것을 둡니다 (올라갈 값어치가 있도록)
    this.lootSpot(px, pz, 0, 0, 0, base + pb.sy + 0.05);
  },

  /* 캡슐 두세 동을 한 줄로 세우고 통로로 잇습니다. 길게 뻗어 골목이 됩니다. */
  podRow(cx, cz, yaw) {
    const POD = 4.4;
    const kinds = ['basemodule_A', 'basemodule_B', 'basemodule_C', 'basemodule_D'];
    const n = 2 + Math.floor(rnd() * 2);
    const gap = 15;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap;
      const px = cx + Math.cos(yaw) * off, pz = cz + Math.sin(yaw) * off;
      const name = kinds[Math.floor(rnd() * kinds.length)];
      const b0 = this.padY(px, pz, 11, 11, yaw);
      const pb = this.prop(name, px, b0, pz, yaw + Math.round(rnd() * 4) * Math.PI / 2, POD);
      if (!pb) continue;
      if (prev) {
        const y = Math.min(prev.y + prev.h, b0 + pb.sy) - 1.2;
        this.tunnel(prev.x, prev.z, y, yaw, prev.r, gap - pb.sx * 0.42);
      }
      if (i === 0) this.podSteps(px, pz, yaw, b0, pb);
      this.lootSpot(px, pz, 0, 0, pb.sz * 0.66, b0 + 0.05);
      prev = { x: px, z: pz, y: b0, h: pb.sy, r: pb.sx * 0.42 };
    }
    this.prop('lights', cx, this.padY(cx, cz + 9, 2, 2, 0), cz + 9, rnd() * 6.28, 2.4, false);
    World.buildings.push({ x: cx, z: cz, kind: 'podRow', r: 18 });
  },

  /* 두 지점을 잇는 통로. 모델 한 칸이 길이 2 이므로 필요한 만큼 이어 붙입니다.
     전부 장식이라(solid=false) 지나다니는 데 걸리지 않습니다. */
  tunnel(cx, cz, y, ang, from, to) {
    const name = rnd() < 0.5 ? 'tunnel_straight_A' : 'tunnel_straight_B';
    const s = 4.3;                                     // 지름 약 4m
    const seg = SpaceKit.size(name, s);
    if (!seg) return;
    const span = to - from;
    if (span <= 0) return;
    const n = Math.max(1, Math.round(span / seg.sx));
    const step = span / n;
    for (let i = 0; i < n; i++) {
      const r = from + step * (i + 0.5);
      this.prop(name, cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r, ang, s, false);
    }
  },

  /* 화물 창고동. 안에는 못 들어가지만 둘레가 좋은 엄폐물이 됩니다. */
  depot(cx, cz, yaw) {
    const base = this.padY(cx, cz, 8, 8, yaw);
    const kinds = ['cargodepot_A', 'cargodepot_B', 'cargodepot_C', 'structure_low', 'structure_tall'];
    const name = kinds[Math.floor(rnd() * kinds.length)];
    this.prop(name, cx, base, cz, yaw, 4.2);
    if (rnd() < 0.7) {
      const [x, z] = this.local(cx, cz, yaw, 5.5, 2.0);
      this.prop('solarpanel', x, World.height(x, z), z, yaw + Math.PI / 2, 4.0, false);
    }
    this.lootSpot(cx, cz, yaw, 5.4, -2.2, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'depot', r: 5 });
  },

  /* 착륙장. 평평해서 위로 걸어 올라갈 수 있고, 둘레에 유도등이 켜집니다. */
  pad(cx, cz, yaw) {
    const base = this.padY(cx, cz, 11, 11, yaw);
    const big = rnd() < 0.5;
    const name = big ? 'landingpad_large' : 'landingpad_small';
    const s = big ? 4.4 : 4.8;
    // 모델은 장식으로 두고, 딛고 올라설 판은 낮은 상자로 따로 깝니다
    this.prop(name, cx, base, cz, yaw, s, false);
    const b = SpaceKit.size(name, s);
    if (b) this.box(cx, base + b.sy / 2, cz, b.sx * 0.86, b.sy, b.sz * 0.86, yaw, 0x6f7378);
    for (let i = 0; i < 4; i++) {
      const a = yaw + i * Math.PI / 2 + Math.PI / 4;
      const r = (b ? b.sx : 9) * 0.62;
      this.prop('lights', cx + Math.cos(a) * r, base, cz + Math.sin(a) * r, rnd() * 6.28, 2.4, false);
    }
    this.lootSpot(cx, cz, yaw, 0, 0, base + (b ? b.sy : 0.5) + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'pad', r: 6 });
  },

  /* 평평한 옥상에 기지 설비를 얹습니다.
     전부 장식이라 충돌은 건드리지 않고, 지금 있는 건물이 그대로
     기지 건물처럼 보이게 합니다. */
  mast(cx, cz) {
    const base = World.height(cx, cz);
    const yaw = rnd() * Math.PI * 2;
    // 기둥만 충돌시키고(가느다란 밑동), 날개는 지나갈 수 있게 둡니다
    this.prop(rnd() < 0.5 ? 'windturbine_tall' : 'windturbine_low', cx, base, cz, yaw, 13, false);
    this.box(cx, base + 1.6, cz, 1.7, 3.2, 1.7, yaw, 0x8a8f96);
  },

  /* 보급 팔레트: 딛고 올라설 수 있는 낮은 엄폐물 */
  haystack(cx, cz) {
    const base = World.height(cx, cz);
    this.prop(rnd() < 0.5 ? 'cargo_A' : 'cargo_B', cx, base, cz, rnd() * Math.PI * 2, 2.3);
    if (rnd() < 0.4) this.lootSpot(cx, cz, 0, 1.8, 0, base + 0.05);
  },

  /* 화물 더미. 기지 부품 모델을 쓰고 충돌 상자는 모델 크기에서 뽑습니다. */
  container(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const kinds = ['cargo_A_stacked', 'cargo_B_stacked', 'cargo_A_packed', 'cargo_B_packed',
                   'containers_A', 'containers_B', 'containers_C', 'containers_D'];
    const name = kinds[Math.floor(rnd() * kinds.length)];
    const s = name.indexOf('containers') === 0 ? 6.0 : 3.4;   // 팔레트류는 납작해서 크게
    const b = this.prop(name, cx, base, cz, yaw, s);
    if (!b) return;
    if (rnd() < 0.4) this.lootSpot(cx, cz, yaw, (rnd() - 0.5) * 5, b.sz / 2 + 1.6, base + 0.05);
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

    /* 기지에서 쓰는 것과 같은 바위·시추기를 땅에도 흩뿌립니다.
       땅과 건물이 같은 세계에서 온 것처럼 보이게 하는 마무리입니다. */
    for (let i = 0; i < 260; i++) {
      const sp = World.freeSpot(4);
      const r = rnd();
      const name = r < 0.34 ? 'rock_A' : r < 0.62 ? 'rock_B' : r < 0.86 ? 'rocks_A' : 'rocks_B';
      const sc = (name === 'rocks_B' ? 2.6 : 4.2) * (0.7 + rnd() * 0.8);
      this.prop(name, sp.x, sp.y, sp.z, rnd() * Math.PI * 2, sc, name === 'rocks_B');
    }
    // 채굴 시추기: 마을 바깥에 서 있는 이정표
    for (let i = 0; i < 16; i++) {
      const sp = World.freeSpot(12);
      this.prop('drill_structure', sp.x, sp.y, sp.z, rnd() * Math.PI * 2, 7.5);
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
  /* 건물 색을 외계 식민지 쪽으로 옮깁니다.
     원래 배색(벽은 밝게, 지붕과 창틀은 어둡게)의 밝기 차이는 그대로 두고
     색상만 좁은 청보라 띠 안으로 모으고 채도를 낮춰, 흙빛 시골 마을이
     금속과 콘크리트로 지은 전초 기지처럼 보이게 합니다.
     raw 가 붙은 상자(창유리 등)는 색을 그대로 씁니다. */
  tint(hex, out) {
    out.setHex(hex);
    const q = { h: 0, s: 0, l: 0 };
    out.getHSL(q);
    out.setHSL((THEME.buildHue + q.h * THEME.buildSpread) % 1,
               Math.min(THEME.buildSat, 0.08 + q.s * 0.5),
               q.l * THEME.buildLit + 0.03);
    return out;
  },

  buildInstances(scene) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sv = new THREE.Vector3();
    const col = new THREE.Color();

    // 건물 상자 — 불 켜진 창은 스스로 빛나므로 따로 모읍니다
    const solidDefs = this.boxDefs.filter(b => !b.glow);
    const glowDefs = this.boxDefs.filter(b => b.glow);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02 });
    const boxMesh = new THREE.InstancedMesh(boxGeo, boxMat, solidDefs.length);
    boxMesh.castShadow = true; boxMesh.receiveShadow = true;
    solidDefs.forEach((b, i) => {
      /* 화면 상자의 방향은 충돌 상자와 반드시 같아야 합니다.
         부품 자리는 local() 로 잡는데 그 회전이 three.js 의 Y 회전과 반대여서,
         여기서 부호를 맞춰 주지 않으면 '벽이 없는데 막히고 벽이 있는데 통과되는'
         어긋남이 생깁니다. */
      e.set(b.tilt || 0, -b.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(v.set(b.x, b.y, b.z), q, sv.set(b.sx, b.sy, b.sz));
      boxMesh.setMatrixAt(i, m);
      const c = b.raw ? col.setHex(b.color) : this.tint(b.color, col);
      boxMesh.setColorAt(i, c.convertSRGBToLinear());
    });
    boxMesh.instanceMatrix.needsUpdate = true;
    if (boxMesh.instanceColor) boxMesh.instanceColor.needsUpdate = true;
    scene.add(boxMesh);

    /* 우주 기지 부품: 같은 모델끼리 묶어 종류마다 드로우콜 하나로 그립니다.
       모델 배율이 제각각이라 회전 방향은 화면 상자와 같은 규칙(-yaw)을 씁니다. */
    if (this.props.length && SpaceKit.ready) {
      const byName = new Map();
      for (const pr of this.props) {
        let a = byName.get(pr.name);
        if (!a) { a = []; byName.set(pr.name, a); }
        a.push(pr);
      }
      for (const [name, list] of byName) {
        const geo = SpaceKit.geo[name];
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, SpaceKit.mat, list.length);
        im.castShadow = true; im.receiveShadow = true;
        list.forEach((pr, i) => {
          e.set(0, -pr.yaw, 0, 'YXZ');
          q.setFromEuler(e);
          m.compose(v.set(pr.x, pr.y, pr.z), q, sv.set(pr.s, pr.s, pr.s));
          im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        scene.add(im);
      }
    }

    // 불이 켜진 창: 그림자를 지지 않고 스스로 빛납니다
    if (glowDefs.length) {
      const litMat = new THREE.MeshStandardMaterial({
        color: 0x05070a, emissive: srgb(THEME.glassLit),
        emissiveIntensity: 0.62, roughness: 0.4, metalness: 0
      });
      const litMesh = new THREE.InstancedMesh(boxGeo, litMat, glowDefs.length);
      glowDefs.forEach((b, i) => {
        e.set(b.tilt || 0, -b.yaw, 0, 'YXZ');
        q.setFromEuler(e);
        m.compose(v.set(b.x, b.y, b.z), q, sv.set(b.sx, b.sy, b.sz));
        litMesh.setMatrixAt(i, m);
      });
      litMesh.instanceMatrix.needsUpdate = true;
      scene.add(litMesh);
    }

    // 나무 줄기
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: srgb(THEME.trunk), roughness: 1 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, this.trees.length);
    trunkMesh.castShadow = true;

    // 침엽수 잎: 원뿔 세 단
    const pines = this.trees.filter(t => t.pine), leafs = this.trees.filter(t => !t.pine);
    const B = Build;
    const pineGeo = B.merge([
      B.cone(1.00, 2.30, THEME.pine[0], 0, 0.95, 0),
      B.cone(0.78, 1.90, THEME.pine[1], 0, 1.95, 0),
      B.cone(0.54, 1.55, THEME.pine[2], 0, 2.85, 0)
    ]);
    const foliageMat = Mats.vc({ roughness: 0.95, metalness: 0, flatShading: true });
    const pineMesh = new THREE.InstancedMesh(pineGeo, foliageMat, Math.max(1, pines.length));
    pineMesh.castShadow = true;

    // 활엽수 잎: 덩어리 여러 개
    const leafGeo = B.merge([
      B.ico(1.08, THEME.leaf[0], 0, 0, 0),
      B.ico(0.80, THEME.leaf[1], 0.82, 0.30, 0.18),
      B.ico(0.72, THEME.leaf[2], -0.70, 0.20, -0.32)
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
