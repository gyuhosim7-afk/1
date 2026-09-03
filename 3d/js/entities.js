/* ============================================================
   캐릭터와 아이템
   여러 조각을 하나의 지오메트리로 합쳐(정점 색 사용) 드로우콜을 줄입니다.
   좌표 규칙: 정면 벡터는 (sin(yaw), 0, cos(yaw)), 모델의 앞은 +Z
   ============================================================ */

const Mats = {
  cache: {},
  get(hex, opts) {
    const key = hex + '|' + JSON.stringify(opts || {});
    if (!this.cache[key]) {
      this.cache[key] = new THREE.MeshStandardMaterial(
        Object.assign({ color: srgb(hex), roughness: 0.85, metalness: 0.05 }, opts || {}));
    }
    return this.cache[key];
  },
  /* 정점 색을 쓰는 공용 재질 (합쳐진 모델용) */
  vc(opts) {
    const key = 'vc|' + JSON.stringify(opts || {});
    if (!this.cache[key]) {
      this.cache[key] = new THREE.MeshStandardMaterial(
        Object.assign({ vertexColors: true, roughness: 0.72, metalness: 0.06 }, opts || {}));
    }
    return this.cache[key];
  }
};

/* ---------- 조각 합치기 ---------- */
const Build = {
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(),
  _e: new THREE.Euler(), _p: new THREE.Vector3(), _s: new THREE.Vector3(),

  box(w, h, d, color, x, y, z, rx, ry, rz) {
    return { geo: new THREE.BoxGeometry(w, h, d), color, x, y, z, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
  },
  /* 길이가 z 축을 향하는 원기둥 */
  tube(r, len, color, x, y, z, rx, ry, rz) {
    const g = new THREE.CylinderGeometry(r, r, len, 10);
    g.rotateX(Math.PI / 2);
    return { geo: g, color, x, y, z, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
  },
  /* 세로로 선 원기둥 */
  pillar(rTop, rBot, h, color, x, y, z, rx, ry, rz) {
    return { geo: new THREE.CylinderGeometry(rTop, rBot, h, 10), color, x, y, z, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
  },
  cone(r, h, color, x, y, z, rx, ry, rz) {
    return { geo: new THREE.ConeGeometry(r, h, 8), color, x, y, z, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
  },
  ico(r, color, x, y, z, detail) {
    return { geo: new THREE.IcosahedronGeometry(r, detail || 0), color, x, y, z, rx: 0, ry: 0, rz: 0 };
  },
  plane(w, h, color, x, y, z, rx, ry, rz) {
    return { geo: new THREE.PlaneGeometry(w, h), color, x, y, z, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
  },
  sphere(r, color, x, y, z, sx, sy, sz) {
    const g = new THREE.SphereGeometry(r, 10, 7);
    if (sx || sy || sz) g.scale(sx || 1, sy || 1, sz || 1);
    return { geo: g, color, x, y, z, rx: 0, ry: 0, rz: 0 };
  },

  /* 조각 배열 → 정점 색이 들어간 하나의 지오메트리 */
  merge(parts) {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    for (const p of parts) {
      this._e.set(p.rx, p.ry, p.rz);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(1, 1, 1));
      const g = p.geo.clone().applyMatrix4(this._m);
      const ng = g.index ? g.toNonIndexed() : g;
      const ap = ng.attributes.position.array, an = ng.attributes.normal.array;
      c.setHex(p.color).convertSRGBToLinear();
      for (let i = 0; i < ap.length; i += 3) {
        pos.push(ap[i], ap[i + 1], ap[i + 2]);
        nor.push(an[i], an[i + 1], an[i + 2]);
        col.push(c.r, c.g, c.b);
      }
      g.dispose(); if (ng !== g) ng.dispose();
      p.geo.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }
};

/* ============================================================
   총기 모델 (땅에 떨어진 아이템과 손에 든 무기가 같은 모델)
   ============================================================ */
const GunArt = {
  cache: {},
  METAL: 0x33383f, DARK: 0x1f2227, WOOD: 0x7a5433, OLIVE: 0x4a5340,

  geo(key) {
    if (!this.cache[key]) this.cache[key] = Build.merge(this.parts(key));
    return this.cache[key];
  },

  parts(key) {
    const B = Build, M = this.METAL, D = this.DARK, W = this.WOOD, O = this.OLIVE;
    const A = GUNS[key].color;
    switch (key) {
      case 'pistol': return [
        B.box(0.055, 0.085, 0.24, M, 0, 0.03, 0.04),
        B.box(0.05, 0.05, 0.19, D, 0, -0.03, 0.02),
        B.box(0.052, 0.135, 0.07, D, 0, -0.10, -0.055, 0.30),
        B.tube(0.013, 0.04, D, 0, 0.03, 0.17),
        B.box(0.058, 0.018, 0.10, A, 0, 0.076, 0.05)
      ];
      case 'smg': return [
        B.box(0.07, 0.115, 0.30, M, 0, 0.02, 0.03),
        B.tube(0.016, 0.17, D, 0, 0.03, 0.25),
        B.box(0.045, 0.20, 0.075, D, 0, -0.12, 0.02, 0.10),
        B.box(0.05, 0.125, 0.06, D, 0, -0.08, -0.10, 0.32),
        B.tube(0.014, 0.20, D, 0.028, 0.02, -0.22),
        B.tube(0.014, 0.20, D, -0.028, 0.02, -0.22),
        B.box(0.052, 0.022, 0.24, A, 0, 0.085, 0.04)
      ];
      case 'shotgun': return [
        B.tube(0.025, 0.60, M, 0, 0.055, 0.32),
        B.tube(0.025, 0.60, M, 0, 0.005, 0.32),
        B.box(0.085, 0.115, 0.17, M, 0, 0.015, -0.04),
        B.box(0.075, 0.07, 0.22, W, 0, -0.01, 0.18),
        B.box(0.065, 0.125, 0.30, W, 0, -0.05, -0.30, -0.10),
        B.box(0.07, 0.14, 0.03, D, 0, -0.075, -0.45),
        B.box(0.02, 0.02, 0.06, A, 0, 0.09, 0.60)
      ];
      case 'rifle': return [
        B.box(0.075, 0.125, 0.40, M, 0, 0.02, 0.0),
        B.box(0.07, 0.085, 0.28, D, 0, 0.02, 0.32),
        B.tube(0.017, 0.28, M, 0, 0.02, 0.56),
        B.tube(0.027, 0.06, D, 0, 0.02, 0.71),
        B.box(0.05, 0.024, 0.34, A, 0, 0.09, 0.06),
        B.box(0.045, 0.22, 0.085, D, 0, -0.14, 0.02, 0.14),
        B.box(0.05, 0.14, 0.065, D, 0, -0.09, -0.15, 0.34),
        B.box(0.058, 0.105, 0.26, D, 0, 0.0, -0.32),
        B.box(0.05, 0.035, 0.17, A, 0, 0.07, -0.30)
      ];
      case 'dmr': return [
        B.box(0.07, 0.12, 0.34, M, 0, 0.02, 0.02),
        B.tube(0.018, 0.44, M, 0, 0.03, 0.42),
        B.tube(0.026, 0.05, D, 0, 0.03, 0.66),
        B.box(0.068, 0.13, 0.34, W, 0, -0.035, -0.30, -0.05),
        B.box(0.07, 0.06, 0.22, W, 0, 0.045, 0.26),
        B.box(0.05, 0.145, 0.09, D, 0, -0.10, 0.10, 0.12),
        B.tube(0.034, 0.22, D, 0, 0.155, 0.02),
        B.box(0.03, 0.06, 0.03, D, 0, 0.11, -0.05),
        B.box(0.03, 0.06, 0.03, D, 0, 0.11, 0.09),
        B.box(0.03, 0.02, 0.20, A, 0, 0.20, 0.02)
      ];
      case 'sniper': return [
        B.box(0.08, 0.13, 0.42, O, 0, 0.02, 0.04),
        B.tube(0.021, 0.58, M, 0, 0.03, 0.54),
        B.box(0.055, 0.055, 0.10, D, 0, 0.03, 0.85),
        B.box(0.075, 0.15, 0.42, O, 0, -0.02, -0.34, -0.04),
        B.box(0.05, 0.12, 0.10, D, 0, -0.10, 0.06),
        B.tube(0.042, 0.30, D, 0, 0.175, 0.06),
        B.box(0.032, 0.07, 0.032, D, 0, 0.12, -0.04),
        B.box(0.032, 0.07, 0.032, D, 0, 0.12, 0.16),
        B.box(0.03, 0.02, 0.24, A, 0, 0.225, 0.06),
        B.box(0.02, 0.16, 0.02, D, 0.05, -0.06, 0.60, 0, 0, -0.35),
        B.box(0.02, 0.16, 0.02, D, -0.05, -0.06, 0.60, 0, 0, 0.35)
      ];
      default: return [B.box(0.08, 0.1, 0.4, M, 0, 0, 0)];
    }
  }
};

/* ============================================================
   아이템 (총기 / 탄약 상자 / 구급상자)
   ============================================================ */
const LootArt = {
  cache: {},
  beamGeo: null,

  geo(kind, gun) {
    const key = kind + ':' + (gun || '');
    if (!this.cache[key]) {
      if (kind === 'gun') this.cache[key] = GunArt.geo(gun);
      else if (kind === 'ammo') this.cache[key] = Build.merge(this.ammoParts(gun));
      else this.cache[key] = Build.merge(this.medParts());
    }
    return this.cache[key];
  },

  ammoParts(gun) {
    const B = Build, A = GUNS[gun].color;
    const box = 0x4b5340, lid = 0x3a4132, brass = 0xc79a3b;
    return [
      B.box(0.36, 0.22, 0.26, box, 0, 0.12, 0),
      B.box(0.38, 0.045, 0.28, lid, 0, 0.245, 0),
      B.box(0.37, 0.055, 0.055, A, 0, 0.15, 0.13),
      B.box(0.055, 0.055, 0.27, A, 0.15, 0.15, 0),
      B.pillar(0.017, 0.017, 0.10, brass, -0.09, 0.31, 0.05),
      B.pillar(0.017, 0.017, 0.10, brass, -0.04, 0.31, -0.03),
      B.pillar(0.017, 0.017, 0.10, brass, 0.02, 0.31, 0.04),
      B.pillar(0.001, 0.017, 0.03, brass, -0.09, 0.375, 0.05),
      B.pillar(0.001, 0.017, 0.03, brass, -0.04, 0.375, -0.03),
      B.pillar(0.001, 0.017, 0.03, brass, 0.02, 0.375, 0.04)
    ];
  },

  medParts() {
    const B = Build;
    const white = 0xeef1f2, gray = 0xb9c0c4, red = 0xd23b32;
    return [
      B.box(0.32, 0.22, 0.24, white, 0, 0.12, 0),
      B.box(0.33, 0.025, 0.25, gray, 0, 0.21, 0),
      B.box(0.16, 0.05, 0.016, red, 0, 0.13, 0.122),
      B.box(0.05, 0.16, 0.016, red, 0, 0.13, 0.122),
      B.box(0.14, 0.016, 0.05, red, 0, 0.232, 0),
      B.box(0.05, 0.016, 0.14, red, 0, 0.232, 0),
      B.box(0.10, 0.035, 0.025, gray, 0, 0.25, 0)
    ];
  },

  beam() {
    if (!this.beamGeo) this.beamGeo = new THREE.CylinderGeometry(0.3, 0.42, 3.4, 10, 1, true);
    return this.beamGeo;
  }
};

class Loot {
  constructor(x, z, kind, gun, amount) {
    const y = World.height(x, z);
    this.pos = new THREE.Vector3(x, y, z);
    this.kind = kind;                 // 'gun' | 'ammo' | 'med'
    this.gun = gun || null;
    this.amount = amount || 0;
    this.dead = false;
    this.spin = Math.random() * Math.PI * 2;

    const color = kind === 'gun' ? GUNS[gun].color : (kind === 'ammo' ? 0xf2cc60 : 0xff6b6b);
    this.color = color;

    this.mesh = new THREE.Group();
    this.model = new THREE.Mesh(LootArt.geo(kind, gun), Mats.vc({ roughness: 0.55, metalness: 0.25 }));
    this.model.castShadow = true;
    this.model.position.y = kind === 'gun' ? 0.55 : 0.35;
    if (kind === 'gun') this.model.rotation.z = 0.22;

    this.beam = new THREE.Mesh(LootArt.beam(), new THREE.MeshBasicMaterial({
      color: srgb(color), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide
    }));
    this.beam.position.y = 1.7;

    this.mesh.add(this.model);
    this.mesh.add(this.beam);
    this.mesh.position.set(x, y, z);
  }

  get label() {
    if (this.kind === 'gun') return GUNS[this.gun].name + ' · ' + GUNS[this.gun].short;
    if (this.kind === 'ammo') return GUNS[this.gun].short + ' 탄약 ' + this.amount + '발';
    return '구급상자';
  }

  /* dist: 카메라와의 거리 — 멀면 모델을 숨겨 그리기 비용을 아낍니다 */
  update(t, dist, highlighted) {
    const near = dist < 55;
    if (this.model.visible !== near) this.model.visible = near;
    const beamOn = dist < 140;
    if (this.beam.visible !== beamOn) this.beam.visible = beamOn;
    if (!near) return;

    this.spin += 0.012;
    this.model.rotation.y = this.spin;
    const base = this.kind === 'gun' ? 0.55 : 0.35;
    this.model.position.y = base + Math.sin(t * 2 + this.spin) * 0.07;
    const s = highlighted ? 1.18 : 1;
    this.model.scale.setScalar(s);
    this.beam.material.opacity = highlighted ? 0.3 : 0.12;
  }
}

/* ============================================================
   캐릭터 모델
   부위별로 합쳐 8개 메시로 만들고, 관절 위치에 그룹을 두어 움직입니다.
   ============================================================ */
const CharArt = {
  cache: {},

  /* 옷차림별 지오메트리 (봇끼리 공유) */
  get(outfit, isPlayer) {
    const key = (isPlayer ? 'p' : '') + outfit.top + '_' + outfit.pants;
    if (!this.cache[key]) this.cache[key] = this.build(outfit, isPlayer);
    return this.cache[key];
  },

  build(outfit, isPlayer) {
    const B = Build;
    const skin = 0xc39a72, dark = 0x2b2f36;
    const top = isPlayer ? 0x3d6285 : outfit.top;
    const pants = isPlayer ? 0x2f3a46 : outfit.pants;
    const vest = isPlayer ? 0x2c3c4c : 0x4b4a3f;
    const helmet = isPlayer ? 0x2f4c6b : 0x50503f;
    const boot = 0x24262b;

    // 몸통: 골반 기준 (골반 그룹은 y=0.92 에 놓입니다)
    const torso = B.merge([
      B.box(0.44, 0.40, 0.26, top, 0, 0.20, 0),                  // 배
      B.box(0.50, 0.30, 0.28, top, 0, 0.50, 0),                  // 가슴
      B.box(0.53, 0.26, 0.31, vest, 0, 0.50, 0),                 // 방탄복
      B.box(0.10, 0.30, 0.33, dark, -0.14, 0.50, 0),             // 멜빵
      B.box(0.10, 0.30, 0.33, dark, 0.14, 0.50, 0),
      B.box(0.34, 0.40, 0.18, 0x50503f, 0, 0.46, -0.24),         // 배낭
      B.box(0.30, 0.10, 0.16, dark, 0, 0.28, -0.25),
      B.box(0.15, 0.10, 0.16, skin, 0, 0.70, 0),                 // 목
      B.box(0.26, 0.27, 0.26, skin, 0, 0.88, 0),                 // 머리
      B.box(0.30, 0.13, 0.30, helmet, 0, 1.02, 0),               // 헬멧
      B.sphere(0.16, helmet, 0, 1.03, 0, 1, 0.75, 1),
      B.box(0.22, 0.07, 0.04, 0x1a1c20, 0, 0.92, 0.14)           // 고글
    ]);

    // 팔: 어깨 관절이 원점, 아래로 뻗음
    const arm = B.merge([
      B.box(0.15, 0.26, 0.15, top, 0, -0.13, 0),                 // 윗팔
      B.box(0.135, 0.26, 0.135, top, 0, -0.37, 0.01),            // 아래팔
      B.box(0.14, 0.10, 0.15, dark, 0, -0.54, 0.02)              // 장갑
    ]);

    // 다리: 엉덩이 관절이 원점
    const thigh = B.merge([
      B.box(0.19, 0.30, 0.20, pants, 0, -0.16, 0)
    ]);
    const shin = B.merge([
      B.box(0.165, 0.30, 0.175, pants, 0, -0.16, 0),
      B.box(0.18, 0.10, 0.26, boot, 0, -0.34, 0.03)              // 군화
    ]);

    return { torso, arm, thigh, shin };
  }
};

class Char3D {
  constructor(x, z, isPlayer, name, outfit) {
    this.pos = new THREE.Vector3(x, World.height(x, z), z);
    this.vy = 0;
    this.grounded = true;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.isPlayer = !!isPlayer;
    this.name = name;
    this.hp = 100; this.maxHp = 100;
    this.dead = false;
    this.deadT = 0;
    this.kills = 0;
    this.rank = 0;
    this.crouch = false;
    this.speedNow = 0;
    this.stepPhase = 0;
    this.lean = 0;
    this.aimBlend = 0;

    this.gun = null;
    this.mag = 0;
    this.reserve = {};
    this.meds = isPlayer ? 1 : 1 + Math.floor(Math.random() * 2);
    this.reloading = 0;
    this.cooldown = 0;
    this.healing = 0;
    this.hitFlash = 0;
    this.recoil = 0;

    this.buildMesh(outfit || OUTFITS[0]);

    this.ai = isPlayer ? null : {
      state: 'loot', target: null, reaction: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random(),
      dest: null, destT: 0, skill: 0.3 + Math.random() * 0.62,
      think: Math.random() * 0.2
    };
  }

  buildMesh(outfit) {
    const art = CharArt.get(outfit, this.isPlayer);
    const mat = Mats.vc({ roughness: 0.82, metalness: 0.02 });
    const mesh = m => { const o = new THREE.Mesh(m, mat); o.castShadow = true; return o; };

    this.mesh = new THREE.Group();
    this.body = new THREE.Group();          // 사망 연출용 회전축
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;

    this.torso = mesh(art.torso);
    this.hips.add(this.torso);

    // 정면이 +Z 이므로 캐릭터의 오른쪽은 로컬 -X 입니다
    this.armR = new THREE.Group(); this.armR.position.set(-0.31, 0.55, 0);
    this.armL = new THREE.Group(); this.armL.position.set(0.31, 0.55, 0);
    this.armL.add(mesh(art.arm)); this.armR.add(mesh(art.arm));
    this.hips.add(this.armL); this.hips.add(this.armR);

    // 총은 오른손 앞에 붙입니다
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(-0.03, -0.52, 0.26);
    this.armR.add(this.gunMount);
    this.gunMesh = null;

    this.legL = new THREE.Group(); this.legL.position.set(-0.11, 0.92, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.11, 0.92, 0);
    this.kneeL = new THREE.Group(); this.kneeL.position.y = -0.33;
    this.kneeR = new THREE.Group(); this.kneeR.position.y = -0.33;
    this.legL.add(mesh(art.thigh)); this.legL.add(this.kneeL); this.kneeL.add(mesh(art.shin));
    this.legR.add(mesh(art.thigh)); this.legR.add(this.kneeR); this.kneeR.add(mesh(art.shin));

    this.body.add(this.hips); this.body.add(this.legL); this.body.add(this.legR);
    this.mesh.add(this.body);
    this.mesh.position.copy(this.pos);
  }

  get spec() { return this.gun ? GUNS[this.gun] : null; }
  get reserveAmmo() { return this.gun ? (this.reserve[this.gun] || 0) : 0; }
  get eyeY() { return this.pos.y + (this.crouch ? 1.18 : CFG.EYE); }

  forward(out) {
    return (out || new THREE.Vector3()).set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  giveGun(key, ammo) {
    this.gun = key;
    this.mag = GUNS[key].mag;
    this.reserve[key] = (this.reserve[key] || 0) + (ammo == null ? GUNS[key].ammoPer : ammo);
    this.reloading = 0;
    if (this.gunMesh) this.gunMount.remove(this.gunMesh);
    this.gunMesh = new THREE.Mesh(GunArt.geo(key), Mats.vc({ roughness: 0.55, metalness: 0.25 }));
    this.gunMesh.castShadow = true;
    this.gunMesh.position.set(0, 0, 0.06);      // 총구는 앞(+Z)을 봅니다
    this.gunMount.add(this.gunMesh);
  }

  canShoot() {
    return !this.dead && this.gun && this.mag > 0 && this.cooldown <= 0 &&
           this.reloading <= 0 && this.healing <= 0;
  }
  needsReload() { return this.gun && this.mag <= 0 && this.reserveAmmo > 0 && this.reloading <= 0; }

  startReload() {
    if (!this.gun || this.reloading > 0 || this.healing > 0) return false;
    if (this.mag >= this.spec.mag || this.reserveAmmo <= 0) return false;
    this.reloading = this.spec.reload;
    return true;
  }
  finishReload() {
    const need = this.spec.mag - this.mag;
    const take = Math.min(need, this.reserve[this.gun] || 0);
    this.mag += take;
    this.reserve[this.gun] -= take;
  }
  startHeal() {
    if (this.meds <= 0 || this.healing > 0 || this.hp >= this.maxHp) return false;
    this.healing = CFG.HEAL_TIME;
    this.reloading = 0;
    return true;
  }

  /* ---------- 자세와 걷기 애니메이션 ---------- */
  syncMesh(dt, aiming) {
    const mesh = this.mesh;
    mesh.position.copy(this.pos);
    mesh.rotation.y = this.yaw;

    if (this.dead) {                       // 쓰러지는 연출
      this.deadT = Math.min(1, this.deadT + dt * 2.6);
      const t = this.deadT * this.deadT * (3 - 2 * this.deadT);
      this.body.rotation.x = -1.48 * t;
      this.body.position.y = -0.12 * t;
      this.hips.rotation.x = 0.2 * t;
      this.armL.rotation.set(-0.4 * t, 0, -0.9 * t);
      this.armR.rotation.set(-0.4 * t, 0, 0.9 * t);
      this.legL.rotation.x = 0.35 * t; this.legR.rotation.x = -0.2 * t;
      this.kneeL.rotation.x = -0.5 * t; this.kneeR.rotation.x = -0.3 * t;
      return;
    }

    const run = Math.min(1, this.speedNow / CFG.SPRINT);
    const moving = this.speedNow > 0.5;

    // 걸음 위상: 빠를수록 빠르게
    this.stepPhase += dt * (2.6 + run * 8.5) * (moving ? 1 : 0);
    const sw = Math.sin(this.stepPhase), sw2 = Math.sin(this.stepPhase * 2);
    const amp = 0.28 + run * 0.62;

    // 총을 들었거나 정조준하면 상체를 세우고 팔을 앞으로
    const wantAim = this.gun ? (aiming ? 1 : 0.72) : 0;
    this.aimBlend += (wantAim - this.aimBlend) * Math.min(1, dt * 8);

    // 다리
    const legAmp = this.crouch ? amp * 0.5 : amp;
    this.legL.rotation.x = sw * legAmp;
    this.legR.rotation.x = -sw * legAmp;
    this.kneeL.rotation.x = -Math.max(0, -sw) * (0.5 + run * 0.9) - (this.crouch ? 1.15 : 0);
    this.kneeR.rotation.x = -Math.max(0, sw) * (0.5 + run * 0.9) - (this.crouch ? 1.15 : 0);
    if (this.crouch) { this.legL.rotation.x -= 0.75; this.legR.rotation.x -= 0.75; }

    if (!this.grounded) {                  // 공중 자세
      this.legL.rotation.x = -0.55; this.legR.rotation.x = 0.3;
      this.kneeL.rotation.x = -0.9; this.kneeR.rotation.x = -0.35;
    }

    // 팔: 무기를 들면 앞으로 모으고, 맨손이면 앞뒤로 흔듭니다
    const a = this.aimBlend;
    const swingL = -sw * amp * 0.85 * (1 - a);
    const swingR = sw * amp * 0.85 * (1 - a);
    this.armL.rotation.x = swingL - a * (1.34 + (aiming ? 0.22 : 0));
    this.armR.rotation.x = swingR - a * (1.42 + (aiming ? 0.18 : 0)) - this.recoil * 0.35;
    this.armL.rotation.z = -a * 0.62;      // 왼팔은 안쪽으로 모아 총을 받칩니다
    this.armR.rotation.z = a * 0.16;
    this.armL.rotation.y = -a * 0.34;
    this.armR.rotation.y = a * 0.10;

    // 재장전하면 왼팔을 탄창 쪽으로
    if (this.reloading > 0) {
      const r = Math.sin((1 - this.reloading / this.spec.reload) * Math.PI);
      this.armL.rotation.x -= r * 0.55;
      this.armL.rotation.z += r * 0.35;
    }
    // 치료 중이면 두 팔을 몸 앞으로
    if (this.healing > 0) {
      this.armL.rotation.set(-1.7, 0, -0.5);
      this.armR.rotation.set(-1.7, 0, 0.5);
    }

    // 몸통: 위아래로 흔들리고 달릴수록 앞으로 기울임
    const targetLean = run * 0.22 + (this.crouch ? 0.25 : 0);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 7);
    this.hips.rotation.x = this.lean * 0.5;
    this.hips.rotation.z = moving ? sw * 0.05 * (1 - a * 0.5) : 0;
    this.body.rotation.x = 0;
    this.body.rotation.z = 0;
    this.body.position.y = (this.crouch ? -0.34 : 0) + (moving ? Math.abs(sw2) * 0.035 * run : Math.sin(this.stepPhase * 0.6) * 0.008);

    // 팔 회전을 상쇄해 총이 늘 앞을 향하게 하고, 시선 위아래를 반영합니다
    this.gunMount.rotation.x = -this.armR.rotation.x - this.pitch * 0.8 - 0.06;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 7);
  }
}
