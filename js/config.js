/* ============================================================
   설정값 모음 (Game configuration)
   ============================================================ */

const CONFIG = {
  WORLD: 4000,          // 맵 한 변의 크기(px)
  BOT_COUNT: 29,        // 봇 수 (플레이어 포함 30명)
  MAX_DT: 0.05,         // 프레임 스파이크 방지
  PLAYER_SPEED: 205,
  BOT_SPEED: 178,
  SPRINT: 1.5,
  PICKUP_RANGE: 52,
  HEAL_TIME: 1.6,
  HEAL_AMOUNT: 55,
  MAX_MEDS: 5,
  VISION: 700,          // 봇 시야
  RESPAWN: false
};

/* 무기 데이터
   dmg: 발당 데미지 / rate: 발사 간격(초) / mag: 탄창 / reload: 재장전(초)
   spread: 탄퍼짐(rad) / bspeed: 탄속 / range: 사거리 / pellets: 산탄 수 */
const WEAPONS = {
  pistol:  { name:'권총',     short:'PISTOL',  dmg:20, rate:0.30, mag:12, reload:1.20, spread:0.045, bspeed:780,  range:640,  pellets:1, ammoPer:48,  auto:false, color:'#c9d1d9' },
  smg:     { name:'기관단총', short:'SMG',     dmg:13, rate:0.085,mag:30, reload:1.70, spread:0.090, bspeed:800,  range:560,  pellets:1, ammoPer:120, auto:true,  color:'#7ee787' },
  shotgun: { name:'산탄총',   short:'SHOTGUN', dmg:11, rate:0.85, mag:6,  reload:2.20, spread:0.200, bspeed:680,  range:370,  pellets:8, ammoPer:32,  auto:false, color:'#ffa657' },
  rifle:   { name:'돌격소총', short:'RIFLE',   dmg:26, rate:0.14, mag:30, reload:2.00, spread:0.052, bspeed:940,  range:840,  pellets:1, ammoPer:120, auto:true,  color:'#79c0ff' },
  sniper:  { name:'저격총',   short:'SNIPER',  dmg:82, rate:1.50, mag:5,  reload:2.80, spread:0.008, bspeed:1500, range:1700, pellets:1, ammoPer:25,  auto:false, color:'#d2a8ff' }
};

const LOOT_TABLE = ['pistol','pistol','pistol','smg','smg','shotgun','shotgun','rifle','rifle','sniper'];

/* 자기장 단계: wait(대기 초) → shrink(축소 초), f = 초기 반지름 대비 비율, dps = 초당 피해 */
const ZONE_PHASES = [
  { wait:28, shrink:36, f:0.62, dps:1  },
  { wait:24, shrink:32, f:0.44, dps:2  },
  { wait:22, shrink:28, f:0.30, dps:4  },
  { wait:20, shrink:24, f:0.19, dps:7  },
  { wait:16, shrink:20, f:0.11, dps:10 },
  { wait:14, shrink:18, f:0.05, dps:14 },
  { wait:12, shrink:16, f:0.015,dps:22 }
];

const BOT_NAMES = [
  '독수리','늑대','까치','호랑이','여우','매','살쾡이','두더지','반달곰','수달',
  '표범','부엉이','산양','멧돼지','너구리','고라니','담비','오소리','청설모','삵',
  '까마귀','참매','하늘다람쥐','불곰','승냥이','스라소니','재규어','코요테','바다표범','북극여우',
  '들개','산토끼','족제비','비버','물총새','솔개','황조롱이','흰꼬리사슴','기린','치타'
];
