/* ============================================================
   월드: 지형(높이맵), 건물·나무·바위, 충돌 및 레이캐스트
   충돌 판정은 three.js Raycaster 대신 자체 해석식으로 처리해
   나무 수천 그루에서도 가볍게 동작합니다.
   ============================================================ */

/* sRGB 로 고른 색을 렌더러가 쓰는 선형 공간으로 옮깁니다.
   이 변환을 빼면 조명이 겹치며 화면 전체가 하얗게 뜹니다. */
function srgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

/* --- 값 노이즈 --- */
function hash2(x, y) {
  // Math.imul 로 32비트 곱셈을 유지합니다.
  // 일반 곱셈은 2^53 을 넘어가며 하위 비트가 뭉개져 노이즈가 평평해집니다.
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct, gain) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * f, y * f) * amp;
    norm += amp; amp *= gain; f *= 2.03;
  }
  return sum / norm;
}

const World = {
  size: CFG.MAP,
  half: CFG.MAP / 2,
  seg: CFG.SEG,
  step: CFG.MAP / CFG.SEG,
  heights: null,
  waterY: 0.8,
  boxes: [],        // 충돌 상자 { x,y,z, hx,hy,hz, yaw, cos,sin, top, bottom }
  cyls: [],         // 충돌 원기둥 { x,z,r,top }
  towns: [],
  grid: null,       // 브로드페이즈 격자
  cell: 40,
  group: null,

  /* ---------- 지형 ---------- */
  buildHeights() {
    const n = this.seg + 1;
    this.heights = new Float32Array(n * n);
    const seedX = Math.random() * 900, seedZ = Math.random() * 900;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.half + i * this.step;
        const z = -this.half + j * this.step;
        const nx = (x + seedX) / 170, nz = (z + seedZ) / 170;
        let h = fbm(nx, nz, 5, 0.5) * 40 - 8;            // 큰 언덕
        h += (fbm(nx * 3.1, nz * 3.1, 3, 0.5) - 0.5) * 7; // 중간 기복
        h += (valueNoise(nx * 9, nz * 9) - 0.5) * 1.6;    // 잔주름
        // 섬 마스크: 가장자리는 물 아래로 (해안선에 노이즈를 섞어 들쭉날쭉하게)
        const dr = Math.hypot(x, z) / this.half;
        const dq = Math.max(Math.abs(x), Math.abs(z)) / this.half;
        const d = dr * 0.65 + dq * 0.35 + (valueNoise(x / 85 + 31, z / 85 + 17) - 0.5) * 0.14;
        const edge = 1 - smooth(Math.min(1, Math.max(0, (d - 0.66) / 0.3)));
        h = h * edge - (1 - edge) * 14;
        this.heights[j * n + i] = h;
      }
    }
  },

  /* 마을이 들어설 자리를 평탄화 */
  flatten(cx, cz, radius) {
    const n = this.seg + 1;
    const target = this.height(cx, cz);
    const i0 = Math.max(0, Math.floor((cx - radius + this.half) / this.step));
    const i1 = Math.min(n - 1, Math.ceil((cx + radius + this.half) / this.step));
    const j0 = Math.max(0, Math.floor((cz - radius + this.half) / this.step));
    const j1 = Math.min(n - 1, Math.ceil((cz + radius + this.half) / this.step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -this.half + i * this.step, z = -this.half + j * this.step;
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) continue;
        const t = smooth(Math.min(1, d / radius));
        const k = j * n + i;
        this.heights[k] = this.heights[k] * t + target * (1 - t);
      }
    }
  },

  /* 임의 지점 높이 (이중선형 보간) */
  height(x, z) {
    const n = this.seg + 1;
    let fi = (x + this.half) / this.step, fj = (z + this.half) / this.step;
    fi = Math.min(n - 1.001, Math.max(0, fi));
    fj = Math.min(n - 1.001, Math.max(0, fj));
    const i = Math.floor(fi), j = Math.floor(fj);
    const tx = fi - i, tz = fj - j;
    const h00 = this.heights[j * n + i], h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i], h11 = this.heights[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  },

  /* ---------- 브로드페이즈 격자 ----------
     장애물을 만들 때마다 바로 색인해 두어 생성 도중에도 조회할 수 있습니다. */
  resetColliders() {
    this.boxes = []; this.cyls = []; this.grid = new Map();
  },

  index(obj, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const key = cx + ',' + cz;
        let arr = this.grid.get(key);
        if (!arr) { arr = []; this.grid.set(key, arr); }
        arr.push(obj);
      }
    }
  },

  addBox(b) {
    this.boxes.push(b);
    const rad = Math.hypot(b.hx, b.hz);
    this.index(b, b.x - rad, b.z - rad, b.x + rad, b.z + rad);
  },

  addCyl(c) {
    this.cyls.push(c);
    this.index(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
  },

  /* 선분이 지나는 칸의 장애물 모으기 */
  near(x1, z1, x2, z2, pad) {
    pad = pad || 0;
    if (!this.grid) return [];
    const c = this.cell;
    const out = new Set();
    const minX = Math.min(x1, x2) - pad, maxX = Math.max(x1, x2) + pad;
    const minZ = Math.min(z1, z2) - pad, maxZ = Math.max(z1, z2) + pad;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const arr = this.grid.get(cx + ',' + cz);
        if (arr) for (const o of arr) out.add(o);
      }
    }
    return out;
  },

  /* ---------- 충돌 ---------- */
  /* 발밑 지지 높이: 지형과 올라설 수 있는 상자 윗면 중 높은 쪽 */
  groundY(x, z, feetY) {
    let g = this.height(x, z);
    const list = this.near(x, z, x, z, 2);
    for (const o of list) {
      if (o.r !== undefined) continue;             // 원기둥은 올라설 수 없음
      if (o.top > feetY + 0.55) continue;          // 너무 높으면 지지대가 아님
      if (o.top < g) continue;
      if (this.insideBox(o, x, z, 0)) g = o.top;
    }
    return g;
  },

  insideBox(b, x, z, pad) {
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * b.cos + dz * b.sin;
    const lz = -dx * b.sin + dz * b.cos;
    return Math.abs(lx) <= b.hx + pad && Math.abs(lz) <= b.hz + pad;
  },

  /* 원기둥(캐릭터)을 장애물 밖으로 밀어냄 */
  resolve(x, z, r, feetY, headY) {
    const list = this.near(x, z, x, z, r + 3);
    for (let pass = 0; pass < 2; pass++) {
      for (const o of list) {
        if (o.r !== undefined) {
          if (o.top < feetY + 0.35) continue;
          const dx = x - o.x, dz = z - o.z;
          const d = Math.hypot(dx, dz), min = r + o.r;
          if (d < min && d > 1e-4) { x = o.x + dx / d * min; z = o.z + dz / d * min; }
          continue;
        }
        if (o.top <= feetY + 0.55 || o.bottom >= headY) continue;  // 넘어가거나 밑을 지남
        // 상자 로컬 좌표에서 밀어내기
        const dx = x - o.x, dz = z - o.z;
        let lx = dx * o.cos + dz * o.sin;
        let lz = -dx * o.sin + dz * o.cos;
        const ox = o.hx + r - Math.abs(lx);
        const oz = o.hz + r - Math.abs(lz);
        if (ox <= 0 || oz <= 0) continue;
        if (ox < oz) lx += Math.sign(lx || 1) * ox;
        else lz += Math.sign(lz || 1) * oz;
        x = o.x + lx * o.cos - lz * o.sin;
        z = o.z + lx * o.sin + lz * o.cos;
      }
    }
    const lim = this.half - 4;
    return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
  },

  /* ---------- 레이캐스트 ---------- */
  /* 지형·건물·나무에 대한 최근접 충돌 거리 (없으면 maxT) */
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.near(ox, oz, ex, ez, 2);

    for (const o of list) {
      if (o.r !== undefined) {
        // 원기둥 (XZ 원 + 높이)
        const px = ox - o.x, pz = oz - o.z;
        const a = dx * dx + dz * dz;
        if (a < 1e-8) continue;
        const b = 2 * (px * dx + pz * dz);
        const c = px * px + pz * pz - o.r * o.r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0.05 || t > best) continue;
        const hy = oy + dy * t;
        if (hy > o.top || hy < o.top - o.h) continue;
        best = t;
      } else {
        // 상자 (yaw 회전 OBB → 로컬 슬랩 검사)
        const px = ox - o.x, pz = oz - o.z;
        const lx = px * o.cos + pz * o.sin, lz = -px * o.sin + pz * o.cos;
        const ldx = dx * o.cos + dz * o.sin, ldz = -dx * o.sin + dz * o.cos;
        let t0 = 0, t1 = best;
        const axes = [[lx, ldx, o.hx], [oy - o.y, dy, o.hy], [lz, ldz, o.hz]];
        let ok = true;
        for (const [p, d, h] of axes) {
          if (Math.abs(d) < 1e-8) { if (Math.abs(p) > h) { ok = false; break; } continue; }
          let ta = (-h - p) / d, tb = (h - p) / d;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 > 0.05 && t0 < best) best = t0;
      }
    }

    // 지형: 일정 간격으로 높이 비교 후 이분 탐색
    const stepLen = 1.6;
    let prevT = 0, prevD = oy - this.height(ox, oz);
    for (let t = stepLen; t < Math.min(best, maxT); t += stepLen) {
      const d = (oy + dy * t) - this.height(ox + dx * t, oz + dz * t);
      if (d < 0 && prevD >= 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          const dm = (oy + dy * mid) - this.height(ox + dx * mid, oz + dz * mid);
          if (dm < 0) hi = mid; else lo = mid;
        }
        if (hi < best) best = hi;
        break;
      }
      prevT = t; prevD = d;
    }
    return best;
  },

  /* 두 점 사이가 트여 있는지 */
  clear(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    return this.ray(x1, y1, z1, dx / len, dy / len, dz / len, len) >= len - 0.4;
  },

  /* 지형 위 임의의 빈 자리 */
  freeSpot(minR, near, spread) {
    for (let i = 0; i < 400; i++) {
      let x, z;
      if (near) { x = near.x + (Math.random() * 2 - 1) * spread; z = near.z + (Math.random() * 2 - 1) * spread; }
      else { const lim = this.half * 0.72; x = (Math.random() * 2 - 1) * lim; z = (Math.random() * 2 - 1) * lim; }
      const y = this.height(x, z);
      if (y < this.waterY + 0.6) continue;
      const list = this.near(x, z, x, z, minR + 2);
      let ok = true;
      for (const o of list) {
        if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + minR) { ok = false; break; } }
        else if (this.insideBox(o, x, z, minR + 0.2) && o.top > y + 0.6) { ok = false; break; }
      }
      if (ok) return { x, y, z };
    }
    return { x: 0, y: this.height(0, 0), z: 0 };
  }
};
