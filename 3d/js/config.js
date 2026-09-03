/* ============================================================
   3D 배틀로얄 설정값
   길이 단위는 미터, 각도는 라디안입니다.
   ============================================================ */

const CFG = {
  MAP: 620,             // 맵 한 변 (m)
  SEG: 160,             // 지형 격자 해상도
  BOTS: 29,
  FOG_NEAR: 60,
  FOG_FAR: 340,
  FOV: 72,
  ADS_FOV: 42,

  GRAVITY: 22,
  JUMP: 6.4,
  WALK: 4.4,
  SPRINT: 7.8,
  CROUCH: 2.2,
  EYE: 1.62,            // 눈높이
  BODY_R: 0.42,         // 몸통 반지름 (충돌)
  BODY_H: 1.8,

  CAM_DIST: 4.6,        // 3인칭 카메라 거리
  CAM_HEIGHT: 1.72,
  CAM_SIDE: 0.72,       // 어깨 너머 오프셋
  ADS_DIST: 2.4,
  ADS_SIDE: 0.95,

  PICK_RANGE: 4.2,        // 발밑 줍기 반경
  AIM_PICK: 9.0,          // 조준선이 향한 아이템은 이 거리까지 주울 수 있음
  HEAL_TIME: 4.0,
  HEAL_AMOUNT: 55,
  MAX_MEDS: 5,
  BOT_VISION: 150,      // 봇 시야 거리 (m)
  MAX_DT: 0.05
};

/* 무기: dmg 발당 피해, rpm 분당 발사수, spread 탄퍼짐(rad),
   range 유효사거리(m), recoil 반동(rad) */
const GUNS = {
  pistol:  { name:'권총',     short:'P92',   dmg:22, rpm:340,  mag:15, reload:1.4, spread:0.028, adsSpread:0.011, range:120, recoil:0.020, ammoPer:60,  auto:false, color:0xc9d1d9 },
  smg:     { name:'기관단총', short:'UMP',   dmg:16, rpm:720,  mag:30, reload:2.0, spread:0.045, adsSpread:0.020, range:110, recoil:0.014, ammoPer:120, auto:true,  color:0x7ee787 },
  shotgun: { name:'산탄총',   short:'S686',  dmg:13, rpm:110,  mag:8,  reload:2.6, spread:0.075, adsSpread:0.058, range:45,  recoil:0.055, ammoPer:40,  auto:false, pellets:8, color:0xffa657 },
  rifle:   { name:'돌격소총', short:'M416',  dmg:27, rpm:660,  mag:30, reload:2.3, spread:0.034, adsSpread:0.010, range:230, recoil:0.017, ammoPer:120, auto:true,  color:0x79c0ff },
  dmr:     { name:'지정사수총',short:'SKS',  dmg:44, rpm:260,  mag:20, reload:2.6, spread:0.026, adsSpread:0.005, range:320, recoil:0.030, ammoPer:80,  auto:false, color:0xffd166 },
  sniper:  { name:'저격총',   short:'AWM',   dmg:95, rpm:38,   mag:5,  reload:3.4, spread:0.020, adsSpread:0.0018,range:500, recoil:0.070, ammoPer:25,  auto:false, color:0xd2a8ff }
};

const GUN_KEYS = Object.keys(GUNS);
const LOOT_GUNS = ['pistol','pistol','smg','smg','shotgun','rifle','rifle','dmr','sniper'];

const HEADSHOT = 2.1;   // 헤드샷 배수

/* 자기장 단계 */
const PHASES = [
  { wait:40, shrink:45, f:0.60, dps:1  },
  { wait:34, shrink:40, f:0.42, dps:2  },
  { wait:30, shrink:34, f:0.29, dps:4  },
  { wait:26, shrink:30, f:0.19, dps:6  },
  { wait:22, shrink:26, f:0.11, dps:9  },
  { wait:18, shrink:22, f:0.055,dps:13 },
  { wait:15, shrink:18, f:0.018,dps:20 }
];

const NAMES = [
  '독수리','늑대','까치','호랑이','여우','매','살쾡이','두더지','반달곰','수달',
  '표범','부엉이','산양','멧돼지','너구리','고라니','담비','오소리','청설모','삵',
  '까마귀','참매','불곰','승냥이','스라소니','재규어','코요테','북극여우','들개','산토끼',
  '족제비','비버','물총새','솔개','황조롱이','사슴','기린','치타','하이에나','바다표범'
];

/* 캐릭터 옷 색 (봇 구분용) */
const OUTFITS = [
  { top:0x8c5a3c, pants:0x3f4a3a }, { top:0x4a5568, pants:0x2d3748 },
  { top:0x6b4f3a, pants:0x4a4a3a }, { top:0x5a6b4a, pants:0x3a4230 },
  { top:0x7a4a4a, pants:0x3d3d4a }, { top:0x46606b, pants:0x33404a }
];
