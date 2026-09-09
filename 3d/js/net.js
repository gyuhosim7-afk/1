/* ============================================================
   함께 하기: 같은 링크를 연 사람들과 실시간으로 같은 섬에서 플레이
   - 위치·체력 같은 상태는 presence 로 계속 흘려보냅니다
   - 사격·피격·아이템 획득·사망은 event 로 알립니다
   - 봇은 방장 한 명이 굴리고 나머지는 그 결과만 받아 그립니다
   room 을 쓸 수 없는 환경(파일로 직접 열기 등)에서는 조용히 혼자 플레이합니다.
   ============================================================ */
const Net = {
  room: null, ready: false, myPeer: null, hostPeer: null,
  players: {},              // peer -> Char3D (다른 사람 캐릭터)
  lobbyPeers: [],
  lastSend: 0, lastShot: 0,
  pendingStart: null,

  get online() { return !!(this.room && this.ready); },
  get isHost() { return !this.online || this.hostPeer === this.myPeer; },
  get playerCount() { return this.lobbyPeers.filter(p => p.kind === 'viewer').length || 1; },

  async connect() {
    if (!window.claude || !window.claude.use) return false;
    let room = null;
    try { room = await window.claude.use('room'); } catch (e) { room = null; }
    if (!room) return false;
    this.attach(room);
    return true;
  },

  /* 통신 방식을 갈아 끼웁니다. presence / emit / on / onPeers 만 갖추면
     어떤 것이든 됩니다 — 아티팩트의 room 이든, 브라우저끼리 직접 잇는
     WebRTC 방이든 게임 로직은 달라지지 않습니다. */
  attach(room) {
    this.room = room;
    this.ready = true;
    room.onPeers(change => this.onPeers(change), () => { this.ready = false; });
    room.on('start', m => this.onStart(m));
    room.on('shot', m => this.onShot(m));
    room.on('hit', m => this.onHit(m));
    room.on('pick', m => this.onPick(m));
    room.on('died', m => this.onDied(m));
    this.push({ mode: 'lobby', name: Profile.nickname(), skin: Profile.data.equipped.skin });
  },

  /* 친구 방에 들어갔을 때 (Party 가 부릅니다) */
  useRTC() {
    if (this.room === RTCRoom) return;
    RTCRoom.handlers = {};
    this.attach(RTCRoom);
  },
  dropRTC() {
    if (this.room !== RTCRoom) return;
    this.room = null; this.ready = false; this.players = {}; this.lobbyPeers = [];
  },

  push(patch) { if (this.online) this.room.presence(patch).catch(() => {}); },
  send(topic, data) { if (this.online) this.room.emit(topic, data).catch(() => {}); },

  /* ---------- 참가자 변화 ---------- */
  onPeers(change) {
    const list = change.peers.filter(p => p.kind === 'viewer');
    this.lobbyPeers = list;
    const me = list.find(p => p.isMe && p.sameTab);
    if (me) this.myPeer = me.peer;

    // 방장이 사라지면 남은 사람 중 첫 번째가 이어받습니다
    if (this.hostPeer && !list.some(p => p.peer === this.hostPeer)) {
      this.hostPeer = list.map(p => p.peer).sort()[0] || this.myPeer;
      if (this.hostPeer === this.myPeer) Game.pushFeed('방장을 이어받았습니다');
    }

    for (const p of change.left) this.removePlayer(p.peer);
    if (Game.state === 'playing') for (const p of list) this.syncPlayer(p);
    if (typeof Lobby !== 'undefined' && Lobby.el) Lobby.showPeers(list);
  },

  /* ---------- 매치 시작 ---------- */
  /* 방장은 '어느 섬에서 언제 시작할지' 만 정합니다.
     참가자 수는 보내지 않습니다 — 방장이 숫자를 조작해 전원을 적은 봇으로
     시작시키는 길을 막기 위해, 각자 자기 쪽 상수를 씁니다. */
  hostStart(mode) {
    const seed = (Math.random() * 0x7fffffff) | 0;
    const at = Date.now() + 1200;             // 다 같이 시작하도록 잠깐 여유를 둡니다
    this.hostPeer = this.myPeer;
    /* 누가 어느 시작 지점을 쓸지는 방장이 정한 순서로 정합니다.
       각자 제 목록을 정렬해 쓰면, 목록이 아직 안 맞은 순간에 둘이 같은
       자리에서 시작하는 일이 생깁니다. */
    const order = this.lobbyPeers.filter(x => x.kind === 'viewer').map(x => x.peer).sort();
    const d = { seed, at, host: this.myPeer, mode: mode || 'br', order };
    this.send('start', d);
    this.pendingStart = d;
  },

  /* 결투장에서 내가 쓸 시작 지점 번호 (0 이 방장) */
  slotOf(order) {
    if (!order || !order.length) return 0;
    const i = order.indexOf(this.myPeer);
    return i < 0 ? 1 : (i % 2);
  },

  onStart(msg) {
    const d = msg.data || {};
    if (!d.seed) return;
    if (msg.isMe && msg.sameTab) return;       // 내가 보낸 것은 이미 처리
    this.hostPeer = d.host || msg.peer;
    this.pendingStart = { seed: d.seed, at: d.at, host: this.hostPeer,
                          mode: d.mode || 'br', order: d.order || [] };
    Lobby.notifyStarting(d.mode);
  },

  /* 예약된 시작 시각이 되면 매치를 엽니다 */
  tick() {
    if (this.pendingStart && Date.now() >= this.pendingStart.at) {
      const s = this.pendingStart;
      this.pendingStart = null;
      /* 사람 수는 방장이 보낸 목록 길이로 셉니다. 각자 제 목록을 세면
         목록이 아직 안 맞은 순간에 봇 수가 달라져 서로 다른 섬이 됩니다. */
      const humans = (s.order || []).length || 1;
      Main.beginMatch(CFG.BOTS, { seed: s.seed, startedAt: s.at, online: true, humans,
                                  mode: s.mode || 'br', slot: this.slotOf(s.order) });
    }
  },

  /* ---------- 매치 중 상태 주고받기 ---------- */
  update(dt) {
    if (!this.online || Game.state !== 'playing') return;
    const now = performance.now();
    if (now - this.lastSend < 55) return;      // 초당 18회 정도
    this.lastSend = now;

    const p = Game.player;
    const patch = {
      mode: 'match',
      name: Profile.nickname(),
      skin: Profile.data.equipped.skin,
      gunSkin: p.gunSkin,
      x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
      yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2),
      hp: Math.max(0, Math.round(p.hp)),
      gun: p.gun || '', scope: p.zoom,
      fly: p.flying || '', crouch: !!p.crouch, dead: !!p.dead,
      spd: +p.speedNow.toFixed(1)
    };
    if (this.isHost) patch.bots = this.packBots();
    this.push(patch);
  },

  /* 봇 상태를 문자열 하나로 압축 (방장만 보냅니다) */
  packBots() {
    const out = [];
    for (const c of Game.chars) {
      if (!c.ai || c.remote) continue;
      out.push([c.netId, c.pos.x.toFixed(1), c.pos.y.toFixed(1), c.pos.z.toFixed(1),
                c.yaw.toFixed(2), Math.max(0, Math.round(c.hp)), c.gun || ''].join(','));
    }
    return out.join('|');
  },

  applyBots(str) {
    if (!str) return;
    for (const row of str.split('|')) {
      const f = row.split(',');
      const c = Game.botById[+f[0]];
      if (!c) continue;
      c.netTarget = c.netTarget || new THREE.Vector3();
      c.netTarget.set(+f[1], +f[2], +f[3]);
      c.yaw = +f[4];
      const hp = +f[5];
      if (hp <= 0 && !c.dead) { c.dead = true; c.deadT = 0; }
      c.hp = hp;
      if (f[6] && c.gun !== f[6]) c.giveGun(f[6], 60);
    }
  },

  /* 다른 사람 캐릭터를 만들거나 위치를 갱신 */
  syncPlayer(peer) {
    if (!peer || peer.isMe || peer.kind !== 'viewer') return;
    const d = peer.presence || {};
    if (d.mode !== 'match') { this.removePlayer(peer.peer); return; }

    let c = this.players[peer.peer];
    if (!c) {
      const skin = SKINS[d.skin] || SKINS.recruit;
      c = new Char3D(d.x || 0, d.z || 0, false, d.name || '생존자', skin);
      c.remote = true;
      c.ai = null;
      c.gunSkin = d.gunSkin || 'stock';
      Game.scene.add(c.mesh);
      Game.chars.push(c);
      this.players[peer.peer] = c;
      Game.pushFeed((d.name || '생존자') + ' 님이 합류했습니다');
    }
    c.netTarget = c.netTarget || new THREE.Vector3();
    c.netTarget.set(d.x || 0, d.y || 0, d.z || 0);
    c.yaw = d.yaw || 0;
    c.pitch = d.pitch || 0;
    c.hp = d.hp == null ? 100 : d.hp;
    c.crouch = !!d.crouch;
    c.flying = d.fly || null;
    c.speedNow = d.spd || 0;
    if (d.dead && !c.dead) { c.dead = true; c.deadT = 0; }
    if (!d.dead && c.dead) { c.dead = false; c.deadT = 0; }
    if (d.gun && c.gun !== d.gun) c.giveGun(d.gun, 60);
    if (this.isHost && d.bots) { /* 방장은 자기 계산을 씁니다 */ }
    else if (d.bots) this.applyBots(d.bots);
  },

  removePlayer(peerId) {
    const c = this.players[peerId];
    if (!c) return;
    Game.scene.remove(c.mesh);
    const i = Game.chars.indexOf(c);
    if (i >= 0) Game.chars.splice(i, 1);
    delete this.players[peerId];
  },

  /* 매 프레임: 받은 위치로 부드럽게 따라갑니다 */
  interpolate(dt) {
    const k = Math.min(1, dt * 12);
    for (const id in this.players) {
      const c = this.players[id];
      if (c.netTarget) c.pos.lerp(c.netTarget, k);
      c.syncMesh(dt, false);
    }
    if (!this.isHost) {
      for (const c of Game.chars) {
        if (!c.ai || c.remote) continue;
        if (c.netTarget) c.pos.lerp(c.netTarget, k);
        c.syncMesh(dt, false);
      }
    }
  },

  /* ---------- 사건 ---------- */
  shot(x, y, z, ex, ey, ez) {
    const now = performance.now();
    if (now - this.lastShot < 120) return;     // 초당 8회로 제한
    this.lastShot = now;
    this.send('shot', { x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1),
                        ex: +ex.toFixed(1), ey: +ey.toFixed(1), ez: +ez.toFixed(1) });
  },
  onShot(m) {
    if (m.isMe || Game.state !== 'playing') return;
    const d = m.data || {};
    Game.tracer(d.x, d.y, d.z, d.ex, d.ey, d.ez, false);
    Game.muzzleFlash(d.x, d.y, d.z, false);
    Sfx.shot(Game.player ? Game.player.pos.distanceTo(new THREE.Vector3(d.x, d.y, d.z)) : 200, 'rifle');
  },

  hitPlayer(peerId, dmg, head) { this.send('hit', { to: peerId, dmg: Math.round(dmg), head: !!head }); },
  hitBot(netId, dmg, head) { this.send('hit', { bot: netId, dmg: Math.round(dmg), head: !!head, by: Profile.nickname() }); },
  onHit(m) {
    if (Game.state !== 'playing') return;
    const d = m.data || {};
    if (d.to && d.to === this.myPeer && !m.isMe) {
      Game.damage(Game.player, d.dmg, this.players[m.peer] || null, d.head, false);
    } else if (d.bot != null && this.isHost && !m.isMe) {
      const c = Game.botById[d.bot];
      if (c && !c.dead) Game.damage(c, d.dmg, this.players[m.peer] || null, d.head, false);
    }
  },

  pick(lootId) { this.send('pick', { id: lootId }); },
  onPick(m) {
    if (m.isMe || Game.state !== 'playing') return;
    const l = Game.loots.find(x => x.id === (m.data || {}).id);
    if (l && !l.dead) { l.dead = true; Game.scene.remove(l.mesh); }
  },

  died(byName) {
    this.deathNo = (this.deathNo || 0) + 1;
    this.send('died', { by: byName || '', n: this.deathNo });
  },
  onDied(m) {
    if (m.isMe || Game.state !== 'playing') return;
    const c = this.players[m.peer];
    if (!c) return;
    /* 죽음마다 번호를 붙여 세는 이유:
       위치(presence)가 이 알림보다 먼저 도착하면 c.dead 가 이미 true 라,
       'c.dead 가 아니면 센다' 로는 점수를 놓칩니다. 번호로 세면 순서가
       뒤바뀌어도 한 번만, 빠짐없이 셉니다. */
    const n = (m.data || {}).n || 0;
    const seen = this.deathSeen || (this.deathSeen = {});
    if (n && seen[m.peer] === n) return;         // 같은 죽음을 두 번 세지 않습니다
    seen[m.peer] = n;
    if (!c.dead) { c.dead = true; c.deadT = 0; }
    if (!Game.duel) { Game.pushFeed(c.name + ' 탈락'); return; }
    /* 1대1 에서는 상대가 쓰러졌다는 것이 곧 내 한 점입니다.
       상대 쪽에서도 같은 순간에 '상대가 득점' 으로 세므로 양쪽 점수가 맞습니다.
       (제 실수로 죽어도 1대1 에서는 남는 사람이 한 점을 가져갑니다) */
    Game.score[0]++;
    Game.pushFeed(c.name + ' 처치   ' + Game.score[0] + ' : ' + Game.score[1]);
    Sfx.kill();
  },

  leaveMatch() {
    for (const id in this.players) this.removePlayer(id);
    this.players = {};
    this.deathNo = 0; this.deathSeen = {};
    this.push({ mode: 'lobby', bots: null });
  }
};
