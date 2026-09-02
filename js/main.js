/* ============================================================
   입력 처리, HUD 갱신, 메인 루프
   ============================================================ */
const UI = {
  el: {},
  init() {
    const ids = ['menu', 'over', 'hud', 'hp', 'hpText', 'weapon', 'ammo', 'meds',
      'alive', 'kills', 'zoneText', 'feed', 'prompt', 'result', 'resultSub',
      'resultStats', 'startBtn', 'againBtn', 'botCount', 'crosshair', 'hurt'];
    for (const id of ids) this.el[id] = document.getElementById(id);
  },

  showMenu() {
    this.el.crosshair.classList.add('hidden');
    this.el.menu.classList.remove('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.add('hidden');
  },

  showGame() {
    this.el.crosshair.classList.remove('hidden');
    this.el.menu.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  },

  showResult(r) {
    this.el.crosshair.classList.add('hidden');
    this.el.over.classList.remove('hidden');
    this.el.result.textContent = r.won ? '치킨 디너!' : '탈락';
    this.el.result.className = r.won ? 'win' : 'lose';
    this.el.resultSub.textContent = r.won
      ? '마지막 생존자가 되었습니다'
      : r.rank + '위 / ' + r.total + '명';
    this.el.resultStats.innerHTML =
      '<div><b>' + r.kills + '</b><span>처치</span></div>' +
      '<div><b>#' + r.rank + '</b><span>순위</span></div>' +
      '<div><b>' + U.time(r.time) + '</b><span>생존 시간</span></div>';
  },

  update(g) {
    const p = g.player;
    const hp = U.clamp(p.hp / p.maxHp, 0, 1);
    this.el.hp.style.width = (hp * 100) + '%';
    this.el.hp.style.background = hp > 0.5 ? '#3fb950' : (hp > 0.25 ? '#d29922' : '#f85149');
    this.el.hpText.textContent = Math.max(0, Math.ceil(p.hp));

    if (p.weapon) {
      const s = p.spec;
      this.el.weapon.textContent = s.name;
      this.el.weapon.style.color = s.color;
      this.el.ammo.textContent = p.reloading > 0 ? '재장전...' : (p.mag + ' / ' + p.reserveAmmo);
    } else {
      this.el.weapon.textContent = '맨손';
      this.el.weapon.style.color = '#8b949e';
      this.el.ammo.textContent = '무기를 주우세요';
    }
    this.el.meds.textContent = p.meds;
    this.el.alive.textContent = g.alive;
    this.el.kills.textContent = p.kills;

    const z = g.zone;
    if (z.phase >= ZONE_PHASES.length && !z.shrinking) this.el.zoneText.textContent = '최종 지역';
    else this.el.zoneText.textContent = (z.shrinking ? '축소 중 ' : '다음 축소 ') + U.time(z.timer);
    this.el.zoneText.style.color = z.shrinking ? '#f85149' : '#c9d1d9';

    // 킬 로그
    this.el.feed.innerHTML = g.killfeed.map(k =>
      '<div style="opacity:' + U.clamp(k.life, 0, 1) + '">' + k.text + '</div>').join('');

    // 줍기 안내
    const near = g.nearestPickup(p);
    if (near && !p.dead) {
      this.el.prompt.classList.remove('hidden');
      this.el.prompt.innerHTML = '<kbd>F</kbd> ' + near.label;
    } else {
      this.el.prompt.classList.add('hidden');
    }

    // 피격 화면 효과
    this.el.hurt.style.opacity = p.dead ? 0 : U.clamp((1 - hp) * 0.5, 0, 0.45);
  }
};

const Input = {
  keys: {},
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (Game.state !== 'playing') {
        if (k === 'enter') Main.startGame();
        return;
      }
      if (k === 'r') Game.player.startReload();
      if (k === 'f') {
        const p = Game.nearestPickup(Game.player);
        if (p) Game.pickUp(Game.player, p);
      }
      if (k === 'q' || k === 'e') Game.player.startHeal();
      if (k === 'm') { Sfx.enabled = !Sfx.enabled; Game.pushFeed('소리 ' + (Sfx.enabled ? '켜짐' : '꺼짐')); }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; Game.input.shoot = 0; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      Game.input.mx = e.clientX - r.left;
      Game.input.my = e.clientY - r.top;
      UI.el.crosshair.style.transform = 'translate(' + (e.clientX - 13) + 'px,' + (e.clientY - 13) + 'px)';
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) { Sfx.init(); Game.input.shoot = 1; } });
    window.addEventListener('mouseup', e => { if (e.button === 0) Game.input.shoot = 0; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  poll() {
    const i = Game.input, k = this.keys;
    i.up = (k['w'] || k['arrowup']) ? 1 : 0;
    i.down = (k['s'] || k['arrowdown']) ? 1 : 0;
    i.left = (k['a'] || k['arrowleft']) ? 1 : 0;
    i.right = (k['d'] || k['arrowright']) ? 1 : 0;
    i.sprint = (k['shift']) ? 1 : 0;
  }
};

const Main = {
  last: 0,
  init() {
    UI.init();
    const canvas = document.getElementById('game');
    Game.setup(canvas, document.getElementById('minimap'));
    Input.init(canvas);
    UI.el.startBtn.addEventListener('click', () => this.startGame());
    UI.el.againBtn.addEventListener('click', () => this.startGame());
    UI.showMenu();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  startGame() {
    Sfx.init();
    const n = parseInt(UI.el.botCount.value, 10) || CONFIG.BOT_COUNT;
    Game.start(U.clamp(n, 4, 59));
    UI.showGame();
  },

  loop(t) {
    const dt = Math.min(CONFIG.MAX_DT, (t - this.last) / 1000);
    this.last = t;
    if (Game.state === 'playing') {
      Input.poll();
      Game.update(dt);
      UI.update(Game);
    }
    Game.draw();
    requestAnimationFrame(nt => this.loop(nt));
  }
};

window.addEventListener('DOMContentLoaded', () => Main.init());
