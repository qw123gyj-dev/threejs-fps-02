// The DOM HUD: health, ammo, money, timer, score, alive counts, killfeed, a minimap and
// the buy menu. It never touches the simulation; main.js pushes numbers in and reads the
// play and buy callbacks out. Cached last values keep DOM writes to what changed.
import { SITES } from './world.js';

const COPY = {
  start: {
    title: 'Emberline',
    copy: 'A foundry at dusk. Plant the spike at A or B, or wipe the Cinder team. First to 7 rounds takes the match.',
    action: 'Click to play',
  },
  paused: { title: 'Emberline', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  dead: { title: 'You are down', copy: 'Spectating a teammate until the round ends.', action: '' },
};

export function createHud(colliders) {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorNum = el('armor-num');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreValue = el('score-value');
  const aliveValue = el('alive-value');
  const killfeed = el('killfeed');
  const hitmarker = el('hitmarker');
  const crosshair = el('crosshair');
  const damage = el('damage');
  const flash = el('flash');
  const banner = el('banner');
  const spikeBar = el('spike');
  const spikeText = el('spike-text');
  const spikeFill = el('spike-fill');
  const buyMenu = el('buy-menu');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');
  const map = el('minimap');
  const mapCtx = map.getContext('2d');
  const scope = el('scope');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(node, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      if (last.hp !== hp) {
        last.hp = hp;
        healthFill.style.width = `${Math.max(0, hp)}%`;
        healthFill.classList.toggle('low', hp <= 30);
        healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      }
      setText(armorNum, armor > 0 ? `+${Math.ceil(armor)}` : '', 'armor');
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'wname');
      ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setMoney(value) { setText(moneyValue, `$${value}`, 'money'); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerValue, `${mm}:${ss}`, 'timer');
      timerValue.classList.toggle('planted', phase === 'planted');
    },
    setScore(van, cin, round) { setText(scoreValue, `V ${van} — ${cin} C · R${round}`, 'score'); },
    setAlive(van, cin) { setText(aliveValue, `▲ ${van} · ▼ ${cin}`, 'alive'); },
    setCrosshair(spread) {
      const gap = 4 + spread * 260;
      crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    setScoped(on) { scope.hidden = !on; },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    flashBlind(strength) {
      flash.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { flash.style.opacity = '0'; }, 350 + strength * 2200);
    },
    killfeed(killer, victim, head) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `${killer} ${head ? '◎' : '×'} ${victim}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(text, holdMs = 2200) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    setSpike(status, seconds, progress) {
      if (!status) { spikeBar.hidden = true; return; }
      spikeBar.hidden = false;
      if (status === 'planted') setText(spikeText, `SPIKE PLANTED — ${Math.ceil(seconds)}s`, 'spike');
      else if (status === 'planting') setText(spikeText, `PLANTING ${Math.ceil(progress * 100)}%`, 'spike');
      else if (status === 'defusing') setText(spikeText, `DEFUSING ${Math.ceil(progress * 100)}%`, 'spike');
      spikeFill.style.width = `${Math.round(progress * 100)}%`;
    },
    showBuy(catalog, money, onBuy) {
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      for (let index = 0; index < catalog.length; index += 1) {
        const item = catalog[index];
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = money < item.price;
        row.innerHTML = `<span class="buy-key">${index + 1}</span><span>${item.name}</span><span>$${item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(row);
      }
      buyMenu.hidden = false;
    },
    hideBuy() { buyMenu.hidden = true; },
    updateBuyMoney(money) { buyMoney.textContent = `$${money}`; },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      play.style.display = text.action ? '' : 'none';
      overlay.hidden = false;
      if (text.action) play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    drawMinimap(playerBody, teammates, spike) {
      const w = map.width;
      const h = map.height;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(20,18,28,0.85)';
      mapCtx.fillRect(0, 0, w, h);
      const sx = w / 46;
      const sz = h / 38;
      const px = (x) => (x + 23) * sx;
      const pz = (z) => (z + 19) * sz;
      mapCtx.fillStyle = '#3a3348';
      for (const c of colliders) {
        mapCtx.fillRect(px(c.min.x), pz(c.min.z), (c.max.x - c.min.x) * sx, (c.max.z - c.min.z) * sz);
      }
      for (const site of SITES) {
        mapCtx.fillStyle = site.key === 'A' ? '#ffb02e' : '#3ec6ff';
        mapCtx.globalAlpha = 0.85;
        mapCtx.fillRect(px(site.center[0] - site.half[0]), pz(site.center[1] - site.half[1]), site.half[0] * 2 * sx, site.half[1] * 2 * sz);
        mapCtx.globalAlpha = 1;
        mapCtx.fillStyle = '#191722';
        mapCtx.font = 'bold 11px sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(site.key, px(site.center[0]), pz(site.center[1]) + 4);
      }
      if (spike.state === 'planted' || spike.state === 'dropped') {
        mapCtx.fillStyle = '#ff2a1e';
        mapCtx.beginPath();
        mapCtx.arc(px(spike.pos.x), pz(spike.pos.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const mate of teammates) {
        if (!mate.alive) continue;
        mapCtx.fillStyle = '#ffb02e';
        mapCtx.beginPath();
        mapCtx.arc(px(mate.body.position.x), pz(mate.body.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Player arrow.
      mapCtx.save();
      mapCtx.translate(px(playerBody.position.x), pz(playerBody.position.z));
      mapCtx.rotate(-playerBody.yaw);
      mapCtx.fillStyle = '#efe9dc';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
}
