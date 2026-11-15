// The DOM HUD: health, armour, ammunition, money, the round timer, the score, the
// bomb, the kill feed, the buy menu and the overlays. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out. Every setter skips work when the
// value did not change, so a quiet frame costs nothing.
const COPY = {
  start: {
    title: 'Emberline',
    copy: 'Vanguard attacks. Plant the charge at A or B, or eliminate Sentinel. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-v');
  const scoreS = $('score-s');
  const roundValue = $('round-value');
  const weaponName = $('weapon-name');
  const grenadesValue = $('grenades-value');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const vignette = $('vignette');
  const flashOverlay = $('flash-overlay');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(element, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  return {
    setHealth(health, armor) {
      const hp = Math.max(0, Math.ceil(health));
      setText(healthValue, String(hp), 'hp');
      setText(armorValue, armor > 0 ? `+${Math.ceil(armor)}` : '', 'armor');
      const ratio = Math.max(0, health / 100);
      if (last.hpRatio !== ratio) {
        last.hpRatio = ratio;
        healthFill.style.width = `${ratio * 100}%`;
        healthFill.style.background = ratio > 0.5 ? 'var(--green)' : ratio > 0.25 ? 'var(--amber)' : 'var(--red)';
      }
      vignette.style.opacity = health < 35 && health > 0 ? String(0.55 - health / 100) : '0';
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      setText(moneyValue, `$${money}`, 'money');
      setText(buyMoney, `$${money}`, 'buyMoney');
    },
    setTimer(seconds, bombSeconds) {
      const value = bombSeconds !== null ? `BOMB ${Math.ceil(bombSeconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      setText(timerValue, value, 'timer');
      timerValue.classList.toggle('danger', bombSeconds !== null || seconds < 15);
    },
    setScore(vanguard, sentinel, round) {
      setText(scoreV, String(vanguard), 'scoreV');
      setText(scoreS, String(sentinel), 'scoreS');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setGrenades(count) {
      setText(grenadesValue, count > 0 ? `FLASH x${count}` : '', 'grenades');
    },
    setBomb(text) {
      setText(bombStatus, text, 'bomb');
      bombStatus.classList.toggle('danger', text.startsWith('BOMB'));
    },
    setCrosshairSpread(spreadPx) {
      const px = Math.round(4 + spreadPx * 300);
      if (last.spread === px) return;
      last.spread = px;
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killfeed(killer, victim, head) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = '';
      const killerSpan = document.createElement('b');
      killerSpan.textContent = killer;
      const victimSpan = document.createElement('b');
      victimSpan.textContent = victim;
      line.append(killerSpan, document.createTextNode(head ? ' ⌖ ' : '  →  '), victimSpan);
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(main, sub, holdMs = 2600) {
      bannerTitle.textContent = main;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    showProgress(label, ratio) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(ratio * 100)}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    showBuy(open) {
      buyMenu.hidden = !open;
    },
    buyState(items) {
      for (const item of items) {
        const row = document.querySelector(`[data-buy="${item.id}"]`);
        if (!row) continue;
        row.classList.toggle('owned', item.owned);
        row.classList.toggle('cant', !item.owned && !item.affordable);
        row.querySelector('.buy-price').textContent = item.owned ? 'OWNED' : `$${item.price}`;
      }
    },
    flash() {
      flashOverlay.style.opacity = '0.95';
      setTimeout(() => {
        flashOverlay.style.opacity = '0';
      }, 60);
      setTimeout(() => {
        flashOverlay.style.opacity = '0.55';
      }, 120);
      setTimeout(() => {
        flashOverlay.style.opacity = '0';
      }, 900);
    },
    showOverlay(mode, score, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? `${extra || ''} Score ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const row = event.target.closest('[data-buy]');
        if (row) handler(row.dataset.buy);
      });
    },
  };
}
