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
  sphere(r, color, x, y, z, sx, sy, sz, seg) {
    const g = new THREE.SphereGeometry(r, seg || 10, Math.round((seg || 10) * 0.7));
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
      else if (kind === 'vest') this.cache[key] = Build.merge(this.vestParts(level));
      else if (kind === 'bag') this.cache[key] = Build.merge(this.bagParts(level));
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

  /* 바닥에 떨어진 방탄조끼 */
  vestParts(level) {
    const B = Build, c = VESTS[level].color, strap = 0x2a2d33, tag = 0xf0c453;
    const parts = [
      B.box(0.34, 0.40, 0.16, c, 0, 0.30, 0),              // 몸판
      B.box(0.40, 0.13, 0.15, c, 0, 0.38, 0),              // 어깨 부분
      B.box(0.09, 0.42, 0.03, strap, -0.12, 0.30, 0.09),   // 앞 끈
      B.box(0.09, 0.42, 0.03, strap, 0.12, 0.30, 0.09),
      B.box(0.36, 0.07, 0.03, strap, 0, 0.16, 0.09),
      B.box(0.13, 0.10, 0.05, strap, 0, 0.30, 0.10)        // 탄창 주머니
    ];
    for (let i = 0; i < level; i++) parts.push(B.box(0.05, 0.05, 0.02, tag, -0.12 + i * 0.06, 0.47, 0.085));
    return parts;
  },

  /* 바닥에 떨어진 가방 */
  bagParts(level) {
    const B = Build, c = BAGS[level].color, strap = 0x2a2d33, tag = 0xf0c453;
    const w = 0.30 + level * 0.045, h = 0.30 + level * 0.06, dz = 0.20 + level * 0.03;
    const parts = [
      B.box(w, h, dz, c, 0, h / 2 + 0.02, 0),
      B.box(w * 0.9, h * 0.34, dz * 0.5, c, 0, h * 0.72, dz * 0.5),   // 위 주머니
      B.box(0.07, h * 0.9, 0.04, strap, -w * 0.28, h / 2, -dz / 2 - 0.02),
      B.box(0.07, h * 0.9, 0.04, strap, w * 0.28, h / 2, -dz / 2 - 0.02),
      B.box(w * 0.75, 0.06, 0.03, strap, 0, h * 0.42, dz / 2 + 0.01)
    ];
    for (let i = 0; i < level; i++) parts.push(B.box(0.045, 0.045, 0.02, tag, -0.09 + i * 0.07, h + 0.01, dz / 2));
    return parts;
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
    if (!this.beamGeo) this.beamGeo = new THREE.CylinderGeometry(0.26, 0.36, 2.8, 8, 1, true);
    return this.beamGeo;
  }
};

class Loot {
  /* fixedY 를 주면 그 높이에 그대로 놓습니다 (건물 2·3층 파밍용) */
  constructor(x, z, kind, gun, amount, level, fixedY) {
    const y = fixedY == null ? World.height(x, z) : fixedY;
    this.pos = new THREE.Vector3(x, y, z);
    this.kind = kind;                 // 'gun' | 'ammo' | 'med' | 'scope' | 'vest' | 'bag'
    this.gun = gun || null;
    this.amount = amount || 0;
    this.level = level || 0;          // 조준경 배율 / 방어구 등급
    this.dead = false;
    this.spin = Math.random() * Math.PI * 2;

    const color = kind === 'gun' ? GUNS[gun].color
      : (kind === 'ammo' ? 0xf2cc60
      : (kind === 'scope' ? SCOPES[this.level].color
      : (kind === 'vest' ? 0x9ecbff
      : (kind === 'bag' ? 0xc7a86b : 0xff6b6b))));
    this.color = color;

    this.mesh = new THREE.Group();
    this.model = new THREE.Mesh(LootArt.geo(kind, gun, this.level), Mats.vc({ roughness: 0.55, metalness: 0.25 }));
    this.model.castShadow = true;
    this.model.position.y = kind === 'gun' ? 0.55 : (kind === 'scope' ? 0.45 : 0.35);
    if (kind === 'gun') this.model.rotation.z = 0.22;

    this.beam = new THREE.Mesh(LootArt.beam(), new THREE.MeshBasicMaterial({
      color: srgb(color), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide
    }));
    this.beam.position.y = 1.45;

    this.mesh.add(this.model);
    this.mesh.add(this.beam);
    this.mesh.position.set(x, y, z);
  }

  get label() {
    if (this.kind === 'gun') return GUNS[this.gun].name + ' · ' + GUNS[this.gun].short;
    if (this.kind === 'ammo') return GUNS[this.gun].short + ' 탄약 ' + this.amount + '발';
    if (this.kind === 'scope') return SCOPES[this.level].name + ' (' + SCOPES[this.level].label + ')';
    if (this.kind === 'vest') return VESTS[this.level].name + ' (피해 -' + Math.round(VESTS[this.level].reduce * 100) + '%)';
    if (this.kind === 'bag') return BAGS[this.level].name + ' (구급상자 ' + BAGS[this.level].meds + '개)';
    return '구급상자';
  }

  /* dist: 카메라와의 거리 — 멀면 모델을 숨겨 그리기 비용을 아낍니다 */
  update(t, dist, highlighted) {
    // 멀면 그룹째 끕니다 (하위 메시까지 통째로 건너뛰어 훨씬 가볍습니다)
    const on = dist < 115;
    if (this.mesh.visible !== on) this.mesh.visible = on;
    if (!on) return;
    const near = dist < 48;
    if (this.model.visible !== near) this.model.visible = near;
    if (this.beam.visible !== on) this.beam.visible = on;
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

  /* 폴가이즈풍 콩 몸매
     머리와 몸통이 이어진 달걀 하나 + 짧고 통통한 팔다리.
     좌표는 골반 그룹(월드 y = 0.52) 기준이고 정수리는 약 1.5m 입니다. */
  build(S) {
    const B = Build, sc = B.sc.bind(B);
    const body = S.top, pants = S.pants, boots = S.boots || 0x24262b;
    const trim = S.vest || 0x4a4a42;
    const face = S.face || 0xdcb894, dark = 0x24272d;
    const cap = S.helmet || S.hair || 0x2b2119;

    /* 몸통: 머리까지 하나로 이어진 큰 달걀 */
    const torsoParts = [
      B.sphere(0.35, body, 0, 0.45, 0, 1.0, 1.5, 0.94, 16),        // 콩 본체
      B.sphere(0.356, trim, 0, 0.29, 0, 1.0, 0.30, 0.96, 16),             // 옷 허리 띠

      /* 얼굴: 앞쪽으로 살짝 튀어나온 타원판 */
      B.sphere(0.205, face, 0, 0.765, 0.225, 0.82, 0.88, 0.42, 14),

      /* 큰 눈 */
      B.sphere(0.085, 0xffffff, -0.094, 0.792, 0.295, 0.95, 1.15, 0.60, 10),
      B.sphere(0.085, 0xffffff, 0.094, 0.792, 0.295, 0.95, 1.15, 0.60, 10),
      B.sphere(0.045, 0x191c22, -0.094, 0.784, 0.332, 1, 1.05, 0.55, 8),
      B.sphere(0.045, 0x191c22, 0.094, 0.784, 0.332, 1, 1.05, 0.55, 8),
      B.sphere(0.021, 0xffffff, -0.114, 0.820, 0.358, 1, 1, 0.5, 6),   // 눈 반짝임
      B.sphere(0.021, 0xffffff, 0.114, 0.820, 0.358, 1, 1, 0.5, 6),
      B.box(0.082, 0.019, 0.024, cap, -0.094, 0.880, 0.310, 0.24),     // 눈썹
      B.box(0.082, 0.019, 0.024, cap, 0.094, 0.880, 0.310, 0.24),

      /* 작은 입 */
      B.sphere(0.040, 0x7d3f3c, 0, 0.702, 0.312, 1, 0.55, 0.45, 8),

      /* 등에 멘 작은 가방 */
      B.sphere(0.16, trim, 0, 0.40, -0.235, 1, 1.15, 0.6, 8),
      B.box(0.20, 0.05, 0.06, dark, 0, 0.50, -0.235)
    ];

    if (S.helmet) {                                    // 챙 달린 모자
      torsoParts.push(B.sphere(0.245, S.helmet, 0, 0.885, 0.0, 1.02, 0.62, 1.0, 14));
      torsoParts.push(B.box(0.26, 0.035, 0.15, S.helmet, 0, 0.868, 0.175));
    } else {                                           // 모자가 없으면 머리카락
      torsoParts.push(B.sphere(0.235, S.hair || 0x2b2119, 0, 0.885, -0.01, 1.02, 0.60, 1.0, 12));
    }

    /* 팔: 어깨 관절이 원점, 짧고 통통하게 */
    const arm = [
      B.sphere(0.098, body, 0, -0.02, 0, 1, 1, 1, 8),
      B.pillar(0.090, 0.082, 0.22, body, 0, -0.13, 0),
      B.sphere(0.100, trim, 0, -0.27, 0.01, 1, 0.95, 1, 8)      // 장갑 낀 손
    ];

    /* 다리: 짧은 허벅지와 종아리, 둥근 신발 */
    const thigh = [
      B.pillar(0.118, 0.106, 0.26, pants, 0, -0.13, 0),
      B.sphere(0.108, pants, 0, -0.26, 0, 1, 1, 1, 8)
    ];
    const shin = [
      B.pillar(0.104, 0.098, 0.17, pants, 0, -0.085, 0),
      B.sphere(0.128, boots, 0, -0.185, 0.030, 1, 0.72, 1.28, 8)  // 신발
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
    this.vest = 0;                 // 방탄조끼 등급 (0 = 없음)
    this.bag = 0;                  // 가방 등급 (0 = 없음)
    this.vehicle = null;           // 타고 있는 차량
    this.climb = null;             // 기어오르는 중 { t, from, to }
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
    this.hips.position.y = 0.52;              // 다리가 짧아진 만큼 골반도 낮게

    this.torso = mesh(art.torso);
    this.hips.add(this.torso);

    // 정면이 +Z 이므로 캐릭터의 오른쪽은 로컬 -X 입니다
    this.armR = new THREE.Group(); this.armR.position.set(-0.325, 0.60, 0);
    this.armL = new THREE.Group(); this.armL.position.set(0.325, 0.60, 0);
    this.armL.add(mesh(art.arm)); this.armR.add(mesh(art.arm));
    this.hips.add(this.armL); this.hips.add(this.armR);

    // 총은 오른손 앞에 붙입니다
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(-0.02, -0.32, 0.17);
    this.armR.add(this.gunMount);
    this.gunMesh = null;

    // 등에 메는 두 번째 무기
    this.backMount = new THREE.Group();
    this.backMount.position.set(0.06, 0.60, -0.32);
    this.backMount.rotation.set(Math.PI / 2, 0.22, 0.55);
    this.hips.add(this.backMount);
    this.backMesh = null;

    this.legL = new THREE.Group(); this.legL.position.set(-0.145, 0.52, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.145, 0.52, 0);
    this.kneeL = new THREE.Group(); this.kneeL.position.y = -0.26;
    this.kneeR = new THREE.Group(); this.kneeR.position.y = -0.26;
    this.legL.add(mesh(art.thigh)); this.legL.add(this.kneeL); this.kneeL.add(mesh(art.shin));
    this.legR.add(mesh(art.thigh)); this.legR.add(this.kneeR); this.kneeR.add(mesh(art.shin));

    this.body.add(this.hips); this.body.add(this.legL); this.body.add(this.legR);
    this.mesh.add(this.body);

    // 낙하산은 실제로 펼 때 만듭니다 (평소에는 메시를 두지 않습니다)
    this.chute = { visible: false, rotation: { x: 0, y: 0, z: 0 } };

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
  get eyeY() { return this.pos.y + (this.crouch ? 0.98 : CFG.EYE); }

  /* 가방이 좋을수록 구급상자와 예비 탄약을 더 챙길 수 있습니다 */
  get medCap() { return CFG.MAX_MEDS + (this.bag ? BAGS[this.bag].meds : 0); }
  get ammoCap() { return CFG.BASE_AMMO_CAP + (this.bag ? BAGS[this.bag].ammo : 0); }
  /* 조끼가 막아 주는 피해 비율 */
  get armor() { return this.vest ? VESTS[this.vest].reduce : 0; }

  /* 탄약을 한도까지만 담습니다. 실제로 담은 양을 돌려줍니다 */
  addAmmo(key, n) {
    const have = this.reserve[key] || 0;
    const room = Math.max(0, this.ammoCap - have);
    const take = Math.min(n, room);
    this.reserve[key] = have + take;
    return take;
  }

  /* 방어구를 착용합니다. 이전에 입고 있던 등급(없으면 0)을 돌려줍니다 */
  wear(kind, level) {
    const cur = kind === 'vest' ? this.vest : this.bag;
    if (cur >= level) return -1;
    if (kind === 'vest') this.vest = level; else this.bag = level;
    this.refreshGear();
    return cur;
  }

  /* 조끼와 가방을 몸에 붙입니다 */
  refreshGear() {
    const B = Build, mat = Mats.vc({ roughness: 0.7, metalness: 0.05 });
    if (this.vestMesh) { this.hips.remove(this.vestMesh); this.vestMesh = null; }
    if (this.bagMesh) { this.hips.remove(this.bagMesh); this.bagMesh = null; }
    if (this.vest) {
      const c = VESTS[this.vest].color;
      const parts = [
        B.sphere(0.362, c, 0, 0.48, 0, 1.0, 0.62, 0.98, 14),          // 몸판
        B.sphere(0.345, 0x2a2d33, 0, 0.30, 0, 1.02, 0.16, 1.0, 12),   // 아래 띠
        B.box(0.10, 0.30, 0.05, 0x2a2d33, -0.13, 0.55, 0.29),         // 어깨 끈
        B.box(0.10, 0.30, 0.05, 0x2a2d33, 0.13, 0.55, 0.29),
        B.box(0.15, 0.11, 0.06, 0x2a2d33, 0, 0.42, 0.31)              // 탄창 주머니
      ];
      for (let i = 0; i < this.vest; i++) {
        parts.push(B.box(0.045, 0.045, 0.02, 0xf0c453, -0.05 + i * 0.05, 0.62, 0.33));
      }
      this.vestMesh = new THREE.Mesh(B.merge(parts), mat);
      this.vestMesh.castShadow = true;
      this.hips.add(this.vestMesh);
    }
    if (this.bag) {
      const c = BAGS[this.bag].color;
      const w = 0.34 + this.bag * 0.05, h = 0.34 + this.bag * 0.07, dz = 0.16 + this.bag * 0.035;
      const parts = [
        B.box(w, h, dz, c, 0, 0.44, -0.30 - dz / 2),
        B.box(w * 0.86, h * 0.32, dz * 0.6, c, 0, 0.44 + h * 0.24, -0.30 - dz * 0.9),
        B.box(w * 0.7, 0.05, 0.03, 0x2a2d33, 0, 0.40, -0.30 - dz - 0.01)
      ];
      this.bagMesh = new THREE.Mesh(B.merge(parts), mat);
      this.bagMesh.castShadow = true;
      this.hips.add(this.bagMesh);
    }
  }

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
    this.addAmmo(key, ammo == null ? GUNS[key].ammoPer : ammo);
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
      this.gunMesh.scale.setScalar(0.82);       // 몸집에 맞춘 크기
      this.gunMesh.position.set(0, 0, 0.06);    // 총구는 앞(+Z)
      this.gunMount.add(this.gunMesh);
    }
    if (this.other) {                            // 남는 무기는 등에 멥니다
      this.backMesh = new THREE.Mesh(GunArt.geo(this.other, this.scopeOff[1 - this.slot] ? 0 : this.scopes[1 - this.slot], this.gunSkin), mat);
      this.backMesh.castShadow = true;
      this.backMesh.scale.setScalar(0.74);
      this.backMesh.position.set(0, 0, -0.32);   // 등 뒤에서 몸통 길이에 맞게
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
    } else if (this.climb) {                          // 기어오르기
      const k = Math.min(1, this.climb.t / this.climb.dur);
      const pull = Math.sin(Math.min(1, k * 1.35) * Math.PI * 0.5);   // 팔로 당기는 구간
      t.armLx = -2.5 + pull * 1.1; t.armRx = -2.5 + pull * 1.1;
      t.armLz = 0.35; t.armRz = -0.35; t.armLy = 0.15; t.armRy = -0.15;
      t.legLx = -1.15 + pull * 1.0; t.legRx = -0.85 + pull * 0.8;
      t.kneeLx = -1.5 + pull * 1.3; t.kneeRx = -1.2 + pull * 1.0;
      t.legLz = 0.1; t.legRz = -0.1;
      t.bodyX = -0.35 + pull * 0.35; t.bodyZ = 0;
      t.bodyY = 0; t.hipsX = 0.2 - pull * 0.2; t.hipsZ = 0;
      t.gunX = 0;
      rate = 14;
    } else if (this.flying) {                         // 낙하
      if (this.flying === 'chute' && !this.chuteMesh) {
        this.chuteMesh = new THREE.Mesh(ChuteArt.build(),
          Mats.vc({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
        this.chuteMesh.castShadow = true;
        this.chuteMesh.position.y = 1.45;
        this.mesh.add(this.chuteMesh);
        this.chute = this.chuteMesh;
      }
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
      if (this.chuteMesh) {
        this.mesh.remove(this.chuteMesh);
        this.chuteMesh = null;
        this.chute = { visible: false, rotation: { x: 0, y: 0, z: 0 } };
      }
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
        t.bodyY = (this.crouch ? -0.20 : 0) + bob;
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

/* ============================================================
   차량: 넓어진 맵을 빠르게 이동하는 수단
   바퀴는 따로 두어 굴러가고 앞바퀴가 조향합니다.
   ============================================================ */
const VehicleArt = {
  cache: {},

  get(key) {
    if (!this.cache[key]) this.cache[key] = this.build(key);
    return this.cache[key];
  },

  build(key) {
    const B = Build;
    const spec = VEHICLES[key];
    const body = spec.color, dark = 0x24272d, glass = 0x5b7d94, metal = 0x9aa3ab;
    let parts, wheels;

    if (key === 'bike') {
      parts = [
        B.box(0.30, 0.22, 1.55, body, 0, 0.62, 0),               // 프레임
        B.box(0.44, 0.16, 0.55, dark, 0, 0.78, -0.20),           // 안장
        B.box(0.34, 0.30, 0.30, body, 0, 0.80, 0.55),            // 연료탱크
        B.box(0.62, 0.06, 0.10, dark, 0, 0.96, 0.72),            // 핸들
        B.box(0.16, 0.34, 0.10, glass, 0, 1.06, 0.80),           // 바람막이
        B.box(0.10, 0.42, 0.10, metal, 0, 0.72, 0.74, 0.35),     // 앞 포크
        B.box(0.24, 0.20, 0.36, dark, 0, 0.50, -0.62)            // 뒤 짐받이
      ];
      wheels = [{ x: 0, y: 0.42, z: 0.78, r: 0.42, w: 0.16, steer: true },
                { x: 0, y: 0.42, z: -0.70, r: 0.42, w: 0.20, steer: false }];
    } else if (key === 'buggy') {
      parts = [
        B.box(1.70, 0.42, 3.00, body, 0, 0.66, 0),               // 차대
        B.box(1.40, 0.44, 1.10, dark, 0, 1.05, -0.30),           // 좌석
        B.box(1.55, 0.10, 1.20, dark, 0, 1.62, -0.30),           // 롤케이지 지붕
        B.box(0.10, 0.90, 0.10, metal, -0.72, 1.20, 0.25),
        B.box(0.10, 0.90, 0.10, metal, 0.72, 1.20, 0.25),
        B.box(0.10, 0.90, 0.10, metal, -0.72, 1.20, -0.85),
        B.box(0.10, 0.90, 0.10, metal, 0.72, 1.20, -0.85),
        B.box(1.30, 0.30, 0.24, dark, 0, 0.92, 1.42),            // 앞 범퍼
        B.box(0.30, 0.20, 0.14, 0xfff0c0, -0.48, 0.92, 1.52),    // 전조등
        B.box(0.30, 0.20, 0.14, 0xfff0c0, 0.48, 0.92, 1.52),
        B.box(1.20, 0.36, 0.60, dark, 0, 0.86, -1.30)            // 엔진
      ];
      wheels = [{ x: -0.95, y: 0.50, z: 1.05, r: 0.50, w: 0.30, steer: true },
                { x: 0.95, y: 0.50, z: 1.05, r: 0.50, w: 0.30, steer: true },
                { x: -0.95, y: 0.50, z: -1.10, r: 0.52, w: 0.34, steer: false },
                { x: 0.95, y: 0.50, z: -1.10, r: 0.52, w: 0.34, steer: false }];
    } else {                                                     // 픽업트럭
      parts = [
        B.box(1.95, 0.55, 4.40, body, 0, 0.78, 0),               // 차체
        B.box(1.85, 0.80, 1.90, body, 0, 1.42, 0.35),            // 운전실
        B.box(1.70, 0.62, 0.10, glass, 0, 1.48, 1.28),           // 앞 유리
        B.box(0.10, 0.60, 1.70, glass, -0.90, 1.46, 0.30),       // 측면 유리
        B.box(0.10, 0.60, 1.70, glass, 0.90, 1.46, 0.30),
        B.box(1.85, 0.10, 1.85, dark, 0, 1.84, 0.35),            // 지붕
        B.box(1.90, 0.55, 1.90, dark, 0, 1.08, -1.35),           // 짐칸
        B.box(1.90, 0.12, 0.12, dark, 0, 1.36, -2.24),
        B.box(1.75, 0.34, 0.26, dark, 0, 0.78, 2.16),            // 앞 범퍼
        B.box(0.34, 0.22, 0.14, 0xfff0c0, -0.62, 0.92, 2.24),    // 전조등
        B.box(0.34, 0.22, 0.14, 0xfff0c0, 0.62, 0.92, 2.24),
        B.box(0.26, 0.16, 0.12, 0xc23b32, -0.72, 0.92, -2.24),   // 후미등
        B.box(0.26, 0.16, 0.12, 0xc23b32, 0.72, 0.92, -2.24),
        B.box(0.70, 0.50, 0.12, metal, 0, 1.10, -2.30)           // 예비 타이어 거치
      ];
      wheels = [{ x: -1.02, y: 0.55, z: 1.52, r: 0.55, w: 0.34, steer: true },
                { x: 1.02, y: 0.55, z: 1.52, r: 0.55, w: 0.34, steer: true },
                { x: -1.02, y: 0.55, z: -1.48, r: 0.55, w: 0.34, steer: false },
                { x: 1.02, y: 0.55, z: -1.48, r: 0.55, w: 0.34, steer: false }];
    }
    return { body: B.merge(parts), wheels };
  },

  wheelGeo(r, w) {
    const key = 'w' + r + ':' + w;
    if (!this.cache[key]) {
      const g = new THREE.CylinderGeometry(r, r, w, 12);
      g.rotateZ(Math.PI / 2);                                    // 축이 x 를 향하도록
      const hub = new THREE.BoxGeometry(w + 0.03, r * 0.5, r * 0.5);
      const parts = [
        { geo: g, color: 0x22252a, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
        { geo: hub, color: 0x9aa3ab, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      ];
      this.cache[key] = Build.merge(parts);
    }
    return this.cache[key];
  }
};

class Vehicle3D {
  constructor(x, z, key) {
    this.key = key;
    this.spec = VEHICLES[key];
    this.pos = new THREE.Vector3(x, World.height(x, z), z);
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.steer = 0;
    this.hp = this.spec.hp;
    this.dead = false;
    this.driver = null;
    this.spin = 0;
    this.pitch = 0; this.roll = 0;

    const art = VehicleArt.get(key);
    const mat = Mats.vc({ roughness: 0.62, metalness: 0.22 });
    this.mesh = new THREE.Group();
    this.tilt = new THREE.Group();                 // 지형 기울기용
    this.mesh.add(this.tilt);
    const bodyMesh = new THREE.Mesh(art.body, mat);
    bodyMesh.castShadow = true;
    this.tilt.add(bodyMesh);

    this.wheels = art.wheels.map(w => {
      const m = new THREE.Mesh(VehicleArt.wheelGeo(w.r, w.w), mat);
      m.castShadow = true;
      m.position.set(w.x, w.y, w.z);
      m.userData.steer = w.steer;
      this.tilt.add(m);
      return m;
    });

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    // 충돌: 차량도 장애물로 등록하지 않고, 캐릭터와는 게임 쪽에서 따로 판정합니다
  }

  get occupied() { return !!this.driver; }
  get seatY() { return this.spec.seatH; }

  /* 입력에 따라 굴러갑니다. throttle -1~1, steer -1~1 */
  drive(dt, throttle, steer, brake) {
    const sp = this.spec;
    if (this.dead) throttle = 0;
    if (brake) {
      const s = Math.sign(this.speed);
      this.speed -= s * sp.brake * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
    } else if (throttle > 0.05) {
      this.speed += sp.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    } else if (throttle < -0.05) {
      this.speed += sp.accel * throttle * dt * (this.speed > 0 ? 2.2 : 0.7);
    } else {
      this.speed *= Math.max(0, 1 - dt * 1.1);     // 관성 주행
      if (Math.abs(this.speed) < 0.15) this.speed = 0;
    }
    this.speed = Math.max(-sp.rev, Math.min(sp.max, this.speed));

    // 조향은 속도가 있어야 듣습니다
    this.steer += (steer - this.steer) * Math.min(1, dt * 9);
    const grip = Math.min(1, Math.abs(this.speed) / 5.5);
    this.yaw -= this.steer * sp.turn * dt * grip * Math.sign(this.speed || 1);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt;
    const nz = this.pos.z + fz * this.speed * dt;

    // 장애물: 밀려난 거리가 크면 부딪힌 것으로 봅니다
    const res = World.resolve(nx, nz, sp.r, this.pos.y + 0.4, this.pos.y + 1.6);
    const pushed = Math.hypot(res.x - nx, res.z - nz);
    this.pos.x = res.x; this.pos.z = res.z;
    if (pushed > 0.06) {
      const impact = Math.abs(this.speed);
      this.speed *= 0.25;
      if (impact > 9) this.damage(impact * 3.5);
    }

    // 지형 따라가기 + 기울기
    const g = World.groundY(this.pos.x, this.pos.z, this.pos.y + 0.6);
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 12);
    const ahead = 1.6;
    const hF = World.height(this.pos.x + fx * ahead, this.pos.z + fz * ahead);
    const hB = World.height(this.pos.x - fx * ahead, this.pos.z - fz * ahead);
    const rx = -fz, rz = fx;
    const hR = World.height(this.pos.x + rx * ahead, this.pos.z + rz * ahead);
    const hL = World.height(this.pos.x - rx * ahead, this.pos.z - rz * ahead);
    const wantPitch = Math.atan2(hB - hF, ahead * 2);
    const wantRoll = Math.atan2(hR - hL, ahead * 2);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 6);
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 6);

    // 바퀴 회전
    this.spin += this.speed * dt / 0.5;
    for (const w of this.wheels) {
      w.rotation.x = this.spin;
      w.rotation.y = w.userData.steer ? -this.steer * 0.5 : 0;
    }
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.tilt.rotation.set(this.pitch, 0, this.roll);
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }
}

/* ============================================================
   공중 보급: 비행기가 떨어뜨린 상자
   낙하산을 달고 내려와 착지하면 연기를 피우고, F 로 열 수 있습니다.
   ============================================================ */
const CrateArt = {
  geo: null, chuteGeo: null,

  crate() {
    if (this.geo) return this.geo;
    const B = Build;
    const red = 0xc23b32, white = 0xe8e4da, dark = 0x2a2d33, tan = 0x9a7a4a;
    this.geo = B.merge([
      B.box(1.60, 1.10, 1.60, tan, 0, 0.55, 0),
      B.box(1.66, 0.16, 1.66, red, 0, 1.05, 0),          // 뚜껑 테두리
      B.box(1.68, 0.26, 0.30, red, 0, 0.62, 0),          // 붉은 띠
      B.box(0.30, 0.26, 1.68, red, 0, 0.62, 0),
      B.box(1.66, 0.10, 0.14, dark, 0, 0.16, 0.80),      // 아래 보강대
      B.box(1.66, 0.10, 0.14, dark, 0, 0.16, -0.80),
      B.box(0.44, 0.44, 0.06, white, 0, 0.62, 0.82),     // 표식
      B.box(0.30, 0.10, 0.02, red, 0, 0.62, 0.86),
      B.box(0.10, 0.30, 0.02, red, 0, 0.62, 0.86),
      B.box(0.26, 0.12, 0.26, dark, 0, 1.18, 0)          // 고리
    ]);
    return this.geo;
  },

  chute() {
    if (this.chuteGeo) return this.chuteGeo;
    const dome = new THREE.SphereGeometry(2.3, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
    dome.scale(1, 0.6, 1);
    const nd = dome.index ? dome.toNonIndexed() : dome;
    const pos = nd.attributes.position, nor = nd.attributes.normal;
    const positions = [], normals = [], colors = [];
    const a = new THREE.Color(0xc23b32).convertSRGBToLinear();
    const b = new THREE.Color(0xf2f0e6).convertSRGBToLinear();
    for (let i = 0; i < pos.count; i += 3) {
      let mx = 0, mz = 0;
      for (let k = 0; k < 3; k++) { mx += pos.getX(i + k); mz += pos.getZ(i + k); }
      const ang = Math.atan2(mz / 3, mx / 3);
      const c = Math.floor((ang + Math.PI) / (Math.PI * 2) * 8) % 2 ? a : b;
      for (let k = 0; k < 3; k++) {
        positions.push(pos.getX(i + k), pos.getY(i + k) + 3.4, pos.getZ(i + k));
        normals.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
        colors.push(c.r, c.g, c.b);
      }
    }
    dome.dispose(); if (nd !== dome) nd.dispose();
    const lines = Build.merge([0, 1, 2, 3].map(i => {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const x = Math.cos(ang) * 1.1, z = Math.sin(ang) * 1.1;
      return Build.box(0.05, 3.1, 0.05, 0xd8d4c8, x, 1.8, z,
                       Math.atan2(z, 1.8) * 0.5, 0, -Math.atan2(x, 1.8) * 0.5);
    }));
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
    this.chuteGeo = geo;
    return geo;
  },

  smokeGeo: null,
  smoke() {
    if (!this.smokeGeo) this.smokeGeo = new THREE.CylinderGeometry(1.1, 2.6, 34, 12, 1, true);
    return this.smokeGeo;
  }
};

class Airdrop {
  constructor(x, z, y) {
    this.pos = new THREE.Vector3(x, y, z);
    this.landed = false;
    this.opened = false;
    this.dead = false;
    this.drift = (Math.random() - 0.5) * 1.6;
    this.spin = Math.random() * Math.PI;

    this.mesh = new THREE.Group();
    this.crate = new THREE.Mesh(CrateArt.crate(), Mats.vc({ roughness: 0.7, metalness: 0.1 }));
    this.crate.castShadow = true;
    this.mesh.add(this.crate);

    this.chute = new THREE.Mesh(CrateArt.chute(), Mats.vc({ roughness: 0.9, side: THREE.DoubleSide }));
    this.chute.position.y = 1.2;
    this.mesh.add(this.chute);

    this.smoke = new THREE.Mesh(CrateArt.smoke(), new THREE.MeshBasicMaterial({
      color: srgb(0xff5a4a), transparent: true, opacity: 0.16,
      depthWrite: false, side: THREE.DoubleSide
    }));
    this.smoke.position.y = 17;
    this.smoke.visible = false;
    this.mesh.add(this.smoke);

    this.mesh.position.copy(this.pos);
  }

  update(dt) {
    this.spin += dt * 0.35;
    if (!this.landed) {
      this.pos.y -= CFG.DROP_FALL * dt;
      this.pos.x += Math.sin(this.spin) * this.drift * dt;
      this.pos.z += Math.cos(this.spin * 0.8) * this.drift * dt;
      const g = World.groundY(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y <= g) {
        this.pos.y = g;
        this.landed = true;
        this.chute.visible = false;
        this.smoke.visible = true;
        World.addCyl({ x: this.pos.x, z: this.pos.z, r: 1.15, top: this.pos.y + 1.15, h: 1.3 });
      } else {
        this.chute.rotation.z = Math.sin(this.spin) * 0.06;
      }
    } else {
      this.smoke.material.opacity = 0.13 + Math.sin(this.spin * 3) * 0.03;
      this.smoke.rotation.y = this.spin * 0.4;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.landed ? this.mesh.rotation.y : this.spin * 0.5;
  }

  /* 상자를 엽니다: 안에 든 것이 주변에 흩어집니다 */
  contents() {
    const t = DROP_TABLE;
    const gun = t.guns[Math.floor(Math.random() * t.guns.length)];
    const scope = t.scopes[Math.floor(Math.random() * t.scopes.length)];
    return [
      { kind: 'gun', gun, amount: GUNS[gun].ammoPer },
      { kind: 'scope', level: scope },
      { kind: 'vest', level: t.vest },
      { kind: 'bag', level: t.bag },
      { kind: 'med', amount: t.meds }
    ];
  }
}
