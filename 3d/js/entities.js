/* ============================================================
   캐릭터와 아이템
   모델은 모두 박스로 조립한 저폴리 인간형입니다.
   좌표 규칙: 캐릭터의 정면 벡터는 (sin(yaw), 0, cos(yaw))
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
  }
};

function boxMesh(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Mats.get(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* 인간형 모델 (정면 +Z) */
function makeBody(outfit, isPlayer) {
  const g = new THREE.Group();
  const skin = 0xc9a17a;
  const top = isPlayer ? 0x3f5d7a : outfit.top;
  const pants = isPlayer ? 0x2f3a46 : outfit.pants;

  const legL = boxMesh(0.24, 0.88, 0.26, pants, -0.16, 0.44, 0);
  const legR = boxMesh(0.24, 0.88, 0.26, pants, 0.16, 0.44, 0);
  const torso = boxMesh(0.62, 0.74, 0.34, top, 0, 1.25, 0);
  const vest = boxMesh(0.66, 0.42, 0.38, 0x4a4a42, 0, 1.32, 0);
  const pack = boxMesh(0.44, 0.5, 0.22, 0x54503f, 0, 1.3, -0.27);
  const neck = boxMesh(0.18, 0.1, 0.18, skin, 0, 1.67, 0);
  const head = boxMesh(0.3, 0.32, 0.3, skin, 0, 1.86, 0);
  const helmet = boxMesh(0.36, 0.16, 0.36, isPlayer ? 0x37506b : 0x4b4b45, 0, 2.0, 0);
  const armL = boxMesh(0.17, 0.52, 0.17, top, -0.37, 1.32, 0.04);
  const armR = boxMesh(0.17, 0.52, 0.17, top, 0.37, 1.32, 0.04);

  // 손에 든 총 (교체 시 색만 바꿉니다)
  const gun = new THREE.Group();
  const body = boxMesh(0.1, 0.14, 0.62, 0x2a2a2c, 0, 0, 0.18);
  const barrel = boxMesh(0.06, 0.06, 0.42, 0x3a3a3c, 0, 0.01, 0.62);
  const mag = boxMesh(0.08, 0.2, 0.1, 0x333336, 0, -0.14, 0.16);
  gun.add(body); gun.add(barrel); gun.add(mag);
  gun.position.set(-0.26, 1.28, 0.16);
  gun.visible = false;

  g.add(legL); g.add(legR); g.add(torso); g.add(vest); g.add(pack);
  g.add(neck); g.add(head); g.add(helmet); g.add(armL); g.add(armR); g.add(gun);

  g.userData = { legL, legR, armL, armR, gun, gunBody: body, gunBarrel: barrel, head, torso };
  return g;
}

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
    this.kills = 0;
    this.rank = 0;
    this.crouch = false;
    this.speedNow = 0;
    this.stepPhase = 0;

    this.gun = null;
    this.mag = 0;
    this.reserve = {};
    this.meds = isPlayer ? 1 : 1 + Math.floor(Math.random() * 2);
    this.reloading = 0;
    this.cooldown = 0;
    this.healing = 0;
    this.hitFlash = 0;

    this.mesh = makeBody(outfit || OUTFITS[0], isPlayer);
    this.mesh.position.copy(this.pos);

    this.ai = isPlayer ? null : {
      state: 'loot', target: null, reaction: 0, burst: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random(),
      dest: null, destT: 0, skill: 0.3 + Math.random() * 0.62,
      think: Math.random() * 0.2, jumpT: 0
    };
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
    const ud = this.mesh.userData;
    ud.gun.visible = true;
    ud.gunBody.material = Mats.get(GUNS[key].color, { roughness: 0.6 });
    const len = key === 'sniper' || key === 'dmr' ? 1.25 : (key === 'pistol' ? 0.6 : 1);
    ud.gun.scale.set(1, 1, len);
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

  /* 모델 갱신: 위치, 방향, 걷기 애니메이션 */
  syncMesh(dt) {
    const ud = this.mesh.userData;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const crouchY = this.crouch ? -0.28 : 0;
    this.mesh.scale.y = this.crouch ? 0.82 : 1;

    this.stepPhase += this.speedNow * dt * 2.2;
    const swing = this.speedNow > 0.4 ? Math.sin(this.stepPhase) * 0.55 : 0;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    // 총을 들었을 때만 팔을 앞으로 올립니다
    const hold = this.gun ? -1.0 : -0.12;
    ud.armL.rotation.x = -swing * 0.3 + hold;
    ud.armR.rotation.x = swing * 0.3 + hold;
    ud.armL.rotation.z = this.gun ? 0.12 : 0;
    ud.armR.rotation.z = this.gun ? -0.12 : 0;

    // 총구를 시선 위아래로
    const aim = -this.pitch;
    ud.gun.rotation.x = aim;
    ud.gun.position.y = 1.28 + crouchY * 0.2;
  }
}

/* ---------- 아이템 ---------- */
const LootGeo = {
  crate: null, beam: null,
  init() {
    if (this.crate) return;
    this.crate = new THREE.BoxGeometry(0.6, 0.42, 0.6);
    this.beam = new THREE.CylinderGeometry(0.34, 0.34, 4, 8, 1, true);
  }
};

class Loot {
  constructor(x, z, kind, gun, amount) {
    LootGeo.init();
    const y = World.height(x, z);
    this.pos = new THREE.Vector3(x, y, z);
    this.kind = kind;               // 'gun' | 'ammo' | 'med'
    this.gun = gun || null;
    this.amount = amount || 0;
    this.dead = false;
    this.spin = Math.random() * Math.PI;

    const color = kind === 'gun' ? GUNS[gun].color : (kind === 'ammo' ? 0xf2cc60 : 0xff6b6b);
    this.mesh = new THREE.Group();
    const crate = new THREE.Mesh(LootGeo.crate, Mats.get(color, { roughness: 0.5 }));
    crate.position.y = 0.45;
    crate.castShadow = true;
    const beam = new THREE.Mesh(LootGeo.beam, new THREE.MeshBasicMaterial({
      color: srgb(color), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide
    }));
    beam.position.y = 2.2;
    this.mesh.add(crate); this.mesh.add(beam);
    this.mesh.position.set(x, y, z);
    this.crate = crate;
  }

  get label() {
    if (this.kind === 'gun') return GUNS[this.gun].name + ' (' + GUNS[this.gun].short + ')';
    if (this.kind === 'ammo') return GUNS[this.gun].short + ' 탄약 ' + this.amount + '발';
    return '구급상자';
  }

  update(t) {
    this.spin += 0.02;
    this.crate.rotation.y = this.spin;
    this.crate.position.y = 0.45 + Math.sin(t * 2 + this.spin) * 0.08;
  }
}
