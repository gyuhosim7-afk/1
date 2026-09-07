/* ============================================================
   봇 인공지능
   ============================================================ */
const AI = {
  update(bot, dt, game) {
    const a = bot.ai;
    const zone = game.zone;

    a.strafeTimer -= dt;
    if (a.strafeTimer <= 0) { a.strafe *= -1; a.strafeTimer = U.rand(0.7, 2.0); }
    a.reaction -= dt;

    // --- 자기장 판단 ---
    const dz = U.dist(bot.x, bot.y, zone.x, zone.y);
    const outside = dz > zone.r - 90;
    const dangerZone = dz > zone.r * 0.92;

    // --- 적 탐색 ---
    let enemy = null, edist = Infinity;
    for (const c of game.chars) {
      if (c === bot || c.dead) continue;
      const d = U.dist(bot.x, bot.y, c.x, c.y);
      if (d < edist && d < CONFIG.VISION && World.lineOfSight(bot.x, bot.y, c.x, c.y)) {
        enemy = c; edist = d;
      }
    }
    if (enemy && enemy !== a.target) a.reaction = U.rand(0.12, 0.55) * (1.5 - a.skill);
    a.target = enemy;

    const outOfAmmo = !bot.weapon || (bot.mag <= 0 && bot.reserveAmmo <= 0);

    // --- 치료 ---
    if (bot.healing > 0) { return; }
    if (bot.hp < 45 && bot.meds > 0 && (!enemy || edist > 520)) {
      if (bot.startHeal()) return;
    }

    // --- 상태 결정 ---
    if (outside) a.state = 'zone';
    else if (enemy && !outOfAmmo) a.state = 'fight';
    else if (enemy && outOfAmmo && edist < 420) a.state = 'flee';
    else if (outOfAmmo || (bot.reserveAmmo < 15 && bot.mag < 6)) a.state = 'loot';
    else if (dangerZone) a.state = 'zone';
    else a.state = 'roam';

    let mx = 0, my = 0, sprint = 1;

    if (a.state === 'zone') {
      const ang = U.angle(bot.x, bot.y, zone.x, zone.y);
      mx = Math.cos(ang); my = Math.sin(ang);
      sprint = 1.35;
      if (enemy && !outOfAmmo) this.combat(bot, enemy, edist, dt, game, false);
      else bot.angle = U.approachAngle(bot.angle, ang, 6 * dt);
    }
    else if (a.state === 'fight') {
      const mv = this.combat(bot, enemy, edist, dt, game, true);
      mx = mv.x; my = mv.y;
    }
    else if (a.state === 'flee') {
      const ang = U.angle(enemy.x, enemy.y, bot.x, bot.y);
      mx = Math.cos(ang); my = Math.sin(ang);
      sprint = 1.4;
      bot.angle = U.approachAngle(bot.angle, ang, 5 * dt);
    }
    else if (a.state === 'loot') {
      let best = null, bd = 900 * 900;
      for (const p of game.pickups) {
        if (p.dead) continue;
        if (p.kind === 'ammo' && (!bot.weapon || p.weapon !== bot.weapon)) continue;
        if (p.kind === 'med' && bot.meds >= 2) continue;
        const d = U.dist2(bot.x, bot.y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        const ang = U.angle(bot.x, bot.y, best.x, best.y);
        mx = Math.cos(ang); my = Math.sin(ang);
        bot.angle = U.approachAngle(bot.angle, ang, 6 * dt);
        sprint = 1.2;
        if (U.dist(bot.x, bot.y, best.x, best.y) < CONFIG.PICKUP_RANGE) game.pickUp(bot, best);
      } else {
        this.wander(bot, dt, zone);
        mx = Math.cos(a.wanderAngle); my = Math.sin(a.wanderAngle);
      }
    }
    else { // roam
      this.wander(bot, dt, zone);
      mx = Math.cos(a.wanderAngle); my = Math.sin(a.wanderAngle);
      bot.angle = U.approachAngle(bot.angle, a.wanderAngle, 4 * dt);
      // 가까운 아이템은 지나가며 줍기
      for (const p of game.pickups) {
        if (!p.dead && U.dist2(bot.x, bot.y, p.x, p.y) < CONFIG.PICKUP_RANGE * CONFIG.PICKUP_RANGE) {
          game.pickUp(bot, p); break;
        }
      }
    }

    // --- 재장전 ---
    if (bot.mag <= 0 && bot.reserveAmmo > 0) bot.startReload();
    else if (a.state !== 'fight' && bot.weapon && bot.mag < bot.spec.mag && bot.reserveAmmo > 0 && bot.reloading <= 0) {
      bot.startReload();
    }

    game.moveChar(bot, mx, my, dt, sprint);
  },

  /* 전투 기동 + 조준 + 사격. 반환값은 이동 방향 */
  combat(bot, enemy, edist, dt, game, allowMove) {
    const a = bot.ai;
    const spec = bot.spec;
    const toEnemy = U.angle(bot.x, bot.y, enemy.x, enemy.y);

    // 조준 (숙련도에 따라 회전 속도 차이)
    const turn = (3.2 + a.skill * 5) * dt;
    bot.angle = U.approachAngle(bot.angle, toEnemy, turn);

    // 사격 판단
    if (a.reaction <= 0 && spec) {
      const inRange = edist < spec.range * 0.95;
      const aimed = Math.abs(U.angleDiff(bot.angle, toEnemy)) < 0.12 + (1 - a.skill) * 0.10;
      if (inRange && aimed && bot.canShoot() && World.lineOfSight(bot.x, bot.y, enemy.x, enemy.y)) {
        const err = ((1 - a.skill) * 0.16 + 0.02) * U.rand(-1, 1) * (edist / 380 + 0.55);
        game.fire(bot, bot.angle + err);
      } else if (bot.needsReload()) {
        bot.startReload();
      }
    }
    if (a.reaction < 0) a.reaction = 0;

    if (!allowMove) return { x: 0, y: 0 };

    // 무기별 선호 거리 유지 + 좌우 무빙
    const want = U.clamp(spec ? spec.range * 0.5 : 300, 130, 620);
    let mx = 0, my = 0;
    if (edist > want * 1.15) { mx += Math.cos(toEnemy); my += Math.sin(toEnemy); }
    else if (edist < want * 0.65) { mx -= Math.cos(toEnemy); my -= Math.sin(toEnemy); }
    const perp = toEnemy + Math.PI / 2;
    mx += Math.cos(perp) * a.strafe * 0.85;
    my += Math.sin(perp) * a.strafe * 0.85;

    if (bot.hp < 30) { // 체력 낮으면 거리 벌리기
      mx -= Math.cos(toEnemy) * 0.9; my -= Math.sin(toEnemy) * 0.9;
    }
    const len = Math.hypot(mx, my) || 1;
    return { x: mx / len, y: my / len };
  },

  wander(bot, dt, zone) {
    const a = bot.ai;
    a.wanderTimer -= dt;
    if (a.wanderTimer <= 0 || !a.dest || U.dist(bot.x, bot.y, a.dest.x, a.dest.y) < 90) {
      // 자기장 안쪽의 임의 지점을 목표로
      const ang = U.rand(-Math.PI, Math.PI);
      const rad = U.rand(0, zone.r * 0.75);
      a.dest = { x: U.clamp(zone.x + Math.cos(ang) * rad, 60, World.size - 60),
                 y: U.clamp(zone.y + Math.sin(ang) * rad, 60, World.size - 60) };
      a.wanderTimer = U.rand(3, 7);
    }
    a.wanderAngle = U.angle(bot.x, bot.y, a.dest.x, a.dest.y);
  }
};
