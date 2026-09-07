/* ============================================================
   맵 생성 및 충돌/시야 판정
   ============================================================ */
const World = {
  size: CONFIG.WORLD,
  walls: [],    // 건물/벽 (이동·총알 차단)
  rocks: [],    // 바위 (이동·총알 차단)
  bushes: [],   // 수풀 (장식 + 은폐감)
  zones: [],    // 지역 이름표

  generate() {
    this.size = CONFIG.WORLD;
    this.walls = [];
    this.rocks = [];
    this.bushes = [];
    this.zones = [];

    const S = this.size;
    const margin = 140;

    // --- 마을(건물 뭉치) 여러 곳 배치 ---
    const townNames = ['북쪽 폐허', '중앙 창고', '남쪽 마을', '동부 공장', '서부 캠프', '항구', '방송국', '채석장'];
    const townCount = 8;
    const towns = [];
    for (let i = 0; i < townCount; i++) {
      let cx, cy, ok = false, tries = 0;
      while (!ok && tries++ < 200) {
        cx = U.rand(margin + 300, S - margin - 300);
        cy = U.rand(margin + 300, S - margin - 300);
        ok = towns.every(t => U.dist(t.x, t.y, cx, cy) > 780);
      }
      towns.push({ x: cx, y: cy });
      this.zones.push({ x: cx, y: cy, name: townNames[i % townNames.length] });

      const buildings = U.randInt(4, 7);
      for (let b = 0; b < buildings; b++) {
        for (let t = 0; t < 40; t++) {
          const w = U.rand(90, 230), h = U.rand(90, 230);
          const rect = {
            x: U.clamp(cx + U.rand(-320, 320) - w / 2, margin, S - margin - w),
            y: U.clamp(cy + U.rand(-320, 320) - h / 2, margin, S - margin - h),
            w, h
          };
          if (this.walls.every(o => !U.rectsOverlap(o, rect, 60))) { this.walls.push(rect); break; }
        }
      }
    }

    // --- 흩어진 컨테이너 / 담장 ---
    for (let i = 0; i < 34; i++) {
      for (let t = 0; t < 30; t++) {
        const horiz = Math.random() < 0.5;
        const w = horiz ? U.rand(120, 300) : U.rand(34, 60);
        const h = horiz ? U.rand(34, 60) : U.rand(120, 300);
        const rect = { x: U.rand(margin, S - margin - w), y: U.rand(margin, S - margin - h), w, h };
        if (this.walls.every(o => !U.rectsOverlap(o, rect, 70))) { this.walls.push(rect); break; }
      }
    }

    // --- 바위 ---
    for (let i = 0; i < 90; i++) {
      const r = U.rand(20, 46);
      const x = U.rand(margin, S - margin), y = U.rand(margin, S - margin);
      if (this.walls.some(w => U.circleHitsRect(x, y, r + 40, w))) continue;
      this.rocks.push({ x, y, r });
    }

    // --- 수풀 ---
    for (let i = 0; i < 220; i++) {
      this.bushes.push({ x: U.rand(60, S - 60), y: U.rand(60, S - 60), r: U.rand(22, 50) });
    }

    return this;
  },

  /* 원이 지형과 충돌하는지 */
  blocked(x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r > this.size || y + r > this.size) return true;
    for (const w of this.walls) if (U.circleHitsRect(x, y, r, w)) return true;
    for (const o of this.rocks) if (U.dist2(x, y, o.x, o.y) < (r + o.r) * (r + o.r)) return true;
    return false;
  },

  /* 총알(점)이 지형에 막히는지 */
  hitsSolid(x, y) {
    if (x < 0 || y < 0 || x > this.size || y > this.size) return true;
    for (const w of this.walls) if (U.pointInRect(x, y, w)) return true;
    for (const o of this.rocks) if (U.dist2(x, y, o.x, o.y) < o.r * o.r) return true;
    return false;
  },

  /* 두 점 사이 시야 확보 여부 */
  lineOfSight(x1, y1, x2, y2) {
    const d = U.dist(x1, y1, x2, y2);
    const steps = Math.ceil(d / 26);
    if (steps <= 1) return true;
    const dx = (x2 - x1) / steps, dy = (y2 - y1) / steps;
    for (let i = 1; i < steps; i++) {
      if (this.hitsSolid(x1 + dx * i, y1 + dy * i)) return false;
    }
    return true;
  },

  /* 지형에 막히지 않는 랜덤 위치 */
  freeSpot(r, near, spread) {
    for (let i = 0; i < 300; i++) {
      let x, y;
      if (near) {
        x = U.clamp(near.x + U.rand(-spread, spread), 60, this.size - 60);
        y = U.clamp(near.y + U.rand(-spread, spread), 60, this.size - 60);
      } else {
        x = U.rand(80, this.size - 80);
        y = U.rand(80, this.size - 80);
      }
      if (!this.blocked(x, y, r)) return { x, y };
    }
    return { x: this.size / 2, y: this.size / 2 };
  }
};
