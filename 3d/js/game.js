/* ============================================================
   게임 코어: 씬 구성, 3인칭 카메라, 사격, 자기장, 미니맵
   ============================================================ */
const Game = {
  renderer: null, scene: null, camera: null, sun: null,
  chars: [], loots: [], tracers: [], puffs: [],
  player: null, zone: null, zoneMesh: null,
  state: 'menu', time: 0, result: null,
  look: { yaw: 0, pitch: -0.06 },
  ads: false, shooting: false,
  camDist: CFG.CAM_DIST,
  recoilKick: 0,
  hitMarker: 0, damageDir: null,
  feed: [],
  minimapImg: null,
  aimPoint: new THREE.Vector3(),
  _v: new THREE.Vector3(), _v2: new THREE.Vector3(),

  /* ---------- 초기화 ---------- */
  init(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(srgb(0xbcc9d2), CFG.FOG_NEAR, CFG.FOG_FAR);
    this.scene.background = new THREE.Color(0xa9c1d8);

    this.camera = new THREE.PerspectiveCamera(CFG.FOV, window.innerWidth / window.innerHeight, 0.12, 1400);

    // 하늘 돔 (위아래 그라데이션)
    const skyGeo = new THREE.SphereGeometry(900, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4d7fb5) },
        bottom: { value: new THREE.Color(0xd9d3c2) },
        horizon: { value: 0.16 }
      },
      vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float horizon; varying float vY;' +
        'void main(){ float t = smoothstep(-0.05, 0.55, vY - horizon*0.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // 조명: 낮은 오후 해 + 하늘빛
    this.sun = new THREE.DirectionalLight(0xffe4c0, 2.6);
    this.sun.position.set(70, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 320; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x9dc2e8, 0x46502f, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.10));

    // 총알 궤적 풀
    for (let i = 0; i < 28; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: srgb(0xfff0b0), transparent: true, opacity: 0, depthWrite: false
      }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    // 피격 먼지 풀
    const puffGeo = new THREE.SphereGeometry(0.16, 6, 5);
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
        color: srgb(0xd9cdb6), transparent: true, opacity: 0, depthWrite: false
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.puffs.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },

  /* ---------- 매치 시작 ---------- */
  start(botCount) {
    // 이전 매치 정리
    for (const c of this.chars) this.scene.remove(c.mesh);
    for (const l of this.loots) this.scene.remove(l.mesh);
    if (this.zoneMesh) this.scene.remove(this.zoneMesh);
    Scenery.dispose(this.scene);

    this.chars = []; this.loots = []; this.feed = [];
    this.time = 0; this.result = null; this.hitMarker = 0; this.damageDir = null;

    Scenery.build(this.scene);

    const R0 = World.half * 0.85;   // 첫 자기장은 섬 안쪽까지만
    this.zone = { x: 0, z: 0, r: R0, R0, sx: 0, sz: 0, sr: R0, tx: 0, tz: 0, tr: R0,
                  phase: 0, timer: PHASES[0].wait, shrinking: false, dps: PHASES[0].dps };

    const zGeo = new THREE.CylinderGeometry(1, 1, 260, 64, 1, true);
    const zMat = new THREE.MeshBasicMaterial({
      color: srgb(0x59b6ff), transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false
    });
    this.zoneMesh = new THREE.Mesh(zGeo, zMat);
    this.scene.add(this.zoneMesh);

    // 플레이어
    const ps = World.freeSpot(2);
    this.player = new Char3D(ps.x, ps.z, true, '나');
    this.scene.add(this.player.mesh);
    this.chars.push(this.player);
    this.look.yaw = Math.random() * Math.PI * 2;
    this.look.pitch = -0.05;

    // 봇
    const names = NAMES.slice();
    for (let i = 0; i < botCount; i++) {
      const s = this.spawnSpot();
      const nm = names.length ? names.splice(Math.floor(Math.random() * names.length), 1)[0] : '봇' + i;
      const b = new Char3D(s.x, s.z, false, nm, OUTFITS[i % OUTFITS.length]);
      for (const k of GUN_KEYS) b.reserve[k] = 90;
      if (Math.random() < 0.3) b.giveGun(LOOT_GUNS[Math.floor(Math.random() * LOOT_GUNS.length)], 90);
      this.scene.add(b.mesh);
      this.chars.push(b);
    }

    this.spawnLoot();
    this.buildMinimapImage();
    this.state = 'playing';
    this.pushFeed('전투 시작 — 생존자 ' + this.chars.length + '명');
  },

  spawnSpot() {
    let best = null, bestD = -1;
    for (let i = 0; i < 120; i++) {
      const s = World.freeSpot(2);
      let near = Infinity;
      for (const c of this.chars) {
        const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z) * (c.isPlayer ? 0.5 : 1);
        if (d < near) near = d;
      }
      if (near > 90) return s;
      if (near > bestD) { bestD = near; best = s; }
    }
    return best;
  },

  spawnLoot() {
    const add = (x, z) => {
      const roll = Math.random();
      let l;
      if (roll < 0.44) {
        const g = LOOT_GUNS[Math.floor(Math.random() * LOOT_GUNS.length)];
        l = new Loot(x, z, 'gun', g, GUNS[g].ammoPer);
      } else if (roll < 0.76) {
        const g = LOOT_GUNS[Math.floor(Math.random() * LOOT_GUNS.length)];
        l = new Loot(x, z, 'ammo', g, Math.round(GUNS[g].ammoPer * 0.5));
      } else {
        l = new Loot(x, z, 'med', null, 1);
      }
      this.scene.add(l.mesh);
      this.loots.push(l);
    };
    for (const t of World.towns) {
      for (let i = 0; i < 13; i++) {
        const s = World.freeSpot(1, t, t.r);
        add(s.x, s.z);
      }
    }
    for (let i = 0; i < 55; i++) { const s = World.freeSpot(1); add(s.x, s.z); }
  },

  get alive() { return this.chars.reduce((n, c) => n + (c.dead ? 0 : 1), 0); },

  /* ---------- 프레임 갱신 ---------- */
  update(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.updateZone(dt);

    if (!this.player.dead) this.updatePlayer(dt, input);

    for (const c of this.chars) {
      if (c.dead) continue;
      if (c.cooldown > 0) c.cooldown -= dt;
      if (c.hitFlash > 0) c.hitFlash -= dt;
      if (c.reloading > 0) {
        c.reloading -= dt;
        if (c.reloading <= 0) { c.finishReload(); if (c === this.player) Sfx.reload(); }
      }
      if (c.healing > 0) {
        c.healing -= dt;
        if (c.healing <= 0) { c.meds--; c.hp = Math.min(c.maxHp, c.hp + CFG.HEAL_AMOUNT); }
      }
      if (!c.isPlayer) AI.update(c, dt, this);

      const dz = Math.hypot(c.pos.x - this.zone.x, c.pos.z - this.zone.z);
      if (dz > this.zone.r) this.damage(c, this.zone.dps * dt, null, false, true);

      c.syncMesh(dt);
    }

    for (const l of this.loots) if (!l.dead) l.update(this.time);

    this.updateEffects(dt);
    this.updateCamera(dt);

    // 자기장 메시 위치
    const z = this.zone;
    this.zoneMesh.position.set(z.x, 60, z.z);
    this.zoneMesh.scale.set(z.r, 1, z.r);

    // 그림자 카메라를 플레이어 주변으로
    const p = this.player.pos;
    this.sun.position.set(p.x + 70, p.y + 95, p.z + 42);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.target.updateMatrixWorld();
    this.skyDome.position.set(p.x, 0, p.z);

    for (const f of this.feed) f.life -= dt;
    this.feed = this.feed.filter(f => f.life > 0).slice(-6);
    if (this.hitMarker > 0) this.hitMarker -= dt;
    if (this.damageDir) { this.damageDir.life -= dt; if (this.damageDir.life <= 0) this.damageDir = null; }
    if (this.recoilKick > 0) this.recoilKick = Math.max(0, this.recoilKick - dt * 2.6);

    if (this.player.dead) this.finish(false);
    else if (this.alive <= 1) this.finish(true);
  },

  updatePlayer(dt, input) {
    const p = this.player;

    // 시점
    this.look.yaw -= input.dx * 0.0022;
    this.look.pitch -= input.dy * 0.0022;
    this.look.pitch = Math.max(-1.15, Math.min(0.95, this.look.pitch));
    input.dx = 0; input.dy = 0;
    p.yaw = this.look.yaw;
    p.pitch = this.look.pitch;

    // 이동 (카메라 기준)
    const f = this._v.set(Math.sin(this.look.yaw), 0, Math.cos(this.look.yaw));
    const r = this._v2.set(f.z, 0, -f.x);
    let mx = 0, mz = 0;
    if (input.fwd) { mx += f.x; mz += f.z; }
    if (input.back) { mx -= f.x; mz -= f.z; }
    if (input.left) { mx -= r.x; mz -= r.z; }
    if (input.right) { mx += r.x; mz += r.z; }

    p.crouch = !!input.crouch;
    let speed = CFG.WALK;
    if (p.crouch) speed = CFG.CROUCH;
    else if (input.sprint && input.fwd && !this.ads) speed = CFG.SPRINT;
    if (p.healing > 0) speed = Math.min(speed, 1.6);
    if (this.ads) speed = Math.min(speed, CFG.WALK * 0.6);

    if (input.jump && p.grounded && p.healing <= 0) { p.vy = CFG.JUMP; input.jump = false; }
    this.moveChar(p, mx, mz, speed, dt);

    this.ads = !!input.ads && p.healing <= 0;

    // 사격
    if (input.fire && p.healing <= 0) {
      if (p.canShoot()) {
        this.playerShoot();
        if (!p.spec.auto) input.fire = false;
      } else if (p.gun && p.mag <= 0 && p.reloading <= 0) p.startReload();
      else if (!p.gun) input.fire = false;
    }
  },

  /* 화면 중앙 조준선이 가리키는 지점으로 발사 */
  playerShoot() {
    const p = this.player;
    const cam = this.camera;
    const dir = cam.getWorldDirection(this._v).clone();
    const origin = cam.position;
    const hitT = this.rayAll(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 500, p);
    const aim = this.aimPoint.copy(origin).addScaledVector(dir, Math.max(6, hitT));

    // 총구 위치 (어깨 앞)
    const fwd = this._v2.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const mx = p.pos.x + fwd.x * 0.55 + fwd.z * 0.28;
    const my = p.pos.y + (p.crouch ? 1.05 : 1.32);
    const mz = p.pos.z + fwd.z * 0.55 - fwd.x * 0.28;
    const d = new THREE.Vector3(aim.x - mx, aim.y - my, aim.z - mz).normalize();
    this.fireShot(p, mx, my, mz, d);
    this.recoilKick = Math.min(1, this.recoilKick + 0.5);
    this.look.pitch += p.spec.recoil * (this.ads ? 0.6 : 1);
  },

  /* ---------- 사격 ---------- */
  fireShot(ch, ox, oy, oz, dir) {
    if (!ch.canShoot()) return;
    const spec = ch.spec;
    ch.cooldown = 60 / spec.rpm;
    ch.mag--;
    const pellets = spec.pellets || 1;
    const spread = (ch.isPlayer && this.ads) ? spec.adsSpread : spec.spread;
    const moving = ch.speedNow > 2.5 ? 1.9 : (ch.crouch ? 0.6 : 1);

    for (let i = 0; i < pellets; i++) {
      const d = this._v.copy(dir);
      const s = spread * moving;
      d.x += (Math.random() * 2 - 1) * s;
      d.y += (Math.random() * 2 - 1) * s;
      d.z += (Math.random() * 2 - 1) * s;
      d.normalize();

      const maxT = spec.range;
      const hit = this.traceCharacters(ox, oy, oz, d.x, d.y, d.z, maxT, ch);
      const wallT = World.ray(ox, oy, oz, d.x, d.y, d.z, maxT);
      let endT = Math.min(wallT, maxT);
      if (hit && hit.t < wallT) {
        endT = hit.t;
        const dmg = spec.dmg * (hit.head ? HEADSHOT : 1) * (1 - Math.min(0.45, hit.t / spec.range * 0.45));
        this.damage(hit.char, dmg, ch, hit.head, false);
      } else if (wallT < maxT) {
        this.puff(ox + d.x * endT, oy + d.y * endT, oz + d.z * endT);
      }
      this.tracer(ox, oy, oz, ox + d.x * endT, oy + d.y * endT, oz + d.z * endT, ch.isPlayer);
    }

    Sfx.shot(ch === this.player ? 0 : this.player.pos.distanceTo(ch.pos), ch.gun);
    if (ch.mag <= 0) ch.startReload();
  },

  /* 캐릭터에 대한 광선 판정 (몸통 원기둥 + 머리 구) */
  traceCharacters(ox, oy, oz, dx, dy, dz, maxT, exclude) {
    let best = null;
    for (const c of this.chars) {
      if (c.dead || c === exclude) continue;
      const r = 0.42;
      const px = ox - c.pos.x, pz = oz - c.pos.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-9) continue;
      const b = 2 * (px * dx + pz * dz);
      const cc = px * px + pz * pz - r * r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      let t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0.1) t = (-b + Math.sqrt(disc)) / (2 * a);
      if (t < 0.1 || t > maxT || (best && t > best.t)) continue;
      const hy = oy + dy * t;
      const top = c.pos.y + (c.crouch ? 1.45 : 1.95);
      if (hy < c.pos.y || hy > top) continue;
      const headY = c.pos.y + (c.crouch ? 1.36 : 1.86);
      best = { t, char: c, head: hy > headY - 0.14 };
    }
    return best;
  },

  /* 지형·구조물·캐릭터를 모두 고려한 최근접 거리 */
  rayAll(ox, oy, oz, dx, dy, dz, maxT, exclude) {
    const w = World.ray(ox, oy, oz, dx, dy, dz, maxT);
    const c = this.traceCharacters(ox, oy, oz, dx, dy, dz, maxT, exclude);
    return c && c.t < w ? c.t : w;
  },

  damage(target, amount, src, head, isZone) {
    if (target.dead) return;
    target.hp -= amount;
    if (!isZone) {
      target.hitFlash = 0.12;
      if (src === this.player) {
        this.hitMarker = head ? 0.3 : 0.18;
        Sfx.hit(head);
      }
      if (target === this.player && src) {
        this.damageDir = { yaw: Math.atan2(src.pos.x - target.pos.x, src.pos.z - target.pos.z), life: 1.4 };
        Sfx.hurt();
      }
    }
    if (target.hp <= 0) this.kill(target, src, isZone);
  },

  kill(c, src, isZone) {
    if (c.dead) return;
    c.dead = true; c.hp = 0;
    c.rank = this.alive + 1;
    c.mesh.visible = false;
    if (src && src !== c) { src.kills++; if (src === this.player) Sfx.kill(); }
    this.dropLoot(c);
    if (isZone) this.pushFeed(c.name + ' 님이 자기장에 쓰러졌습니다');
    else this.pushFeed((src ? src.name : '???') + ' → ' + c.name + (src === this.player ? ' (처치!)' : ''));
  },

  dropLoot(c) {
    if (c.gun) {
      const l = new Loot(c.pos.x + 0.8, c.pos.z, 'gun', c.gun, Math.max(15, c.mag + (c.reserve[c.gun] || 0)));
      this.scene.add(l.mesh); this.loots.push(l);
    }
    if (c.meds > 0) {
      const l = new Loot(c.pos.x - 0.8, c.pos.z + 0.5, 'med', null, 1);
      this.scene.add(l.mesh); this.loots.push(l);
    }
  },

  pickUp(ch, l) {
    if (l.dead) return false;
    if (l.kind === 'gun') {
      if (ch.gun === l.gun) ch.reserve[l.gun] = (ch.reserve[l.gun] || 0) + l.amount;
      else {
        const old = ch.gun, oldAmmo = old ? ch.mag + (ch.reserve[old] || 0) : 0;
        ch.giveGun(l.gun, l.amount);
        if (old) {
          ch.reserve[old] = 0;
          const d = new Loot(l.pos.x + 1.1, l.pos.z, 'gun', old, Math.max(10, oldAmmo));
          this.scene.add(d.mesh); this.loots.push(d);
        }
      }
      if (ch === this.player) this.pushFeed(GUNS[l.gun].name + ' 획득');
    } else if (l.kind === 'ammo') {
      if (!ch.gun) return false;
      ch.reserve[l.gun] = (ch.reserve[l.gun] || 0) + l.amount;
      if (ch === this.player) this.pushFeed(GUNS[l.gun].short + ' 탄약 +' + l.amount);
    } else {
      if (ch.meds >= CFG.MAX_MEDS) return false;
      ch.meds++;
      if (ch === this.player) this.pushFeed('구급상자 획득');
    }
    l.dead = true;
    this.scene.remove(l.mesh);
    if (ch === this.player) Sfx.pick();
    return true;
  },

  nearestLoot(ch) {
    let best = null, bd = CFG.PICK_RANGE * CFG.PICK_RANGE;
    for (const l of this.loots) {
      if (l.dead) continue;
      const d = (l.pos.x - ch.pos.x) ** 2 + (l.pos.z - ch.pos.z) ** 2;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  },

  /* ---------- 이동 ---------- */
  moveChar(ch, mx, mz, speed, dt) {
    const len = Math.hypot(mx, mz);
    if (len > 0.0001) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
    const before = { x: ch.pos.x, z: ch.pos.z };

    const nx = ch.pos.x + mx * speed * dt;
    const nz = ch.pos.z + mz * speed * dt;
    const headY = ch.pos.y + (ch.crouch ? 1.35 : CFG.BODY_H);
    const res = World.resolve(nx, nz, CFG.BODY_R, ch.pos.y, headY);
    ch.pos.x = res.x; ch.pos.z = res.z;

    ch.vy -= CFG.GRAVITY * dt;
    ch.pos.y += ch.vy * dt;
    const g = World.groundY(ch.pos.x, ch.pos.z, ch.pos.y);
    if (ch.pos.y <= g) { ch.pos.y = g; ch.vy = 0; ch.grounded = true; }
    else if (ch.vy < -0.2) ch.grounded = false;

    ch.speedNow = Math.hypot(ch.pos.x - before.x, ch.pos.z - before.z) / Math.max(dt, 1e-4);
  },

  /* ---------- 카메라 ---------- */
  updateCamera(dt) {
    const p = this.player;
    const yaw = this.look.yaw, pitch = this.look.pitch - this.recoilKick * 0.05;
    const dir = this._v.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).normalize();

    const wantDist = this.ads ? CFG.ADS_DIST : CFG.CAM_DIST;
    const side = this.ads ? CFG.ADS_SIDE : CFG.CAM_SIDE;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 9);

    const pivotY = p.pos.y + (p.crouch ? 1.3 : CFG.CAM_HEIGHT);
    const right = this._v2.set(dir.z, 0, -dir.x).normalize();
    const px = p.pos.x + right.x * side, pz = p.pos.z + right.z * side;

    // 카메라가 벽이나 나무를 뚫지 않도록 거리 축소
    let dist = this.camDist;
    const back = World.ray(px, pivotY, pz, -dir.x, -dir.y, -dir.z, dist + 0.4);
    if (back < dist + 0.4) dist = Math.max(0.9, back - 0.35);
    // 광선에 걸리지 않는 옆쪽 장애물까지 고려해 한 번 더 당깁니다
    for (let i = 0; i < 3; i++) {
      const cx = px - dir.x * dist, cy = pivotY - dir.y * dist, cz = pz - dir.z * dist;
      if (!this.camBlocked(cx, cy, cz)) break;
      dist = Math.max(0.9, dist - 0.55);
    }

    this.camera.position.set(px - dir.x * dist, pivotY - dir.y * dist, pz - dir.z * dist);
    const minY = World.height(this.camera.position.x, this.camera.position.z) + 0.45;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    this.camera.lookAt(px + dir.x * 60, pivotY + dir.y * 60, pz + dir.z * 60);

    const wantFov = this.ads ? CFG.ADS_FOV : CFG.FOV;
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 11);
      this.camera.updateProjectionMatrix();
    }

    // 1인칭처럼 가까울 때 머리 감추기
    p.mesh.userData.head.visible = dist > 1.4;
  },

  /* 카메라 위치가 장애물 안(또는 아주 가까이)에 있는지 */
  camBlocked(x, y, z) {
    const pad = 0.45;
    for (const o of World.near(x, z, x, z, 2)) {
      if (o.r !== undefined) {
        if (y < o.top && y > o.top - o.h && Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
      } else if (y < o.top + pad && y > o.bottom - pad && World.insideBox(o, x, z, pad)) return true;
    }
    return y < World.height(x, z) + 0.4;
  },

  /* ---------- 자기장 ---------- */
  updateZone(dt) {
    const z = this.zone;
    z.timer -= dt;
    if (!z.shrinking) {
      if (z.timer <= 0 && z.phase < PHASES.length) {
        const ph = PHASES[z.phase];
        const tr = z.R0 * ph.f;
        const off = Math.max(0, z.r - tr) * 0.75 * Math.random();
        const ang = Math.random() * Math.PI * 2;
        z.sx = z.x; z.sz = z.z; z.sr = z.r;
        z.tx = z.x + Math.cos(ang) * off;
        z.tz = z.z + Math.sin(ang) * off;
        z.tr = tr; z.shrinking = true; z.timer = ph.shrink; z.dps = ph.dps;
        this.pushFeed('자기장 ' + (z.phase + 1) + '단계 축소 시작');
      }
    } else {
      const ph = PHASES[z.phase];
      const t = 1 - Math.max(0, Math.min(1, z.timer / ph.shrink));
      z.x = z.sx + (z.tx - z.sx) * t;
      z.z = z.sz + (z.tz - z.sz) * t;
      z.r = z.sr + (z.tr - z.sr) * t;
      if (z.timer <= 0) {
        z.x = z.tx; z.z = z.tz; z.r = z.tr;
        z.shrinking = false; z.phase++;
        z.timer = z.phase < PHASES.length ? PHASES[z.phase].wait : 9999;
      }
    }
  },

  /* ---------- 효과 ---------- */
  tracer(x1, y1, z1, x2, y2, z2, isPlayer) {
    const t = this.tracers.find(t => t.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1);
    pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    t.line.material.color.setHex(isPlayer ? 0xfff0b0 : 0xffc06a).convertSRGBToLinear();
    t.life = 0.07;
  },

  puff(x, y, z) {
    const p = this.puffs.find(p => p.life <= 0);
    if (!p) return;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    p.life = 0.42;
    p.vel.set((Math.random() - 0.5) * 1.4, Math.random() * 1.6, (Math.random() - 0.5) * 1.4);
  },

  updateEffects(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      } else t.line.material.opacity = 0;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) { if (p.mesh.visible) p.mesh.visible = false; continue; }
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(1 + (0.42 - p.life) * 3);
      p.mesh.material.opacity = Math.max(0, p.life / 0.42) * 0.7;
      if (p.life <= 0) p.mesh.visible = false;
    }
  },

  pushFeed(text) { this.feed.push({ text, life: 6 }); },

  finish(won) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    const p = this.player;
    this.result = {
      won, rank: won ? 1 : (p.rank || this.alive + 1),
      kills: p.kills, time: this.time, total: this.chars.length
    };
    UI.showResult(this.result);
  },

  /* ---------- 미니맵 바탕 그림 ---------- */
  buildMinimapImage() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = -World.half + (i / S) * World.size;
        const z = -World.half + (j / S) * World.size;
        const h = World.height(x, z);
        const k = (j * S + i) * 4;
        let r, gg, b;
        if (h < World.waterY) { r = 42; gg = 78; b = 104; }
        else if (h < World.waterY + 1.6) { r = 176; gg = 162; b = 124; }
        else {
          const t = Math.max(0, Math.min(1, (h - 2) / 26));
          r = 74 + t * 66; gg = 94 + t * 48; b = 56 + t * 44;
          const shade = (World.height(x + 3, z) - h) * 12;
          r -= shade; gg -= shade; b -= shade;
        }
        img.data[k] = Math.max(0, Math.min(255, r));
        img.data[k + 1] = Math.max(0, Math.min(255, gg));
        img.data[k + 2] = Math.max(0, Math.min(255, b));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // 건물 자국
    g.fillStyle = 'rgba(30,32,36,0.85)';
    for (const b of World.boxes) {
      if (b.top - b.bottom < 2) continue;
      const i = ((b.x + World.half) / World.size) * S;
      const j = ((b.z + World.half) / World.size) * S;
      const w = Math.max(1.5, (b.hx * 2 / World.size) * S);
      const h = Math.max(1.5, (b.hz * 2 / World.size) * S);
      g.fillRect(i - w / 2, j - h / 2, w, h);
    }
    this.minimapImg = c;
  },

  render() { if (this.renderer) this.renderer.render(this.scene, this.camera); }
};
