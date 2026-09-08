/* ============================================================
   친구와 함께 하기

   왜 이렇게 나눴는가
   - Firestore 로 위치를 실시간 전송하면 무료 한도가 금방 바닥납니다.
     초당 18회 × 사람 수 만큼 쓰기가 발생하는데 무료는 하루 2만 건입니다.
   - 그래서 Firestore 는 '드물게 바뀌는 것' 만 맡습니다.
     친구 목록, 접속 상태, 초대, 그리고 브라우저끼리 서로를 찾게 해 주는
     연결 주선(시그널링) 뿐입니다.
   - 실제 위치·사격은 브라우저끼리 직접 주고받습니다(WebRTC). 서버를
     거치지 않으므로 아무리 보내도 요금이 들지 않고 지연도 훨씬 짧습니다.

   RTCRoom 은 net.js 가 기대하는 것과 똑같은 모양
   (presence / emit / on / onPeers)을 갖췄습니다. 그래서 게임 로직은
   그대로 두고 통신 방식만 갈아 끼울 수 있습니다.
   ============================================================ */

/* ---------- 브라우저끼리 직접 연결하는 방 ---------- */
const RTCRoom = {
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],

  code: null, me: null, host: null,
  conns: {},            // uid -> { pc, ch, open }
  state: {},            // uid -> { name, presence }
  handlers: {},
  peersCb: null, gone: null,
  mine: {},             // 내가 마지막으로 보낸 presence
  _stop: [],

  get joined() { return !!this.code; },

  /* ---------- net.js 가 쓰는 네 가지 ---------- */
  presence(patch) {
    Object.assign(this.mine, patch);
    this.bcast({ t: 'p', d: patch });
    this.state[this.me] = this.state[this.me] || {};
    Object.assign(this.state[this.me].presence = this.state[this.me].presence || {}, patch);
    this.firePeers();
    return Promise.resolve();
  },
  emit(topic, data) {
    this.bcast({ t: 'e', k: topic, d: data });
    return Promise.resolve();
  },
  on(topic, fn) { (this.handlers[topic] = this.handlers[topic] || []).push(fn); },
  onPeers(cb, gone) { this.peersCb = cb; this.gone = gone; this.firePeers(); },

  /* ---------- 안쪽 ---------- */
  peerList() {
    return Object.keys(this.state).map(uid => ({
      peer: uid, kind: 'viewer',
      isMe: uid === this.me, sameTab: uid === this.me,
      name: this.state[uid].name || '',
      presence: this.state[uid].presence || {}
    }));
  },

  firePeers(left) {
    if (this.peersCb) this.peersCb({ peers: this.peerList(), left: left || [] });
  },

  bcast(obj) {
    const s = JSON.stringify(obj);
    for (const uid in this.conns) {
      const c = this.conns[uid];
      if (c.ch && c.ch.readyState === 'open') {
        try { c.ch.send(s); } catch (e) { /* 끊긴 상대는 무시 */ }
      }
    }
  },

  recv(uid, raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'p') {
      const st = this.state[uid] = this.state[uid] || {};
      st.presence = Object.assign(st.presence || {}, m.d);
      this.firePeers();
    } else if (m.t === 'e') {
      for (const fn of (this.handlers[m.k] || [])) {
        try { fn({ data: m.d, peer: uid, isMe: false, sameTab: false }); } catch (e) { /* 계속 */ }
      }
    }
  },

  /* 한 상대와의 연결을 엽니다.
     둘 중 uid 가 작은 쪽이 먼저 말을 거는 것으로 정해, 양쪽이 동시에
     제안해서 꼬이는 일을 막습니다. */
  link(uid, sig) {
    if (this.conns[uid]) return this.conns[uid];
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    const c = this.conns[uid] = { pc, ch: null };
    const polite = this.me < uid;          // 내가 먼저 제안하는 쪽인가

    pc.onicecandidate = e => { if (e.candidate) sig.send(uid, { ice: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(uid);
    };
    const wire = ch => {
      c.ch = ch;
      ch.onmessage = e => this.recv(uid, e.data);
      ch.onopen = () => {
        this.state[uid] = this.state[uid] || {};
        if (Object.keys(this.mine).length) ch.send(JSON.stringify({ t: 'p', d: this.mine }));
        this.firePeers();
      };
      ch.onclose = () => this.drop(uid);
    };
    if (polite) {
      wire(pc.createDataChannel('game', { ordered: true }));
      pc.createOffer().then(o => pc.setLocalDescription(o))
        .then(() => sig.send(uid, { sdp: pc.localDescription.toJSON() }))
        .catch(() => {});
    } else {
      pc.ondatachannel = e => wire(e.channel);
    }
    return c;
  },

  async onSignal(uid, msg, sig) {
    const c = this.link(uid, sig);
    try {
      if (msg.sdp) {
        await c.pc.setRemoteDescription(msg.sdp);
        if (msg.sdp.type === 'offer') {
          await c.pc.setLocalDescription(await c.pc.createAnswer());
          sig.send(uid, { sdp: c.pc.localDescription.toJSON() });
        }
      } else if (msg.ice) {
        await c.pc.addIceCandidate(msg.ice);
      }
    } catch (e) { /* 늦게 도착한 신호는 버립니다 */ }
  },

  drop(uid) {
    const c = this.conns[uid];
    if (!c) return;
    try { c.pc.close(); } catch (e) { /* 무시 */ }
    delete this.conns[uid];
    delete this.state[uid];
    this.firePeers([{ peer: uid }]);
  },

  leave() {
    for (const uid in this.conns) { try { this.conns[uid].pc.close(); } catch (e) { /* 무시 */ } }
    for (const fn of this._stop) { try { fn(); } catch (e) { /* 무시 */ } }
    this._stop = [];
    this.conns = {}; this.state = {}; this.mine = {};
    this.code = null; this.host = null;
    this.firePeers();
  }
};

/* ============================================================
   친구와 초대 (Firestore)
   여기서 다루는 것은 드물게 바뀌는 것뿐입니다 — 친구 목록, 접속 상태,
   초대, 그리고 브라우저끼리 서로를 찾게 해 주는 신호. 실제 게임 통신은
   위의 RTCRoom 이 브라우저끼리 직접 처리합니다.
   ============================================================ */
const Party = {
  ready: false,
  friends: [],          // [{ uid, name, code, online }]
  invites: [],          // [{ from, name, room }]
  room: null,           // 지금 들어가 있는 방 코드
  isHost: false,
  members: [],          // [{ uid, name }]
  error: null,
  _stop: [], _beat: 0, _seen: {},

  get on() { return this.ready && typeof Auth !== 'undefined' && Auth.signedIn; },
  get db() { return Auth._db; },
  get F() { return Auth._m.db; },

  /* 로그인 직후에 부릅니다 */
  async start() {
    if (typeof Auth === 'undefined' || !Auth.ready || !Auth.signedIn) return false;
    try {
      const F = this.F, uid = Auth.user.uid;
      // 남들이 나를 찾을 수 있도록 공개 정보를 올립니다 (이름·친구 코드·접속 시각)
      await F.setDoc(F.doc(this.db, 'profiles', uid), {
        name: Profile.nickname(), code: Account.data.id, at: Date.now()
      }, { merge: true });

      // 나에게 온 초대를 지켜봅니다
      this._stop.push(F.onSnapshot(F.collection(this.db, 'invites', uid, 'from'), snap => {
        this.invites = snap.docs.map(d => Object.assign({ from: d.id }, d.data()))
          .filter(v => Date.now() - (v.at || 0) < 120000);   // 2분 지난 초대는 버립니다
        this.render();
      }, () => { /* 권한 오류는 조용히 */ }));

      this.ready = true;
      await this.loadFriends();
      this.beat();
      this.render();
      return true;
    } catch (e) {
      this.error = '친구 기능을 시작하지 못했습니다';
      return false;
    }
  },

  stop() {
    for (const f of this._stop) { try { f(); } catch (e) { /* 무시 */ } }
    this._stop = [];
    clearInterval(this._beat);
    this.ready = false; this.friends = []; this.invites = [];
    this.leaveRoom();
  },

  /* 살아 있다는 표시. 30초마다 시각만 갱신합니다 (쓰기가 적어야 합니다) */
  beat() {
    clearInterval(this._beat);
    const tick = async () => {
      if (!this.on) return;
      try {
        const F = this.F;
        await F.setDoc(F.doc(this.db, 'profiles', Auth.user.uid),
                       { name: Profile.nickname(), code: Account.data.id, at: Date.now() },
                       { merge: true });
      } catch (e) { /* 무시 */ }
      this.loadFriends();
    };
    this._beat = setInterval(tick, 30000);
  },

  /* 내 친구 목록을 읽고 각자의 접속 상태를 확인합니다 */
  async loadFriends() {
    if (!this.on) return;
    try {
      const F = this.F;
      const mine = await F.getDoc(F.doc(this.db, 'players', Auth.user.uid));
      const ids = ((mine.exists() && mine.data().friends) || []).slice(0, 50);
      const out = [];
      for (const uid of ids) {
        const p = await F.getDoc(F.doc(this.db, 'profiles', uid));
        if (!p.exists()) continue;
        const d = p.data();
        out.push({ uid, name: d.name || '생존자', code: d.code || '',
                   online: Date.now() - (d.at || 0) < 90000 });
      }
      this.friends = out;
      this.render();
    } catch (e) { /* 무시 */ }
  },

  /* 친구 코드로 찾아 목록에 넣습니다 */
  async addFriend(code) {
    if (!this.on) return { ok: false, why: '먼저 로그인해 주세요' };
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) return { ok: false, why: '친구 코드를 확인해 주세요' };
    if (code === Account.data.id) return { ok: false, why: '본인 코드입니다' };
    try {
      const F = this.F;
      const q = F.query(F.collection(this.db, 'profiles'), F.where('code', '==', code));
      const found = await F.getDocs(q);
      if (found.empty) return { ok: false, why: '그 코드를 쓰는 사람이 없습니다' };
      const doc0 = found.docs[0];
      if (doc0.id === Auth.user.uid) return { ok: false, why: '본인 코드입니다' };
      await F.setDoc(F.doc(this.db, 'players', Auth.user.uid),
                     { friends: F.arrayUnion(doc0.id) }, { merge: true });
      await this.loadFriends();
      return { ok: true, name: (doc0.data() || {}).name || '생존자' };
    } catch (e) {
      return { ok: false, why: '친구를 찾지 못했습니다' };
    }
  },

  async removeFriend(uid) {
    if (!this.on) return;
    try {
      const F = this.F;
      await F.setDoc(F.doc(this.db, 'players', Auth.user.uid),
                     { friends: F.arrayRemove(uid) }, { merge: true });
      await this.loadFriends();
    } catch (e) { /* 무시 */ }
  },

  /* ---------- 방 ---------- */
  newCode() {
    const B = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 5; i++) s += B[(Math.random() * B.length) | 0];
    return s;
  },

  /* 방을 열고 친구를 부릅니다 */
  async invite(uid) {
    if (!this.on) return { ok: false, why: '먼저 로그인해 주세요' };
    try {
      const F = this.F;
      if (!this.room) { const r = await this.openRoom(); if (!r.ok) return r; }
      await F.setDoc(F.doc(this.db, 'invites', uid, 'from', Auth.user.uid),
                     { name: Profile.nickname(), room: this.room, at: Date.now() });
      return { ok: true };
    } catch (e) { return { ok: false, why: '초대를 보내지 못했습니다' }; }
  },

  async openRoom() {
    try {
      const F = this.F, code = this.newCode(), uid = Auth.user.uid;
      await F.setDoc(F.doc(this.db, 'rooms', code), {
        host: uid, at: Date.now(),
        members: { [uid]: { name: Profile.nickname(), at: Date.now() } }
      });
      this.isHost = true;
      this.joinLive(code);
      return { ok: true, code };
    } catch (e) { return { ok: false, why: '방을 만들지 못했습니다' }; }
  },

  async joinRoom(code) {
    if (!this.on) return { ok: false, why: '먼저 로그인해 주세요' };
    code = String(code || '').trim().toUpperCase();
    try {
      const F = this.F, uid = Auth.user.uid;
      const ref = F.doc(this.db, 'rooms', code);
      const snap = await F.getDoc(ref);
      if (!snap.exists()) return { ok: false, why: '그런 방이 없습니다' };
      await F.setDoc(ref, { members: { [uid]: { name: Profile.nickname(), at: Date.now() } } },
                     { merge: true });
      this.isHost = (snap.data().host === uid);
      this.joinLive(code);
      // 받은 초대는 지웁니다
      try { await F.deleteDoc(F.doc(this.db, 'invites', uid, 'from', snap.data().host)); } catch (e) { /* 무시 */ }
      return { ok: true, code };
    } catch (e) { return { ok: false, why: '방에 들어가지 못했습니다' }; }
  },

  /* 방을 지켜보며 새 사람이 오면 브라우저끼리 직접 연결합니다 */
  joinLive(code) {
    const F = this.F, uid = Auth.user.uid;
    this.room = code;
    RTCRoom.code = code; RTCRoom.me = uid;
    RTCRoom.state[uid] = { name: Profile.nickname(), presence: {} };

    // 나에게 온 연결 신호
    const sigCol = F.collection(this.db, 'rooms', code, 'sig');
    const sig = {
      send: (to, msg) => {
        F.addDoc(sigCol, { from: uid, to, msg: JSON.stringify(msg), at: Date.now() })
          .catch(() => {});
      }
    };
    this._stop.push(F.onSnapshot(F.query(sigCol, F.where('to', '==', uid)), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (this._seen[ch.doc.id]) return;
        this._seen[ch.doc.id] = 1;
        let msg; try { msg = JSON.parse(d.msg); } catch (e) { return; }
        RTCRoom.onSignal(d.from, msg, sig);
        F.deleteDoc(ch.doc.ref).catch(() => {});     // 쓴 신호는 지워 둡니다
      });
    }, () => { /* 무시 */ }));

    // 방 인원 변화
    this._stop.push(F.onSnapshot(F.doc(this.db, 'rooms', code), snap => {
      if (!snap.exists()) { this.leaveRoom(); return; }
      const d = snap.data() || {}, mem = d.members || {};
      this.isHost = d.host === uid;
      this.members = Object.keys(mem).map(k => ({ uid: k, name: (mem[k] || {}).name || '생존자' }));
      for (const k of Object.keys(mem)) {
        if (k === uid) continue;
        RTCRoom.state[k] = RTCRoom.state[k] || { name: mem[k].name, presence: {} };
        RTCRoom.link(k, sig);          // 이미 연결돼 있으면 아무 일도 하지 않습니다
      }
      RTCRoom.firePeers();
      this.render();
    }, () => { /* 무시 */ }));

    if (typeof Net !== 'undefined') Net.useRTC();
    this.render();
  },

  async leaveRoom() {
    const code = this.room;
    this.room = null; this.members = []; this.isHost = false;
    RTCRoom.leave();
    if (typeof Net !== 'undefined') Net.dropRTC();
    if (!code || !this.on) { this.render(); return; }
    try {
      const F = this.F;
      // 중첩 필드를 지울 때는 점 표기로 updateDoc 을 쓰는 것이 정확합니다
      await F.updateDoc(F.doc(this.db, 'rooms', code),
                        { ['members.' + Auth.user.uid]: F.deleteField() });
    } catch (e) { /* 무시 */ }
    this.render();
  },

  render() { if (typeof Lobby !== 'undefined' && Lobby.renderParty) Lobby.renderParty(); }
};
