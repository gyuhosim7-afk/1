/* ============================================================
   3D 배틀로얄 설정값
   길이 단위는 미터, 각도는 라디안입니다.
   ============================================================ */

const CFG = {
  MAP: 1100,            // 맵 한 변 (m)
  SEG: 224,             // 지형 격자 해상도
  BOTS: 39,
  FOG_NEAR: 70,
  FOG_FAR: 420,
  FOV: 72,
  ADS_FOV: 42,

  GRAVITY: 22,
  JUMP: 6.4,
  WALK: 4.4,
  SPRINT: 7.8,
  CROUCH: 2.2,
  EYE: 1.28,            // 눈높이 (폴가이즈 체형)
  BODY_R: 0.40,         // 몸통 반지름 (충돌)
  BODY_H: 1.55,

  CAM_DIST: 4.6,        // 3인칭 카메라 거리
  CAM_HEIGHT: 1.30,
  CAM_SIDE: 0.72,       // 어깨 너머 오프셋
  ADS_DIST: 2.4,
  ADS_SIDE: 0.95,

  DROP_HEIGHT: 210,       // 낙하 시작 고도 (m)
  CHUTE_OPEN: 75,         // 이 고도에서 낙하산이 자동으로 펴집니다
  FREEFALL_SPEED: 52,     // 자유낙하 최고 속도
  CHUTE_SPEED: 7.5,       // 낙하산 하강 속도
  FREEFALL_MOVE: 34,      // 자유낙하 중 수평 이동
  CHUTE_MOVE: 17,         // 낙하산 수평 이동
  SLOTS: 2,               // 무기 칸 수
  SWAP_TIME: 0.45,        // 무기 교체 시간

  PICK_RANGE: 4.2,        // 발밑 줍기 반경
  AIM_PICK: 9.0,          // 조준선이 향한 아이템은 이 거리까지 주울 수 있음
  HEAL_TIME: 4.0,
  HEAL_AMOUNT: 55,
  MAX_MEDS: 2,            // 가방이 없을 때 들 수 있는 구급상자 수
  BASE_AMMO_CAP: 180,     // 가방이 없을 때 총별 예비 탄약 한도
  BOT_VISION: 165,        // 봇 시야 거리 (m)
  MAX_DT: 0.05,

  /* ---------- 차량 ---------- */
  VEH_RANGE: 4.6,         // 이 거리 안에서 탈 수 있습니다
  VEH_CAM_DIST: 9.6,
  VEH_CAM_HEIGHT: 3.5,

  /* ---------- 공중 보급 ---------- */
  DROP_FIRST: 90,         // 첫 보급까지 (초)
  DROP_EVERY: 130,        // 이후 보급 간격 (초)
  DROP_ALT: 190,          // 보급 상자가 나타나는 고도
  DROP_FALL: 9.5,         // 보급 상자 낙하 속도 (m/s)
  DROP_OPEN: 4.0          // 보급 상자를 열 수 있는 거리
};

/* 무기: dmg 발당 피해, rpm 분당 발사수, spread 탄퍼짐(rad),
   range 유효사거리(m), recoil 반동(rad) */
const GUNS = {
  pistol:  { name:'권총',     short:'P92',   dmg:22, rpm:340,  mag:15, reload:1.4, spread:0.028, adsSpread:0.011, range:120, recoil:0.020, ammoPer:60,  auto:false, scope:1, canScope:false, color:0xc9d1d9 },
  smg:     { name:'기관단총', short:'UMP',   dmg:16, rpm:720,  mag:30, reload:2.0, spread:0.045, adsSpread:0.020, range:110, recoil:0.014, ammoPer:120, auto:true,  scope:1, canScope:true, color:0x7ee787 },
  shotgun: { name:'산탄총',   short:'S686',  dmg:13, rpm:110,  mag:8,  reload:2.6, spread:0.075, adsSpread:0.058, range:45,  recoil:0.055, ammoPer:40,  auto:false, pellets:8, scope:1, canScope:false, color:0xffa657 },
  rifle:   { name:'돌격소총', short:'M416',  dmg:27, rpm:660,  mag:30, reload:2.3, spread:0.034, adsSpread:0.010, range:230, recoil:0.017, ammoPer:120, auto:true,  scope:1, canScope:true, color:0x79c0ff },
  dmr:     { name:'지정사수총',short:'SKS',  dmg:44, rpm:260,  mag:20, reload:2.6, spread:0.026, adsSpread:0.005, range:320, recoil:0.030, ammoPer:80,  auto:false, scope:1, canScope:true, color:0xffd166 },
  sniper:  { name:'저격총',   short:'AWM',   dmg:95, rpm:38,   mag:5,  reload:3.4, spread:0.020, adsSpread:0.0018,range:500, recoil:0.070, ammoPer:25,  auto:false, scope:1, canScope:true, color:0xd2a8ff }
};

const GUN_KEYS = Object.keys(GUNS);
const LOOT_GUNS = ['pistol','pistol','smg','smg','shotgun','rifle','rifle','dmr','sniper'];

const HEADSHOT = 2.1;   // 헤드샷 배수

/* 주워서 무기에 다는 조준경 */
const SCOPES = {
  2: { name: '레드도트', label: '2x', color: 0xff5a4a },
  4: { name: '4배율 조준경', label: '4x', color: 0x7ee787 },
  8: { name: '8배율 조준경', label: '8x', color: 0xd2a8ff }
};
const SCOPE_LEVELS = [2, 2, 2, 4, 4, 8];

/* ============================================================
   방어구: 조끼는 받는 피해를 줄이고, 가방은 챙길 수 있는 양을 늘립니다.
   ============================================================ */
const VESTS = {
  1: { name: '방탄조끼 Lv1', reduce: 0.15, color: 0x6b7280 },
  2: { name: '방탄조끼 Lv2', reduce: 0.28, color: 0x3f6b8a },
  3: { name: '방탄조끼 Lv3', reduce: 0.40, color: 0x2f3c4c }
};
const BAGS = {
  1: { name: '가방 Lv1', meds: 2, ammo: 120, color: 0x6b5a3c },
  2: { name: '가방 Lv2', meds: 4, ammo: 260, color: 0x4a5539 },
  3: { name: '가방 Lv3', meds: 6, ammo: 420, color: 0x2f3a2a }
};
/* 바닥에 흔하게 떨어지는 등급 (보급 상자에서는 3레벨이 나옵니다) */
const GEAR_LEVELS = [1, 1, 1, 2, 2, 3];

/* ============================================================
   차량: 넓은 맵을 빠르게 이동하는 수단
   accel 가속(m/s^2), max 최고 속도(m/s), turn 조향(rad/s)
   ============================================================ */
const VEHICLES = {
  truck: { name: '픽업트럭', accel: 11, max: 25, rev: 8,  turn: 1.35, brake: 20,
           hp: 900, r: 1.55, seatH: 1.15, mass: 1, color: 0x8a6a3c },
  buggy: { name: '버기',     accel: 14, max: 28, rev: 9,  turn: 1.75, brake: 24,
           hp: 620, r: 1.30, seatH: 0.95, mass: 0.8, color: 0xb9773c },
  bike:  { name: '오토바이', accel: 17, max: 31, rev: 6,  turn: 2.35, brake: 26,
           hp: 340, r: 0.85, seatH: 0.95, mass: 0.5, color: 0x3f6b8a }
};
const VEHICLE_KEYS = Object.keys(VEHICLES);

/* 보급 상자에 들어 있는 것 — 좋은 무기와 최고 등급 방어구 */
const DROP_TABLE = {
  guns: ['sniper', 'dmr', 'rifle'],
  scopes: [8, 8, 4],
  vest: 3, bag: 3, meds: 2
};

/* 자기장 단계 — 맵이 넓어진 만큼 대기·축소 시간을 늘려 천천히 좁혀 옵니다.
   축소 시간이 길어야 자기장 벽이 밀려오는 속도가 걸어서 따라갈 만합니다. */
const PHASES = [
  { wait:78, shrink:72, f:0.62, dps:1  },
  { wait:64, shrink:64, f:0.44, dps:2  },
  { wait:56, shrink:56, f:0.31, dps:3  },
  { wait:48, shrink:48, f:0.20, dps:5  },
  { wait:40, shrink:40, f:0.12, dps:8  },
  { wait:32, shrink:32, f:0.06, dps:12 },
  { wait:25, shrink:27, f:0.02, dps:18 }
];

const NAMES = [
  '독수리','늑대','까치','호랑이','여우','매','살쾡이','두더지','반달곰','수달',
  '표범','부엉이','산양','멧돼지','너구리','고라니','담비','오소리','청설모','삵',
  '까마귀','참매','불곰','승냥이','스라소니','재규어','코요테','북극여우','들개','산토끼',
  '족제비','비버','물총새','솔개','황조롱이','사슴','기린','치타','하이에나','바다표범'
];

/* ============================================================
   스킨과 상자 (로비에서 쓰는 데이터)
   ============================================================ */
const RARITY = {
  common:    { name: '일반', color: '#9fb0c0', refund: 30 },
  rare:      { name: '고급', color: '#58a6ff', refund: 90 },
  epic:      { name: '희귀', color: '#bc8cff', refund: 220 },
  legendary: { name: '전설', color: '#f0c674', refund: 600 }
};

/* 캐릭터 스킨: 옷·장비 색과 머리/피부 톤 */
const SKINS = {
  recruit:  { name: '기본 전투복', rarity: 'common',    top: 0x3d6285, pants: 0x2f3a46, vest: 0x2c3c4c, boots: 0x24262b, helmet: 0x2f4c6b, hair: 0x2b2119, tone: 0xc39a72 },
  ranger:   { name: '삼림 레인저', rarity: 'common',    top: 0x4d5b39, pants: 0x3a4230, vest: 0x40452f, boots: 0x2b2a24, helmet: 0x46503a, hair: 0x1f1a14, tone: 0xd0a87c },
  militia:  { name: '민병대',      rarity: 'common',    top: 0x6b4f3a, pants: 0x453d33, vest: 0x4b4a3f, boots: 0x2a251f, helmet: 0x554b3c, hair: 0x3a2a1c, tone: 0xb98b63 },
  desert:   { name: '사막 위장',   rarity: 'rare',      top: 0xb9a077, pants: 0x9c8a63, vest: 0x8b7a54, boots: 0x5b4c34, helmet: 0xa8926a, hair: 0x2b2119, tone: 0xc9a077 },
  urban:    { name: '도시 위장',   rarity: 'rare',      top: 0x5b626b, pants: 0x40464d, vest: 0x2f343a, boots: 0x232629, helmet: 0x4a5058, hair: 0x171310, tone: 0x8d6547 },
  medic:    { name: '야전 의무병', rarity: 'rare',      top: 0xdfe4e6, pants: 0x4a5158, vest: 0xc23b32, boots: 0x2a2d31, helmet: 0xe4e8ea, hair: 0x6b4a2a, tone: 0xdfb894 },
  tracksuit:{ name: '트랙수트',    rarity: 'epic',      top: 0xd63a5a, pants: 0x1e2229, vest: 0xb02f4c, boots: 0xf0f0f0, helmet: 0, hair: 0x141414, tone: 0xc39a72 },
  suit:     { name: '검은 정장',   rarity: 'epic',      top: 0x1c1f24, pants: 0x15171b, vest: 0x24272d, boots: 0x0f1013, helmet: 0, hair: 0x201a14, tone: 0xd6ad86 },
  arctic:   { name: '설원 특수부대', rarity: 'epic',    top: 0xe8eef2, pants: 0xc9d4dc, vest: 0xaebac4, boots: 0x4a5158, helmet: 0xdfe8ee, hair: 0x2b2119, tone: 0xe0bb96 },
  gold:     { name: '황금 갑주',   rarity: 'legendary', top: 0xd4a531, pants: 0x8a6c1f, vest: 0xf0c453, boots: 0x5c4712, helmet: 0xf2cf6b, hair: 0x2b2119, tone: 0xc39a72 },
  santa:    { name: '산타 복장',   rarity: 'legendary', top: 0xc9302c, pants: 0xa32622, vest: 0xf5f5f5, boots: 0x231f1c, helmet: 0xc9302c, hair: 0xf0f0f0, tone: 0xd8ab84 }
};

/* 총기 스킨: 금속·손잡이 색을 바꿉니다 */
const GUN_SKINS = {
  stock:  { name: '기본',      rarity: 'common',    metal: 0x33383f, dark: 0x1f2227, wood: 0x7a5433 },
  sand:   { name: '사막',      rarity: 'rare',      metal: 0xa89170, dark: 0x6f6047, wood: 0x8a6a42 },
  frost:  { name: '한파',      rarity: 'rare',      metal: 0xbecbd4, dark: 0x74838f, wood: 0x9fb0bb },
  carbon: { name: '카본',      rarity: 'epic',      metal: 0x22262c, dark: 0x121417, wood: 0x2c3138 },
  neon:   { name: '네온',      rarity: 'epic',      metal: 0x24304a, dark: 0x141a27, wood: 0x2b6cff },
  golden: { name: '황금',      rarity: 'legendary', metal: 0xd9ad3d, dark: 0x8a6c1f, wood: 0xb08a2a }
};

/* 상자와 확률 (합이 1 이 되도록 맞춰 두었습니다) */
const CRATES = {
  supply:  { name: '보급 상자',     price: 150,  desc: '가볍게 열어 보는 기본 상자',
             rates: { common: 0.70, rare: 0.24, epic: 0.05, legendary: 0.01 } },
  combat:  { name: '전투 상자',     price: 500,  desc: '고급 이상이 절반 넘게 나옵니다',
             rates: { common: 0.38, rare: 0.44, epic: 0.15, legendary: 0.03 } },
  premium: { name: '프리미엄 상자', price: 1500, desc: '전설 확률이 가장 높은 상자',
             rates: { common: 0.08, rare: 0.40, epic: 0.40, legendary: 0.12 } }
};

/* 매치 보상 */
const REWARD = {
  base: 60,
  perKill: 25,
  rankBonus: 6,      // (참가자 수 - 순위) × 6
  win: 500
};

/* 봇이 입는 옷 (스킨 목록에서 골라 씁니다) */
const BOT_SKINS = ['recruit', 'ranger', 'militia', 'desert', 'urban', 'medic'];
const OUTFITS = BOT_SKINS.map(k => SKINS[k]);
