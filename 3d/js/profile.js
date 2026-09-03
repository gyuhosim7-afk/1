/* ============================================================
   플레이어 계정: BP, 보유 스킨, 장착, 전적, 상자 뽑기
   브라우저(localStorage)에 저장됩니다.
   ============================================================ */
const Profile = {
  KEY: 'lastSurvivor3d.profile',
  data: {
    bp: 800,
    owned: { skin: ['recruit'], gun: ['stock'] },
    equipped: { skin: 'recruit', gun: 'stock' },
    stats: { matches: 0, wins: 0, kills: 0, best: 99, bestKills: 0, opened: 0 }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data.bp = Math.max(0, +d.bp || 0);
        if (d.owned) {
          this.data.owned.skin = (d.owned.skin || ['recruit']).filter(k => SKINS[k]);
          this.data.owned.gun = (d.owned.gun || ['stock']).filter(k => GUN_SKINS[k]);
        }
        if (d.equipped) {
          if (SKINS[d.equipped.skin]) this.data.equipped.skin = d.equipped.skin;
          if (GUN_SKINS[d.equipped.gun]) this.data.equipped.gun = d.equipped.gun;
        }
        if (d.stats) Object.assign(this.data.stats, d.stats);
      }
    } catch (e) { /* 저장소를 못 쓰면 기본값으로 시작합니다 */ }
    // 기본 아이템은 항상 보유
    if (this.data.owned.skin.indexOf('recruit') < 0) this.data.owned.skin.push('recruit');
    if (this.data.owned.gun.indexOf('stock') < 0) this.data.owned.gun.push('stock');
  },

  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ } },

  owns(type, key) { return this.data.owned[type].indexOf(key) >= 0; },
  equip(type, key) {
    if (!this.owns(type, key)) return false;
    this.data.equipped[type] = key;
    this.save();
    return true;
  },
  addBp(n) { this.data.bp = Math.max(0, this.data.bp + n); this.save(); },

  /* 상자에 들어 있는 전체 목록 */
  pool() {
    const out = [];
    for (const k in SKINS) out.push({ type: 'skin', key: k, name: SKINS[k].name, rarity: SKINS[k].rarity });
    for (const k in GUN_SKINS) out.push({ type: 'gun', key: k, name: GUN_SKINS[k].name + ' 도장', rarity: GUN_SKINS[k].rarity });
    return out;
  },

  /* 상자 열기: 확률표대로 등급을 뽑고 그 등급 안에서 아이템을 고릅니다 */
  openCrate(crateKey) {
    const crate = CRATES[crateKey];
    if (!crate) return null;
    if (this.data.bp < crate.price) return { error: 'BP가 부족합니다' };

    this.addBp(-crate.price);
    this.data.stats.opened++;

    let roll = Math.random(), rarity = 'common';
    for (const r in crate.rates) {
      if (roll < crate.rates[r]) { rarity = r; break; }
      roll -= crate.rates[r];
    }
    const items = this.pool().filter(i => i.rarity === rarity);
    const item = items[Math.floor(Math.random() * items.length)];

    const dup = this.owns(item.type, item.key);
    let refund = 0;
    if (dup) { refund = RARITY[rarity].refund; this.addBp(refund); }
    else { this.data.owned[item.type].push(item.key); }
    this.save();
    return { item, rarity, dup, refund, spent: crate.price };
  },

  /* 매치 결과 → 보상 계산과 전적 갱신 */
  reward(result, total) {
    const rankBonus = Math.max(0, (total - result.rank)) * REWARD.rankBonus;
    const kills = result.kills * REWARD.perKill;
    const win = result.won ? REWARD.win : 0;
    const bp = REWARD.base + kills + rankBonus + win;
    this.addBp(bp);

    const s = this.data.stats;
    s.matches++;
    if (result.won) s.wins++;
    s.kills += result.kills;
    s.best = Math.min(s.best || 99, result.rank);
    s.bestKills = Math.max(s.bestKills || 0, result.kills);
    this.save();
    return { total: bp, base: REWARD.base, kills, rankBonus, win };
  }
};
