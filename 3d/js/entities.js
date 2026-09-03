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

  /* 조각을 눌러 납작하게 (사람 몸통처럼 타원으로 만들 때 씁니다) */
  sc(part, sx, sy, sz) { part.sx = sx; part.sy = sy == null ? 1 : sy; part.sz = sz == null ? sx : sz; return part; },

  /* 조각 배열 → 정점 색이 들어간 하나의 지오메트리 */
  merge(parts) {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    for (const p of parts) {
      this._e.set(p.rx, p.ry, p.rz);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q,
                      this._s.set(p.sx || 1, p.sy || 1, p.sz || 1));
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

  geo(key, scope, skinKey) {
    const sk = GUN_SKINS[skinKey] || GUN_SKINS.stock;
    const id = key + ':' + (scope || 0) + ':' + (skinKey || 'stock');
    if (!this.cache[id]) {
      const parts = this.parts(key, sk);
      if (scope > 1) parts.push.apply(parts, this.scopeParts(scope, sk));
      this.cache[id] = Build.merge(parts);
    }
    return this.cache[id];
  },

  /* 무기 위에 얹는 조준경 (배율이 클수록 길고 큽니다) */
  scopeParts(level, sk) {
    const B = Build, D = (sk || GUN_SKINS.stock).dark, M = (sk || GUN_SKINS.stock).metal;
    const tint = SCOPES[level].color;
    if (level <= 2) return [                       // 레드도트
      B.box(0.05, 0.055, 0.05, D, 0, 0.115, -0.02),
      B.box(0.075, 0.09, 0.09, D, 0, 0.185, 0.0),
      B.box(0.055, 0.065, 0.012, tint, 0, 0.185, 0.045)
    ];
    const len = level >= 8 ? 0.30 : 0.22;
    const rad = level >= 8 ? 0.042 : 0.034;
    return [
      B.tube(rad, len, D, 0, 0.175, 0.03),
      B.tube(rad * 1.25, 0.035, M, 0, 0.175, 0.03 + len / 2),
      B.box(0.03, 0.07, 0.03, D, 0, 0.12, 0.03 - len / 2 + 0.04),
      B.box(0.03, 0.07, 0.03, D, 0, 0.12, 0.03 + len / 2 - 0.04),
      B.box(0.02, 0.016, 0.02, tint, 0, 0.215, 0.03)
    ];
  },

  parts(key, sk) {
    sk = sk || GUN_SKINS.stock;
    const B = Build, M = sk.metal, D = sk.dark, W = sk.wood, O = this.OLIVE;
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
        B.box(0.05, 0.022, 0.30, A, 0, 0.088, 0.02)
      ];
      case 'sniper': return [
        B.box(0.08, 0.13, 0.42, O, 0, 0.02, 0.04),
        B.tube(0.021, 0.58, M, 0, 0.03, 0.54),
        B.box(0.055, 0.055, 0.10, D, 0, 0.03, 0.85),
        B.box(0.075, 0.15, 0.42, O, 0, -0.02, -0.34, -0.04),
        B.box(0.05, 0.12, 0.10, D, 0, -0.10, 0.06),
        B.box(0.05, 0.024, 0.34, A, 0, 0.095, 0.06),
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

  geo(kind, gun, level) {
    const key = kind + ':' + (gun || '') + ':' + (level || 0);
    if (!this.cache[key]) {
      if (kind === 'gun') this.cache[key] = GunArt.geo(gun, 0);
      else if (kind === 'ammo') this.cache[key] = Build.merge(this.ammoParts(gun));
      else if (kind === 'scope') this.cache[key] = Build.merge(this.scopeItemParts(level));
      else this.cache[key] = Build.merge(this.medParts());
    }
    return this.cache[key];
  },

  /* 바닥에 떨어진 조준경 */
  scopeItemParts(level) {
    const B = Build, D = 0x25282e, M = 0x3d434b;
    const tint = SCOPES[level].color;
    if (level <= 2) return [
      B.box(0.20, 0.20, 0.16, D, 0, 0.12, 0),
      B.box(0.15, 0.15, 0.02, tint, 0, 0.12, 0.09),
      B.box(0.13, 0.05, 0.13, M, 0, 0.01, 0)
    ];
    const len = level >= 8 ? 0.46 : 0.34;
    return [
      B.tube(level >= 8 ? 0.075 : 0.06, len, D, 0, 0.13, 0),
      B.tube(level >= 8 ? 0.095 : 0.08, 0.06, M, 0, 0.13, len / 2),
      B.tube(0.055, 0.05, tint, 0, 0.13, -len / 2 - 0.01),
      B.box(0.05, 0.09, 0.05, M, 0, 0.05, len * 0.2),
      B.box(0.05, 0.09, 0.05, M, 0, 0.05, -len * 0.2)
    ];
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
  constructor(x, z, kind, gun, amount, level) {
    const y = World.height(x, z);
    this.pos = new THREE.Vector3(x, y, z);
    this.kind = kind;                 // 'gun' | 'ammo' | 'med' | 'scope'
    this.gun = gun || null;
    this.amount = amount || 0;
    this.level = level || 0;          // 조준경 배율
    this.dead = false;
    this.spin = Math.random() * Math.PI * 2;

    const color = kind === 'gun' ? GUNS[gun].color
      : (kind === 'ammo' ? 0xf2cc60 : (kind === 'scope' ? SCOPES[this.level].color : 0xff6b6b));
    this.color = color;

    this.mesh = new THREE.Group();
    this.model = new THREE.Mesh(LootArt.geo(kind, gun, this.level), Mats.vc({ roughness: 0.55, metalness: 0.25 }));
    this.model.castShadow = true;
    this.model.position.y = kind === 'gun' ? 0.55 : (kind === 'scope' ? 0.45 : 0.35);
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
    if (this.kind === 'scope') return SCOPES[this.level].name + ' (' + SCOPES[this.level].label + ')';
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
    const base = this.kind === 'gun' ? 0.55 : (this.kind === 'scope' ? 0.45 : 0.35);
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

  /* 스킨별 지오메트리 (같은 스킨을 입은 캐릭터끼리 공유) */
  get(skin) {
    const key = skin.name || 'default';
    if (!this.cache[key]) this.cache[key] = this.build(skin);
    return this.cache[key];
  },

  /* 사람 비율에 맞춘 저폴리 인체
     키 1.8m 기준: 골반 0.92, 어깨 1.54, 눈 1.62, 정수리 1.80 */
  build(S) {
    const B = Build, sc = B.sc.bind(B);
    const top = S.top, pants = S.pants, vest = S.vest || 0x4a4a42;
    const boots = S.boots || 0x24262b, tone = S.tone || 0xc39a72, hair = S.hair || 0x2b2119;
    const gear = 0x2a2d33;

    /* 몸통 (골반 그룹 기준) */
    const torsoParts = [
      sc(B.pillar(0.155, 0.145, 0.20, pants, 0, 0.09, 0), 1, 1, 0.72),      // 골반
      B.box(0.33, 0.055, 0.24, gear, 0, 0.19, 0),                            // 허리띠
      sc(B.pillar(0.145, 0.183, 0.30, top, 0, 0.36, 0), 1, 1, 0.72),         // 배
      sc(B.pillar(0.183, 0.192, 0.24, top, 0, 0.61, 0), 1, 1, 0.70),         // 가슴
      sc(B.pillar(0.196, 0.20, 0.30, vest, 0, 0.55, 0.004), 1, 1, 0.76),     // 방탄조끼
      sc(B.pillar(0.20, 0.19, 0.06, gear, 0, 0.40, 0.004), 1, 1, 0.78),      // 조끼 아래단
      B.box(0.085, 0.24, 0.30, gear, -0.145, 0.615, 0),                      // 어깨끈
      B.box(0.085, 0.24, 0.30, gear, 0.145, 0.615, 0),
      B.box(0.13, 0.10, 0.07, gear, 0, 0.45, 0.15),                          // 탄창 주머니
      B.box(0.10, 0.08, 0.06, gear, -0.13, 0.44, 0.14),
      sc(B.sphere(0.098, top, -0.202, 0.60, 0), 1, 0.95, 1),                 // 어깨
      sc(B.sphere(0.098, top, 0.202, 0.60, 0), 1, 0.95, 1),
      B.box(0.28, 0.34, 0.15, 0x4a4a3e, 0, 0.46, -0.20),                     // 배낭
      B.box(0.30, 0.09, 0.17, gear, 0, 0.30, -0.20),
      sc(B.pillar(0.058, 0.065, 0.10, tone, 0, 0.72, 0), 1, 1, 1),           // 목
      sc(B.sphere(0.115, tone, 0, 0.845, 0.005), 1, 1.1, 0.97),              // 머리
      B.box(0.155, 0.10, 0.16, tone, 0, 0.785, 0.02),                        // 턱
      sc(B.sphere(0.03, tone, -0.113, 0.845, 0), 0.6, 1, 1),                 // 귀
      sc(B.sphere(0.03, tone, 0.113, 0.845, 0), 0.6, 1, 1),
      sc(B.sphere(0.121, hair, 0, 0.872, -0.012), 1, 0.82, 1),               // 머리카락
      sc(B.sphere(0.10, hair, 0, 0.815, -0.055), 1, 0.7, 1),                 // 뒷머리
      B.box(0.03, 0.038, 0.03, tone, 0, 0.828, 0.108),                       // 코
      B.box(0.035, 0.026, 0.02, 0x1a1a20, -0.048, 0.855, 0.104),             // 눈
      B.box(0.035, 0.026, 0.02, 0x1a1a20, 0.048, 0.855, 0.104),
      B.box(0.046, 0.013, 0.02, hair, -0.048, 0.888, 0.103),                 // 눈썹
      B.box(0.046, 0.013, 0.02, hair, 0.048, 0.888, 0.103),
      B.box(0.048, 0.012, 0.02, 0x8a5148, 0, 0.792, 0.096)                   // 입
    ];
    if (S.helmet) {                                                          // 헬멧
      torsoParts.push(sc(B.sphere(0.133, S.helmet, 0, 0.872, 0), 1, 0.78, 1.02));
      torsoParts.push(B.box(0.26, 0.03, 0.10, S.helmet, 0, 0.855, 0.10));
      torsoParts.push(B.box(0.05, 0.05, 0.06, gear, 0.12, 0.885, 0.02));
    }

    /* 팔 (어깨 관절이 원점) */
    const arm = [
      sc(B.sphere(0.072, top, 0, -0.02, 0), 1, 1, 1),                        // 어깨 이음새
      sc(B.pillar(0.066, 0.052, 0.30, top, 0, -0.17, 0), 1, 1, 1),           // 윗팔
      B.sphere(0.05, top, 0, -0.32, 0),                                      // 팔꿈치
      sc(B.pillar(0.05, 0.043, 0.28, top, 0, -0.46, 0.005), 1, 1, 1),        // 아래팔
      B.box(0.072, 0.045, 0.08, gear, 0, -0.60, 0.005),                      // 손목
      B.box(0.078, 0.10, 0.085, gear, 0, -0.655, 0.012)                      // 장갑
    ];

    /* 다리 (엉덩이 관절이 원점, 무릎은 -0.44) */
    const thigh = [
      sc(B.pillar(0.098, 0.078, 0.42, pants, 0, -0.21, 0), 1, 1, 0.95),
      B.sphere(0.072, pants, 0, -0.42, 0),                                   // 무릎
      B.box(0.10, 0.09, 0.045, gear, 0, -0.41, 0.062)                        // 무릎 보호대
    ];
    const shin = [
      sc(B.pillar(0.074, 0.06, 0.34, pants, 0, -0.17, 0), 1, 1, 0.95),
      B.box(0.108, 0.16, 0.115, boots, 0, -0.40, 0),                         // 군화 목
      B.box(0.115, 0.09, 0.24, boots, 0, -0.475, 0.03),
      B.box(0.10, 0.06, 0.09, boots, 0, -0.49, 0.15)
    ];

    return {
      torso: B.merge(torsoParts),
      arm: B.merge(arm),
      thigh: B.merge(thigh),
      shin: B.merge(shin)
    };
  }
};

/* 낙하산: 돔 지붕 + 줄 */
const ChuteArt = {
  geo: null,
  build() {
    if (this.geo) return this.geo;
    const dome = new THREE.SphereGeometry(2.7, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    dome.scale(1, 0.62, 1);
    const nd = dome.index ? dome.toNonIndexed() : dome;
    const pos = nd.attributes.position, nor = nd.attributes.normal;
    const positions = [], normals = [], colors = [];
    const a = new THREE.Color(0xe8552f).convertSRGBToLinear();
    const b = new THREE.Color(0xf2f0e6).convertSRGBToLinear();
    for (let i = 0; i < pos.count; i += 3) {
      // 삼각형마다 방위각을 보고 색을 번갈아 칠합니다
      let mx = 0, mz = 0;
      for (let k = 0; k < 3; k++) { mx += pos.getX(i + k); mz += pos.getZ(i + k); }
      const ang = Math.atan2(mz / 3, mx / 3);
      const slice = Math.floor((ang + Math.PI) / (Math.PI * 2) * 8);
      const c = slice % 2 ? a : b;
      for (let k = 0; k < 3; k++) {
        positions.push(pos.getX(i + k), pos.getY(i + k) + 3.1, pos.getZ(i + k));
        normals.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
        colors.push(c.r, c.g, c.b);
      }
    }
    dome.dispose(); if (nd !== dome) nd.dispose();

    // 줄: 어깨에서 지붕 가장자리로
    const lineParts = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const x = Math.cos(ang) * 1.35, z = Math.sin(ang) * 1.35;
      lineParts.push(Build.box(0.045, 3.0, 0.045, 0xd8d4c8, x, 1.7, z,
                               Math.atan2(z, 1.7) * 0.55, 0, -Math.atan2(x, 1.7) * 0.55));
    }
    const lines = Build.merge(lineParts);
    const lp = lines.attributes.position, ln = lines.attributes.normal, lc = lines.attributes.color;
    for (let i = 0; i < lp.count; i++) {
      positions.push(lp.getX(i), lp.getY(i), lp.getZ(i));
      normals.push(ln.getX(i), ln.getY(i), ln.getZ(i));
      colors.push(lc.getX(i), lc.getY(i), lc.getZ(i));
    }
    lines.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    this.geo = geo;
    return geo;
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
    this.flying = null;            // 'freefall' | 'chute' | null
    this.chuteTilt = 0;
    this.speedNow = 0;
    this.stepPhase = 0;
    this.speedSmooth = 0;
    this.aimBlend = 0;
    this.victory = 0;
    this.pose = {
      legLx: 0, legRx: 0, legLz: 0, legRz: 0, kneeLx: 0, kneeRx: 0,
      armLx: 0, armLy: 0, armLz: 0, armRx: 0, armRy: 0, armRz: 0,
      hipsX: 0, hipsZ: 0, bodyX: 0, bodyZ: 0, bodyY: 0, gunX: 0
    };

    this.guns = [null, null];      // 무기 두 칸
    this.mags = [0, 0];
    this.scopes = [0, 0];          // 칸마다 달린 조준경 배율 (0 = 없음)
    this.scopeOff = [false, false]; // 조준경을 떼어 둔 상태
    this.slot = 0;
    this.swap = 0;                 // 교체 중 남은 시간
    this.reserve = {};
    this.meds = isPlayer ? 1 : 1 + Math.floor(Math.random() * 2);
    this.reloading = 0;
    this.cooldown = 0;
    this.healing = 0;
    this.hitFlash = 0;
    this.recoil = 0;

    this.gunSkin = 'stock';
    this.buildMesh(outfit || OUTFITS[0]);

    this.ai = isPlayer ? null : {
      state: 'loot', target: null, reaction: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random(),
      dest: null, destT: 0, skill: 0.3 + Math.random() * 0.62,
      think: Math.random() * 0.2
    };
  }

  buildMesh(outfit) {
    const art = CharArt.get(outfit);
    const mat = Mats.vc({ roughness: 0.82, metalness: 0.02 });
    const mesh = m => { const o = new THREE.Mesh(m, mat); o.castShadow = true; return o; };

    this.mesh = new THREE.Group();
    this.body = new THREE.Group();          // 사망 연출용 회전축
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;

    this.torso = mesh(art.torso);
    this.hips.add(this.torso);

    // 정면이 +Z 이므로 캐릭터의 오른쪽은 로컬 -X 입니다
    this.armR = new THREE.Group(); this.armR.position.set(-0.21, 0.615, 0);
    this.armL = new THREE.Group(); this.armL.position.set(0.21, 0.615, 0);
    this.armL.add(mesh(art.arm)); this.armR.add(mesh(art.arm));
    this.hips.add(this.armL); this.hips.add(this.armR);

    // 총은 오른손 앞에 붙입니다
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(-0.02, -0.60, 0.22);
    this.armR.add(this.gunMount);
    this.gunMesh = null;

    // 등에 메는 두 번째 무기
    this.backMount = new THREE.Group();
    this.backMount.position.set(0.05, 0.50, -0.30);
    this.backMount.rotation.set(Math.PI / 2, 0.25, 0.6);
    this.hips.add(this.backMount);
    this.backMesh = null;

    this.legL = new THREE.Group(); this.legL.position.set(-0.105, 0.92, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.105, 0.92, 0);
    this.kneeL = new THREE.Group(); this.kneeL.position.y = -0.44;
    this.kneeR = new THREE.Group(); this.kneeR.position.y = -0.44;
    this.legL.add(mesh(art.thigh)); this.legL.add(this.kneeL); this.kneeL.add(mesh(art.shin));
    this.legR.add(mesh(art.thigh)); this.legR.add(this.kneeR); this.kneeR.add(mesh(art.shin));

    this.body.add(this.hips); this.body.add(this.legL); this.body.add(this.legR);
    this.mesh.add(this.body);

    // 낙하산 (필요할 때만 보이게)
    this.chute = new THREE.Mesh(ChuteArt.build(), Mats.vc({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    this.chute.castShadow = true;
    this.chute.position.y = 1.7;
    this.chute.visible = false;
    this.mesh.add(this.chute);

    this.mesh.position.copy(this.pos);
  }

  /* 현재 든 무기 — 기존 코드가 그대로 쓰도록 접근자로 감쌉니다 */
  get gun() { return this.guns[this.slot]; }
  set gun(v) { this.guns[this.slot] = v; }
  get mag() { return this.mags[this.slot]; }
  set mag(v) { this.mags[this.slot] = v; }
  get other() { return this.guns[1 - this.slot]; }
  get zoom() {
    if (!this.gun || this.scopeOff[this.slot]) return 1;
    return this.scopes[this.slot] || 1;
  }
  get scopeStowed() { return !!(this.scopes[this.slot] && this.scopeOff[this.slot]); }
  get hasTwo() { return !!(this.guns[0] && this.guns[1]); }

  get spec() { return this.gun ? GUNS[this.gun] : null; }
  get reserveAmmo() { return this.gun ? (this.reserve[this.gun] || 0) : 0; }
  get eyeY() { return this.pos.y + (this.crouch ? 1.18 : CFG.EYE); }

  forward(out) {
    return (out || new THREE.Vector3()).set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /* 빈 칸이 있으면 그쪽에, 없으면 지금 든 칸에 넣습니다. 넣은 칸 번호를 돌려줍니다 */
  giveGun(key, ammo) {
    let idx = this.guns.indexOf(null);
    if (idx < 0) idx = this.slot;
    this.guns[idx] = key;
    this.mags[idx] = GUNS[key].mag;
    this.scopes[idx] = 0;
    this.scopeOff[idx] = false;
    this.reserve[key] = (this.reserve[key] || 0) + (ammo == null ? GUNS[key].ammoPer : ammo);
    this.reloading = 0;
    this.slot = idx;
    this.refreshGuns();
    return idx;
  }

  /* 무기 칸 전환 */
  selectSlot(idx) {
    if (idx === this.slot || !this.guns[idx] || this.dead || this.flying) return false;
    this.slot = idx;
    this.reloading = 0;
    this.swap = CFG.SWAP_TIME;
    this.refreshGuns();
    return true;
  }
  swapSlot() { return this.selectSlot(1 - this.slot); }

  /* 든 무기와 등에 멘 무기 모델을 다시 붙입니다 */
  /* 지금 든 무기에 조준경을 답니다. 이전 조준경 배율을 돌려줍니다 (없으면 0) */
  attachScope(level) {
    if (!this.gun || !GUNS[this.gun].canScope) return -1;
    const old = this.scopes[this.slot] || 0;
    if (old === level) return -1;
    this.scopes[this.slot] = level;
    this.refreshGuns();
    return old;
  }

  /* 조준경을 떼거나 다시 붙입니다. 상태(붙임/뗌)를 돌려줍니다 */
  toggleScope() {
    if (!this.gun || !this.scopes[this.slot]) return null;
    this.scopeOff[this.slot] = !this.scopeOff[this.slot];
    this.refreshGuns();
    return !this.scopeOff[this.slot];
  }

  refreshGuns() {
    const mat = Mats.vc({ roughness: 0.55, metalness: 0.25 });
    if (this.gunMesh) { this.gunMount.remove(this.gunMesh); this.gunMesh = null; }
    if (this.backMesh) { this.backMount.remove(this.backMesh); this.backMesh = null; }
    if (this.gun) {
      this.gunMesh = new THREE.Mesh(GunArt.geo(this.gun, this.scopeOff[this.slot] ? 0 : this.scopes[this.slot], this.gunSkin), mat);
      this.gunMesh.castShadow = true;
      this.gunMesh.position.set(0, 0, 0.06);    // 총구는 앞(+Z)
      this.gunMount.add(this.gunMesh);
    }
    if (this.other) {                            // 남는 무기는 등에 멥니다
      this.backMesh = new THREE.Mesh(GunArt.geo(this.other, this.scopeOff[1 - this.slot] ? 0 : this.scopes[1 - this.slot], this.gunSkin), mat);
      this.backMesh.castShadow = true;
      this.backMount.add(this.backMesh);
    }
  }

  canShoot() {
    return !this.dead && !this.flying && this.gun && this.mag > 0 && this.cooldown <= 0 &&
           this.reloading <= 0 && this.healing <= 0 && this.swap <= 0;
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

  /* ---------- 자세와 애니메이션 ----------
     상태별 '기본 자세'는 부드럽게 따라가고(감속 보간), 걷기 같은 주기 동작은
     보간 뒤에 더해 또렷하게 남깁니다. 상태가 바뀌어도 자세가 튀지 않습니다. */
  syncMesh(dt, aiming) {
    const mesh = this.mesh;
    mesh.position.copy(this.pos);
    mesh.rotation.y = this.yaw;

    // 속도와 조준 정도를 부드럽게
    this.speedSmooth += (this.speedNow - this.speedSmooth) * Math.min(1, dt * 9);
    const run = Math.min(1, this.speedSmooth / CFG.SPRINT);
    const mv = Math.min(1, this.speedSmooth / 1.8);   // 걷기 정도 (0~1, 부드럽게 변합니다)
    const moving = mv > 0.35;

    const t = this._t || (this._t = {});
    let rate = 15;                                   // 기본 보간 속도
    let swing = 0, swingAmp = 0, kneeL = 0, kneeR = 0, bob = 0;

    if (this.dead) {                                  // 쓰러짐
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const d = this.deadT * this.deadT * (3 - 2 * this.deadT);
      t.bodyX = -1.48 * d; t.bodyZ = 0; t.bodyY = -0.12 * d;
      t.hipsX = 0.2 * d; t.hipsZ = 0;
      t.armLx = -0.4 * d; t.armLy = 0; t.armLz = 0.9 * d;
      t.armRx = -0.4 * d; t.armRy = 0; t.armRz = -0.9 * d;
      t.legLx = 0.35 * d; t.legRx = -0.2 * d; t.legLz = 0.1 * d; t.legRz = -0.1 * d;
      t.kneeLx = -0.5 * d; t.kneeRx = -0.3 * d;
      t.gunX = 0;
      rate = 9;
      this.chute.visible = false;
    } else if (this.flying) {                         // 낙하
      this.chute.visible = this.flying === 'chute';
      const free = this.flying === 'freefall';
      t.bodyX = free ? -1.15 : 0.14 + (this.chutePitch || 0) * 0.18;
      t.bodyZ = free ? 0 : -this.chuteTilt * 0.5;
      t.bodyY = free ? 0.55 : 0;
      t.hipsX = 0; t.hipsZ = 0;
      t.armLx = free ? -1.25 : -2.45; t.armLz = free ? 0.95 : 0.5; t.armLy = 0;
      t.armRx = free ? -1.25 : -2.45; t.armRz = free ? -0.95 : -0.5; t.armRy = 0;
      t.legLx = free ? 0.3 : 0.4; t.legRx = free ? 0.3 : 0.22;
      t.legLz = free ? 0.32 : 0; t.legRz = free ? -0.32 : 0;
      t.kneeLx = free ? -0.55 : -0.75; t.kneeRx = free ? -0.55 : -0.5;
      t.gunX = 0;
      rate = 7;
      this.stepPhase += dt;
      if (!free) { this.chute.rotation.z = this.chuteTilt; this.chute.rotation.x = Math.sin(this.stepPhase * 0.6) * 0.04; }
    } else {
      this.chute.visible = false;
      const a = this.aimBlend;

      if (this.victory > 0) {                         // 승리 세리머니
        this.victory += dt;
        const v = this.victory;
        const hop = Math.max(0, Math.sin(v * 5.2));
        const wave = Math.sin(v * 6.5);
        t.bodyY = hop * 0.26;
        t.bodyX = -0.06; t.bodyZ = Math.sin(v * 2.6) * 0.07;
        t.hipsX = -0.12; t.hipsZ = Math.sin(v * 2.6) * 0.1;
        t.armLx = -2.55 + wave * 0.25; t.armLz = 0.42 + wave * 0.12; t.armLy = 0.2;
        t.armRx = -2.55 - wave * 0.25; t.armRz = -0.42 + wave * 0.12; t.armRy = -0.2;
        t.legLx = -hop * 0.35; t.legRx = -hop * 0.35;
        t.legLz = 0.08; t.legRz = -0.08;
        t.kneeLx = -hop * 0.8; t.kneeRx = -hop * 0.8;
        t.gunX = 0.5;
        rate = 11;
      } else {
        // 걷기 주기: 빠를수록 빨라집니다
        this.stepPhase += dt * (2.6 + run * 8.2) * (0.28 + 0.72 * mv);
        swing = Math.sin(this.stepPhase);
        const sw2 = Math.sin(this.stepPhase * 2);
        swingAmp = (0.26 + run * 0.6) * (this.crouch ? 0.5 : 1) * (0.04 + 0.96 * mv);
        kneeL = -Math.max(0, -swing) * (0.45 + run * 0.85) * (0.08 + 0.92 * mv);
        kneeR = -Math.max(0, swing) * (0.45 + run * 0.85) * (0.08 + 0.92 * mv);
        bob = Math.abs(sw2) * 0.035 * run * mv + Math.sin(this.stepPhase * 0.5) * 0.01 * (1 - mv);

        const wantAim = this.gun ? (aiming ? 1 : 0.72) : 0;
        this.aimBlend += (wantAim - this.aimBlend) * Math.min(1, dt * 7);
        const aa = this.aimBlend;

        t.legLx = this.crouch ? -0.75 : 0;
        t.legRx = this.crouch ? -0.75 : 0;
        t.legLz = 0; t.legRz = 0;
        t.kneeLx = this.crouch ? -1.15 : 0;
        t.kneeRx = this.crouch ? -1.15 : 0;
        if (!this.grounded) {                          // 공중
          t.legLx = -0.5; t.legRx = 0.28;
          t.kneeLx = -0.85; t.kneeRx = -0.32;
        }

        t.armLx = -aa * (1.34 + (aiming ? 0.22 : 0));
        t.armRx = -aa * (1.42 + (aiming ? 0.18 : 0)) - this.recoil * 0.35;
        t.armLz = -aa * 0.62; t.armRz = aa * 0.16;
        t.armLy = -aa * 0.34; t.armRy = aa * 0.10;

        if (this.reloading > 0) {                      // 재장전: 왼손이 탄창으로
          const r = Math.sin((1 - this.reloading / this.spec.reload) * Math.PI);
          t.armLx -= r * 0.55; t.armLz += r * 0.35;
        }
        if (this.healing > 0) {                        // 치료: 두 손을 앞으로
          t.armLx = -1.7; t.armLz = -0.5; t.armLy = 0;
          t.armRx = -1.7; t.armRz = 0.5; t.armRy = 0;
        }
        if (this.swap > 0) {                           // 무기 교체: 총을 내렸다 올림
          const s = Math.sin((1 - this.swap / CFG.SWAP_TIME) * Math.PI);
          t.armRx += s * 0.9; t.armLx += s * 0.7;
        }

        const lean = run * 0.22 + (this.crouch ? 0.25 : 0);
        t.hipsX = lean * 0.5;
        t.hipsZ = 0;
        t.bodyX = 0; t.bodyZ = 0;
        t.bodyY = (this.crouch ? -0.34 : 0) + bob;
        t.gunX = 0;
        rate = 16;
      }
    }

    // 목표 자세로 부드럽게 (프레임 수와 무관한 감속 보간)
    const p = this.pose;
    const k = 1 - Math.exp(-rate * Math.max(dt, 0.0001));
    for (const key in t) p[key] += ((t[key] || 0) - p[key]) * k;

    // 보간된 기본 자세 + 걷기 흔들림
    this.legL.rotation.set(p.legLx + swing * swingAmp, 0, p.legLz);
    this.legR.rotation.set(p.legRx - swing * swingAmp, 0, p.legRz);
    this.kneeL.rotation.x = p.kneeLx + kneeL;
    this.kneeR.rotation.x = p.kneeRx + kneeR;

    const armSwing = swing * swingAmp * 0.85 * (1 - this.aimBlend);
    this.armL.rotation.set(p.armLx - armSwing, p.armLy, p.armLz);
    this.armR.rotation.set(p.armRx + armSwing, p.armRy, p.armRz);

    this.hips.rotation.set(p.hipsX, 0, p.hipsZ + swing * 0.04 * mv * (1 - this.aimBlend * 0.5));
    this.body.rotation.set(p.bodyX, 0, p.bodyZ);
    this.body.position.y = p.bodyY;

    // 총구는 팔 회전을 상쇄해 늘 앞을 봅니다
    this.gunMount.rotation.x = -this.armR.rotation.x - this.pitch * 0.8 - 0.06 + p.gunX;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 7);
  }
}
