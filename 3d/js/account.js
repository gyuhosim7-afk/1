/* ============================================================
   계정 · 친구 · 같은 섬 코드

   서버 없이 동작하도록 만들었습니다.
   - 계정: 진행 상황(BP·스킨·전적)을 짧은 '저장 코드' 한 줄로 옮깁니다.
           다른 기기에서 그 코드를 붙여 넣으면 그대로 이어서 합니다.
   - 친구: 상대의 '친구 코드'를 등록해 목록으로 관리합니다.
   - 같은 섬 코드: 섬과 봇 수를 담은 코드입니다. 친구가 같은 코드로 시작하면
                   지형·건물·아이템·자기장이 완전히 같은 섬에서 플레이합니다.

   claude 의 db 기능이 켜져 있으면(공개 공유를 끄고 조직 전용으로 바꾼 경우)
   접속 상태와 초대까지 실시간으로 동작하도록 아래 db 경로가 살아납니다.
   꺼져 있으면 조용히 로컬 모드로만 동작합니다.
   ============================================================ */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // 헷갈리는 I, L, O, U 제외

const Account = {
  KEY: 'lastSurvivor3d.account',
  data: { id: '', friends: [] },      // id: 내 친구 코드, friends: [{ id, name }]
  db: null,                           // db 기능이 있을 때만 채워집니다
  online: false,
  peers: {},                          // 친구 코드 -> { at, state, name }
  _saveT: 0,

  /* ---------- 저장소 ---------- */
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.id === 'string') this.data.id = d.id.slice(0, 8);
        if (Array.isArray(d.friends)) {
          this.data.friends = d.friends
            .filter(f => f && typeof f.id === 'string')
            .slice(0, 30)
            .map(f => ({ id: f.id.slice(0, 8), name: String(f.name || '생존자').slice(0, 12) }));
        }
      }
    } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
    if (!this.data.id) { this.data.id = this.newId(); this.save(); }
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ } },

  newId() {
    let s = '';
    for (let i = 0; i < 6; i++) s += B32[Math.floor(Math.random() * 32)];
    return s;
  },

  /* ---------- 저장 코드 (기기 사이 진행 상황 옮기기) ----------
     사람이 손으로 옮기는 코드이므로 짧게 만듭니다.
     형식: LS1|bp|보유스킨비트|보유도장비트|장착스킨|장착도장|전적|닉네임|검사값 */
  exportCode() {
    const d = Profile.data;
    const skinKeys = Object.keys(SKINS), gunKeys = Object.keys(GUN_SKINS);
    const bits = (keys, owned) => {
      let n = 0;
      keys.forEach((k, i) => { if (owned.indexOf(k) >= 0) n |= (1 << i); });
      return n.toString(32);
    };
    const s = d.stats;
    const body = [
      'LS1',
      Math.min(9999999, d.bp).toString(32),
      bits(skinKeys, d.owned.skin),
      bits(gunKeys, d.owned.gun),
      skinKeys.indexOf(d.equipped.skin).toString(32),
      gunKeys.indexOf(d.equipped.gun).toString(32),
      [s.matches | 0, s.wins | 0, s.kills | 0, s.best | 0, s.bestKills | 0, s.opened | 0]
        .map(n => Math.min(99999, n).toString(32)).join('.'),
      this.data.id,
      encodeURIComponent(Profile.nickname())
    ].join('|');
    return body + '|' + this.sum(body).toString(32);
  },

  /* 붙여 넣은 코드를 검사하고 그대로 반영합니다. 성공하면 true */
  importCode(text) {
    const raw = String(text || '').trim().replace(/\s+/g, '');
    const parts = raw.split('|');
    if (parts.length !== 10 || parts[0] !== 'LS1') return { ok: false, why: '코드 형식이 맞지 않습니다' };
    const body = parts.slice(0, 9).join('|');
    if (this.sum(body).toString(32) !== parts[9]) return { ok: false, why: '코드가 손상되었습니다' };

    const skinKeys = Object.keys(SKINS), gunKeys = Object.keys(GUN_SKINS);
    const unbits = (keys, str) => {
      const n = parseInt(str, 32) || 0;
      return keys.filter((k, i) => n & (1 << i));
    };
    const st = parts[6].split('.').map(v => parseInt(v, 32) || 0);
    const d = Profile.data;
    d.bp = Math.max(0, parseInt(parts[1], 32) || 0);
    d.owned.skin = unbits(skinKeys, parts[2]);
    d.owned.gun = unbits(gunKeys, parts[3]);
    if (d.owned.skin.indexOf('recruit') < 0) d.owned.skin.push('recruit');
    if (d.owned.gun.indexOf('stock') < 0) d.owned.gun.push('stock');
    d.equipped.skin = skinKeys[parseInt(parts[4], 32)] || 'recruit';
    d.equipped.gun = gunKeys[parseInt(parts[5], 32)] || 'stock';
    if (d.owned.skin.indexOf(d.equipped.skin) < 0) d.equipped.skin = 'recruit';
    if (d.owned.gun.indexOf(d.equipped.gun) < 0) d.equipped.gun = 'stock';
    d.stats = { matches: st[0] || 0, wins: st[1] || 0, kills: st[2] || 0,
                best: st[3] || 99, bestKills: st[4] || 0, opened: st[5] || 0 };
    d.name = decodeURIComponent(parts[8] || '').slice(0, 12);
    Profile.save();

    this.data.id = (parts[7] || '').slice(0, 8) || this.data.id;
    this.save();
    return { ok: true };
  },

  sum(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h % 1000003;
  },

  /* ---------- 친구 ---------- */
  addFriend(code, name) {
    const id = String(code || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    if (id.length < 4) return { ok: false, why: '친구 코드는 6자리입니다' };
    if (id === this.data.id) return { ok: false, why: '내 코드입니다' };
    if (this.data.friends.some(f => f.id === id)) return { ok: false, why: '이미 등록된 친구입니다' };
    if (this.data.friends.length >= 30) return { ok: false, why: '친구는 30명까지 등록됩니다' };
    this.data.friends.push({ id, name: String(name || '').trim().slice(0, 12) || id });
    this.save();
    this.watchFriends();
    return { ok: true };
  },

  removeFriend(id) {
    this.data.friends = this.data.friends.filter(f => f.id !== id);
    this.save();
    return true;
  },

  renameFriend(id, name) {
    const f = this.data.friends.find(f => f.id === id);
    if (f) { f.name = String(name || '').slice(0, 12) || id; this.save(); }
  },

  /* 친구 상태: db 가 없으면 '알 수 없음' 으로 표시합니다 */
  friendState(id) {
    if (!this.online) return 'unknown';
    const p = this.peers[id];
    if (!p || Date.now() - p.at > 70000) return 'offline';
    return p.state === 'match' ? 'match' : 'lobby';
  },

  /* ---------- 같은 섬 코드 ----------
     섬 씨앗(30비트) + 봇 수(6비트) 를 base32 로 8글자에 담습니다. */
  makeIslandCode(seed, bots) {
    const s = (seed >>> 0) % 0x40000000;                 // 30비트
    const n = Math.max(0, Math.min(59, bots | 0));
    let v = s * 64 + n;                                  // 36비트 → 8글자
    let out = '';
    for (let i = 0; i < 8; i++) { out = B32[v % 32] + out; v = Math.floor(v / 32); }
    return out;
  },

  parseIslandCode(text) {
    const s = String(text || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (s.length !== 8) return null;
    let v = 0;
    for (const ch of s) {
      const i = B32.indexOf(ch);
      if (i < 0) return null;
      v = v * 32 + i;
    }
    const bots = v % 64, seed = Math.floor(v / 64);
    if (seed <= 0) return null;
    return { seed, bots };
  },

  /* ---------- db 가 켜져 있을 때만 쓰는 실시간 부분 ---------- */
  async connect() {
    if (!window.claude || !window.claude.use) return false;
    let db = null;
    try { db = await window.claude.use('db'); } catch (e) { db = null; }
    if (!db) return false;
    this.db = db;
    this.online = true;
    this.beat();
    this._beat = setInterval(() => this.beat(), 25000);
    this.watchFriends();
    return true;
  },

  /* 내 접속 상태를 알립니다 */
  beat() {
    if (!this.online) return;
    const state = Game && Game.state === 'playing' ? 'match' : 'lobby';
    this.db.doc('presence/' + this.data.id)
      .set({ name: Profile.nickname(), at: Date.now(), state })
      .catch(() => {});
  },

  /* 친구들의 접속 상태를 지켜봅니다 */
  watchFriends() {
    if (!this.online) return;
    for (const un of (this._unsub || [])) { try { un(); } catch (e) { /* 무시 */ } }
    this._unsub = [];
    for (const f of this.data.friends) {
      try {
        const un = this.db.doc('presence/' + f.id).onSnapshot(snap => {
          this.peers[f.id] = snap && snap.exists ? snap.data : null;
          if (typeof Lobby !== 'undefined' && Lobby.renderFriends) Lobby.renderFriends();
        }, () => {});
        this._unsub.push(un);
      } catch (e) { /* 무시 */ }
    }
  },

  /* 친구를 초대합니다 (db 가 있을 때만) */
  invite(code, bots) {
    if (!this.online) return false;
    this.db.doc('party/' + this.data.id)
      .set({ code, bots, host: this.data.id, name: Profile.nickname(), at: Date.now() })
      .catch(() => {});
    return true;
  },

  /* 친구가 보낸 초대를 읽습니다 */
  async fetchInvite(friendId) {
    if (!this.online) return null;
    try {
      const snap = await this.db.doc('party/' + friendId).get();
      if (!snap || !snap.exists) return null;
      const d = snap.data || {};
      if (!d.code || Date.now() - (d.at || 0) > 300000) return null;
      return d;
    } catch (e) { return null; }
  }
};
