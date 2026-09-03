/* ============================================================
   로비: 캐릭터 미리보기(3D) + 상자·스킨·전적 화면
   ============================================================ */
const Lobby = {
  scene: null, camera: null, group: null, spin: 0, ready: false,

  /* ---------- 3D 미리보기 ---------- */
  initScene() {
    if (this.scene) return;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 60);
    // 왼쪽 패널을 피해 캐릭터가 오른쪽에 서 보이도록 카메라를 옮깁니다
    this.camera.position.set(-1.25, 1.12, 4.5);
    this.camera.lookAt(-1.25, 0.95, 0);

    this.scene.add(new THREE.HemisphereLight(0x9cc0e4, 0x22262c, 1.05));
    const key = new THREE.DirectionalLight(0xfff2de, 2.6);
    key.position.set(2.0, 3.0, 3.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb4ff, 1.7);
    rim.position.set(-3, 2, -2.4);
    this.scene.add(rim);

    // 받침대
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.3, 0.16, 40),
      new THREE.MeshStandardMaterial({ color: srgb(0x1b2028), roughness: 0.6, metalness: 0.3 }));
    pod.position.y = -0.08;
    this.scene.add(pod);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.18, 0.02, 40),
      new THREE.MeshBasicMaterial({ color: srgb(0x2f81f7) }));
    ring.position.y = 0.01;
    this.scene.add(ring);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.ready = true;
  },

  /* 장착한 스킨으로 미리보기 캐릭터를 다시 만듭니다 */
  refresh() {
    this.initScene();
    while (this.group.children.length) this.group.remove(this.group.children[0]);

    const skin = SKINS[Profile.data.equipped.skin] || SKINS.recruit;
    const art = CharArt.get(skin);
    const mat = Mats.vc({ roughness: 0.82, metalness: 0.02 });
    const mk = geo => new THREE.Mesh(geo, mat);

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    hips.add(mk(art.torso));
    this.group.add(hips);

    const armR = new THREE.Group(); armR.position.set(-0.21, 0.615, 0);
    const armL = new THREE.Group(); armL.position.set(0.21, 0.615, 0);
    armR.add(mk(art.arm)); armL.add(mk(art.arm));
    armR.rotation.set(-0.95, 0.1, 0.16);      // 총을 든 자세
    armL.rotation.set(-1.05, -0.3, -0.5);
    hips.add(armR); hips.add(armL);

    const gun = new THREE.Mesh(
      GunArt.geo('rifle', 0, Profile.data.equipped.gun),
      Mats.vc({ roughness: 0.55, metalness: 0.25 }));
    gun.position.set(-0.02, -0.60, 0.22);
    gun.rotation.x = 0.95;
    armR.add(gun);

    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.105 * s, 0.92, 0);
      leg.rotation.set(s > 0 ? 0.06 : -0.04, 0, 0.02 * s);
      leg.add(mk(art.thigh));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      knee.rotation.x = -0.05;
      knee.add(mk(art.shin));
      leg.add(knee);
      this.group.add(leg);
    }
  },

  update(dt) {
    if (!this.ready) return;
    this.spin += dt * 0.35;
    this.group.rotation.y = Math.sin(this.spin) * 0.55 + 0.25;
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
      revealCard: document.getElementById('revealCard')
    };

    this.el.tabs.forEach(btn => btn.addEventListener('click', () => this.tab(btn.dataset.tab)));
    document.getElementById('reveal').addEventListener('click', () => {
      this.el.reveal.classList.add('hidden');
    });
    this.buildCrates();
    this.buildRates();
    this.refreshUI();
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
