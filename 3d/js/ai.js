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
    a.nadeT = (a.nadeT || 0) - dt;
    if (a.strafeT <= 0) { a.strafe *= -1; a.strafeT = 0.8 + Math.random() * 1.8; }

    if (a.think <= 0) { this.think(bot, game); a.think = 0.10 + Math.random() * 0.12; }

    if (bot.healing > 0) { bot.speedNow = 0; return; }

    let mx = 0, mz = 0, speed = CFG.WALK;
    const enemy = a.target;

    if (a.state === 'fight' && enemy && !enemy.dead) {
      const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      const toE = Math.atan2(dx, dz);
      // 조준 회전: 사람이 마우스로 낼 수 있는 속도에 맞춰 둡니다
      const turn = CFG.BOT_TURN * dt;
      bot.yaw = this.approach(bot.yaw, toE, turn);
      const dy = (enemy.pos.y + CFG.BOT_AIM_Y) - (bot.pos.y + 1.15);
      bot.pitch = this.approach(bot.pitch, Math.atan2(dy, dist), turn);

      /* 교전 자세.
         사거리 안에 들어와 조준이 끝났으면 '자리를 잡고' 쏩니다.
         계속 뛰면서 쏘면 탄퍼짐이 두 배가 되어 아무리 쏴도 맞지 않습니다. */
      const want = this.preferredRange(bot);
      const aimed = Math.abs(this.angleDiff(bot.yaw, toE)) < 0.2;
      const settled = dist < want * 1.15 && aimed && a.reaction <= 0 && bot.hp >= 35;
      bot.ads = settled;

      if (dist > want * 1.2) { mx += dx / dist; mz += dz / dist; speed = CFG.SPRINT * 0.8; }
      else if (dist < want * 0.55) { mx -= dx / dist; mz -= dz / dist; }
      // 좌우 무빙 (조준 중에는 살짝만)
      const sw = settled ? 0.3 : 0.9;
      mx += Math.cos(toE) * a.strafe * sw;
      mz += -Math.sin(toE) * a.strafe * sw;
      if (settled) speed = Math.min(speed, CFG.WALK * 0.45);   // 천천히 움직여야 탄이 모입니다
      if (bot.hp < 35) { mx -= dx / dist * 0.8; mz -= dz / dist * 0.8; speed = CFG.SPRINT; }

      this.shoot(bot, enemy, dist, game);
    } else if ((bot.ads = false) || a.dest) {
      const dx = a.dest.x - bot.pos.x, dz = a.dest.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.2) {
        mx = dx / dist; mz = dz / dist;
        speed = a.state === 'zone' ? CFG.SPRINT : (dist > 25 ? CFG.SPRINT * 0.92 : CFG.WALK);
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
        // 막힌 게 넘어갈 만한 턱이면 기어오릅니다 (담장·상자·낮은 지붕)
        if (ahead < 1.8 && bot.grounded) {
          const oldYaw = bot.yaw;
          bot.yaw = Math.atan2(mx, mz);
          const v = game.vaultTarget(bot);
          if (v) { game.startClimb(bot, v); return; }
          bot.yaw = oldYaw;
        }
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

    /* 봇도 사람과 같은 속도 규칙을 지키게 합니다.
       사람은 앞으로 갈 때만 질주할 수 있고, 정조준 중에는 걷기의 60%,
       옆걸음·뒷걸음은 걷기 속도가 상한입니다. 예전에는 봇만 이 규칙을
       벗어나 옆으로도 뒤로도 질주해서, 실제로 사람보다 빨랐습니다
       (교전 중 최대 7.8 m/s — 같은 상황의 사람은 2.64~4.4). */
    if (mx || mz) {
      const fwd = Math.sin(bot.yaw) * mx + Math.cos(bot.yaw) * mz;   // 얼마나 '앞으로' 가는가
      let cap = fwd > 0.5 ? CFG.SPRINT : CFG.WALK;
      if (bot.ads) cap = CFG.WALK * 0.6;
      if (bot.crouch) cap = CFG.CROUCH;
      speed = Math.min(speed, cap);
    }
    speed *= CFG.BOT_SPEED;

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

    /* 적 탐색.
       사람은 화면에 담긴 각도만 볼 수 있으므로 봇도 같게 제한합니다.
       예전에는 '시야각 밖은 늦게 인지' 라는 주석만 있고 검사가 없어서,
       봇이 등 뒤 165m 까지 다 보고 있었습니다 — 사람에게 없는 이점이었습니다.
       뒤쪽은 발소리·총성으로 아는 정도만 인정해, 가까울 때만 알아챕니다. */
    const cosFov = Math.cos(CFG.BOT_FOV * Math.PI / 360);      // 반각의 코사인
    let enemy = null, best = Infinity;
    for (const c of game.chars) {
      if (c === bot || c.dead) continue;
      const d = bot.pos.distanceTo(c.pos);
      if (d > CFG.BOT_VISION || d > best) continue;
      if (d > CFG.BOT_HEAR) {
        const ex = c.pos.x - bot.pos.x, ez = c.pos.z - bot.pos.z;
        const len = Math.hypot(ex, ez) || 1e-4;
        if ((Math.sin(bot.yaw) * ex + Math.cos(bot.yaw) * ez) / len < cosFov) continue;
      }
      if (!World.clear(bot.pos.x, bot.pos.y + 1.15, bot.pos.z, c.pos.x, c.pos.y + 1.0, c.pos.z)) continue;
      // 연막 너머는 보이지 않습니다
      if (game.smoked(bot.pos.x, bot.pos.y + 1.15, bot.pos.z, c.pos.x, c.pos.y + 1.0, c.pos.z)) continue;
      best = d; enemy = c;
    }
    // 처음 본 순간의 반응 지연 (사람 평균 반응 속도 만큼)
    if (enemy && enemy !== a.target) a.reaction = CFG.BOT_REACT * (0.75 + Math.random() * 0.5);
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

    // 착지한 보급 상자가 가까우면 챙기러 갑니다
    if (!enemy) {
      let box = null, bxd = 130 * 130;
      for (const dr of game.drops) {
        if (!dr.landed || dr.opened || dr.dead) continue;
        const d = (dr.pos.x - bot.pos.x) ** 2 + (dr.pos.z - bot.pos.z) ** 2;
        if (d < bxd) { bxd = d; box = dr; }
      }
      if (box) {
        a.state = 'loot';
        a.dest = { x: box.pos.x, z: box.pos.z };
        if (bxd < CFG.DROP_OPEN * CFG.DROP_OPEN) game.openDrop(bot, box);
        return;
      }
    }

    // 아이템 찾기 (무기·탄약뿐 아니라 조끼와 가방도 챕니다)
    const wantGear = bot.vest < 3 || bot.bag < 3 || bot.helmet < 3;
    if (noAmmo || (bot.reserveAmmo < 20 && bot.mag < 8) || (bot.meds < 1 && bot.hp < 70) || wantGear) {
      let target = null, bd = 80 * 80;
      for (const l of game.loots) {
        if (l.dead) continue;
        if (a.skip && a.skip.get(l) > game.time) continue;   // 한동안 포기한 아이템
        /* 이미 가진 총인데 그 구경 탄약까지 가득이면 주워도 얻을 것이 없습니다.
           예전에는 이런 총을 목표로 잡고 그 자리에서 줍기만 끝없이 되풀이해,
           봇이 접속이 끊긴 것처럼 굳어 있다가 나중에 갑자기 움직였습니다. */
        if (l.kind === 'gun' && bot.guns.indexOf(l.gun) >= 0 &&
            (bot.reserve[GUNS[l.gun].ammo] || 0) >= bot.ammoCap) continue;
        if (l.kind === 'ammo' && (!bot.usesCaliber(l.gun) ||
            (bot.reserve[l.gun] || 0) >= bot.ammoCap)) continue;
        if (l.kind === 'med' && bot.meds >= bot.medCap) continue;
        if (l.kind === 'vest' && bot.vest >= l.level) continue;
        if (l.kind === 'helmet' && bot.helmet >= l.level) continue;
        if (l.kind === 'throw' && (bot.throws[l.gun] || 0) >= bot.throwCap) continue;
        if (l.kind === 'bag' && bot.bag >= l.level) continue;
        if (l.kind === 'scope' && (!bot.gun || !GUNS[bot.gun].canScope ||
            (bot.scopes[bot.slot] || 0) >= l.level)) continue;
        const d = (l.pos.x - bot.pos.x) ** 2 + (l.pos.z - bot.pos.z) ** 2;
        if (d < bd) { bd = d; target = l; }
      }
      if (target) {
        a.state = 'loot';
        a.dest = { x: target.pos.x, z: target.pos.z };
        /* 한 아이템이 봇을 영영 붙잡아 두지 못하게 하는 안전장치입니다.
           목표에 가까워지지 못한 채 6초가 지나면 — 지붕이나 벼랑처럼 걸어서
           닿을 수 없는 자리든, 주워도 얻을 것이 없어 아이템이 그대로 남든 —
           그 아이템은 한동안 포기하고 다른 것을 찾습니다. 예전에는 이때 봇이
           접속이 끊긴 것처럼 굳어 있다가 갑자기 다시 움직였습니다. */
        const d = Math.sqrt(bd);
        if (a.stuckOn !== target) { a.stuckOn = target; a.stuckAt = game.time; a.stuckBest = d; }
        else if (d < a.stuckBest - 0.5) { a.stuckBest = d; a.stuckAt = game.time; }
        else if (game.time - a.stuckAt > 6) {
          if (!a.skip) a.skip = new Map();
          a.skip.set(target, game.time + 60);
          a.stuckOn = null;
          return;
        }
        if (bd < CFG.PICK_RANGE * CFG.PICK_RANGE && game.pickUp(bot, target)) a.stuckOn = null;
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
      /* 결투장에서는 익힌 길목 쪽으로 다시 잡습니다. 익힌 게 없으면
         맵 안의 아무 칸이나 고릅니다 — 자기장 반지름으로 뽑으면 결투장에서는
         맵 밖을 향해 벽에 붙어 서 있게 됩니다. */
      const spot = game.duel ? (Habit.ambush() || Habit.spotOf(Math.floor(Math.random() * 25))) : null;
      if (spot) a.dest = spot;
      else {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * zone.r * 0.7;
        a.dest = { x: zone.x + Math.cos(ang) * rad, z: zone.z + Math.sin(ang) * rad };
      }
      a.destT = 8 + Math.random() * 6;
    }
    if (bot.gun && bot.mag < bot.spec.mag && bot.reserveAmmo > 0) bot.startReload();
  },

  /* 붙어서 싸우는 거리.
     예전에는 90m 까지 벌어져 서로 아무도 못 맞히는 싸움이 됐습니다. */
  preferredRange(bot) {
    if (!bot.gun) return 22;
    const r = bot.spec.range;
    return Math.max(9, Math.min(r * 0.28, 55));
  },

  /* 이 거리보다 멀면 아예 쏘지 않고 접근합니다 */
  engageRange(bot) {
    return Math.min(bot.spec.range, this.preferredRange(bot) * 1.6);
  },

  shoot(bot, enemy, dist, game) {
    const a = bot.ai;
    if (a.reaction > 0) return;
    if (!bot.gun) return;
    if (bot.needsReload()) { bot.startReload(); return; }
    if (!bot.canShoot()) return;
    if (dist > this.engageRange(bot)) return;

    const ex = enemy.pos.x, ey = enemy.pos.y + CFG.BOT_AIM_Y, ez = enemy.pos.z;
    const bx = bot.pos.x, by = bot.pos.y + 1.15, bz = bot.pos.z;
    if (!World.clear(bx, by, bz, ex, ey, ez)) return;

    /* 알맞은 거리면 가끔 수류탄을 던집니다.
       너무 가까우면 자기도 휘말리므로 12m 보다 멀 때만 씁니다. */
    if (bot.throws.frag > 0 && dist > 12 && dist < 34 && a.nadeT <= 0 && Math.random() < 0.02) {
      a.nadeT = 9 + Math.random() * 8;
      game.throwItem(bot, 'frag');
      return;
    }
    // 체력이 깎였는데 적이 멀면 연막을 치고 빠집니다
    if (bot.throws.smoke > 0 && bot.hp < 45 && dist > 14 && a.nadeT <= 0 && Math.random() < 0.03) {
      a.nadeT = 12;
      game.throwItem(bot, 'smoke');
      return;
    }

    // 조준선이 목표에 충분히 가까울 때만 발사
    const toE = Math.atan2(ex - bx, ez - bz);
    if (Math.abs(this.angleDiff(bot.yaw, toE)) > 0.16) return;

    const v = this._v.set(ex - bx, ey - by, ez - bz).normalize();
    /* 사람에게 없는 인공 조준 오차. 기본은 0 이라 봇의 명중률은
       사람과 같은 탄퍼짐(총 성능)만으로 결정됩니다. */
    const err = CFG.BOT_AIM_ERR * (0.55 + dist / 130);
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
