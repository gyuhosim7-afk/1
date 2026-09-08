/* ============================================================
   계정: 구글 로그인 + 클라우드 저장 (Firebase)

   설계 원칙
   - 로그인은 '선택' 입니다. 설정이 비어 있거나 Firebase 를 못 불러와도
     게임은 지금처럼 게스트로 그대로 돌아갑니다. 링크를 연 친구가
     로그인 화면에 막히는 일이 없어야 합니다.
   - 로그인하면 BP·스킨·전적이 계정에 따라다닙니다. 기기를 바꿔도
     같은 구글 계정으로 들어오면 이어서 합니다.
   - 처음 로그인할 때는 '덮어쓰기' 가 아니라 '합치기' 를 합니다.
     기기에서 모은 것과 계정에 있던 것 중 좋은 쪽을 남깁니다.
     한쪽을 날려 버리면 되돌릴 방법이 없기 때문입니다.
   ============================================================ */
const Auth = {
  SDK: 'https://www.gstatic.com/firebasejs/10.12.2/',
  ready: false,          // Firebase 준비됨
  user: null,            // 로그인한 사람 { uid, name, photo }
  error: null,
  _app: null, _auth: null, _db: null,
  _saveT: 0,

  get enabled() {
    return !!(typeof FIREBASE_CONFIG !== 'undefined'
              && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
  },
  get signedIn() { return !!this.user; },

  /* Firebase SDK 는 설정이 있을 때만 받아 옵니다 (없으면 요청조차 안 합니다) */
  async init() {
    if (!this.enabled) return false;
    try {
      const [{ initializeApp }, authMod, dbMod] = await Promise.all([
        import(this.SDK + 'firebase-app.js'),
        import(this.SDK + 'firebase-auth.js'),
        import(this.SDK + 'firebase-firestore.js')
      ]);
      this._app = initializeApp(FIREBASE_CONFIG);
      this._auth = authMod.getAuth(this._app);
      this._db = dbMod.getFirestore(this._app);
      this._m = { auth: authMod, db: dbMod };
      this.ready = true;

      authMod.onAuthStateChanged(this._auth, u => {
        this.user = u ? { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' } : null;
        if (u) this.pull();
        this.onChange();
      });
      return true;
    } catch (e) {
      this.error = (e && e.message) || '로그인 기능을 불러오지 못했습니다';
      return false;
    }
  },

  onChange() { if (typeof Lobby !== 'undefined' && Lobby.renderAccount) Lobby.renderAccount(); },

  async signIn() {
    if (!this.ready) return { ok: false, why: '로그인 기능이 준비되지 않았습니다' };
    try {
      const { GoogleAuthProvider, signInWithPopup } = this._m.auth;
      await signInWithPopup(this._auth, new GoogleAuthProvider());
      return { ok: true };
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { ok: false, why: '로그인을 취소했습니다' };
      }
      if (code === 'auth/unauthorized-domain') {
        return { ok: false, why: 'Firebase 콘솔에서 이 주소를 승인된 도메인에 넣어 주세요' };
      }
      return { ok: false, why: (e && e.message) || '로그인에 실패했습니다' };
    }
  },

  async signOut() {
    if (!this.ready) return;
    await this._m.auth.signOut(this._auth);
  },

  _ref() {
    const { doc } = this._m.db;
    return doc(this._db, 'players', this.user.uid);
  },

  /* 계정에 저장된 것을 가져와 이 기기 것과 합칩니다 */
  async pull() {
    if (!this.ready || !this.user) return;
    try {
      const { getDoc } = this._m.db;
      const snap = await getDoc(this._ref());
      if (snap.exists()) this.merge(snap.data());
      if (!Profile.data.name && this.user.name) Profile.data.name = this.user.name.slice(0, 12);
      Profile.save();
      this.push();
      if (typeof Lobby !== 'undefined' && Lobby.ready) { Lobby.refresh(); Lobby.renderAll && Lobby.renderAll(); }
    } catch (e) {
      this.error = '계정 정보를 읽지 못했습니다';
      this.onChange();
    }
  },

  /* 합치기 규칙: 수치는 좋은 쪽, 보유 목록은 합집합 */
  merge(cloud) {
    const P = Profile.data;
    if (!cloud || typeof cloud !== 'object') return;
    P.bp = Math.max(P.bp || 0, +cloud.bp || 0);
    if (typeof cloud.name === 'string' && !P.name) P.name = cloud.name.slice(0, 12);
    const union = (mine, theirs, table) => {
      const set = {};
      for (const k of (mine || []).concat(theirs || [])) if (table[k]) set[k] = 1;
      return Object.keys(set);
    };
    if (cloud.owned) {
      P.owned.skin = union(P.owned.skin, cloud.owned.skin, SKINS);
      P.owned.gun = union(P.owned.gun, cloud.owned.gun, GUN_SKINS);
    }
    const c = cloud.stats || {}, s = P.stats;
    s.matches = Math.max(s.matches || 0, c.matches || 0);
    s.wins = Math.max(s.wins || 0, c.wins || 0);
    s.kills = Math.max(s.kills || 0, c.kills || 0);
    s.opened = Math.max(s.opened || 0, c.opened || 0);
    s.bestKills = Math.max(s.bestKills || 0, c.bestKills || 0);
    s.best = Math.min(s.best === undefined ? 99 : s.best, c.best === undefined ? 99 : c.best);
  },

  /* 저장은 조금 모았다가 보냅니다 (매치가 끝날 때마다 곧바로 쓰면 낭비입니다) */
  push(now) {
    if (!this.ready || !this.user) return;
    clearTimeout(this._saveT);
    const send = async () => {
      try {
        const { setDoc } = this._m.db;
        const P = Profile.data;
        await setDoc(this._ref(), {
          bp: P.bp, name: P.name || '', owned: P.owned, equipped: P.equipped,
          stats: P.stats, at: Date.now()
        });
      } catch (e) { this.error = '계정에 저장하지 못했습니다'; this.onChange(); }
    };
    if (now) send(); else this._saveT = setTimeout(send, 1500);
  }
};
