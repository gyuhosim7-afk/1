/* ============================================================
   로비: 캐릭터 미리보기(3D) + 상자·스킨·전적 화면
   ============================================================ */
const Lobby = {
  scene: null, camera: null, group: null, spin: 0, ready: false,

  /* ---------- 3D 미리보기 (해질녘 벌판에 선 캐릭터) ---------- */
  initScene() {
    if (this.scene) return;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(srgb(0x2b3446), 14, 62);
    this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 0.95, 4.5);
    this.camera.lookAt(0, 0.80, 0);

    // 하늘: 해질녘 그라데이션
    const skyGeo = new THREE.SphereGeometry(150, 24, 16);
    const sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x1d2942) }, bottom: { value: new THREE.Color(0xb08054) } },
      vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vY;' +
        'void main(){ float t = smoothstep(-0.08, 0.5, vY); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
    }));
    this.scene.add(sky);

    // 바닥
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: srgb(0x4a5539), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 뒤쪽 실루엣 (나무와 폐허)
    const dark = new THREE.MeshStandardMaterial({ color: srgb(0x232b33), roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * 0.15 + (i / 13) * Math.PI * 1.3;
      const dist = 22 + Math.random() * 16;
      const h = 5 + Math.random() * 6;
      const tree = new THREE.Mesh(new THREE.ConeGeometry(1.4 + Math.random(), h, 7), dark);
      tree.position.set(Math.sin(ang) * dist, h / 2, -Math.abs(Math.cos(ang)) * dist - 4);
      this.scene.add(tree);
    }
    const ruin = new THREE.Mesh(new THREE.BoxGeometry(6, 4.4, 5), dark);
    ruin.position.set(-9.5, 2.2, -16);
    this.scene.add(ruin);

    // 조명: 따뜻한 역광 + 앞쪽 보조광
    this.scene.add(new THREE.HemisphereLight(0xa8c0dc, 0x3a3a28, 1.0));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.4);
    key.position.set(2.6, 3.2, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb877, 2.2);
    rim.position.set(-3.2, 2.4, -3.6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xbcd4f0, 1.0);   // 얼굴이 어둡지 않도록
    fill.position.set(0.4, 1.6, 5);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.ready = true;
  },

  /* 장착한 스킨으로 미리보기 캐릭터를 다시 만듭니다 (편히 선 자세) */
  refresh() {
    this.initScene();
    while (this.group.children.length) this.group.remove(this.group.children[0]);

    const skin = SKINS[Profile.data.equipped.skin] || SKINS.recruit;
    const art = CharArt.get(skin);
    const mat = Mats.vc({ roughness: 0.82, metalness: 0.02 });
    const mk = geo => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

    const hips = new THREE.Group();
    hips.position.y = 0.52;
    hips.add(mk(art.torso));
    this.group.add(hips);

    const armR = new THREE.Group(); armR.position.set(-0.325, 0.60, 0);
    const armL = new THREE.Group(); armL.position.set(0.325, 0.60, 0);
    armR.add(mk(art.arm)); armL.add(mk(art.arm));
    armR.rotation.set(-0.05, 0, -0.22);          // 팔을 자연스럽게 내린 자세
    armL.rotation.set(-0.02, 0, 0.24);
    hips.add(armR); hips.add(armL);
    this.armR = armR; this.armL = armL; this.hipsRef = hips;

    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.145 * s, 0.52, 0);
      leg.rotation.set(s > 0 ? 0.05 : -0.03, 0, 0.03 * s);
      leg.add(mk(art.thigh));
      const knee = new THREE.Group();
      knee.position.y = -0.26;
      knee.rotation.x = -0.04;
      knee.add(mk(art.shin));
      leg.add(knee);
      this.group.add(leg);
    }
    this.group.rotation.y = 0.12;
  },

  update(dt) {
    if (!this.ready) return;
    this.spin += dt;
    // 숨쉬는 듯한 미세한 움직임과 아주 느린 시선 이동
    if (this.hipsRef) {
      this.hipsRef.position.y = 0.52 + Math.sin(this.spin * 1.4) * 0.012;
      this.hipsRef.rotation.y = Math.sin(this.spin * 0.5) * 0.05;
      if (this.armR) this.armR.rotation.x = -0.05 + Math.sin(this.spin * 1.4) * 0.05;
      if (this.armL) this.armL.rotation.x = -0.02 + Math.sin(this.spin * 1.4 + 0.6) * 0.05;
    }
    this.group.rotation.y = 0.12 + Math.sin(this.spin * 0.22) * 0.16;
    this.camera.position.x = Math.sin(this.spin * 0.16) * 0.12;
    this.camera.lookAt(0, 0.80, 0);
  },

  render(renderer) {
    if (!this.ready) return;
    renderer.render(this.scene, this.camera);
  },

  resize() {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  },

  /* ---------- 화면 ---------- */
  init() {
    this.el = {
      root: document.getElementById('lobby'),
      bp: document.getElementById('bp'),
      tabs: document.querySelectorAll('#lobby .tabs button'),
      panels: document.querySelectorAll('#lobby .panel'),
      crateList: document.getElementById('crateList'),
      rateTable: document.getElementById('rateTable'),
      skinGrid: document.getElementById('skinGrid'),
      gunGrid: document.getElementById('gunGrid'),
      statList: document.getElementById('statList'),
      reveal: document.getElementById('reveal'),
      peerList: document.getElementById('peerList'),
      modeName: document.getElementById('modeName'),
      nick: document.getElementById('nickInput'),
      revealCard: document.getElementById('revealCard')
    };

    this.el.tabs.forEach(btn => btn.addEventListener('click', () => this.tab(btn.dataset.tab)));

    // 시점(1인칭/3인칭) 전환
    this.viewBtns = document.querySelectorAll('.segmented button[data-view]');
    this.viewBtns.forEach(btn => btn.addEventListener('click', () => {
      Settings.data.fpv = btn.dataset.view === 'fpp';
      Settings.save(); Settings.sync();
      this.syncView();
    }));
    this.syncView();
    document.getElementById('reveal').addEventListener('click', () => {
      this.el.reveal.classList.add('hidden');
    });
    // 닉네임
    this.el.nick.value = Profile.data.name || '';
    this.el.nick.addEventListener('input', () => {
      Profile.setName(this.el.nick.value);
      if (Net.online) Net.push({ name: Profile.nickname() });
      this.showPeers(Net.lobbyPeers);
    });

    this.buildCrates();
    this.buildRates();
    this.refreshUI();
  },

  syncView() {
    if (!this.viewBtns) return;
    this.viewBtns.forEach(b => b.classList.toggle('on', (b.dataset.view === 'fpp') === !!Settings.data.fpv));
  },

  tab(name) {
    this.el.tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    this.el.panels.forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
  },

  buildCrates() {
    this.el.crateList.innerHTML = Object.keys(CRATES).map(k => {
      const c = CRATES[k];
      const bars = Object.keys(c.rates).map(r =>
        '<span class="bar" style="width:' + (c.rates[r] * 100) + '%;background:' + RARITY[r].color + '"></span>').join('');
      return '<div class="crate" data-crate="' + k + '">' +
        '<div class="crateIcon"></div>' +
        '<div class="crateBody"><b>' + c.name + '</b><span>' + c.desc + '</span>' +
        '<div class="bars">' + bars + '</div></div>' +
        '<button class="buy">' + c.price.toLocaleString() + ' BP</button></div>';
    }).join('');
    this.el.crateList.querySelectorAll('.crate').forEach(el => {
      el.querySelector('.buy').addEventListener('click', () => this.open(el.dataset.crate));
    });
  },

  buildRates() {
    const rows = Object.keys(CRATES).map(k => {
      const c = CRATES[k];
      return '<tr><td>' + c.name + '</td>' +
        Object.keys(RARITY).map(r => '<td>' + (c.rates[r] * 100).toFixed(0) + '%</td>').join('') + '</tr>';
    }).join('');
    const pool = Profile.pool();
    const byRarity = Object.keys(RARITY).map(r => {
      const names = pool.filter(i => i.rarity === r).map(i => i.name).join(', ');
      return '<div class="poolRow"><b style="color:' + RARITY[r].color + '">' + RARITY[r].name + '</b>' +
        '<span>' + names + '</span><em>중복 시 ' + RARITY[r].refund + ' BP</em></div>';
    }).join('');
    this.el.rateTable.innerHTML =
      '<table><thead><tr><th>상자</th>' +
      Object.keys(RARITY).map(r => '<th style="color:' + RARITY[r].color + '">' + RARITY[r].name + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="pool">' + byRarity + '</div>';
  },

  open(crateKey) {
    const res = Profile.openCrate(crateKey);
    if (!res) return;
    if (res.error) { this.toast(res.error); return; }

    const r = RARITY[res.rarity];
    this.el.revealCard.className = 'revealCard ' + res.rarity;
    this.el.revealCard.innerHTML =
      '<span class="rarity" style="color:' + r.color + '">' + r.name + '</span>' +
      '<b>' + res.item.name + '</b>' +
      '<span class="kind">' + (res.item.type === 'skin' ? '캐릭터 스킨' : '총기 도장') + '</span>' +
      (res.dup ? '<em class="dup">이미 보유 · ' + res.refund + ' BP 환급</em>' : '<em class="new">신규 획득!</em>');
    this.el.reveal.classList.remove('hidden');
    Sfx.pick();
    this.refreshUI();
  },

  /* 함께 접속한 사람 목록 */
  showPeers(list) {
    if (!this.el || !this.el.peerList) return;
    const others = (list || []).filter(p => !p.isMe && p.kind === 'viewer');
    if (!Net.online) { this.el.peerList.textContent = '혼자 플레이 중'; this.el.modeName.textContent = '솔로'; return; }
    if (!others.length) {
      this.el.peerList.innerHTML = '<span class="dot on"></span>연결됨 · 링크를 공유해 보세요';
      this.el.modeName.textContent = '솔로';
      return;
    }
    const names = others.map(p => (p.presence && p.presence.name) || '생존자');
    this.el.modeName.textContent = '함께 ' + (others.length + 1) + '명';
    this.el.peerList.innerHTML = '<span class="dot on"></span>' + names.join(', ') + ' 님과 함께';
  },

  onNetReady() { this.showPeers(Net.lobbyPeers); },
  notifyStarting() { this.toast('곧 함께 시작합니다'); },

  toast(msg) {
    const t = document.getElementById('lobbyToast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => t.classList.add('hidden'), 2200);
  },

  refreshUI() {
    const d = Profile.data;
    this.el.bp.textContent = d.bp.toLocaleString();

    const card = (type, key, name, rarity) => {
      const owned = Profile.owns(type, key);
      const on = d.equipped[type] === key;
      return '<button class="item' + (owned ? '' : ' locked') + (on ? ' on' : '') + '" data-type="' + type + '" data-key="' + key + '">' +
        '<span class="itemChip" style="background:' + RARITY[rarity].color + '"></span>' +
        '<b>' + name + '</b>' +
        '<span class="tag" style="color:' + RARITY[rarity].color + '">' + RARITY[rarity].name + '</span>' +
        '<span class="state">' + (owned ? (on ? '장착 중' : '장착하기') : '미보유') + '</span></button>';
    };

    this.el.skinGrid.innerHTML = Object.keys(SKINS).map(k => card('skin', k, SKINS[k].name, SKINS[k].rarity)).join('');
    this.el.gunGrid.innerHTML = Object.keys(GUN_SKINS).map(k => card('gun', k, GUN_SKINS[k].name, GUN_SKINS[k].rarity)).join('');
    document.querySelectorAll('#lobby .item').forEach(el => {
      el.addEventListener('click', () => {
        const { type, key } = el.dataset;
        if (!Profile.owns(type, key)) { this.toast('상자에서 얻을 수 있습니다'); return; }
        Profile.equip(type, key);
        this.refresh();
        this.refreshUI();
        Sfx.swap();
      });
    });

    const s = d.stats;
    const rows = [
      ['치른 매치', s.matches + '회'],
      ['우승', s.wins + '회'],
      ['누적 처치', s.kills + '명'],
      ['최고 순위', (s.best && s.best < 99 ? s.best + '위' : '-')],
      ['한 판 최다 처치', (s.bestKills || 0) + '명'],
      ['연 상자', (s.opened || 0) + '개'],
      ['보유 스킨', d.owned.skin.length + ' / ' + Object.keys(SKINS).length],
      ['보유 도장', d.owned.gun.length + ' / ' + Object.keys(GUN_SKINS).length]
    ];
    this.el.statList.innerHTML = rows.map(r =>
      '<div class="statRow"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  }
};
