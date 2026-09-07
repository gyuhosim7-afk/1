/* ============================================================
   엔티티: 캐릭터 / 총알 / 아이템
   ============================================================ */

class Pickup {
  constructor(x, y, kind, weapon, amount) {
    this.x = x; this.y = y;
    this.kind = kind;              // 'weapon' | 'ammo' | 'med'
    this.weapon = weapon || null;  // kind === 'weapon' | 'ammo' 일 때
    this.amount = amount || 0;
    this.bob = Math.random() * Math.PI * 2;
    this.dead = false;
  }
  get label() {
    if (this.kind === 'weapon') return WEAPONS[this.weapon].name;
    if (this.kind === 'ammo') return WEAPONS[this.weapon].short + ' 탄약 ' + this.amount;
    return '구급킷';
  }
  get color() {
    if (this.kind === 'weapon') return WEAPONS[this.weapon].color;
    if (this.kind === 'ammo') return '#f2cc60';
    return '#ff7b72';
  }
}

class Bullet {
  constructor(owner, x, y, angle, w) {
    const spec = WEAPONS[w];
    this.owner = owner;
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * spec.bspeed;
    this.vy = Math.sin(angle) * spec.bspeed;
    this.dmg = spec.dmg;
    this.left = spec.range;
    this.color = spec.color;
    this.weapon = w;
    this.dead = false;
    this.px = x; this.py = y;
  }
}

class Character {
  constructor(x, y, isPlayer, name) {
    this.x = x; this.y = y;
    this.r = 15;
    this.hp = 100; this.maxHp = 100;
    this.angle = U.rand(-Math.PI, Math.PI);
    this.isPlayer = !!isPlayer;
    this.name = name;
    this.dead = false;
    this.kills = 0;
    this.rank = 0;

    this.weapon = null;
    this.mag = 0;
    this.reserve = {};      // { pistol: 60, ... }
    this.meds = isPlayer ? 1 : U.randInt(0, 2);
    this.reloading = 0;     // 남은 재장전 시간
    this.cooldown = 0;      // 다음 발사까지 남은 시간
    this.healing = 0;       // 남은 치료 시간
    this.hitFlash = 0;
    this.recoil = 0;

    this.speed = isPlayer ? CONFIG.PLAYER_SPEED : CONFIG.BOT_SPEED;
    this.color = isPlayer ? '#58a6ff' : '#ff6b6b';

    // 봇 AI 상태
    this.ai = isPlayer ? null : {
      state: 'loot',
      target: null,
      lootTarget: null,
      strafe: Math.random() < 0.5 ? 1 : -1,
      strafeTimer: U.rand(0.6, 1.8),
      wanderAngle: U.rand(-Math.PI, Math.PI),
      wanderTimer: 0,
      reaction: 0,
      skill: U.rand(0.35, 1.0),          // 명중률/판단력
      aggression: U.rand(0.3, 1.0),
      dest: null
    };
  }

  get spec() { return this.weapon ? WEAPONS[this.weapon] : null; }
  get reserveAmmo() { return this.weapon ? (this.reserve[this.weapon] || 0) : 0; }

  giveWeapon(key, ammo) {
    this.weapon = key;
    this.mag = WEAPONS[key].mag;
    this.reserve[key] = (this.reserve[key] || 0) + (ammo == null ? WEAPONS[key].ammoPer : ammo);
    this.reloading = 0;
  }

  canShoot() {
    return !this.dead && this.weapon && this.mag > 0 && this.cooldown <= 0 && this.reloading <= 0 && this.healing <= 0;
  }

  needsReload() {
    return this.weapon && this.mag <= 0 && this.reserveAmmo > 0 && this.reloading <= 0;
  }

  startReload() {
    if (!this.weapon || this.reloading > 0 || this.healing > 0) return false;
    if (this.mag >= this.spec.mag || this.reserveAmmo <= 0) return false;
    this.reloading = this.spec.reload;
    return true;
  }

  finishReload() {
    const need = this.spec.mag - this.mag;
    const take = Math.min(need, this.reserve[this.weapon] || 0);
    this.mag += take;
    this.reserve[this.weapon] -= take;
  }

  startHeal() {
    if (this.meds <= 0 || this.healing > 0 || this.hp >= this.maxHp) return false;
    this.healing = CONFIG.HEAL_TIME;
    this.reloading = 0;
    return true;
  }
}
