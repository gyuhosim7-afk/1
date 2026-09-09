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

    /* 구조물이 서로 겹치면 벽과 벽 사이에 낄 자리가 생깁니다.
       자리를 잡을 때 이미 놓인 것들과 반지름이 겹치지 않는지 봅니다. */
    const RAD = { hab: 24, podRow: 20, pad: 10, depot: 9, container: 5,
                  ruin: 12, rockPile: 7, mast: 5, haystack: 3 };
    const fits = (kind, x, z) => {
      const r = RAD[kind] || 5;
      for (const b of plan) {
        if (Math.hypot(b.x - x, b.z - z) < r + (RAD[b.kind] || 5)) return false;
      }
      return true;
    };
    /* 자리를 여러 번 뽑아 보고, 끝내 빈자리가 없으면 그냥 거릅니다.
       억지로 끼워 넣느니 하나 덜 놓는 편이 낫습니다. */
    const putFree = (kind, pick, tries) => {
      for (let i = 0; i < (tries || 40); i++) {
        const s = pick();
        if (fits(kind, s.x, s.z)) { put(kind, s.x, s.z, s.yaw); return true; }
      }
      return false;
    };

    /* 마을은 전부 기지 부품으로 짓습니다.
       거주동(캡슐 무리) · 창고동 · 착륙장 · 화물 더미가 섞여 골목을 이룹니다. */
    for (const t of towns) {
      const count = 5 + Math.floor(rnd() * 4);
      const placed = [];
      let bigOne = true;                          // 마을마다 큰 기지 한 곳
      const ring = (lo, hi) => () => {
        const ang = rnd() * Math.PI * 2, rad = t.r * (lo + rnd() * (hi - lo));
        return { x: t.x + Math.cos(ang) * rad, z: t.z + Math.sin(ang) * rad, yaw: rnd() * Math.PI * 2 };
      };
      for (let i = 0; i < count; i++) {
        const kind = bigOne ? 'hab' : (rnd() < 0.55 ? 'podRow' : 'hab');
        if (putFree(kind, ring(0, 1))) bigOne = false;
      }
      for (let i = 0; i < 8; i++) putFree('container', ring(0.4, 1.1));
      for (let i = 0; i < 4; i++) putFree('depot', ring(0.5, 1.1));
      for (let i = 0; i < 2; i++) putFree('pad', ring(0.3, 1.4));
    }

    // 벌판에 흩어진 작은 전초 기지
    const wild = min => () => {
      const sp = World.freeSpot(min);
      return { x: sp.x, z: sp.z, yaw: rnd() * Math.PI * 2 };
    };
    for (let i = 0; i < 34; i++) {
      const r = rnd();
      putFree(r < 0.30 ? 'podRow' : r < 0.46 ? 'hab' : r < 0.62 ? 'depot'
              : r < 0.80 ? 'ruin' : 'container', wild(20));
    }

    // 벌판을 채우는 지형지물
    for (let i = 0; i < 8; i++) putFree('pad', wild(12));
    for (let i = 0; i < 5; i++) putFree('mast', wild(14));
    for (let i = 0; i < 34; i++) putFree('rockPile', wild(8));
    for (let i = 0; i < 26; i++) putFree('haystack', wild(4));
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
  trim(cx, cz, yaw, lx, ly, lz, w, h, thick, color) {
    const [x, z] = this.local(cx, cz, yaw, lx, lz);
    this.boxDefs.push({ x, y: ly, z, sx: w, sy: h, sz: thick, yaw, color, solid: false });
  },

  /* 이 모델을 이 자리에 앉힐 때의 바닥 높이.
     가운데 한 점만 재면 비탈에서 낮은 쪽 모서리가 공중에 뜨므로,
     모델이 실제로 덮는 넓이를 보고 그 안에서 가장 낮은 지면에 맞춥니다. */
  sit(name, s, x, z, yaw) {
    const b = SpaceKit.size(name, s);
    if (!b) return World.height(x, z);
    const hx = b.sx / 2, hz = b.sz / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
    let low = Infinity;
    for (const ox of [-hx, 0, hx]) {
      for (const oz of [-hz, 0, hz]) {
        low = Math.min(low, World.height(x + ox * c - oz * sn, z + ox * sn + oz * c));
      }
    }
    return low;
  },

  /* 부품을 앉힐 높이. 발자국 안에서 '가장 낮은' 지면에 맞춥니다.
     가장 높은 곳에 맞추면 비탈에서 낮은 쪽 모서리가 그만큼 공중에 뜹니다
     — 실제로 건물이 떠 보이던 원인이었습니다. 낮은 쪽에 맞추면 반대로
     높은 쪽이 지면에 조금 묻히는데, 이쪽이 훨씬 자연스럽습니다. */
  padY(cx, cz, w, d, yaw) {
    let h = World.height(cx, cz);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const [x, z] = this.local(cx, cz, yaw, i * w * 0.5, j * d * 0.5);
        h = Math.min(h, World.height(x, z));
      }
    }
    return h + 0.04;
  },

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
    const rockYaw = rnd() * Math.PI * 2;
    this.prop('rocks_B', cx, this.sit('rocks_B', 2.2, cx, cz, rockYaw), cz, rockYaw, 2.2);
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
      const cn = rnd() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked', cy2 = rnd() * Math.PI * 2;
      this.prop(cn, x, this.sit(cn, 2.4, x, z, cy2), z, cy2, 2.4);
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
        this.prop('solarpanel', sx, this.sit('solarpanel', 4.0, sx, sz, a), sz, a, 4.0, false);
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
    const n1 = rnd() < 0.5 ? 'cargo_A' : 'cargo_B', y1 = rnd() * 6.28;
    this.prop(n1, x1, this.sit(n1, 2.4, x1, z1, y1), z1, y1, 2.4);
    const n2 = rnd() < 0.5 ? 'cargo_A_stacked' : 'cargo_B_stacked', y2 = rnd() * 6.28;
    this.prop(n2, x2, this.sit(n2, 3.2, x2, z2, y2), z2, y2, 3.2);
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
      this.prop('solarpanel', x, this.sit('solarpanel', 4.0, x, z, yaw + Math.PI / 2), z,
                yaw + Math.PI / 2, 4.0, false);
    }
    this.lootSpot(cx, cz, yaw, 5.4, -2.2, base + 0.05);
    World.buildings.push({ x: cx, z: cz, kind: 'depot', r: 5 });
  },

  /* 착륙장. 평평해서 위로 걸어 올라갈 수 있고, 둘레에 유도등이 켜집니다. */
  pad(cx, cz, yaw) {
    const base = this.padY(cx, cz, 11, 11, yaw);
    const big = rnd() < 0.5;
    const name = big ? 'landingpad_large' : 'landingpad_small';
    /* 한 번에 기어오를 수 있는 턱이 2m 이므로 그보다 낮게 잡습니다.
       예전 배율(4.4)에서는 판이 2.2m 라 아무도 못 올라갔고, 그 위에 둔
       아이템은 주울 수가 없었습니다. */
    const s = big ? 3.2 : 3.6;
    // 모델은 장식으로 두고, 딛고 올라설 판은 상자로 따로 깝니다
    this.prop(name, cx, base, cz, yaw, s, false);
    const b = SpaceKit.size(name, s);
    // 팔각판이라 모서리만 살짝 줄여 보이는 넓이와 거의 같게 맞춥니다
    if (b) this.box(cx, base + b.sy / 2, cz, b.sx * 0.95, b.sy, b.sz * 0.95, yaw, 0x6f7378);
    for (let i = 0; i < 4; i++) {
      const a = yaw + i * Math.PI / 2 + Math.PI / 4;
      const r = (b ? b.sx : 9) * 0.62;
      this.prop('lights', cx + Math.cos(a) * r, base, cz + Math.sin(a) * r, rnd() * 6.28, 2.4, false);
    }
    // 올라가기 쉽도록 옆에 화물 한 칸
    const [sx, sz] = this.local(cx, cz, yaw, (b ? b.sx : 9) * 0.5 + 1.2, 0);
    this.prop(rnd() < 0.5 ? 'cargo_A' : 'cargo_B', sx, World.height(sx, sz), sz, rnd() * 6.28, 2.4);
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
    const b = this.prop(name, cx, this.sit(name, s, cx, cz, yaw), cz, yaw, s);
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
      const ry = rnd() * Math.PI * 2;
      this.prop(name, sp.x, this.sit(name, sc, sp.x, sp.z, ry), sp.z, ry, sc, name === 'rocks_B');
    }
    // 채굴 시추기: 마을 바깥에 서 있는 이정표
    for (let i = 0; i < 16; i++) {
      const sp = World.freeSpot(12);
      const dy = rnd() * Math.PI * 2;
      this.prop('drill_structure', sp.x, this.sit('drill_structure', 7.5, sp.x, sp.z, dy), sp.z, dy, 7.5);
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

    // 남은 상자들 (담장, 착륙장 발판, 풍력 발전기 밑동)
    const solidDefs = this.boxDefs;
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
      /* 가로등만 스스로 빛나는 재질을 씁니다. 나머지는 아틀라스 하나를
         공유하므로, 등 하나만 재질을 갈아 끼워도 드로우콜은 그대로입니다. */
      const litMat = SpaceKit.mat.clone();
      litMat.emissive = new THREE.Color(srgb(0x64e2d8));
      litMat.emissiveIntensity = 0.55;
      for (const [name, list] of byName) {
        const geo = SpaceKit.geo[name];
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, name === 'lights' ? litMat : SpaceKit.mat, list.length);
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
