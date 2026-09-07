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
    // 같은 계열 총은 생김새를 나눠 씁니다 (색은 총마다 다릅니다)
    switch (GUNS[key].model || key) {
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
      case 'vss': return [
        B.box(0.068, 0.115, 0.30, D, 0, 0.02, 0.0),
        B.tube(0.036, 0.40, D, 0, 0.03, 0.36),              // 총열을 감싼 소음기
        B.tube(0.042, 0.05, M, 0, 0.03, 0.58),
        B.box(0.05, 0.14, 0.09, D, 0, -0.10, -0.02, 0.10),
        B.box(0.062, 0.115, 0.26, W, 0, -0.01, -0.26),      // 나무 개머리판
        B.box(0.05, 0.022, 0.24, A, 0, 0.085, 0.02),
        // 붙박이 조준경
        B.tube(0.034, 0.22, D, 0, 0.165, 0.05),
        B.tube(0.042, 0.03, M, 0, 0.165, 0.16),
        B.box(0.03, 0.06, 0.03, D, 0, 0.115, -0.02),
        B.box(0.03, 0.06, 0.03, D, 0, 0.115, 0.13),
        B.box(0.02, 0.016, 0.02, 0x7ee787, 0, 0.20, 0.05)
      ];
      case 'lmg': return [
        B.box(0.085, 0.135, 0.46, M, 0, 0.02, 0.0),
        B.tube(0.020, 0.40, M, 0, 0.03, 0.44),
        B.tube(0.030, 0.07, D, 0, 0.03, 0.67),
        B.box(0.115, 0.145, 0.20, O, 0, -0.03, 0.02),      // 탄통
        B.box(0.05, 0.024, 0.40, A, 0, 0.10, 0.06),
        B.box(0.048, 0.20, 0.085, D, 0, -0.13, -0.02, 0.12),
        B.box(0.062, 0.115, 0.28, O, 0, 0.0, -0.34),
        B.box(0.02, 0.18, 0.02, D, 0.05, -0.07, 0.52, 0, 0, -0.40),
        B.box(0.02, 0.18, 0.02, D, -0.05, -0.07, 0.52, 0, 0, 0.40)
      ];
      default: return [B.box(0.08, 0.1, 0.4, M, 0, 0, 0)];
    }
  }
};


/* ============================================================
   수송기
   경기 시작에 섬을 가로질러 날아갑니다.
   모두 이 안에서 시작해 원하는 자리에서 뛰어내립니다.
   ============================================================ */
/* ============================================================
   캐릭터 모델 (glTF)
   뼈대와 애니메이션이 들어 있는 파일 하나를 한 번만 읽고,
   등장인물마다 뼈대를 복제해서 씁니다 (지오메트리와 텍스처는 공유).
   ============================================================ */
const CharModel = {
  ready: false, src: null, clips: {}, error: null,

  load(url) {
    if (this._p) return this._p;
    this._p = new Promise(resolve => {
      new THREE.GLTFLoader().load(url, g => {
        this.src = g.scene;
        // 그림자를 지고, 멀리서도 사라지지 않게 합니다
        this.src.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.frustumCulled = false;
        });
        for (const c of g.animations) this.clips[c.name] = c;
        this.ready = true;
        resolve(true);
      }, undefined, err => {
        this.error = err && err.message ? err.message : '모델을 불러오지 못했습니다';
        resolve(false);
      });
    });
    return this._p;
  },

  /* 한 명분 복제. 스킨 색을 입혀 서로 구별되게 합니다.
     원본 모델은 -Z 쪽을 보고 있는데(발끝으로 확인) 게임의 정면은 +Z 라서,
     껍데기 그룹을 하나 씌워 반 바퀴 돌려 세웁니다.
     바깥에서는 이 껍데기를 기울이기만 하면 되고, 뼈 찾기도 그대로 됩니다. */
  make(outfit) {
    const inner = THREE.SkeletonUtils.clone(this.src);
    const tint = new THREE.Color(outfit && outfit.top ? outfit.top : 0xffffff).convertSRGBToLinear();
    // 원본 텍스처는 그대로 두고 색만 곱합니다 (재질만 복제하므로 가볍습니다)
    inner.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.copy(tint);
      o.castShadow = true;
      o.frustumCulled = false;
    });
    inner.rotation.y = Math.PI;
    const g = new THREE.Group();
    g.add(inner);
    return g;
  }
};

/* 투척 무기 모양 (바닥에 떨어진 것과 날아가는 것이 같은 모양을 씁니다) */
const ThrowArt = {
  cache: {},
  geo(type) {
    if (!this.cache[type]) {
      const B = Build, T = THROWABLES[type];
      const dark = 0x2a2d33, metal = 0x6f7378;
      const parts = type === 'frag' ? [
        B.sphere(0.085, T.color, 0, 0, 0, 1, 1.18, 1, 12),        // 파인애플 몸통
        B.box(0.155, 0.018, 0.155, 0x3a4136, 0, 0.028, 0),        // 홈
        B.box(0.155, 0.018, 0.155, 0x3a4136, 0, -0.028, 0),
        B.pillar(0.030, 0.034, 0.045, metal, 0, 0.115, 0),        // 뇌관
        B.box(0.016, 0.075, 0.030, metal, 0.036, 0.098, 0, 0, 0, 0.22)  // 안전 손잡이
      ] : [
        B.pillar(0.062, 0.062, 0.215, T.color, 0, 0, 0),          // 원통
        B.pillar(0.066, 0.066, 0.022, 0x8a9299, 0, 0.085, 0),
        B.pillar(0.066, 0.066, 0.022, 0x8a9299, 0, -0.085, 0),
        B.pillar(0.028, 0.032, 0.040, metal, 0, 0.128, 0),
        B.box(0.014, 0.070, 0.028, metal, 0.032, 0.112, 0, 0, 0, 0.20)
      ];
      this.cache[type] = Build.merge(parts);
    }
    return this.cache[type];
  }
};

/* 날아가는 투척 무기 */
class Grenade {
  constructor(type, x, y, z, vx, vy, vz, owner) {
    this.type = type;
    this.spec = THROWABLES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(vx, vy, vz);
    this.owner = owner;
    this.fuse = this.spec.fuse;
    this.spin = new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    this.dead = false;
    this.rest = 0;                       // 멈춰 있는 시간
    this.mesh = new THREE.Mesh(ThrowArt.geo(type), Mats.vc({ roughness: 0.6, metalness: 0.2 }));
    this.mesh.castShadow = true;
    this.mesh.position.copy(this.pos);
  }

  /* 지형과 건물에 튕기며 굴러갑니다 */
  update(dt) {
    this.fuse -= dt;
    this.vel.y -= CFG.GRAVITY * dt;
    const r = 0.09;
    // 한 프레임에 벽을 뚫지 않도록 잘게 나눠 옮깁니다
    const step = Math.max(1, Math.ceil(this.vel.length() * dt / 0.25));
    for (let i = 0; i < step; i++) {
      const d = dt / step;
      const nx = this.pos.x + this.vel.x * d;
      const ny = this.pos.y + this.vel.y * d;
      const nz = this.pos.z + this.vel.z * d;
      const g = World.groundY(nx, nz, Math.max(this.pos.y, ny) + 0.4);
      if (ny <= g + r) {                                  // 바닥에 닿음
        this.pos.set(nx, g + r, nz);
        this.vel.y = Math.abs(this.vel.y) * 0.32;
        this.vel.x *= 0.62; this.vel.z *= 0.62;
        if (this.vel.length() < 0.6) { this.vel.set(0, 0, 0); this.rest += d; }
        continue;
      }
      // 옆으로 벽에 부딪히면 튕깁니다
      if (World.blocked(nx, nz, r, ny, ny + 0.18, 0)) {
        const bx = World.blocked(nx, this.pos.z, r, ny, ny + 0.18, 0);
        const bz = World.blocked(this.pos.x, nz, r, ny, ny + 0.18, 0);
        if (bx) this.vel.x *= -0.42;
        if (bz) this.vel.z *= -0.42;
        if (!bx && !bz) { this.vel.x *= -0.42; this.vel.z *= -0.42; }
        this.pos.y = ny;
        continue;
      }
      this.pos.set(nx, ny, nz);
    }
    this.mesh.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.04) {
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.y += this.spin.y * dt;
      this.mesh.rotation.z += this.spin.z * dt;
    }
  }
}

/* 연막: 반투명한 덩어리 여러 개로 이루어진 구름. 시야를 가립니다 */
class Smoke {
  constructor(x, y, z) {
    this.pos = new THREE.Vector3(x, y, z);
    this.r = 0;
    this.maxR = THROWABLES.smoke.radius;
    this.life = THROWABLES.smoke.life;
    this.dead = false;
    this.t = 0;
    if (!Smoke._geo) Smoke._geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({
      color: srgb(0xd6dde3), transparent: true, opacity: 0.0, depthWrite: false
    });
    this.mat = mat;
    this.mesh = new THREE.Group();
    this.blobs = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(Smoke._geo, mat);
      const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.6);
      this.blobs.push({ m, ox: Math.cos(a) * rr, oz: Math.sin(a) * rr,
                        oy: 0.15 + Math.random() * 0.75, s: 0.42 + Math.random() * 0.42,
                        ph: Math.random() * 6.28 });
      this.mesh.add(m);
    }
    this.mesh.position.set(x, y, z);
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    // 처음 1.5초 동안 부풀고, 마지막 3초 동안 옅어집니다
    this.r = this.maxR * Math.min(1, this.t / 1.5);
    const fade = Math.min(1, this.t / 0.8) * Math.min(1, this.life / 3);
    this.mat.opacity = 0.52 * fade;
    for (const b of this.blobs) {
      const drift = Math.sin(this.t * 0.7 + b.ph) * 0.25;
      b.m.position.set(b.ox * this.r * 0.8 + drift, b.oy * this.r * 0.55 + this.t * 0.06,
                       b.oz * this.r * 0.8 - drift);
      b.m.scale.setScalar(b.s * this.r * 0.62);
    }
  }

  /* 이 선분이 연막을 가로지르는가 (봇 시야 판정에 씁니다) */
  blocks(x1, y1, z1, x2, y2, z2) {
    if (this.r < 1) return false;
    const cx = this.pos.x, cy = this.pos.y + this.r * 0.35, cz = this.pos.z;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) return false;
    let t = ((cx - x1) * dx + (cy - y1) * dy + (cz - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, py = y1 + dy * t, pz = z1 + dz * t;
    const rr = this.r * 0.85;
    return (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2 < rr * rr;
  }
}

/* 지점 표시(핑) 표식: 공중에 뜬 마름모 + 바닥 기둥 */
const PingArt = {
  make() {
    if (!this._geo) {
      this._geo = new THREE.OctahedronGeometry(0.42, 0);
      this._beam = new THREE.CylinderGeometry(0.30, 0.30, 9, 10, 1, true);
      this._beam.translate(0, 4.5, 0);
      this._ring = new THREE.RingGeometry(0.9, 1.15, 22);
      this._ring.rotateX(-Math.PI / 2);
    }
    const g = new THREE.Group();
    const c = srgb(0xffd166);
    const mark = new THREE.Mesh(this._geo, new THREE.MeshBasicMaterial({ color: c }));
    const beam = new THREE.Mesh(this._beam, new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -1.1;
    const ring = new THREE.Mesh(this._ring, new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = -1.05;
    g.add(mark); g.add(beam); g.add(ring);
    return g;
  }
};

class Plane {
  constructor(ax, az, bx, bz, y) {
    this.a = new THREE.Vector3(ax, y, az);
    this.b = new THREE.Vector3(bx, y, bz);
    const dx = bx - ax, dz = bz - az;
    this.len = Math.hypot(dx, dz);
    this.dir = { x: dx / this.len, z: dz / this.len };
    this.yaw = Math.atan2(this.dir.x, this.dir.z);
    this.total = this.len / CFG.PLANE_SPEED;
    this.t = 0;
    this.pos = this.a.clone();
    this.mesh = new THREE.Mesh(Plane.geo(), Mats.vc({ roughness: 0.72, metalness: 0.18 }));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  /* 항로 위 t초 지점의 위치 */
  at(t, out) {
    const d = Math.min(this.len, CFG.PLANE_SPEED * t);
    return (out || new THREE.Vector3()).set(
      this.a.x + this.dir.x * d, this.a.y, this.a.z + this.dir.z * d);
  }

  /* 어떤 지점에 가장 가까이 지나가는 시각 (초) */
  bestTime(x, z) {
    const d = (x - this.a.x) * this.dir.x + (z - this.a.z) * this.dir.z;
    return Math.max(0, Math.min(this.total, d / CFG.PLANE_SPEED));
  }

  update(dt) {
    this.t += dt;
    this.at(this.t, this.pos);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  static geo() {
    if (this._geo) return this._geo;
    const B = Build;
    const body = 0xb9c2cc, dark = 0x394452, wing = 0x8f9aa6, glass = 0x2f4a5e;
    const parts = [
      // 동체
      B.sphere(2.6, body, 0, 0, 0, 1.0, 0.95, 5.4, 16),
      B.sphere(2.4, body, 0, 0, 12.6, 1.0, 0.92, 1.6, 14),        // 기수
      B.box(2.6, 1.6, 1.2, glass, 0, 0.9, 12.0),                  // 조종석 창
      // 주익
      B.box(21.0, 0.55, 4.2, wing, 0, 1.5, 1.0),
      B.box(3.0, 1.1, 2.0, dark, -6.2, 0.6, 1.6),                 // 엔진
      B.box(3.0, 1.1, 2.0, dark, 6.2, 0.6, 1.6),
      B.box(2.2, 0.9, 1.6, dark, -9.6, 0.7, 1.2),
      B.box(2.2, 0.9, 1.6, dark, 9.6, 0.7, 1.2),
      // 꼬리
      B.box(0.7, 5.4, 3.6, wing, 0, 3.0, -12.0),
      B.box(9.0, 0.45, 2.6, wing, 0, 4.6, -13.0),
      // 뒷문 (열려 있습니다)
      B.box(3.2, 0.3, 3.4, dark, 0, -1.5, -14.6, -0.5),
      // 동체 줄무늬
      B.box(0.4, 0.5, 22.0, 0xf0c453, -2.3, 0.4, 0),
      B.box(0.4, 0.5, 22.0, 0xf0c453, 2.3, 0.4, 0)
    ];
    this._geo = Build.merge(parts);
    return this._geo;
  }
}

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
      else if (kind === 'helmet') this.cache[key] = Build.merge(this.helmetParts(level));
      else if (kind === 'throw') this.cache[key] = ThrowArt.geo(gun);
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

  /* 탄약 상자. cal 은 구경 이름입니다 ('556' 처럼) */
  ammoParts(cal) {
    const B = Build, A = (CALIBERS[cal] || CALIBERS['9mm']).color;
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

  /* 바닥에 떨어진 헬멧 */
  helmetParts(level) {
    const B = Build, c = HELMETS[level].color, strap = 0x2a2d33;
    const parts = [
      B.sphere(0.19, c, 0, 0.20, 0, 1.0, 0.78, 1.05, 14),
      B.box(0.22, 0.035, 0.13, c, 0, 0.155, 0.14),
      B.box(0.30, 0.04, 0.30, strap, 0, 0.055, 0)
    ];
    for (let i = 0; i < level; i++) {
      parts.push(B.box(0.035, 0.035, 0.018, 0xf0c453, -0.04 + i * 0.04, 0.245, 0.145));
    }
    return parts;
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
    this.kind = kind;                 // 'gun' | 'ammo' | 'med' | 'scope' | 'vest' | 'helmet' | 'bag'
    // 'ammo' 일 때는 gun 자리에 총 이름이 아니라 '구경' 이 들어옵니다 ('556' 등)
    this.gun = gun || null;
    this.amount = amount || 0;
    this.level = level || 0;          // 조준경 배율 / 방어구 등급
    this.dead = false;
    this.spin = Math.random() * Math.PI * 2;

    const color = kind === 'gun' ? GUNS[gun].color
      : (kind === 'ammo' ? (CALIBERS[gun] || CALIBERS['9mm']).color
      : (kind === 'scope' ? SCOPES[this.level].color
      : (kind === 'vest' ? 0x9ecbff
      : (kind === 'bag' ? 0xc7a86b
      : (kind === 'helmet' ? 0xd9e2ec
      : (kind === 'throw' ? THROWABLES[gun].tint : 0xff6b6b))))));
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
    if (this.kind === 'ammo') return (CALIBERS[this.gun] || CALIBERS['9mm']).name + ' ' + this.amount + '발';
    if (this.kind === 'scope') return SCOPES[this.level].name + ' (' + SCOPES[this.level].label + ')';
    if (this.kind === 'vest') return VESTS[this.level].name + ' (피해 -' + Math.round(VESTS[this.level].reduce * 100) + '%)';
    if (this.kind === 'bag') return BAGS[this.level].name + ' (구급상자 ' + BAGS[this.level].meds + '개)';
    if (this.kind === 'helmet') return HELMETS[this.level].name + ' (머리 피해 -' + Math.round(HELMETS[this.level].reduce * 100) + '%)';
    if (this.kind === 'throw') return THROWABLES[this.gun].name + ' ' + this.amount + '개';
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

  /* 색을 어둡게 / 밝게 (발과 볼처럼 같은 계열의 다른 톤을 만들 때 씁니다) */
  shade(hex, k) {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
    const b = Math.min(255, Math.round((hex & 255) * k));
    return (r << 16) | (g << 8) | b;
  },

  /* 커비풍 둥근 몸매
     머리와 몸통이 하나인 큰 달걀에, 큼직한 눈과 볼, 짧은 팔과 넓적한 발.
     좌표는 골반 그룹(월드 y = 0.52) 기준이고 정수리는 약 1.37m 입니다. */
  build(S) {
    const B = Build;
    const body = S.top;
    const foot = this.shade(S.boots && S.boots !== 0x24262b ? S.boots : body, 0.62);
    const trim = S.vest || 0x4a4a42;
    const dark = 0x24272d;
    const cheek = this.shade(body, 0.78);

    /* 몸통: 매끄럽고 동그란 공 하나.
       얼굴 부품은 공 표면 바로 위에 오도록 z 를 계산해 얹습니다.
       (반지름 x 0.415 · y 0.457 · z 0.402, 중심 y 0.36) */
    const torsoParts = [
      B.sphere(0.415, body, 0, 0.36, 0, 1.0, 1.10, 0.97, 24),

      /* 눈: 위쪽이 하얗고 아래가 짙은 남색인 큼직한 세로 타원.
         공 표면(z ≈ 0.355) 바로 위에 얹어야 안으로 파묻히지 않습니다 */
      B.sphere(0.098, 0x080e20, -0.145, 0.505, 0.342, 0.66, 1.45, 0.34, 14),
      B.sphere(0.098, 0x080e20,  0.145, 0.505, 0.342, 0.66, 1.45, 0.34, 14),
      B.sphere(0.090, 0x162c63, -0.145, 0.495, 0.352, 0.62, 1.34, 0.32, 14),
      B.sphere(0.090, 0x162c63,  0.145, 0.495, 0.352, 0.62, 1.34, 0.32, 14),
      B.sphere(0.086, 0x2f6ad0, -0.145, 0.442, 0.354, 0.60, 0.62, 0.30, 12),   // 아래쪽 푸른빛
      B.sphere(0.086, 0x2f6ad0,  0.145, 0.442, 0.354, 0.60, 0.62, 0.30, 12),
      B.sphere(0.070, 0xffffff, -0.145, 0.552, 0.360, 0.64, 0.74, 0.28, 12),   // 흰 하이라이트
      B.sphere(0.070, 0xffffff,  0.145, 0.552, 0.360, 0.64, 0.74, 0.28, 12),

      /* 발그레한 볼 */
      B.sphere(0.082, cheek, -0.265, 0.358, 0.300, 1.25, 0.62, 0.26, 12),
      B.sphere(0.082, cheek,  0.265, 0.358, 0.300, 1.25, 0.62, 0.26, 12),

      /* 작게 벌린 입 */
      B.sphere(0.064, 0x8f2f26, 0, 0.318, 0.392, 1.0, 1.05, 0.28, 12),
      B.sphere(0.045, 0x5a1712, 0, 0.310, 0.404, 0.9, 0.90, 0.20, 10),

      /* 등에 멘 작은 가방 */
      B.sphere(0.17, trim, 0, 0.30, -0.275, 1.0, 1.05, 0.55, 12),
      B.box(0.21, 0.05, 0.06, dark, 0, 0.40, -0.275)
    ];

    if (S.helmet) {                                    // 챙 달린 모자
      torsoParts.push(B.sphere(0.268, S.helmet, 0, 0.790, -0.01, 1.0, 0.52, 1.0, 16));
      torsoParts.push(B.box(0.27, 0.035, 0.17, S.helmet, 0, 0.762, 0.215));
    } else {                                           // 모자가 없으면 머리카락
      torsoParts.push(B.sphere(0.268, S.hair || 0x2b2119, 0, 0.795, -0.02, 1.0, 0.50, 1.0, 16));
    }

    /* 팔: 마디 없이 매끈하게 이어지는 짧은 팔 */
    const arm = [
      B.sphere(0.112, body, 0, -0.03, 0, 1.0, 1.0, 1.0, 10),
      B.sphere(0.104, body, 0, -0.12, 0, 0.98, 1.35, 0.98, 10),
      B.sphere(0.098, body, 0, -0.235, 0.01, 1.02, 1.0, 1.02, 10)   // 동그란 손
    ];

    /* 다리는 보이지 않습니다. 몸 바로 아래에 넓적한 발만 붙습니다 */
    const thigh = [
      B.sphere(0.03, foot, 0, -0.02, 0, 1, 1, 1, 5)      // 몸 속에 숨는 이음매
    ];
    const shin = [
      B.sphere(0.195, foot, 0, 0.075, 0.045, 0.94, 0.60, 1.30, 16)
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
    this.pose = { bodyX: 0, bodyZ: 0, bodyY: 0 };   // 모델 전체 기울기

    this.guns = [null, null];      // 무기 두 칸
    this.mags = [0, 0];
    this.scopes = [0, 0];          // 칸마다 달린 조준경 배율 (0 = 없음)
    this.scopeOff = [false, false]; // 조준경을 떼어 둔 상태
    this.slot = 0;
    this.swap = 0;                 // 교체 중 남은 시간
    this.reserve = {};
    this.meds = isPlayer ? 1 : 1 + Math.floor(Math.random() * 2);
    this.throws = { frag: 0, smoke: 0 };      // 지니고 있는 투척 무기
    this.vest = 0;                 // 방탄조끼 등급 (0 = 없음)
    this.helmet = 0;               // 헬멧 등급 (0 = 없음)
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
    this.mesh = new THREE.Group();
    this.outfit = outfit;

    // 모델과 뼈대
    this.body = CharModel.make(outfit);        // 사망 연출용 회전축이기도 합니다
    this.mesh.add(this.body);

    // 걷기·달리기·서기 세 동작을 속도에 따라 섞습니다
    this.mixer = new THREE.AnimationMixer(this.body);
    this.act = {};
    for (const [key, name] of [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run']]) {
      const clip = CharModel.clips[name];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      this.act[key] = a;
    }
    this.animT = 0;

    /* 뼈에 물건을 답니다 (손에 총, 등에 예비 무기, 머리에 헬멧).
       glTF 로더가 이름의 콜론을 지우므로 두 표기를 모두 찾아봅니다. */
    const bone = n => this.body.getObjectByName('mixamorig' + n)
                   || this.body.getObjectByName('mixamorig:' + n);
    this.handR = bone('RightHand');
    this.spine = bone('Spine2') || bone('Spine1') || this.body;
    this.headBone = bone('Head') || this.spine;

    /* 믹사모 뼈대는 센티미터 단위라 뼈의 월드 배율이 0.01 입니다.
       미터로 만든 장비를 뼈에 그대로 달면 100분의 1 로 쪼그라들기 때문에,
       배율을 되돌리는 그룹을 사이에 하나 끼워 넣습니다.
       그러면 장비 쪽 좌표는 지금까지처럼 미터 단위로 쓸 수 있습니다. */
    this.body.updateMatrixWorld(true);
    const mount = (b, px, py, pz, rx, ry, rz) => {
      const s = new THREE.Vector3();
      b.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      const k = 1 / (s.x || 1);               // 뼈 한 칸이 몇 미터인지의 역수
      const g = new THREE.Group();
      g.scale.setScalar(k);
      g.position.set(px * k, py * k, pz * k); // 자리 값도 뼈 단위로 바꿔 줍니다
      g.rotation.set(rx || 0, ry || 0, rz || 0);
      b.add(g);
      return g;
    };

    // 손뼈 기준으로 총을 쥐는 자세
    this.gunMount = mount(this.handR || this.body, 0.02, 0.04, 0.02, -Math.PI / 2, 0, Math.PI / 2);
    this.gunMesh = null;

    this.backMount = mount(this.spine, 0.02, -0.14, -0.28, Math.PI / 2, 0.18, 1.15);
    this.backMesh = null;

    // 헬멧과 가방을 다는 자리 (역시 미터 단위)
    this.headMount = mount(this.headBone, 0, 0, 0, 0, 0, 0);
    this.gearMount = mount(this.spine, 0, 0, 0, 0, 0, 0);

    this.chute = { visible: false, rotation: { x: 0, y: 0, z: 0 } };
    this.mesh.position.copy(this.pos);
  }

  /* 속도에 맞춰 서기 → 걷기 → 달리기 로 섞습니다 */
  updateAnim(dt) {
    if (!this.mixer) return;
    const A = this.act;
    if (!A.idle) { this.mixer.update(dt); return; }
    const sp = this.speedSmooth;
    let wIdle = 0, wWalk = 0, wRun = 0;
    if (sp < 0.35) wIdle = 1;
    else if (sp < CFG.WALK) {                       // 서기 ↔ 걷기
      const k = (sp - 0.35) / (CFG.WALK - 0.35);
      wIdle = 1 - k; wWalk = k;
    } else {                                        // 걷기 ↔ 달리기
      const k = Math.min(1, (sp - CFG.WALK) / (CFG.SPRINT - CFG.WALK));
      wWalk = 1 - k; wRun = k;
    }
    const ease = (a, w) => { if (a) a.setEffectiveWeight(a.getEffectiveWeight() + (w - a.getEffectiveWeight()) * Math.min(1, dt * 10)); };
    ease(A.idle, wIdle); ease(A.walk, wWalk); ease(A.run, wRun);
    // 발이 미끄러지지 않도록 재생 속도를 이동 속도에 맞춥니다
    if (A.walk) A.walk.setEffectiveTimeScale(Math.max(0.6, sp / CFG.WALK));
    if (A.run) A.run.setEffectiveTimeScale(Math.max(0.7, sp / CFG.SPRINT));
    this.mixer.update(dt);
  }

  /* 현재 든 무기 — 기존 코드가 그대로 쓰도록 접근자로 감쌉니다 */
  get gun() { return this.guns[this.slot]; }
  set gun(v) { this.guns[this.slot] = v; }
  get mag() { return this.mags[this.slot]; }
  set mag(v) { this.mags[this.slot] = v; }
  get other() { return this.guns[1 - this.slot]; }
  get zoom() {
    if (!this.gun) return 1;
    // 총에 붙어 있는 조준경은 뗄 수 없습니다 (VSS)
    const built = GUNS[this.gun].builtScope || 0;
    if (built) return built;
    if (this.scopeOff[this.slot]) return 1;
    return this.scopes[this.slot] || 1;
  }
  get scopeStowed() { return !!(this.scopes[this.slot] && this.scopeOff[this.slot]); }
  get hasTwo() { return !!(this.guns[0] && this.guns[1]); }

  get spec() { return this.gun ? GUNS[this.gun] : null; }
  /* 지금 든 총이 쓰는 구경 */
  get caliber() { return this.gun ? GUNS[this.gun].ammo : null; }
  get reserveAmmo() { return this.gun ? (this.reserve[GUNS[this.gun].ammo] || 0) : 0; }
  get eyeY() { return this.pos.y + (this.crouch ? 0.98 : CFG.EYE); }

  /* 가방이 좋을수록 구급상자와 예비 탄약을 더 챙길 수 있습니다 */
  get medCap() { return CFG.MAX_MEDS + (this.bag ? BAGS[this.bag].meds : 0); }
  get throwCap() { return CFG.MAX_THROW + (this.bag ? BAGS[this.bag].throw : 0); }
  get ammoCap() { return CFG.BASE_AMMO_CAP + (this.bag ? BAGS[this.bag].ammo : 0); }
  /* 조끼가 막아 주는 피해 비율 (몸통) */
  get armor() { return this.vest ? VESTS[this.vest].reduce : 0; }
  /* 헬멧이 막아 주는 피해 비율 (머리) */
  get headArmor() { return this.helmet ? HELMETS[this.helmet].reduce : 0; }

  /* 탄약을 구경별 한도까지만 담습니다. 실제로 담은 양을 돌려줍니다 */
  addAmmo(cal, n) {
    if (!cal) return 0;
    const have = this.reserve[cal] || 0;
    const room = Math.max(0, this.ammoCap - have);
    const take = Math.min(n, room);
    this.reserve[cal] = have + take;
    return take;
  }

  /* 이 구경을 쓰는 총을 들고 있는가 */
  usesCaliber(cal) { return this.guns.some(g => g && GUNS[g].ammo === cal); }

  /* 방어구를 착용합니다. 이전에 입고 있던 등급(없으면 0)을 돌려줍니다 */
  wear(kind, level) {
    const cur = this[kind] || 0;
    if (cur >= level) return -1;
    this[kind] = level;
    this.refreshGear();
    return cur;
  }

  /* 조끼·가방·헬멧을 몸에 붙입니다 */
  refreshGear() {
    const B = Build, mat = Mats.vc({ roughness: 0.7, metalness: 0.05 });
    /* 모델이 이미 방탄복을 입고 있으므로 조끼는 따로 그리지 않고,
       헬멧은 머리뼈에 가방은 등뼈에 답니다. */
    const drop = (m, parent) => { if (m && parent) parent.remove(m); };
    drop(this.vestMesh, this.gearMount); this.vestMesh = null;
    drop(this.bagMesh, this.gearMount); this.bagMesh = null;
    drop(this.helmetMesh, this.headMount); this.helmetMesh = null;
    if (!this.headMount) return;
    if (this.helmet) {
      const c = HELMETS[this.helmet].color, strap = 0x2a2d33;
      const parts = [
        B.sphere(0.128, c, 0, 0.130, 0.012, 1.04, 0.92, 1.06, 16),      // 헬멧 껍데기
        B.box(0.19, 0.024, 0.085, c, 0, 0.098, 0.115),                  // 챙
        B.box(0.030, 0.10, 0.028, strap, -0.108, 0.040, 0.030),         // 턱끈
        B.box(0.030, 0.10, 0.028, strap, 0.108, 0.040, 0.030)
      ];
      if (this.helmet >= 2) parts.push(B.box(0.045, 0.038, 0.065, strap, 0.108, 0.140, 0.0));  // 옆 부착물
      if (this.helmet >= 3) {
        parts.push(B.box(0.15, 0.028, 0.032, strap, 0, 0.218, 0.0));     // 윗면 레일
        parts.push(B.box(0.045, 0.055, 0.045, 0x1f2227, 0, 0.190, 0.105)); // 앞쪽 야시경 거치대
      }
      this.helmetMesh = new THREE.Mesh(B.merge(parts), mat);
      this.helmetMesh.castShadow = true;
      this.headMount.add(this.helmetMesh);
    }
    if (this.bag) {
      const c = BAGS[this.bag].color;
      const w = 0.25 + this.bag * 0.030, h = 0.24 + this.bag * 0.040, dz = 0.09 + this.bag * 0.020;
      const y0 = -0.19, z0 = -0.125;            // 척추뼈에서 등 한가운데에 붙입니다
      const parts = [
        B.box(w, h, dz, c, 0, y0, z0 - dz / 2),
        B.box(w * 0.86, h * 0.30, dz * 0.6, c, 0, y0 + h * 0.24, z0 - dz * 0.9),
        B.box(w * 0.7, 0.04, 0.03, 0x2a2d33, 0, y0 - 0.03, z0 - dz - 0.01)
      ];
      this.bagMesh = new THREE.Mesh(B.merge(parts), mat);
      this.bagMesh.castShadow = true;
      this.gearMount.add(this.bagMesh);
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
    this.addAmmo(GUNS[key].ammo, ammo == null ? CALIBERS[GUNS[key].ammo].box : ammo);
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
    const cal = GUNS[this.gun].ammo;
    const take = Math.min(need, this.reserve[cal] || 0);
    this.mag += take;
    this.reserve[cal] -= take;
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

    this.speedSmooth += (this.speedNow - this.speedSmooth) * Math.min(1, dt * 9);
    const b = this.body;

    /* 자세는 뼈대 애니메이션이 맡고, 여기서는 모델 전체를 기울이는 일만 합니다.
       (쓰러짐·낙하·기어오르기는 따로 만든 동작이 없어 몸통을 기울여 표현합니다) */
    const t = this._t || (this._t = { x: 0, y: 0, z: 0, rate: 12 });

    if (this.dead) {                                  // 쓰러짐: 앞으로 넘어갑니다
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const d = this.deadT * this.deadT * (3 - 2 * this.deadT);
      t.x = 1.45 * d; t.z = -0.18 * d; t.y = -0.05 * d;
      t.rate = 9;
      if (this.mixer) this.mixer.timeScale = 1 - d;   // 쓰러지며 동작이 멎습니다
      this.chute.visible = false;
    } else if (this.climb) {                          // 기어오르기: 몸을 세워 매달립니다
      const k = Math.min(1, this.climb.t / this.climb.dur);
      const pull = Math.sin(Math.min(1, k * 1.35) * Math.PI * 0.5);
      t.x = 0.55 - pull * 0.45; t.z = 0; t.y = 0;
      t.rate = 12;
    } else if (this.flying) {                         // 낙하
      if (this.flying === 'chute' && !this.chuteMesh) {
        this.chuteMesh = new THREE.Mesh(ChuteArt.build(),
          Mats.vc({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
        this.chuteMesh.castShadow = true;
        this.chuteMesh.position.y = 2.6;
        this.mesh.add(this.chuteMesh);
        this.chute = this.chuteMesh;
      }
      this.chute.visible = this.flying === 'chute';
      const free = this.flying === 'freefall';
      t.x = free ? 1.1 : -(0.16 + (this.chutePitch || 0) * 0.18);
      t.z = free ? 0 : this.chuteTilt * 0.5;
      t.y = 0; t.rate = 7;
      this.stepPhase += dt;
      if (!free) { this.chute.rotation.z = this.chuteTilt; this.chute.rotation.x = Math.sin(this.stepPhase * 0.6) * 0.04; }
    } else {
      if (this.chuteMesh) {
        this.mesh.remove(this.chuteMesh);
        this.chuteMesh = null;
        this.chute = { visible: false, rotation: { x: 0, y: 0, z: 0 } };
      }
      this.chute.visible = false;
      const run = Math.min(1, this.speedSmooth / CFG.SPRINT);
      // 달릴수록 앞으로, 앉으면 낮게
      t.x = run * 0.14; t.z = 0;
      t.y = this.crouch ? -0.34 : 0;
      t.rate = 14;
      if (this.mixer) this.mixer.timeScale = 1;
    }

    // 목표 기울기로 부드럽게 (프레임 수와 무관한 감속 보간)
    const p = this.pose;
    const k = 1 - Math.exp(-t.rate * Math.max(dt, 0.0001));
    p.bodyX += (t.x - p.bodyX) * k;
    p.bodyZ += (t.z - p.bodyZ) * k;
    p.bodyY += (t.y - p.bodyY) * k;
    b.rotation.set(p.bodyX, 0, p.bodyZ);
    b.position.y = p.bodyY;

    // 뼈대 애니메이션 (낙하·쓰러짐 중에도 돌려 자세가 굳지 않게 합니다)
    this.updateAnim(dt);

    // 조준 중에는 상체를 시선 쪽으로 살짝 틀어 줍니다
    if (this.spine) {
      const want = aiming ? -this.pitch * 0.55 : 0;
      this._spineX = (this._spineX || 0) + (want - (this._spineX || 0)) * Math.min(1, dt * 8);
      this.spine.rotation.x += this._spineX;
    }
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
      { kind: 'gun', gun, amount: CALIBERS[GUNS[gun].ammo].box * 2 },
      { kind: 'scope', level: scope },
      { kind: 'vest', level: t.vest },
      { kind: 'helmet', level: t.helmet },
      { kind: 'bag', level: t.bag },
      { kind: 'med', amount: t.meds },
      { kind: 'throw', gun: 'frag', amount: t.frag }
    ];
  }
}
