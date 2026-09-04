/* ============================================================
   3D 배틀로얄 설정값
   길이 단위는 미터, 각도는 라디안입니다.
   ============================================================ */

const CFG = {
  MAP: 1500,            // 맵 한 변 (m)
  SEG: 208,             // 지형 격자 해상도 (칸 7.2m — 넓어진 맵에서 삼각형을 아낍니다)
  BOTS: 39,
  FOG_NEAR: 70,
  FOG_FAR: 390,
  FOV: 72,
  ADS_FOV: 42,

  GRAVITY: 22,
  JUMP: 6.4,
  WALK: 4.4,
  SPRINT: 7.8,
  CROUCH: 2.2,
  EYE: 1.12,            // 눈높이 (커비 체형)
  BODY_R: 0.40,         // 몸통 반지름 (충돌)
  BODY_H: 1.42,
  STEP_UP: 0.60,        // 걸어서 올라설 수 있는 턱 높이 (계단 한 칸 = 0.36)
  VAULT_MAX: 2.0,       // 매달려 기어오를 수 있는 최대 높이
  VAULT_TIME: 0.55,     // 기어오르는 데 걸리는 시간

  CAM_DIST: 4.6,        // 3인칭 카메라 거리
  CAM_HEIGHT: 1.14,
  CAM_SIDE: 0.72,       // 어깨 너머 오프셋
  ADS_DIST: 2.4,
  ADS_SIDE: 0.95,

  DROP_HEIGHT: 300,       // 수송기 고도 (m)
  CHUTE_OPEN: 95,         // 이 고도에서 낙하산이 자동으로 펴집니다
  FREEFALL_SPEED: 52,     // 자유낙하 최고 속도
  CHUTE_SPEED: 4.6,       // 낙하산 하강 속도 (천천히 내려와 멀리까지 갑니다)
  FREEFALL_MOVE: 34,      // 자유낙하 중 수평 이동
  CHUTE_MOVE: 14,         // 낙하산 수평 이동

  /* ---------- 수송기 ---------- */
  PLANE_SPEED: 62,        // 수송기 속도 (m/s)
  PLANE_LEAD: 3.0,        // 문이 열리기 전 대기 (초)
  PLANE_TAIL: 2.5,        // 항로 끝에서 자동으로 뛰어내리기까지 (초)

  /* ---------- 지점 표시(핑) ---------- */
  PING_LIFE: 34,          // 표시가 남아 있는 시간 (초)
  PING_MAX: 5,            // 동시에 남길 수 있는 표시 수
  PING_RANGE: 900,        // 표시를 찍을 수 있는 최대 거리
  SLOTS: 2,               // 무기 칸 수
  SWAP_TIME: 0.45,        // 무기 교체 시간

  PICK_RANGE: 4.2,        // 발밑 줍기 반경
  AIM_PICK: 9.0,          // 조준선이 향한 아이템은 이 거리까지 주울 수 있음
  HEAL_TIME: 4.0,
  HEAL_AMOUNT: 55,
  MAX_MEDS: 2,            // 가방이 없을 때 들 수 있는 구급상자 수
  BASE_AMMO_CAP: 180,     // 가방이 없을 때 구경별 예비 탄약 한도
  BOT_VISION: 165,        // 봇 시야 거리 (m)
  MAX_DT: 0.1,          // 프레임이 느려도 슬로모션이 되지 않게 (이동은 잘게 나눠 처리)

  /* ---------- 차량 ---------- */
  VEH_RANGE: 4.6,         // 이 거리 안에서 탈 수 있습니다
  VEH_CAM_DIST: 9.6,
  VEH_CAM_HEIGHT: 3.5,

  /* ---------- 공중 보급 ---------- */
  DROP_FIRST: 170,        // 첫 보급까지 (초)
  DROP_EVERY: 220,        // 이후 보급 간격 (초)
  DROP_ALT: 190,          // 보급 상자가 나타나는 고도
  DROP_FALL: 9.5,         // 보급 상자 낙하 속도 (m/s)
  DROP_OPEN: 4.0          // 보급 상자를 열 수 있는 거리
};

/* ============================================================
   탄약 구경
   총마다 따로 탄을 세지 않고 구경별로 한 주머니를 씁니다.
   같은 구경을 쓰는 총끼리 탄약을 나눠 쓰게 되어,
   무엇을 주워야 하는지가 훨씬 분명해집니다.
   ============================================================ */
const CALIBERS = {
  '9mm':  { name: '9mm 권총탄',    short: '9mm',    color: 0xf2cc60, box: 45 },
  '45':   { name: '.45 권총탄',    short: '.45',    color: 0xe0a24a, box: 40 },
  '556':  { name: '5.56mm 소총탄', short: '5.56mm', color: 0x7ee787, box: 60 },
  '762':  { name: '7.62mm 소총탄', short: '7.62mm', color: 0x79c0ff, box: 50 },
  '12ga': { name: '12게이지 산탄', short: '12게이지', color: 0xffa657, box: 18 },
  '300':  { name: '.300 매그넘',   short: '.300',   color: 0xd2a8ff, box: 20, dropOnly: true }
};

/* 무기: dmg 발당 피해, rpm 분당 발사수, spread 탄퍼짐(rad),
   range 유효사거리(m), recoil 반동(rad), ammo 쓰는 구경,
   model 생김새(없으면 키와 같은 모양), drop 이 true 면 보급 상자에서만 나옵니다 */
const GUNS = {
  /* ---------- 권총 ---------- */
  pistol:  { name:'권총',       short:'P92',    ammo:'9mm',  dmg:22, rpm:340,  mag:15, reload:1.4, spread:0.028, adsSpread:0.011, range:120, recoil:0.020, auto:false, canScope:false, color:0xc9d1d9 },
  revolver:{ name:'리볼버',     short:'R45',    ammo:'45',   dmg:52, rpm:130,  mag:6,  reload:2.3, spread:0.030, adsSpread:0.009, range:150, recoil:0.048, auto:false, canScope:true,  color:0xb0763f, model:'pistol' },

  /* ---------- 기관단총 ---------- */
  smg:     { name:'기관단총',   short:'UMP45',  ammo:'45',   dmg:18, rpm:640,  mag:30, reload:2.0, spread:0.043, adsSpread:0.019, range:110, recoil:0.014, auto:true,  canScope:true,  color:0x7ee787 },
  vector:  { name:'기관단총',   short:'벡터',   ammo:'9mm',  dmg:12, rpm:1100, mag:25, reload:2.0, spread:0.040, adsSpread:0.016, range:95,  recoil:0.010, auto:true,  canScope:true,  color:0xa5d6a7, model:'smg' },
  mp5k:    { name:'기관단총',   short:'MP5K',   ammo:'9mm',  dmg:15, rpm:900,  mag:30, reload:2.1, spread:0.036, adsSpread:0.013, range:115, recoil:0.009, auto:true,  canScope:true,  color:0x8fd3f4, model:'smg' },

  /* ---------- 산탄총 ---------- */
  shotgun: { name:'산탄총',     short:'S686',   ammo:'12ga', dmg:13, rpm:110,  mag:8,  reload:2.6, spread:0.075, adsSpread:0.058, range:45,  recoil:0.055, auto:false, pellets:8, canScope:false, color:0xffa657 },
  s12k:    { name:'자동산탄총', short:'S12K',   ammo:'12ga', dmg:10, rpm:300,  mag:5,  reload:2.4, spread:0.082, adsSpread:0.066, range:40,  recoil:0.045, auto:true,  pellets:7, canScope:true,  color:0xd98a3c, model:'shotgun' },

  /* ---------- 돌격소총 ---------- */
  rifle:   { name:'돌격소총',   short:'M416',   ammo:'556',  dmg:26, rpm:660,  mag:30, reload:2.3, spread:0.034, adsSpread:0.010, range:230, recoil:0.017, auto:true,  canScope:true,  color:0x79c0ff },
  scar:    { name:'돌격소총',   short:'SCAR-L', ammo:'556',  dmg:27, rpm:600,  mag:30, reload:2.4, spread:0.032, adsSpread:0.009, range:230, recoil:0.015, auto:true,  canScope:true,  color:0x9ecbff, model:'rifle' },
  ak:      { name:'돌격소총',   short:'AKM',    ammo:'762',  dmg:33, rpm:600,  mag:30, reload:2.6, spread:0.040, adsSpread:0.014, range:240, recoil:0.028, auto:true,  canScope:true,  color:0xc09553, model:'rifle' },

  /* ---------- 지정사수총 ---------- */
  dmr:     { name:'지정사수총', short:'SKS',    ammo:'762',  dmg:44, rpm:260,  mag:20, reload:2.6, spread:0.026, adsSpread:0.005, range:320, recoil:0.030, auto:false, canScope:true,  color:0xffd166 },
  mini14:  { name:'지정사수총', short:'Mini14', ammo:'556',  dmg:38, rpm:290,  mag:20, reload:2.4, spread:0.022, adsSpread:0.004, range:340, recoil:0.020, auto:false, canScope:true,  color:0xe8c07d, model:'dmr' },
  slr:     { name:'지정사수총', short:'SLR',    ammo:'762',  dmg:56, rpm:230,  mag:10, reload:2.9, spread:0.028, adsSpread:0.006, range:380, recoil:0.046, auto:false, canScope:true,  color:0xff9a5b, model:'dmr' },
  /* VSS 는 소음기와 조준경이 총에 붙어 있습니다. 조준경을 따로 달 수 없는 대신
     처음부터 4배율로 보이고 총성이 훨씬 작게 들립니다. */
  vss:     { name:'소음 저격총', short:'VSS',   ammo:'9mm',  dmg:41, rpm:400,  mag:20, reload:2.6, spread:0.030, adsSpread:0.008, range:200, recoil:0.018, auto:true,  canScope:false, builtScope:4, quiet:0.45, color:0x9aa8b5, model:'vss' },

  /* ---------- 저격총 ---------- */
  kar98:   { name:'저격총',     short:'Kar98k', ammo:'762',  dmg:78, rpm:44,   mag:5,  reload:3.1, spread:0.022, adsSpread:0.0022, range:420, recoil:0.062, auto:false, canScope:true, color:0xa9834a, model:'sniper' },

  /* ---------- 보급 상자에서만 나오는 무기 ---------- */
  sniper:  { name:'저격총',     short:'AWM',    ammo:'300',  dmg:105, rpm:38,  mag:5,  reload:3.4, spread:0.020, adsSpread:0.0018, range:500, recoil:0.070, auto:false, canScope:true, color:0xd2a8ff, drop:true },
  m249:    { name:'경기관총',   short:'M249',   ammo:'556',  dmg:26, rpm:750,  mag:100,reload:4.6, spread:0.048, adsSpread:0.016, range:250, recoil:0.016, auto:true,  canScope:true, color:0x6fbf73, drop:true, model:'lmg' },
  groza:   { name:'돌격소총',   short:'그로자', ammo:'762',  dmg:34, rpm:700,  mag:30, reload:2.7, spread:0.034, adsSpread:0.011, range:250, recoil:0.024, auto:true,  canScope:true, color:0x8b6ad6, drop:true, model:'rifle' },
  mk14:    { name:'지정사수총', short:'MK14',   ammo:'762',  dmg:52, rpm:300,  mag:20, reload:2.9, spread:0.024, adsSpread:0.004, range:400, recoil:0.038, auto:true,  canScope:true, color:0xff9d76, drop:true, model:'dmr' }
};

const GUN_KEYS = Object.keys(GUNS);
/* 바닥에 떨어지는 무기 (보급 전용은 빠집니다). 여러 번 적을수록 자주 나옵니다 */
const LOOT_GUNS = ['pistol','pistol','revolver','smg','smg','vector','mp5k','shotgun','s12k',
                   'rifle','rifle','scar','ak','ak','dmr','mini14','slr','vss','kar98'];
/* 보급 상자 전용 무기 */
const DROP_GUNS = GUN_KEYS.filter(k => GUNS[k].drop);
/* 바닥에 떨어지는 탄약 구경 */
const LOOT_CALIBERS = Object.keys(CALIBERS).filter(c => !CALIBERS[c].dropOnly);

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
/* 헬멧: 머리에 맞은 피해를 줄여 줍니다. 조끼가 못 막던 헤드샷을 여기서 막습니다 */
const HELMETS = {
  1: { name: '헬멧 Lv1', reduce: 0.30, color: 0x6b7280 },
  2: { name: '헬멧 Lv2', reduce: 0.45, color: 0x3f6b8a },
  3: { name: '헬멧 Lv3', reduce: 0.58, color: 0x2f3c4c }
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
/* win 은 '차에 탄 사람이 총에 맞는 높이' 입니다 (발밑 기준 m).
   지붕이 있는 트럭은 창문 높이만 노출되고, 뚜껑 없는 버기와 오토바이는 거의 다 드러납니다. */
const VEHICLES = {
  truck: { name: '픽업트럭', accel: 11, max: 25, rev: 8,  turn: 1.35, brake: 20,
           hp: 900, r: 1.55, seatH: 1.15, mass: 1, color: 0x8a6a3c, win: [0.92, 1.48] },
  buggy: { name: '버기',     accel: 14, max: 28, rev: 9,  turn: 1.75, brake: 24,
           hp: 620, r: 1.30, seatH: 0.95, mass: 0.8, color: 0xb9773c, win: [0.50, 1.55] },
  bike:  { name: '오토바이', accel: 17, max: 31, rev: 6,  turn: 2.35, brake: 26,
           hp: 340, r: 0.85, seatH: 0.95, mass: 0.5, color: 0x3f6b8a, win: [0.00, 1.58] }
};
const VEHICLE_KEYS = Object.keys(VEHICLES);

/* 보급 상자에 들어 있는 것 — 좋은 무기와 최고 등급 방어구 */
const DROP_TABLE = {
  guns: DROP_GUNS,                 // AWM · M249 · 그로자 · MK14 는 여기서만 나옵니다
  scopes: [8, 8, 4],
  vest: 3, bag: 3, helmet: 3, meds: 2
};

/* 자기장 단계 — 맵이 넓어진 만큼 대기·축소 시간을 늘려 천천히 좁혀 옵니다.
   축소 시간이 길어야 자기장 벽이 밀려오는 속도가 걸어서 따라갈 만합니다. */
const PHASES = [
  { wait:92, shrink:84, f:0.62, dps:1  },
  { wait:74, shrink:72, f:0.44, dps:2  },
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
