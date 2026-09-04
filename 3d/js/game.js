/* ============================================================
   게임 코어: 씬 구성, 3인칭 카메라, 사격, 자기장, 미니맵
   ============================================================ */
const Game = {
  renderer: null, scene: null, camera: null, sun: null,
  chars: [], loots: [], tracers: [], puffs: [], vehicles: [], drops: [],
  dropTimer: 0,
  player: null, zone: null, zoneMesh: null,
  state: 'menu', time: 0, result: null,
  look: { yaw: 0, pitch: -0.06 },      // 목표 시점
  view: { yaw: 0, pitch: -0.06 },      // 실제로 보여지는 시점 (부드럽게 따라감)
  ads: false, shooting: false,
  camDist: CFG.CAM_DIST,
  recoilKick: 0, landDip: 0,
  hitMarker: 0, damageDir: null,
  feed: [],
  minimapImg: null,
  aimPoint: new THREE.Vector3(),
  aim: { x: 0, y: 0 },              // 화면 안 조준점 위치 (-1~1)
  aimDir: new THREE.Vector3(0, 0, 1),
  _v: new THREE.Vector3(), _v2: new THREE.Vector3(), _v3: new THREE.Vector3(),

  /* ---------- 초기화 ---------- */
  init(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // 기본은 높은 품질로 시작하고, 프레임이 나쁘면 한 번만 낮춥니다
    this.low = false;
    this.perfSum = 0; this.perfN = 0; this.downgraded = false;
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

    // 조명: 낮은 오후 해 + 하늘빛 + 반대쪽에서 들어오는 옅은 반사광
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.35);
    this.sun.position.set(70, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 320; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x9dc2e8, 0x46502f, 0.52));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.20));   // 건물 안이 너무 어둡지 않도록
    this.fill = new THREE.DirectionalLight(0x9fc4ee, 0.55);   // 그림자 없는 보조광
    this.fill.position.set(-60, 40, -70);
    this.scene.add(this.fill);

    this.buildSky();
    this.buildViewLayer();
    this.buildEffects();

    window.addEventListener('resize', () => this.resize());
  },

  /* 하늘: 해와 구름 */
  buildSky() {
    const sunDir = new THREE.Vector3(0.55, 0.62, 0.33).normalize();
    this.sunDir = sunDir;

    // 해 (빛나는 원)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,245,1)');
    grad.addColorStop(0.22, 'rgba(255,238,196,0.85)');
    grad.addColorStop(0.55, 'rgba(255,220,160,0.22)');
    grad.addColorStop(1, 'rgba(255,210,150,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    const sunTex = new THREE.CanvasTexture(c);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, transparent: true, depthWrite: false, depthTest: false, fog: false
    }));
    this.sunSprite.scale.setScalar(220);
    this.sunSprite.renderOrder = -1;
    this.scene.add(this.sunSprite);

    // 구름: 부드러운 얼룩 텍스처를 큰 판에 깔고 천천히 흘려보냅니다
    const cc = document.createElement('canvas');
    cc.width = cc.height = 512;
    const g3 = cc.getContext('2d');
    g3.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 26 + Math.random() * 70;
      const blobs = 3 + Math.floor(Math.random() * 4);
      for (let b = 0; b < blobs; b++) {
        const gr = g3.createRadialGradient(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r * 0.6, 2,
                                           x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g3.fillStyle = gr;
        g3.beginPath(); g3.arc(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r * 0.5, r, 0, Math.PI * 2); g3.fill();
      }
    }
    const cloudTex = new THREE.CanvasTexture(cc);
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(5, 5);
    const cloudGeo = new THREE.PlaneGeometry(7000, 7000);
    cloudGeo.rotateX(Math.PI / 2);
    this.clouds = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide
    }));
    this.clouds.position.y = 330;
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  },

  /* 1인칭 총은 별도 씬에 두고 좁은 시야각으로 겹쳐 그립니다.
     시야각이 넓은 본 화면에 그리면 총이 지나치게 커 보이고 벽에 파묻히기 때문입니다. */
  buildViewLayer() {
    this.viewScene = new THREE.Scene();
    this.viewScene.add(new THREE.HemisphereLight(0xbcd7f0, 0x50543f, 1.0));
    const vl = new THREE.DirectionalLight(0xfff0d6, 1.5);
    vl.position.set(0.7, 1.2, 0.9);
    this.viewScene.add(vl);
    this.viewCamera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 12);
    this.viewGun = new THREE.Group();
    this.viewScene.add(this.viewGun);
    this.viewGunKey = '';
  },

  buildEffects() {
    // 총구 화염
    const flashGeo = new THREE.ConeGeometry(0.09, 0.34, 6);
    flashGeo.rotateX(-Math.PI / 2);
    this.flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffce7a, 0, 14, 2);
    this.scene.add(this.flashLight);
    this.flashT = 0;

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
    const puffGeo = new THREE.SphereGeometry(0.14, 6, 5);
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
        color: srgb(0xd9cdb6), transparent: true, opacity: 0, depthWrite: false
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.puffs.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }
  },

  resize() {
    if (!this.renderer) return;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.viewCamera) { this.viewCamera.aspect = aspect; this.viewCamera.updateProjectionMatrix(); }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },

  /* ---------- 매치 시작 ---------- */
  /* seed 를 주면 모두가 같은 섬에서 시작합니다 (함께 하기용) */
  start(botCount, opts) {
    opts = opts || {};
    this.seed = opts.seed || (Math.random() * 0x7fffffff) | 0;
    this.online = !!opts.online;
    this.startedAt = opts.startedAt || Date.now();
    // 이전 매치 정리
    for (const c of this.chars) this.scene.remove(c.mesh);
    for (const l of this.loots) this.scene.remove(l.mesh);
    if (this.zoneMesh) this.scene.remove(this.zoneMesh);
    Scenery.dispose(this.scene);

    for (const v of (this.vehicles || [])) this.scene.remove(v.mesh);
    for (const a of (this.drops || [])) this.scene.remove(a.mesh);

    RNG.begin(this.seed);                 // 여기서부터 지형·아이템은 시드 난수로
    this.chars = []; this.loots = []; this.feed = []; this.botById = {};
    this.vehicles = []; this.drops = [];
    this.dropTimer = CFG.DROP_FIRST;
    this.time = 0; this.result = null; this.hitMarker = 0; this.damageDir = null;
    this.deathWait = 0; this.winWait = 0; this.landDip = 0;

    Scenery.build(this.scene);

    const R0 = World.half * 0.85;   // 첫 자기장은 섬 안쪽까지만
    this.zone = { x: 0, z: 0, r: R0, R0, sx: 0, sz: 0, sr: R0, tx: 0, tz: 0, tr: R0,
                  phase: 0, timer: PHASES[0].wait, shrinking: false, dps: PHASES[0].dps };
    // 자기장 이동 계획을 미리 뽑아 두면 여러 사람이 같은 자기장을 봅니다
    this.zonePlan = [];
    let cx = 0, cz = 0, cr = R0;
    for (const ph of PHASES) {
      const tr = R0 * ph.f;
      const off = Math.max(0, cr - tr) * 0.75 * rnd();
      const ang = rnd() * Math.PI * 2;
      cx = cx + Math.cos(ang) * off; cz = cz + Math.sin(ang) * off; cr = tr;
      this.zonePlan.push({ x: cx, z: cz, r: tr });
    }

    const zGeo = new THREE.CylinderGeometry(1, 1, 260, 64, 1, true);
    const zMat = new THREE.MeshBasicMaterial({
      color: srgb(0x59b6ff), transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false
    });
    this.zoneMesh = new THREE.Mesh(zGeo, zMat);
    this.scene.add(this.zoneMesh);

    // 플레이어
    const ps = World.freeSpot(2);
    const mySkin = SKINS[Profile.data.equipped.skin] || SKINS.recruit;
    this.player = new Char3D(ps.x, ps.z, true, '나', mySkin);
    this.player.gunSkin = Profile.data.equipped.gun;
    this.scene.add(this.player.mesh);
    this.chars.push(this.player);
    this.look.yaw = Math.random() * Math.PI * 2;
    this.look.pitch = -0.05;
    this.view.yaw = this.look.yaw; this.view.pitch = this.look.pitch;

    // 봇
    const names = NAMES.slice();
    for (let i = 0; i < botCount; i++) {
      const s = this.spawnSpot();
      const nm = names.length ? names.splice(Math.floor(Math.random() * names.length), 1)[0] : '봇' + i;
      const b = new Char3D(s.x, s.z, false, nm, OUTFITS[i % OUTFITS.length]);
      b.netId = i;
      this.botById[i] = b;
      for (const k of GUN_KEYS) b.reserve[k] = 90;
      if (Math.random() < 0.3) b.giveGun(LOOT_GUNS[Math.floor(Math.random() * LOOT_GUNS.length)], 90);
      if (Math.random() < 0.30) b.wear('vest', 1);
      if (Math.random() < 0.25) b.wear('bag', 1);
      this.scene.add(b.mesh);
      this.chars.push(b);
    }

    // 모두 상공에서 낙하 시작
    const towns = World.towns;
    for (const c of this.chars) {
      c.pos.y = World.height(c.pos.x, c.pos.z) + CFG.DROP_HEIGHT + Math.random() * 40;
      c.flying = 'freefall';
      c.vy = -8;
      c.grounded = false;
      if (c.ai) {   // 봇은 마을이나 근처 지점을 목표로 내려갑니다
        const t = towns.length && Math.random() < 0.75
          ? towns[Math.floor(Math.random() * towns.length)]
          : { x: c.pos.x + (Math.random() - 0.5) * 120, z: c.pos.z + (Math.random() - 0.5) * 120 };
        c.ai.drop = { x: t.x + (Math.random() - 0.5) * 60, z: t.z + (Math.random() - 0.5) * 60 };
      }
    }

    this.spawnLoot();
    this.spawnVehicles();
    RNG.end();                            // 여기서부터는 각자의 난수 (조준 흔들림, 봇 판단 등)
    this.buildMinimapImage();
    this.ads = false;
    this.camDist = CFG.CAM_DIST;
    this.updateCamera(0.016);   // 첫 프레임 전에 카메라를 제자리에 놓습니다
    // 이미 시작된 매치에 뒤늦게 들어오면 자기장을 지금 시각까지 진행시킵니다
    let behind = (Date.now() - this.startedAt) / 1000;
    if (behind > 1) {
      behind = Math.min(behind, 600);
      while (behind > 0) { this.updateZone(Math.min(0.5, behind)); behind -= 0.5; }
    }

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
    const add = (x, z, y) => {
      const roll = rnd();
      let l;
      if (roll < 0.34) {
        const g = LOOT_GUNS[Math.floor(rnd() * LOOT_GUNS.length)];
        l = new Loot(x, z, 'gun', g, GUNS[g].ammoPer, 0, y);
      } else if (roll < 0.58) {
        const g = LOOT_GUNS[Math.floor(rnd() * LOOT_GUNS.length)];
        l = new Loot(x, z, 'ammo', g, Math.round(GUNS[g].ammoPer * 0.5), 0, y);
      } else if (roll < 0.72) {
        const lv = SCOPE_LEVELS[Math.floor(rnd() * SCOPE_LEVELS.length)];
        l = new Loot(x, z, 'scope', null, 0, lv, y);
      } else if (roll < 0.83) {
        l = new Loot(x, z, 'vest', null, 0, GEAR_LEVELS[Math.floor(rnd() * GEAR_LEVELS.length)], y);
      } else if (roll < 0.92) {
        l = new Loot(x, z, 'bag', null, 0, GEAR_LEVELS[Math.floor(rnd() * GEAR_LEVELS.length)], y);
      } else {
        l = new Loot(x, z, 'med', null, 1, 0, y);
      }
      l.id = this.loots.length;
      this.scene.add(l.mesh);
      this.loots.push(l);
    };
    // 건물 안 (1·2·3층) — 실내 파밍이 기본이 되도록 넉넉하게 깔아 둡니다
    for (const sp of Scenery.lootSpots) add(sp.x, sp.z, sp.y);
    // 마을 야외
    for (const t of World.towns) {
      for (let i = 0; i < 9; i++) {
        const sp = World.freeSpot(1, t, t.r);
        add(sp.x, sp.z);
      }
    }
    // 벌판
    for (let i = 0; i < 90; i++) { const sp = World.freeSpot(1); add(sp.x, sp.z); }
  },

  /* 차량을 도로 위와 마을 근처에 놓습니다 */
  spawnVehicles() {
    for (const v of this.vehicles) this.scene.remove(v.mesh);
    this.vehicles = [];
    const put = (x, z, key) => {
      if (World.height(x, z) < World.waterY + 1) return;
      const v = new Vehicle3D(x, z, key);
      v.pos.y = World.groundY(x, z, v.pos.y + 1);
      v.sync();
      this.scene.add(v.mesh);
      this.vehicles.push(v);
    };
    // 도로 위: 일정 간격으로
    for (const r of World.roads) {
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
      const n = Math.max(1, Math.round(len / 130));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (rnd() - 0.5) * 0.1;
        const x = r.x1 + (r.x2 - r.x1) * t + (rnd() - 0.5) * 4;
        const z = r.z1 + (r.z2 - r.z1) * t + (rnd() - 0.5) * 4;
        put(x, z, VEHICLE_KEYS[Math.floor(rnd() * VEHICLE_KEYS.length)]);
      }
    }
    // 마을마다 한두 대
    for (const t of World.towns) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const sp = World.freeSpot(3, t, t.r);
        put(sp.x, sp.z, VEHICLE_KEYS[Math.floor(rnd() * VEHICLE_KEYS.length)]);
      }
    }
  },

  get alive() { return this.chars.reduce((n, c) => n + (c.dead ? 0 : 1), 0); },

  /* ---------- 프레임 갱신 ---------- */
  update(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.updateZone(dt);

    if (!this.player.dead) this.updatePlayer(dt, input);

    for (const c of this.chars) {
      if (c.dead) {
        if (c.deadT < 1) c.syncMesh(dt, false);     // 쓰러지는 동작은 끝까지 재생
        continue;
      }
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
      if (c.swap > 0) c.swap -= dt;

      if (c.remote || (c.ai && this.online && !Net.isHost)) continue;   // 남이 굴리는 캐릭터

      if (c.flying) {                       // 낙하 중에는 전투와 자기장 판정을 쉽니다
        if (!c.isPlayer) {
          const t = c.ai.drop;
          const dx = t.x - c.pos.x, dz2 = t.z - c.pos.z;
          const d = Math.hypot(dx, dz2);
          const mx = d > 2 ? dx / d : 0, mz = d > 2 ? dz2 / d : 0;
          if (d > 2) c.yaw = AI.approach(c.yaw, Math.atan2(mx, mz), 3 * dt);
          this.updateFlight(c, dt, mx, mz);
        }
        c.syncMesh(dt, false);
        continue;
      }

      if (!c.isPlayer) AI.update(c, dt, this);

      const dz = Math.hypot(c.pos.x - this.zone.x, c.pos.z - this.zone.z);
      if (dz > this.zone.r) this.damage(c, this.zone.dps * dt, null, false, true);

      c.syncMesh(dt, c === this.player ? this.ads : !!(c.ai && c.ai.state === 'fight'));
    }

    this.updateDrops(dt);
    this.updateVehicles(dt);

    // 아이템: 멀면 숨기고, 지금 주울 수 있는 것은 강조
    this.highlight = this.player.dead ? null : this.nearestLoot(this.player);
    const cam = this.camera.position;
    for (const l of this.loots) {
      if (l.dead) continue;
      const d = Math.hypot(l.pos.x - cam.x, l.pos.y - cam.y, l.pos.z - cam.z);
      l.update(this.time, d, l === this.highlight);
    }

    if (this.online) Net.interpolate(dt);

    this.updateEffects(dt);
    this.updateCamera(dt);

    // 자기장 메시 위치
    const z = this.zone;
    this.zoneMesh.position.set(z.x, 60, z.z);
    this.zoneMesh.scale.set(z.r, 1, z.r);

    // 그림자 카메라를 플레이어 주변으로
    const p = this.player.pos;
    const sd = this.sunDir;
    this.sun.position.set(p.x + sd.x * 120, p.y + sd.y * 120, p.z + sd.z * 120);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.target.updateMatrixWorld();
    this.skyDome.position.set(p.x, 0, p.z);

    // 해와 구름은 카메라를 따라다닙니다
    const cp = this.camera.position;
    this.sunSprite.position.set(cp.x + sd.x * 800, cp.y + sd.y * 800, cp.z + sd.z * 800);
    this.clouds.position.set(cp.x, 330, cp.z);
    this.clouds.material.map.offset.x = (this.time * 0.0016) % 1;
    this.clouds.material.map.offset.y = (this.time * 0.0007) % 1;

    this.updateWater();

    // 상공에서는 안개를 걷어 섬 전체가 보이게 합니다
    const wantFar = this.player.flying ? 1200 : (this.low ? 280 : CFG.FOG_FAR);
    this.scene.fog.far += (wantFar - this.scene.fog.far) * Math.min(1, dt * 1.6);

    for (const f of this.feed) f.life -= dt;
    this.feed = this.feed.filter(f => f.life > 0).slice(-6);
    if (this.hitMarker > 0) this.hitMarker -= dt;
    if (this.damageDir) { this.damageDir.life -= dt; if (this.damageDir.life <= 0) this.damageDir = null; }
    if (this.recoilKick > 0) this.recoilKick = Math.max(0, this.recoilKick - dt * 2.6);

    this.checkPerf(dt);

    // 쓰러지는 장면을 잠깐 보여준 뒤 결과 화면으로
    if (this.player.dead) {
      this.deathWait += dt;
      if (this.deathWait > 1.6) this.finish(false);
    } else if (this.alive <= 1) {
      // 승리: 세리머니를 보여주고 카메라가 천천히 돌아갑니다
      if (!this.player.victory) {
        this.player.victory = 0.001;
        this.winWait = 0;
        this.pushFeed('마지막 생존자! 치킨 디너!');
        Sfx.win();
        UI.el.winBanner.classList.remove('hidden');
      }
      this.winWait += dt;
      this.look.yaw += dt * 0.5;
      this.look.pitch += (-0.16 - this.look.pitch) * Math.min(1, dt * 2);
      if (this.winWait > 3.6) this.finish(true);
    }
  },

  updatePlayer(dt, input) {
    const p = this.player;
    if (p.victory > 0) { input.fire = false; return; }   // 승리 연출 중에는 조작을 멈춥니다

    // 시점
    // 감도 = 기본 배율 × 설정값 (정조준 중에는 정조준 배율을 곱합니다)
    const zoomAdj = this.ads ? Settings.data.ads * Math.sqrt(this.camera.fov / CFG.FOV) : 1;
    const s = 0.0018 * Settings.data.sens * zoomAdj;   // 기본 감도를 조금 낮췄습니다
    this.look.yaw -= input.dx * s;
    this.look.pitch -= input.dy * s * (Settings.data.invert ? -1 : 1);
    this.look.pitch = Math.max(-1.15, Math.min(0.95, this.look.pitch));
    input.dx = 0; input.dy = 0;
    p.yaw = this.look.yaw;
    p.pitch = this.look.pitch;

    // ---------- 차량 운전 ----------
    if (p.vehicle) {
      const v = p.vehicle;
      let th = (input.fwd ? 1 : 0) - (input.back ? 1 : 0) + (input.az || 0);
      let st = (input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.ax || 0);
      th = Math.max(-1, Math.min(1, th));
      st = Math.max(-1, Math.min(1, st));
      v.drive(dt, th, st, !!input.crouch);          // C 키가 브레이크
      // 운전자는 차와 함께 움직입니다
      p.pos.set(v.pos.x, v.pos.y, v.pos.z);
      p.speedNow = Math.abs(v.speed);
      p.crouch = false;
      this.ads = false;
      input.fire = false;
      if (v.dead) { this.pushFeed(v.spec.name + ' 이(가) 파괴되었습니다'); this.exitVehicle(p); }
      return;
    }

    // 이동 (카메라 기준)
    const f = this._v.set(Math.sin(this.look.yaw), 0, Math.cos(this.look.yaw));
    if (p.flying) {
      const r0 = this._v2.set(-f.z, 0, f.x);
      let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.ax || 0);
      let iz = (input.fwd ? 1 : 0) - (input.back ? 1 : 0) + (input.az || 0);
      this.updateFlight(p, dt, f.x * iz + r0.x * ix, f.z * iz + r0.z * ix);
      this.ads = false;
      return;
    }
    // 전진 f 를 기준으로 한 오른쪽 벡터. Y 축이 위인 오른손 좌표계에서는 (-f.z, 0, f.x) 입니다
    const r = this._v2.set(-f.z, 0, f.x);
    // 키보드와 조이스틱을 함께 받습니다 (ax: 좌우, az: 앞뒤, -1~1)
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.ax || 0);
    let iz = (input.fwd ? 1 : 0) - (input.back ? 1 : 0) + (input.az || 0);
    ix = Math.max(-1, Math.min(1, ix));
    iz = Math.max(-1, Math.min(1, iz));
    const mx = f.x * iz + r.x * ix;
    const mz = f.z * iz + r.z * ix;

    p.crouch = !!input.crouch;
    let speed = CFG.WALK;
    if (p.crouch) speed = CFG.CROUCH;
    else if (input.sprint && iz > 0.5 && !this.ads) speed = CFG.SPRINT;
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
  /* 조준점이 가리키는 방향 (마우스가 잠기지 않았을 때는 화면 안 조준점 기준) */
  updateAimDir() {
    this._v3.set(this.aim.x, this.aim.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    this.aimDir.copy(this._v3);
  },

  playerShoot() {
    const p = this.player;
    const cam = this.camera;
    const dir = this.aimDir.clone();
    const origin = cam.position;
    const hitT = this.rayAll(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 500, p);
    const aim = this.aimPoint.copy(origin).addScaledVector(dir, Math.max(6, hitT));

    // 총구 위치 (1인칭이면 카메라 바로 앞, 3인칭이면 어깨 앞)
    let mx, my, mz;
    if (Settings.data.fpv) {
      mx = origin.x + dir.x * 0.7; my = origin.y + dir.y * 0.7 - 0.06; mz = origin.z + dir.z * 0.7;
    } else {
      const fwd = this._v2.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      mx = p.pos.x + fwd.x * 0.55 - fwd.z * 0.28;
      my = p.pos.y + (p.crouch ? 0.85 : 1.05);
      mz = p.pos.z + fwd.z * 0.55 + fwd.x * 0.28;
    }
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
    ch.recoil = 1;
    this.muzzleFlash(ox, oy, oz, ch === this.player);
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
        if (ch.isPlayer && this.online && hit.char.remote) {
          // 상대의 체력은 상대가 관리합니다. 맞았다는 사실만 보냅니다
          const peerId = Object.keys(Net.players).find(k => Net.players[k] === hit.char);
          if (peerId) Net.hitPlayer(peerId, dmg, hit.head);
          this.hitMarker = hit.head ? 0.3 : 0.18; Sfx.hit(hit.head);
          this.puff(hit.char.pos.x, hit.char.pos.y + 1.0, hit.char.pos.z, 0xc23b32);
        } else if (ch.isPlayer && this.online && hit.char.ai && !Net.isHost) {
          Net.hitBot(hit.char.netId, dmg, hit.head);
          this.hitMarker = hit.head ? 0.3 : 0.18; Sfx.hit(hit.head);
          this.puff(hit.char.pos.x, hit.char.pos.y + 1.0, hit.char.pos.z, 0xc23b32);
        } else {
          this.damage(hit.char, dmg, ch, hit.head, false);
        }
      } else if (wallT < maxT) {
        this.puff(ox + d.x * endT, oy + d.y * endT, oz + d.z * endT);
      }
      this.tracer(ox, oy, oz, ox + d.x * endT, oy + d.y * endT, oz + d.z * endT, ch.isPlayer);
      if (ch.isPlayer && this.online) {
        Net.shot(ox, oy, oz, ox + d.x * endT, oy + d.y * endT, oz + d.z * endT);
      }
    }

    Sfx.shot(ch === this.player ? 0 : this.player.pos.distanceTo(ch.pos), ch.gun);
    if (ch.mag <= 0) ch.startReload();
  },

  /* 캐릭터에 대한 광선 판정 (몸통 원기둥 + 머리 구) */
  traceCharacters(ox, oy, oz, dx, dy, dz, maxT, exclude) {
    let best = null;
    for (const c of this.chars) {
      if (c.dead || c === exclude) continue;
      const r = 0.36;
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
      const top = c.pos.y + (c.crouch ? 1.22 : 1.58);
      if (hy < c.pos.y || hy > top) continue;
      const headY = c.pos.y + (c.crouch ? 1.06 : 1.28);
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
    // 방탄조끼는 몸에 맞은 피해만 줄여 줍니다 (머리와 자기장은 그대로)
    if (!isZone && !head && target.armor > 0) amount *= (1 - target.armor);
    target.hp -= amount;
    if (!isZone) {
      target.hitFlash = 0.12;
      if (src === this.player) {
        this.hitMarker = head ? 0.3 : 0.18;
        Sfx.hit(head);
      }
      this.puff(target.pos.x, target.pos.y + 1.0, target.pos.z, 0xc23b32);
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
    c.deadT = 0;
    if (src && src !== c) { src.kills++; if (src === this.player) Sfx.kill(); }
    if (c === this.player && this.online) Net.died(src ? src.name : '');
    this.dropLoot(c);
    if (isZone) this.pushFeed(c.name + ' 님이 자기장에 쓰러졌습니다');
    else this.pushFeed((src ? src.name : '???') + ' → ' + c.name + (src === this.player ? ' (처치!)' : ''));
  },

  dropLoot(c) {
    c.guns.forEach((key, i) => {
      if (!key) return;
      const l = new Loot(c.pos.x + (i ? -0.9 : 0.9), c.pos.z + i * 0.6, 'gun', key,
                         Math.max(15, c.mags[i] + (c.reserve[key] || 0)), 0, c.pos.y);
      this.scene.add(l.mesh); this.loots.push(l);
      if (c.scopes[i]) {
        const s = new Loot(c.pos.x + (i ? -1.6 : 1.6), c.pos.z + i * 0.6, 'scope', null, 0, c.scopes[i], c.pos.y);
        this.scene.add(s.mesh); this.loots.push(s);
      }
    });
    if (c.meds > 0) {
      const l = new Loot(c.pos.x - 0.8, c.pos.z + 0.5, 'med', null, c.meds, 0, c.pos.y);
      this.scene.add(l.mesh); this.loots.push(l);
    }
    if (c.vest) {
      const l = new Loot(c.pos.x + 0.4, c.pos.z - 1.0, 'vest', null, 0, c.vest, c.pos.y);
      this.scene.add(l.mesh); this.loots.push(l);
    }
    if (c.bag) {
      const l = new Loot(c.pos.x - 0.4, c.pos.z - 1.4, 'bag', null, 0, c.bag, c.pos.y);
      this.scene.add(l.mesh); this.loots.push(l);
    }
  },

  pickUp(ch, l) {
    if (l.dead) return false;
    if (l.kind === 'gun') {
      if (ch.guns.indexOf(l.gun) >= 0) {          // 이미 가진 총이면 탄약만
        const got = ch.addAmmo(l.gun, l.amount);
        if (ch === this.player) {
          this.pushFeed(got > 0 ? GUNS[l.gun].short + ' 탄약 +' + got : '탄약이 가득 찼습니다 (가방을 구하세요)');
        }
        if (got <= 0) return false;
      } else if (ch.guns.indexOf(null) >= 0) {    // 빈 칸에 넣기
        const idx = ch.giveGun(l.gun, l.amount);
        if (ch === this.player) this.pushFeed(GUNS[l.gun].name + ' 획득 (' + (idx + 1) + '번 칸)');
      } else {                                    // 지금 든 무기와 교체
        const old = ch.gun, oldAmmo = ch.mag + (ch.reserve[old] || 0);
        ch.guns[ch.slot] = l.gun;
        ch.mags[ch.slot] = GUNS[l.gun].mag;
        ch.addAmmo(l.gun, l.amount);
        ch.reserve[old] = 0;
        ch.reloading = 0;
        ch.refreshGuns();
        const d = new Loot(l.pos.x + 1.2, l.pos.z, 'gun', old, Math.max(10, oldAmmo));
        this.scene.add(d.mesh); this.loots.push(d);
        if (ch === this.player) this.pushFeed(GUNS[old].short + ' → ' + GUNS[l.gun].name + ' 교체');
      }
    } else if (l.kind === 'scope') {
      if (!ch.gun) { if (ch === this.player) this.pushFeed('무기를 먼저 챙기세요'); return false; }
      if (!GUNS[ch.gun].canScope) {
        if (ch === this.player) this.pushFeed(GUNS[ch.gun].name + ' 에는 조준경을 달 수 없습니다');
        return false;
      }
      const old = ch.attachScope(l.level);
      if (old < 0) return false;
      if (old > 0) {                       // 쓰던 조준경은 바닥에 내려놓습니다
        const d = new Loot(l.pos.x + 1.0, l.pos.z, 'scope', null, 0, old);
        this.scene.add(d.mesh); this.loots.push(d);
      }
      if (ch === this.player) this.pushFeed(SCOPES[l.level].name + ' 장착 (' + GUNS[ch.gun].short + ')');
    } else if (l.kind === 'ammo') {
      if (ch.guns.indexOf(l.gun) < 0) {
        if (ch === this.player) this.pushFeed(GUNS[l.gun].short + ' 을 쓰는 총이 없습니다');
        return false;
      }
      const got = ch.addAmmo(l.gun, l.amount);
      if (got <= 0) {
        if (ch === this.player) this.pushFeed('탄약이 가득 찼습니다 (가방을 구하세요)');
        return false;
      }
      if (ch === this.player) this.pushFeed(GUNS[l.gun].short + ' 탄약 +' + got);
    } else if (l.kind === 'vest' || l.kind === 'bag') {
      const old = ch.wear(l.kind, l.level);
      if (old < 0) {
        if (ch === this.player) this.pushFeed('이미 더 좋은 것을 착용 중입니다');
        return false;
      }
      if (old > 0) {                       // 벗은 것은 바닥에 내려놓습니다
        const d = new Loot(l.pos.x + 1.1, l.pos.z, l.kind, null, 0, old, l.pos.y);
        d.id = this.loots.length;
        this.scene.add(d.mesh); this.loots.push(d);
      }
      if (ch === this.player) {
        this.pushFeed((l.kind === 'vest' ? VESTS : BAGS)[l.level].name + ' 착용');
      }
    } else {
      const cap = ch.medCap;
      if (ch.meds >= cap) {
        if (ch === this.player) this.pushFeed('구급상자를 더 들 수 없습니다 (가방을 구하세요)');
        return false;
      }
      ch.meds = Math.min(cap, ch.meds + Math.max(1, l.amount || 1));
      if (ch === this.player) this.pushFeed('구급상자 획득');
    }
    l.dead = true;
    this.scene.remove(l.mesh);
    if (ch === this.player) { Sfx.pick(); if (this.online) Net.pick(l.id); }
    return true;
  },

  /* 주울 대상: 발밑 반경 안이거나, 조준선이 향한 조금 떨어진 아이템 */
  nearestLoot(ch) {
    let best = null, bestScore = Infinity;
    const aim = (ch === this.player) ? this.aimDir : null;
    for (const l of this.loots) {
      if (l.dead) continue;
      const dx = l.pos.x - ch.pos.x, dz = l.pos.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      let score = Infinity;
      if (d <= CFG.PICK_RANGE) {
        score = d;
      } else if (aim && d <= CFG.AIM_PICK) {
        // 화면 가운데로 바라보고 있으면 조금 멀어도 집을 수 있게
        const cx = l.pos.x - this.camera.position.x;
        const cy = l.pos.y + 0.35 - this.camera.position.y;
        const cz = l.pos.z - this.camera.position.z;
        const len = Math.hypot(cx, cy, cz) || 1;
        const dot = (cx * aim.x + cy * aim.y + cz * aim.z) / len;
        if (dot > 0.972) score = d + 2;      // 약 13도 안쪽
      }
      if (score < bestScore) { bestScore = score; best = l; }
    }
    return best;
  },

  /* F 키(줍기) 처리. 실패하면 이유를 알려 줍니다 */
  tryPickup() {
    const p = this.player;
    if (p.dead) return false;
    if (p.vehicle) return this.exitVehicle(p);          // 타고 있으면 내립니다
    if (p.flying) return false;

    const l = this.nearestLoot(p);
    const drop = this.nearestDrop(p);
    const veh = this.nearestVehicle(p);
    // 발밑에 아이템이 있으면 그것부터, 없으면 상자 → 차량 순서
    const lootD = l ? Math.hypot(l.pos.x - p.pos.x, l.pos.z - p.pos.z) : Infinity;
    if (l && lootD <= CFG.PICK_RANGE) return this.pickUp(p, l);
    if (drop) return this.openDrop(p, drop);
    if (veh) return this.enterVehicle(p, veh);
    if (l) return this.pickUp(p, l);
    this.pushFeed('주울 물건이 없습니다 — 아이템 가까이 가세요');
    return false;
  },

  /* 낙하: 자유낙하 → 낙하산 → 착지 */
  updateFlight(c, dt, mx, mz) {
    const ground = World.groundY(c.pos.x, c.pos.z, c.pos.y);
    const alt = c.pos.y - ground;

    if (c.flying === 'freefall') {
      c.vy = Math.max(-CFG.FREEFALL_SPEED, c.vy - CFG.GRAVITY * 1.6 * dt);
      if (alt < CFG.CHUTE_OPEN) {
        c.flying = 'chute';
        c.vy = Math.max(c.vy, -18);
        if (c === this.player) { Sfx.chute(); this.pushFeed('낙하산이 펼쳐졌습니다'); }
      }
    } else {
      c.vy += (-CFG.CHUTE_SPEED - c.vy) * Math.min(1, dt * 2.6);
    }

    const len = Math.hypot(mx, mz);
    if (len > 0.001) { mx /= len; mz /= len; }
    const speed = c.flying === 'freefall' ? CFG.FREEFALL_MOVE : CFG.CHUTE_MOVE;
    const lim = World.half - 6;
    c.pos.x = Math.max(-lim, Math.min(lim, c.pos.x + mx * speed * dt));
    c.pos.z = Math.max(-lim, Math.min(lim, c.pos.z + mz * speed * dt));
    c.pos.y += c.vy * dt;
    c.speedNow = speed * len;

    // 진행 방향으로 낙하산이 기울어집니다
    const fwd = Math.sin(c.yaw) * mx + Math.cos(c.yaw) * mz;
    const side = Math.cos(c.yaw) * mx - Math.sin(c.yaw) * mz;
    c.chuteTilt += (side * 0.28 - c.chuteTilt) * Math.min(1, dt * 3);
    c.chutePitch = fwd;

    const gy = World.groundY(c.pos.x, c.pos.z, c.pos.y);
    if (c.pos.y <= gy) {                    // 착지
      c.pos.y = gy; c.vy = 0; c.grounded = true; c.flying = null;
      c.chuteTilt = 0; c.chutePitch = 0;
      // 구조물 안에 끼어 들어가지 않도록 한 번 밀어냅니다
      const fix = World.resolve(c.pos.x, c.pos.z, CFG.BODY_R, c.pos.y, c.pos.y + CFG.BODY_H);
      c.pos.x = fix.x; c.pos.z = fix.z;
      c.pos.y = Math.max(c.pos.y, World.groundY(c.pos.x, c.pos.z, c.pos.y));
      if (c === this.player) {
        this.landDip = 0.25;
        this.pushFeed('착지 완료 — 무기를 찾으세요');
        Sfx.land();
      }
    }
  },

  /* ---------- 이동 ---------- */
  moveChar(ch, mx, mz, speed, dt) {
    const len = Math.hypot(mx, mz);
    if (len > 0.0001) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
    const before = { x: ch.pos.x, z: ch.pos.z };
    const bodyH = ch.crouch ? 1.35 : CFG.BODY_H;

    /* 한 프레임에 벽을 뚫지 않도록 이동을 짧은 칸으로 나눠 처리합니다.
       칸마다 '그 자리에서 발이 놓일 높이'를 먼저 구하고, 그 높이를 기준으로
       벽을 밀어냅니다. 계단은 한 칸이 걸음 높이보다 낮으므로 자연히 올라갑니다. */
    const dist = speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.14));
    for (let i = 0; i < steps; i++) {
      const nx = ch.pos.x + mx * dist / steps;
      const nz = ch.pos.z + mz * dist / steps;

      const gy = ch.grounded ? World.groundY(nx, nz, ch.pos.y) : -Infinity;
      const feetY = Math.max(ch.pos.y, gy);
      const res = World.resolve(nx, nz, CFG.BODY_R, feetY, feetY + bodyH);

      // 부딪힌 적이 없으면 확인을 건너뜁니다 (대부분의 프레임은 여기서 끝납니다)
      if (Math.abs(res.x - nx) > 1e-6 || Math.abs(res.z - nz) > 1e-6) {
        // 밀어내도 여전히 장애물 속이면 이번 칸은 멈춥니다 (관통 방지).
        // 원래 자리도 장애물 속이었다면(이미 끼인 상태) 빠져나가도록 그대로 옮깁니다.
        const gy2 = ch.grounded ? World.groundY(res.x, res.z, ch.pos.y) : -Infinity;
        const fy2 = Math.max(ch.pos.y, gy2);
        if (World.blocked(res.x, res.z, CFG.BODY_R, fy2, fy2 + bodyH) &&
            !World.blocked(ch.pos.x, ch.pos.z, CFG.BODY_R, ch.pos.y, ch.pos.y + bodyH)) break;
      }
      ch.pos.x = res.x; ch.pos.z = res.z;
    }
    // 세워 둔 차량은 밀고 지나갈 수 없습니다
    for (const v of this.vehicles) {
      if (v.driver === ch) continue;
      if (Math.abs(v.pos.y - ch.pos.y) > 2.4) continue;
      const dx = ch.pos.x - v.pos.x, dz = ch.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz), min = CFG.BODY_R + v.spec.r;
      if (d < min && d > 1e-4) {
        ch.pos.x = v.pos.x + dx / d * min;
        ch.pos.z = v.pos.z + dz / d * min;
      }
    }

    ch.vy -= CFG.GRAVITY * dt;
    ch.pos.y += ch.vy * dt;
    const g = World.groundY(ch.pos.x, ch.pos.z, ch.pos.y);
    if (ch.pos.y <= g) {
      if (ch === this.player && ch.vy < -6) this.landDip = Math.min(0.34, -ch.vy * 0.022);
      ch.pos.y = g; ch.vy = 0; ch.grounded = true;
    }
    else if (ch.vy < -0.2) ch.grounded = false;

    ch.speedNow = Math.hypot(ch.pos.x - before.x, ch.pos.z - before.z) / Math.max(dt, 1e-4);
  },

  /* ---------- 카메라 ---------- */
  updateCamera(dt) {
    const p = this.player;

    // 목표 시점을 부드럽게 따라갑니다 (프레임이 흔들려도 회전이 매끄럽게 이어짐)
    const k = 1 - Math.exp(-32 * Math.max(dt, 0.0001));
    let dyaw = this.look.yaw - this.view.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.view.yaw += dyaw * k;
    this.view.pitch += (this.look.pitch - this.view.pitch) * k;

    const yaw = this.view.yaw, pitch = this.view.pitch - this.recoilKick * 0.05;
    const dir = this._v.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).normalize();

    const scoped = this.ads && p.zoom >= 4;
    const inCar = !!p.vehicle;
    const fpv = Settings.data.fpv && !p.flying && !p.victory && !inCar;

    if (fpv) {                                  // ---------- 1인칭 ----------
      const eyeY = p.pos.y + (p.crouch ? 1.24 : CFG.EYE) + (p.grounded ? Math.sin(p.stepPhase * 2) * 0.022 * Math.min(1, p.speedSmooth / CFG.SPRINT) : 0) - this.landDip;
      this.camera.position.set(p.pos.x, eyeY, p.pos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(pitch, yaw + Math.PI, 0);
      p.mesh.visible = false;

      const wantFovF = this.ads ? (p.zoom > 1 ? CFG.FOV / p.zoom : CFG.ADS_FOV)
                                : CFG.FOV + (p.speedNow > CFG.WALK * 1.35 ? 5.5 : 0);
      if (Math.abs(this.camera.fov - wantFovF) > 0.05) {
        this.camera.fov += (wantFovF - this.camera.fov) * Math.min(1, dt * 11);
        this.camera.updateProjectionMatrix();
      }
      // 벽이나 바위에 바짝 붙었을 때 카메라가 안으로 들어가지 않도록 살짝 뒤로 뺍니다
      for (let i = 0; i < 3; i++) {
        const c = this.camera.position;
        if (!this.camBlocked(c.x, c.y, c.z)) break;
        const back = this._v.set(Math.sin(yaw), 0, Math.cos(yaw));
        c.x -= back.x * 0.16; c.z -= back.z * 0.16;
      }
      this.updateViewGun(dt, scoped);
      this.camera.updateMatrixWorld();
      this.updateAimDir();
      return;
    }
    if (this.viewGun) this.viewGun.visible = false;

    const wantDist = p.flying ? 7.6
      : (inCar ? CFG.VEH_CAM_DIST : (scoped ? 0.01 : (this.ads ? CFG.ADS_DIST : CFG.CAM_DIST)));
    const side = (p.flying || inCar) ? 0 : (scoped ? 0 : (this.ads ? CFG.ADS_SIDE : CFG.CAM_SIDE));
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 9);

    const run = Math.min(1, p.speedNow / CFG.SPRINT);
    if (this.landDip > 0.001) this.landDip *= 0.86; else this.landDip = 0;
    const bob = p.grounded ? Math.sin(p.stepPhase * 2) * 0.028 * run : 0;
    const pivotY = p.pos.y + (inCar ? CFG.VEH_CAM_HEIGHT : (p.crouch ? 1.3 : CFG.CAM_HEIGHT))
                 + (inCar ? 0 : bob) - this.landDip;
    const right = this._v2.set(-dir.z, 0, dir.x).normalize();
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
    this.camera.rotation.order = 'XYZ';
    this.camera.lookAt(px + dir.x * 60, pivotY + dir.y * 60, pz + dir.z * 60);

    const sprinting = !this.ads && !inCar && p.speedNow > CFG.WALK * 1.35 && !p.flying;
    const zoom = p.zoom;
    const wantFov = this.ads ? (zoom > 1 ? CFG.FOV / zoom : CFG.ADS_FOV)
                             : CFG.FOV + (sprinting ? 5.5 : 0) + (p.flying ? 8 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 11);
      this.camera.updateProjectionMatrix();
    }

    // 카메라가 몸에 바짝 붙으면 아예 몸을 감춰 시야를 가리지 않게 합니다
    p.mesh.visible = !inCar && dist > 1.25 && !scoped;

    this.camera.updateMatrixWorld();
    this.updateAimDir();
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

  /* 1인칭에서 손에 든 총 (카메라에 붙입니다) */
  updateViewGun(dt, scoped) {
    const p = this.player;
    const key = p.gun ? p.gun + ':' + p.zoom + ':' + p.gunSkin : '';
    if (key !== this.viewGunKey) {           // 무기나 조준경이 바뀌면 다시 만듭니다
      this.viewGunKey = key;
      while (this.viewGun.children.length) this.viewGun.remove(this.viewGun.children[0]);
      if (p.gun) {
        const m = new THREE.Mesh(GunArt.geo(p.gun, p.zoom > 1 ? p.zoom : 0, p.gunSkin),
                                 Mats.vc({ roughness: 0.55, metalness: 0.25 }));
        m.rotation.y = Math.PI + 0.05;       // 총구가 카메라 앞(-Z)을 보도록 (살짝 안쪽으로)
        m.scale.setScalar(0.58);             // 화면을 가리지 않을 크기
        this.viewGun.add(m);
      }
    }
    this.viewGun.visible = !!p.gun && !(scoped && this.ads);

    // 조준하면 가운데로, 평소에는 오른쪽 아래에서 살짝 흔들립니다
    const t = this.time;
    const run = Math.min(1, p.speedSmooth / CFG.SPRINT);
    const bobX = Math.sin(p.stepPhase) * 0.012 * run;
    const bobY = Math.abs(Math.sin(p.stepPhase * 2)) * 0.014 * run;
    const swap = p.swap > 0 ? Math.sin((1 - p.swap / CFG.SWAP_TIME) * Math.PI) * 0.22 : 0;
    const reload = p.reloading > 0 ? Math.sin((1 - p.reloading / p.spec.reload) * Math.PI) * 0.14 : 0;
    const tx = this.ads ? 0 : 0.245 + bobX;
    const ty = (this.ads ? -0.10 : -0.235 - bobY) - swap - reload;
    const tz = this.ads ? -0.44 : -0.60;
    const kk = Math.min(1, dt * 12);
    this.viewGun.position.x += (tx - this.viewGun.position.x) * kk;
    this.viewGun.position.y += (ty - this.viewGun.position.y) * kk;
    this.viewGun.position.z += (tz - this.viewGun.position.z) * kk;
    this.viewGun.rotation.z += ((this.ads ? 0 : 0.05) - this.viewGun.rotation.z) * kk;
    this.viewGun.rotation.x += ((-p.recoil * 0.25 - reload * 0.5) - this.viewGun.rotation.x) * kk;
  },

  /* ---------- 공중 보급 ---------- */
  updateDrops(dt) {
    this.dropTimer -= dt;
    if (this.dropTimer <= 0 && this.alive > 1) {
      this.dropTimer = CFG.DROP_EVERY;
      this.spawnDrop();
    }
    for (const a of this.drops) { if (!a.dead) a.update(dt); }
  },

  /* 자기장 안쪽 임의 지점에 보급 상자를 떨어뜨립니다 */
  spawnDrop() {
    const z = this.zone;
    let x = z.x, zz = z.z;
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * z.r * 0.8;
      const tx = z.x + Math.cos(ang) * rad, tz = z.z + Math.sin(ang) * rad;
      if (Math.abs(tx) > World.half - 20 || Math.abs(tz) > World.half - 20) continue;
      if (World.height(tx, tz) < World.waterY + 2) continue;
      x = tx; zz = tz; break;
    }
    const a = new Airdrop(x, zz, World.height(x, zz) + CFG.DROP_ALT);
    this.scene.add(a.mesh);
    this.drops.push(a);
    this.pushFeed('보급 상자가 투하되었습니다 — 지도를 확인하세요');
    Sfx.chute();
  },

  /* 가장 가까운, 열 수 있는 보급 상자 */
  nearestDrop(ch) {
    let best = null, bd = CFG.DROP_OPEN;
    for (const a of this.drops) {
      if (!a.landed || a.opened || a.dead) continue;
      const d = Math.hypot(a.pos.x - ch.pos.x, a.pos.z - ch.pos.z);
      if (d < bd && Math.abs(a.pos.y - ch.pos.y) < 4) { bd = d; best = a; }
    }
    return best;
  },

  openDrop(ch, a) {
    if (!a || a.opened) return false;
    a.opened = true;
    a.crate.rotation.x = -0.5;             // 뚜껑이 열린 듯 기울입니다
    a.crate.position.y = 0.1;
    a.smoke.visible = false;
    const items = a.contents();
    items.forEach((it, i) => {
      const ang = (i / items.length) * Math.PI * 2;
      const x = a.pos.x + Math.cos(ang) * 1.7, z = a.pos.z + Math.sin(ang) * 1.7;
      const l = new Loot(x, z, it.kind, it.gun || null, it.amount || 0, it.level || 0,
                         World.groundY(x, z, a.pos.y + 1));
      l.id = this.loots.length;
      this.scene.add(l.mesh);
      this.loots.push(l);
    });
    if (ch === this.player) { this.pushFeed('보급 상자를 열었습니다!'); Sfx.pick(); }
    return true;
  },

  /* ---------- 차량 ---------- */
  updateVehicles(dt) {
    for (const v of this.vehicles) {
      if (v.driver === this.player) continue;      // 플레이어 차량은 조작에서 처리
      if (!v.driver) { v.drive(dt, 0, 0, false); continue; }
      v.drive(dt, 0, 0, false);
    }
    // 달리는 차에 치이면 아픕니다
    for (const v of this.vehicles) {
      if (Math.abs(v.speed) < 6) continue;
      for (const c of this.chars) {
        if (c.dead || c.flying || c === v.driver) continue;
        const d = Math.hypot(c.pos.x - v.pos.x, c.pos.z - v.pos.z);
        if (d > v.spec.r + 1.1) continue;
        if (Math.abs(c.pos.y - v.pos.y) > 2.2) continue;
        if ((c.hitByCar || 0) > this.time) continue;
        c.hitByCar = this.time + 0.7;
        this.damage(c, 18 + Math.abs(v.speed) * 2.4, v.driver || null, false, false);
        v.speed *= 0.7;
      }
    }
  },

  nearestVehicle(ch) {
    let best = null, bd = CFG.VEH_RANGE;
    for (const v of this.vehicles) {
      if (v.occupied || v.dead) continue;
      const d = Math.hypot(v.pos.x - ch.pos.x, v.pos.z - ch.pos.z);
      if (d < bd && Math.abs(v.pos.y - ch.pos.y) < 3) { bd = d; best = v; }
    }
    return best;
  },

  enterVehicle(ch, v) {
    if (!v || v.occupied || v.dead) return false;
    v.driver = ch;
    ch.vehicle = v;
    ch.mesh.visible = false;
    this.ads = false;
    if (ch === this.player) { this.pushFeed(v.spec.name + ' 탑승 — F 로 내립니다'); Sfx.swap(); }
    return true;
  },

  exitVehicle(ch) {
    const v = ch.vehicle;
    if (!v) return false;
    v.driver = null;
    ch.vehicle = null;
    // 차 옆으로 내려놓습니다
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    const ox = v.pos.x + rx * (v.spec.r + 0.9), oz = v.pos.z + rz * (v.spec.r + 0.9);
    const fix = World.resolve(ox, oz, CFG.BODY_R, v.pos.y, v.pos.y + CFG.BODY_H);
    ch.pos.set(fix.x, World.groundY(fix.x, fix.z, v.pos.y + 1.5), fix.z);
    ch.vy = 0;
    ch.mesh.visible = true;
    if (ch === this.player) this.pushFeed(v.spec.name + ' 에서 내렸습니다');
    return true;
  },

  /* ---------- 자기장 ---------- */
  updateZone(dt) {
    const z = this.zone;
    // 마지막 단계가 끝나면 자기장이 끝까지 줄어들어 승부가 반드시 갈립니다
    if (z.phase >= PHASES.length && !z.shrinking) {
      z.r = Math.max(0, z.r - dt * 0.4);
      z.dps = 24;
      return;
    }
    z.timer -= dt;
    if (!z.shrinking) {
      if (z.timer <= 0 && z.phase < PHASES.length) {
        const ph = PHASES[z.phase];
        const plan = this.zonePlan[z.phase];
        z.sx = z.x; z.sz = z.z; z.sr = z.r;
        z.tx = plan.x; z.tz = plan.z; z.tr = plan.r;
        z.shrinking = true; z.timer = ph.shrink; z.dps = ph.dps;
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

  /* 물결: 정점을 사인파로 흔듭니다 (3프레임에 한 번) */
  updateWater() {
    const w = Scenery.water;
    if (!w) return;
    this.waterTick = (this.waterTick || 0) + 1;
    if (this.waterTick % 3) return;
    const pos = w.geometry.attributes.position;
    const t = this.time;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.055 + t * 1.1) * 0.16 + Math.sin(z * 0.041 - t * 0.8) * 0.13);
    }
    pos.needsUpdate = true;
    w.geometry.computeVertexNormals();
  },

  /* 총구 화염 */
  muzzleFlash(x, y, z, isPlayer) {
    const d = Math.hypot(x - this.camera.position.x, y - this.camera.position.y, z - this.camera.position.z);
    if (d > 90) return;
    this.flash.position.set(x, y, z);
    this.flash.lookAt(this.camera.position);
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
    this.flash.visible = true;
    this.flash.material.opacity = 0.95;
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = isPlayer ? 7 : 4;
    this.flashT = 0.055;
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

  puff(x, y, z, color) {
    const p = this.puffs.find(p => p.life <= 0);
    if (!p) return;
    p.mesh.material.color.setHex(color || 0xd9cdb6).convertSRGBToLinear();
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    p.life = 0.42;
    p.vel.set((Math.random() - 0.5) * 1.4, Math.random() * 1.6, (Math.random() - 0.5) * 1.4);
  },

  updateEffects(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.055);
      this.flash.material.opacity = k;
      this.flashLight.intensity *= 0.72;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
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
    const S = 384;
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
    // 도로
    g.strokeStyle = 'rgba(196,180,148,0.9)';
    g.lineWidth = Math.max(1.6, (7 / World.size) * S);
    g.lineCap = 'round';
    for (const r of World.roads) {
      g.beginPath();
      g.moveTo(((r.x1 + World.half) / World.size) * S, ((r.z1 + World.half) / World.size) * S);
      g.lineTo(((r.x2 + World.half) / World.size) * S, ((r.z2 + World.half) / World.size) * S);
      g.stroke();
    }
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

  /* 프레임이 계속 무거우면 해상도와 그림자를 한 단계 낮춥니다 */
  checkPerf(dt) {
    if (this.downgraded || this.state !== 'playing') return;
    this.perfSum += dt; this.perfN++;
    if (this.perfN < 120) return;
    const avg = this.perfSum / this.perfN;
    this.perfSum = 0; this.perfN = 0;
    if (avg > 0.027) {                     // 37fps 미만이면
      this.downgraded = true; this.low = true;
      this.renderer.setPixelRatio(1);
      this.sun.shadow.mapSize.set(1024, 1024);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.scene.fog.far = 280;
      this.pushFeed('그래픽 품질을 낮췄습니다 (프레임 확보)');
    }
  },

  render() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
    // 손에 든 총은 깊이를 지우고 위에 덧그려 벽에 파묻히지 않게 합니다
    if (this.viewGun && this.viewGun.visible && this.state === 'playing') {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
  }
};
