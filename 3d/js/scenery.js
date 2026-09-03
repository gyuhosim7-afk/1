/* ============================================================
   지형 메시, 물, 건물, 나무, 바위 배치
   모든 상자·나무는 InstancedMesh 로 묶어 드로우콜을 줄입니다.
   ============================================================ */
const Scenery = {
  boxDefs: [],   // { x,y,z, sx,sy,sz, yaw, color, solid }
  trees: [], rocks: [], bushes: [],
  meshes: [],

  build(scene) {
    this.boxDefs = []; this.trees = []; this.rocks = []; this.bushes = [];
    World.resetColliders();
    World.buildHeights();

    // --- 마을 자리 선정 후 평탄화 ---
    const towns = [];
    const lim = World.half * 0.62;
    const names = ['소치', '게오르고폴', '포친키', '야스나야', '로조크', '프리모스크', '밀타 베이스'];
    for (let i = 0; i < 7; i++) {
      for (let t = 0; t < 300; t++) {
        const x = (Math.random() * 2 - 1) * lim, z = (Math.random() * 2 - 1) * lim;
        if (World.height(x, z) < World.waterY + 2.5) continue;
        if (towns.some(o => Math.hypot(o.x - x, o.z - z) < 115)) continue;
        towns.push({ x, z, name: names[i], r: 34 + Math.random() * 16 });
        break;
      }
    }
    for (const t of towns) World.flatten(t.x, t.z, t.r + 22);
    World.towns = towns;

    this.buildTerrain(scene);
    this.buildWater(scene);

    // --- 마을 건물 ---
    for (const t of towns) {
      const count = 4 + Math.floor(Math.random() * 4);
      const placed = [];
      for (let i = 0; i < count; i++) {
        for (let a = 0; a < 40; a++) {
          const ang = Math.random() * Math.PI * 2, rad = Math.random() * t.r;
          const x = t.x + Math.cos(ang) * rad, z = t.z + Math.sin(ang) * rad;
          if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 20)) continue;
          placed.push({ x, z });
          const yaw = Math.round(Math.random() * 4) * Math.PI / 2 + (Math.random() - 0.5) * 0.25;
          const roll = Math.random();
          if (roll < 0.34) this.warehouse(x, z, yaw);
          else if (roll < 0.78) this.house(x, z, yaw);
          else this.shed(x, z, yaw);
          break;
        }
      }
      // 컨테이너와 담장으로 엄폐물 추가
      for (let i = 0; i < 5; i++) {
        const ang = Math.random() * Math.PI * 2, rad = t.r * (0.4 + Math.random() * 0.7);
        this.container(t.x + Math.cos(ang) * rad, t.z + Math.sin(ang) * rad, Math.random() * Math.PI);
      }
    }

    // --- 벌판의 외딴 창고와 컨테이너 ---
    for (let i = 0; i < 16; i++) {
      const s = World.freeSpot(14);
      if (Math.random() < 0.5) this.shed(s.x, s.z, Math.random() * Math.PI * 2);
      else this.container(s.x, s.z, Math.random() * Math.PI * 2);
    }

    this.scatterNature(towns);
    this.buildInstances(scene);
  },

  /* ---------- 지형 메시 ---------- */
  buildTerrain(scene) {
    const n = World.seg + 1;
    const geo = new THREE.PlaneGeometry(World.size, World.size, World.seg, World.seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = srgb(0x53713a), cGrass2 = srgb(0x6c8447);
    const cRock = srgb(0x6d6a63), cSand = srgb(0xb9ac86);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = World.height(x, z);
      pos.setY(i, h);
      const hx = World.height(x + 2, z) - World.height(x - 2, z);
      const hz = World.height(x, z + 2) - World.height(x, z - 2);
      const slope = Math.min(1, Math.hypot(hx, hz) / 5.5);
      tmp.copy(cGrass).lerp(cGrass2, valueNoise(x / 26, z / 26));
      if (slope > 0.42) tmp.lerp(cRock, Math.min(1, (slope - 0.42) / 0.4));
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
      const v = 200 + Math.floor(Math.random() * 55);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.65)';
      const x = Math.random() * 128, y = Math.random() * 128;
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(90, 90);
    tex.anisotropy = 4;
    return tex;
  },

  buildWater(scene) {
    const geo = new THREE.PlaneGeometry(World.size * 1.6, World.size * 1.6, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: srgb(0x2f5d78), transparent: true, opacity: 0.84,
      roughness: 0.16, metalness: 0.35
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = World.waterY;
    scene.add(mesh);
    this.water = mesh;
  },

  /* ---------- 건물 조각 ---------- */
  box(x, y, z, sx, sy, sz, yaw, color, solid) {
    this.boxDefs.push({ x, y, z, sx, sy, sz, yaw, color, solid: solid !== false });
    if (solid !== false) {
      World.addBox({
        x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw,
        cos: Math.cos(yaw), sin: Math.sin(yaw),
        top: y + sy / 2, bottom: y - sy / 2
      });
    }
  },

  /* 회전된 로컬 좌표를 월드로 */
  local(cx, cz, yaw, lx, lz) {
    return [cx + lx * Math.cos(yaw) - lz * Math.sin(yaw), cz + lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  },

  /* 사방 벽 + 정면 출입구 */
  walls(cx, cz, yaw, w, d, h, thick, base, color) {
    const doorW = 1.9;
    const seg = (w - doorW) / 2;
    // 앞벽 (출입구 양옆)
    for (const s of [-1, 1]) {
      const [x, z] = this.local(cx, cz, yaw, s * (doorW / 2 + seg / 2), -d / 2);
      this.box(x, base + h / 2, z, seg, h, thick, yaw, color);
    }
    // 뒷벽
    let p = this.local(cx, cz, yaw, 0, d / 2);
    this.box(p[0], base + h / 2, p[1], w, h, thick, yaw, color);
    // 좌우벽
    for (const s of [-1, 1]) {
      p = this.local(cx, cz, yaw, s * w / 2, 0);
      this.box(p[0], base + h / 2, p[1], thick, h, d, yaw, color);
    }
  },

  warehouse(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const w = 16, d = 11, h = 5.2;
    const wall = 0xb9b2a3;
    this.walls(cx, cz, yaw, w, d, h, 0.34, base, wall);
    this.box(cx, base + h + 0.22, cz, w + 0.6, 0.44, d + 0.6, yaw, 0x8a5b47);   // 지붕 (올라설 수 있음)
    // 내부 기둥
    for (const s of [-1, 1]) {
      const [x, z] = this.local(cx, cz, yaw, s * 4.6, 0);
      this.box(x, base + h / 2, z, 0.5, h, 0.5, yaw, 0xa79f92);
    }
  },

  house(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const w = 9.5, d = 7.5, h = 3.4;
    const wall = Math.random() < 0.5 ? 0xd8cfbc : 0xc3b8a2;
    this.walls(cx, cz, yaw, w, d, h, 0.3, base, wall);
    this.box(cx, base + h + 0.15, cz, w + 0.4, 0.3, d + 0.4, yaw, 0x8f6b52);
    // 박공 지붕 (장식, 충돌 없음)
    const roof = 0x7d4b3a;
    for (const s of [-1, 1]) {
      const [x, z] = this.local(cx, cz, yaw, 0, s * d / 4);
      this.boxDefs.push({
        x, y: base + h + 0.95, z, sx: w + 0.7, sy: 0.26, sz: d / 2 + 0.5,
        yaw, color: roof, solid: false, tilt: -s * 0.62
      });
    }
    // 굴뚝
    const [px, pz] = this.local(cx, cz, yaw, w * 0.3, 0);
    this.box(px, base + h + 1.6, pz, 0.7, 1.6, 0.7, yaw, 0x8b7f70);
  },

  shed(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const w = 5.6, d = 4.6, h = 2.9;
    this.walls(cx, cz, yaw, w, d, h, 0.26, base, 0xa9a294);
    this.box(cx, base + h + 0.14, cz, w + 0.35, 0.28, d + 0.35, yaw, 0x6f6a60);
  },

  container(cx, cz, yaw) {
    const base = World.height(cx, cz);
    const palette = [0xb2553f, 0x3f6b8a, 0x5a7a4a, 0xb08a3c, 0x8a8a8a];
    const color = palette[Math.floor(Math.random() * palette.length)];
    this.box(cx, base + 1.3, cz, 6.2, 2.6, 2.5, yaw, color);
    if (Math.random() < 0.3) {
      this.box(cx, base + 3.95, cz, 6.2, 2.6, 2.5, yaw + (Math.random() - 0.5) * 0.2, color);
    }
  },

  /* ---------- 자연물 ---------- */
  scatterNature(towns) {
    const nearTown = (x, z, pad) => towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + pad);

    const density = Game.low ? 0.6 : 1;
    for (let i = 0; i < Math.round(1100 * density); i++) {
      const lim = World.half * 0.95;
      const x = (Math.random() * 2 - 1) * lim, z = (Math.random() * 2 - 1) * lim;
      const y = World.height(x, z);
      if (y < World.waterY + 1.2 || nearTown(x, z, 8)) continue;
      // 숲은 뭉쳐서 자라도록 노이즈로 밀도 조절
      if (valueNoise(x / 55 + 11, z / 55 + 7) < 0.42) continue;
      const pine = Math.random() < 0.55;
      const s = 0.8 + Math.random() * 0.7;
      this.trees.push({ x, y, z, s, pine, rot: Math.random() * Math.PI * 2 });
      World.addCyl({ x, z, r: 0.45 * s, top: y + 8 * s, h: 8 * s });
    }

    for (let i = 0; i < 420; i++) {
      const s0 = World.freeSpot(3);
      const s = 0.7 + Math.random() * 1.5;
      this.rocks.push({ x: s0.x, y: s0.y, z: s0.z, s, rot: Math.random() * Math.PI * 2 });
      World.addCyl({ x: s0.x, z: s0.z, r: 1.05 * s, top: s0.y + 1.5 * s, h: 3 * s });
    }

    for (let i = 0; i < Math.round(900 * density); i++) {
      const lim = World.half * 0.95;
      const x = (Math.random() * 2 - 1) * lim, z = (Math.random() * 2 - 1) * lim;
      const y = World.height(x, z);
      if (y < World.waterY + 0.8) continue;
      this.bushes.push({ x, y, z, s: 0.6 + Math.random() * 0.9, rot: Math.random() * Math.PI * 2 });
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

    // 침엽수 잎
    const pines = this.trees.filter(t => t.pine), leafs = this.trees.filter(t => !t.pine);
    const pineGeo = new THREE.ConeGeometry(1, 1, 7);
    pineGeo.translate(0, 0.5, 0);
    const pineMat = new THREE.MeshStandardMaterial({ color: srgb(0x2f5133), roughness: 0.95, flatShading: true });
    const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, Math.max(1, pines.length));
    pineMesh.castShadow = true;

    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const leafMat = new THREE.MeshStandardMaterial({ color: srgb(0x496b34), roughness: 0.95, flatShading: true });
    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, leafs.length));
    leafMesh.castShadow = true;

    this.trees.forEach((t, i) => {
      const th = 5.5 * t.s;
      e.set(0, t.rot, 0); q.setFromEuler(e);
      m.compose(v.set(t.x, t.y, t.z), q, sv.set(t.s, th, t.s));
      trunkMesh.setMatrixAt(i, m);
    });
    pines.forEach((t, i) => {
      e.set(0, t.rot, 0); q.setFromEuler(e);
      m.compose(v.set(t.x, t.y + 4.6 * t.s, t.z), q, sv.set(2.3 * t.s, 6.4 * t.s, 2.3 * t.s));
      pineMesh.setMatrixAt(i, m);
    });
    leafs.forEach((t, i) => {
      e.set(Math.random(), t.rot, 0); q.setFromEuler(e);
      const r = 2.5 * t.s;
      m.compose(v.set(t.x, t.y + 6.2 * t.s, t.z), q, sv.set(r, r * 0.85, r));
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
    rockMesh.castShadow = true; rockMesh.receiveShadow = true;
    this.rocks.forEach((r, i) => {
      e.set(Math.random() * 0.6, r.rot, Math.random() * 0.6); q.setFromEuler(e);
      m.compose(v.set(r.x, r.y + 0.6 * r.s, r.z), q, sv.set(1.5 * r.s, 1.2 * r.s, 1.4 * r.s));
      rockMesh.setMatrixAt(i, m);
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    scene.add(rockMesh);

    // 수풀
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: srgb(0x3f5b2e), roughness: 1, flatShading: true });
    const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(1, this.bushes.length));
    bushMesh.castShadow = true;
    this.bushes.forEach((b, i) => {
      e.set(0, b.rot, 0); q.setFromEuler(e);
      m.compose(v.set(b.x, b.y + 0.35 * b.s, b.z), q, sv.set(1.1 * b.s, 0.75 * b.s, 1.1 * b.s));
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
