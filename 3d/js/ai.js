/* ============================================================
   봇 인공지능 (3D)
   무거운 판단은 0.1~0.2초마다, 이동과 사격은 매 프레임 처리합니다.
   ============================================================ */
const AI = {
  _v: new THREE.Vector3(),

  update(bot, dt, game) {
    const a = bot.ai;
    a.think -= dt;
    a.strafeT -= dt;
    a.reaction -= dt;
    if (a.strafeT <= 0) { a.strafe *= -1; a.strafeT = 0.8 + Math.random() * 1.8; }

    if (a.think <= 0) { this.think(bot, game); a.think = 0.10 + Math.random() * 0.12; }

    if (bot.healing > 0) { bot.speedNow = 0; return; }

    let mx = 0, mz = 0, speed = CFG.WALK;
    const enemy = a.target;

    if (a.state === 'fight' && enemy && !enemy.dead) {
      const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      const toE = Math.atan2(dx, dz);
      // 조준: 숙련도가 높을수록 빠르게 겨눔
      const turn = (2.4 + a.skill * 5.5) * dt;
      bot.yaw = this.approach(bot.yaw, toE, turn);
      const dy = (enemy.pos.y + 1.25) - (bot.pos.y + 1.35);
      bot.pitch = this.approach(bot.pitch, Math.atan2(dy, dist), turn);

      const want = this.preferredRange(bot);
      if (dist > want * 1.2) { mx += dx / dist; mz += dz / dist; speed = CFG.SPRINT * 0.8; }
      else if (dist < want * 0.55) { mx -= dx / dist; mz -= dz / dist; }
      // 좌우 무빙
      mx += Math.cos(toE) * a.strafe * 0.9;
      mz += -Math.sin(toE) * a.strafe * 0.9;
      if (bot.hp < 35) { mx -= dx / dist * 0.8; mz -= dz / dist * 0.8; speed = CFG.SPRINT; }

      this.shoot(bot, enemy, dist, game);
    } else if (a.dest) {
      const dx = a.dest.x - bot.pos.x, dz = a.dest.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.2) {
        mx = dx / dist; mz = dz / dist;
        speed = a.state === 'zone' ? CFG.SPRINT : (dist > 25 ? CFG.SPRINT * 0.92 : CFG.WALK * 1.2);
        const face = Math.atan2(mx, mz);
        bot.yaw = this.approach(bot.yaw, face, 4 * dt);
        bot.pitch = this.approach(bot.pitch, 0, 2 * dt);
      }
    }

    // 장애물 회피: 진행 방향이 막히면 옆으로 비껴감
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const y = bot.pos.y + 1.0;
      const ahead = World.ray(bot.pos.x, y, bot.pos.z, mx, 0, mz, 3.2);
      if (ahead < 3.2) {
        const side = a.strafe;
        const rx = mx * Math.cos(0.9 * side) - mz * Math.sin(0.9 * side);
        const rz = mx * Math.sin(0.9 * side) + mz * Math.cos(0.9 * side);
        const alt = World.ray(bot.pos.x, y, bot.pos.z, rx, 0, rz, 3.2);
        if (alt > ahead) { mx = rx; mz = rz; }
        else {
          const ca = Math.cos(-0.9 * side), sa = Math.sin(-0.9 * side);
          const tx = mx * ca - mz * sa;
          mz = mx * sa + mz * ca;
          mx = tx;
        }
        // 낮은 턱은 뛰어넘기
        if (bot.grounded && Math.random() < 0.04) bot.vy = CFG.JUMP;
      }
    }

    if (bot.reloading > 0) speed *= 0.8;
    game.moveChar(bot, mx, mz, speed, dt);

    // 오래 제자리면 목적지 재설정
    a.destT -= dt;
    if (a.destT <= 0) { a.dest = null; a.destT = 6 + Math.random() * 4; }
  },

  think(bot, game) {
    const a = bot.ai;
    const zone = game.zone;
    const dz = Math.hypot(bot.pos.x - zone.x, bot.pos.z - zone.z);
    const outside = dz > zone.r - 12;

    // 적 탐색
    let enemy = null, best = Infinity;
    for (const c of game.chars) {
      if (c === bot || c.dead) continue;
      const d = bot.pos.distanceTo(c.pos);
      if (d > CFG.BOT_VISION || d > best) continue;
      // 시야각 밖(뒤쪽)은 조금 늦게 인지
      if (!World.clear(bot.pos.x, bot.pos.y + 1.35, bot.pos.z, c.pos.x, c.pos.y + 1.2, c.pos.z)) continue;
      best = d; enemy = c;
    }
    if (enemy && enemy !== a.target) a.reaction = (1.3 - a.skill) * (0.25 + Math.random() * 0.35);
    a.target = enemy;

    // 무기를 두 자루 들었으면 교전 거리에 맞는 쪽으로 바꿉니다
    if (enemy && bot.hasTwo && bot.swap <= 0 && bot.reloading <= 0) {
      const fit = key => {
        const g = GUNS[key];
        if (best > g.range) return -1;                 // 사거리 밖
        return best > 90 ? g.range / 500 : 1 - g.range / 500;
      };
      if (fit(bot.other) > fit(bot.gun) + 0.15) bot.swapSlot();
    }

    const noAmmo = !bot.gun || (bot.mag <= 0 && bot.reserveAmmo <= 0);

    if (bot.hp < 48 && bot.meds > 0 && (!enemy || best > 55) && !outside) {
      if (bot.startHeal()) { a.state = 'heal'; return; }
    }

    if (outside) {
      a.state = 'zone';
      const ang = Math.atan2(zone.x - bot.pos.x, zone.z - bot.pos.z);
      const rr = Math.max(0, zone.r - 25);
      a.dest = { x: zone.x - Math.sin(ang) * rr * 0.4, z: zone.z - Math.cos(ang) * rr * 0.4 };
      // 자기장 안쪽으로 곧장
      a.dest = { x: zone.x + (bot.pos.x - zone.x) * (rr / Math.max(dz, 1)) * 0.7,
                 z: zone.z + (bot.pos.z - zone.z) * (rr / Math.max(dz, 1)) * 0.7 };
      return;
    }
    if (enemy && !noAmmo) { a.state = 'fight'; return; }
    if (enemy && noAmmo && best < 45) {
      a.state = 'flee';
      a.dest = { x: bot.pos.x + (bot.pos.x - enemy.pos.x), z: bot.pos.z + (bot.pos.z - enemy.pos.z) };
      return;
    }

    // 아이템 찾기
    if (noAmmo || (bot.reserveAmmo < 20 && bot.mag < 8) || (bot.meds < 1 && bot.hp < 70)) {
      let target = null, bd = 70 * 70;
      for (const l of game.loots) {
        if (l.dead) continue;
        if (l.kind === 'ammo' && (!bot.gun || l.gun !== bot.gun)) continue;
        if (l.kind === 'med' && bot.meds >= 2) continue;
        if (l.kind === 'scope' && (!bot.gun || !GUNS[bot.gun].canScope ||
            (bot.scopes[bot.slot] || 0) >= l.level)) continue;
        const d = (l.pos.x - bot.pos.x) ** 2 + (l.pos.z - bot.pos.z) ** 2;
        if (d < bd) { bd = d; target = l; }
      }
      if (target) {
        a.state = 'loot';
        a.dest = { x: target.pos.x, z: target.pos.z };
        if (bd < CFG.PICK_RANGE * CFG.PICK_RANGE) game.pickUp(bot, target);
        return;
      }
    }

    // 근처 아이템은 지나가며 줍기
    for (const l of game.loots) {
      if (l.dead) continue;
      const d = (l.pos.x - bot.pos.x) ** 2 + (l.pos.z - bot.pos.z) ** 2;
      if (d < CFG.PICK_RANGE * CFG.PICK_RANGE) { game.pickUp(bot, l); break; }
    }

    // 자기장 안쪽 목적지로 이동
    a.state = 'rotate';
    if (!a.dest || Math.hypot(a.dest.x - bot.pos.x, a.dest.z - bot.pos.z) < 6) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * zone.r * 0.7;
      a.dest = { x: zone.x + Math.cos(ang) * rad, z: zone.z + Math.sin(ang) * rad };
      a.destT = 8 + Math.random() * 6;
    }
    if (bot.gun && bot.mag < bot.spec.mag && bot.reserveAmmo > 0) bot.startReload();
  },

  preferredRange(bot) {
    if (!bot.gun) return 30;
    const r = bot.spec.range;
    return Math.max(12, Math.min(r * 0.45, 90));
  },

  shoot(bot, enemy, dist, game) {
    const a = bot.ai;
    if (a.reaction > 0) return;
    if (!bot.gun) return;
    if (bot.needsReload()) { bot.startReload(); return; }
    if (!bot.canShoot()) return;
    if (dist > bot.spec.range) return;

    const ex = enemy.pos.x, ey = enemy.pos.y + 1.15, ez = enemy.pos.z;
    const bx = bot.pos.x, by = bot.pos.y + 1.35, bz = bot.pos.z;
    if (!World.clear(bx, by, bz, ex, ey, ez)) return;

    // 조준선이 목표에 충분히 가까울 때만 발사
    const toE = Math.atan2(ex - bx, ez - bz);
    if (Math.abs(this.angleDiff(bot.yaw, toE)) > 0.16) return;

    const v = this._v.set(ex - bx, ey - by, ez - bz).normalize();
    // 숙련도와 거리에 따른 조준 오차
    const err = (1.05 - a.skill) * 0.045 * (0.5 + dist / 90);
    v.x += (Math.random() * 2 - 1) * err;
    v.y += (Math.random() * 2 - 1) * err * 0.6;
    v.z += (Math.random() * 2 - 1) * err;
    v.normalize();
    game.fireShot(bot, bx, by, bz, v);
  },

  approach(a, b, step) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= step) return b;
    return a + Math.sign(d) * step;
  },
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
};
