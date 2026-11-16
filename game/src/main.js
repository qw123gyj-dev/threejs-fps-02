// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createEconomy } from './economy.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { sfx } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const economy = createEconomy();
const weapon = createWeapon(camera);
const hud = createHud(world.colliders);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const body = player.state;

const WEAPON_ORDER = ['sparrow', 'kestrel', 'longshot', 'mule', 'heron'];
const owned = new Set(['sparrow', 'longshot']);
let shake = 0;
let stepSoundAt = 0;
let mapAt = 0;

const playerAgent = {
  id: 'you', name: 'You', team: 'vanguard', isPlayer: true,
  health: 100, armor: 0, alive: true, body, blindUntil: 0, hurtAt: 0,
};

const combat = createCombat(scene, world, {
  onKill(victim, attacker, part) {
    hud.killfeed(attacker.name, victim.name, part === 'head');
    if (attacker === playerAgent) {
      economy.addKill();
      sfx.kill();
    }
    if (victim === playerAgent) {
      combat.dropSpike(body.position);
      spectateTarget = firstAliveTeammate();
      hud.showOverlay('dead');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  onDamage(agent, amount) {
    agent.hurtAt = elapsed;
    if (agent === playerAgent) {
      hud.damageFlash();
      sfx.hurt();
      shake = Math.min(0.4, shake + 0.15);
    }
  },
  onFlash(strength) { hud.flashBlind(strength); },
  onExplode(pos) {
    sfx.explosion();
    const d = body.position.distanceTo(pos);
    if (d < 12) shake = Math.min(0.6, shake + 0.5 - d * 0.03);
  },
  onPlant(site) {
    hud.banner(`Spike planted at site ${site.key} — defend it`);
    economy.addPlant();
    sfx.plant();
  },
  onBeep() { sfx.beep(); },
  onDetonate() { sfx.explosion(); shake = 0.8; },
  onDefuse() { sfx.defuse(); },
  onThrow() { sfx.grenade(); },
});
combat.addAgent(playerAgent);

const bots = createBots(scene, world, combat, random);

const rounds = createRounds(combat, economy, {
  onRoundStart(round) {
    resetAgents();
    hud.banner(`Round ${round} — buy phase (B to shop)`);
    hud.hideBuy();
    buyOpen = false;
  },
  onLive() { hud.banner('Go! Plant the spike or wipe Cinder'); },
  onRoundEnd(winner, reason) {
    hud.banner(winner === 'vanguard' ? `Round won — ${reason}` : `Round lost — ${reason}`);
    if (winner === 'vanguard') sfx.roundWin();
    else sfx.roundLose();
    hud.hideBuy();
    buyOpen = false;
  },
  onMatchEnd(winner) {
    const score = rounds.state.wins;
    hud.showOverlay('start', '');
    document.getElementById('overlay-title').textContent = winner === 'vanguard' ? 'Match won' : 'Match lost';
    document.getElementById('overlay-copy').textContent = `Final score Vanguard ${score.vanguard} — ${score.cinder} Cinder. Click to play again.`;
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let spectateTarget = null;
let wasFiring = false;
let matchStarted = false;

function firstAliveTeammate() {
  for (const bot of bots.bots) {
    if (bot.agent.team === 'vanguard' && bot.agent.alive) return bot.agent;
  }
  for (const bot of bots.bots) {
    if (bot.agent.alive) return bot.agent;
  }
  return null;
}

function resetAgents() {
  bots.reset();
  playerAgent.health = 100;
  playerAgent.armor = economy.state.armor;
  playerAgent.alive = true;
  body.position.set(0, 0, 15);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  spectateTarget = null;
  weapon.refill();
  combat.resetSpike(playerAgent);
  hud.hideOverlay();
}

function restartMatch() {
  economy.reset();
  rounds.reset();
  owned.clear();
  owned.add('sparrow');
  owned.add('longshot');
  weapon.equip('longshot');
  resetAgents();
  matchStarted = true;
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') { sfx.denied(); return; }
  const item = economy.buy(id);
  if (!item) { sfx.denied(); return; }
  sfx.buy();
  if (item.kind === 'weapon') {
    owned.add(id);
    weapon.equip(id);
  }
  hud.setMoney(economy.state.money);
  hud.setHealth(playerAgent.health, economy.state.armor);
  hud.updateBuyMoney(economy.state.money);
  hud.showBuy(economy.catalog(), economy.state.money, buyItem);
}

function throwGrenade(kind) {
  const count = kind === 'frag' ? economy.state.frags : economy.state.flashes;
  if (count <= 0) { sfx.denied(); return; }
  if (kind === 'frag') economy.state.frags -= 1;
  else economy.state.flashes -= 1;
  camera.getWorldDirection(direction);
  const eye = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
  combat.throwGrenade(kind, eye, direction, playerAgent);
}

function syncCamera() {
  let px = body.position.x;
  let py = body.position.y + body.eye;
  let pz = body.position.z;
  let yaw = body.yaw;
  let pitch = body.pitch;
  if (!playerAgent.alive && spectateTarget) {
    px = spectateTarget.body.position.x;
    py = spectateTarget.body.position.y + spectateTarget.body.eye;
    pz = spectateTarget.body.position.z;
    yaw = spectateTarget.body.yaw;
    pitch = 0;
  }
  if (shake > 0) {
    px += (random() - 0.5) * shake * 0.12;
    py += (random() - 0.5) * shake * 0.12;
    pitch += (random() - 0.5) * shake * 0.02;
  }
  camera.position.set(px, py, pz);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const def = weapon.def();
  const wantFov = weapon.state.aiming && def.scoped ? 30 : 74;
  if (Math.abs(camera.fov - wantFov) > 0.5) {
    camera.fov += (wantFov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

const muzzle = new THREE.Vector3();
const pelletDir = new THREE.Vector3();
const direction = new THREE.Vector3();

function shootPlayer() {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    sfx.dryFire();
    weapon.reload();
    return;
  }
  sfx.shot(def.kind);
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.15;
  const spread = weapon.spread(player.groundSpeed());
  const pellets = def.pellets || 1;
  let hitAny = false;
  let killedAny = false;
  let headAny = false;
  scene.updateMatrixWorld(true);
  for (let p = 0; p < pellets; p += 1) {
    pelletDir.copy(direction);
    pelletDir.x += (random() * 2 - 1) * spread;
    pelletDir.y += (random() * 2 - 1) * spread;
    pelletDir.z += (random() * 2 - 1) * spread;
    pelletDir.normalize();
    const res = combat.shoot(camera.position, pelletDir, def, playerAgent, random);
    combat.spawnTracer(muzzle, res.point);
    if (res.agent) {
      hitAny = true;
      if (res.part === 'head') headAny = true;
      if (!res.agent.alive) killedAny = true;
    }
  }
  combat.noise(body.position, 18);
  weapon.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.005);
  if (hitAny) {
    if (headAny) sfx.headshot();
    else sfx.hit();
    hud.hitMarker(killedAny, shot ? 4000 : 90);
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
}

function pushHud() {
  const rs = rounds.state;
  hud.setHealth(playerAgent.health, economy.state.armor);
  hud.setMoney(economy.state.money);
  hud.setScore(rs.wins.vanguard, rs.wins.cinder, rs.round);
  hud.setAlive(bots.aliveCount('vanguard') + (playerAgent.alive ? 1 : 0), bots.aliveCount('cinder'));
  const spike = combat.spike;
  if (spike.state === 'planted') hud.setTimer(spike.fuse, 'planted');
  else hud.setTimer(rs.timer, rs.phase);
  if (spike.state === 'planted') hud.setSpike('planted', spike.fuse, spike.fuse / 35);
  else if (spike.plant > 0) hud.setSpike('planting', 0, spike.plant / 3);
  else if (spike.defuse > 0) hud.setSpike('defusing', 0, spike.defuse / 5);
  else hud.setSpike(null, 0, 0);
  hud.setCrosshair(weapon.spread(player.groundSpeed()));
  hud.setScoped(weapon.state.aiming && weapon.def().scoped);
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 1.8);
  const rs = rounds.state;
  const phase = rs.phase;
  const keys = input.state.keys;

  // Buy menu and weapon switching (edges).
  if (input.pressed('KeyB') && phase === 'buy' && playerAgent.alive) {
    buyOpen = !buyOpen;
    if (buyOpen) hud.showBuy(economy.catalog(), economy.state.money, buyItem);
    else hud.hideBuy();
  }
  if (input.pressed('KeyG') && playerAgent.alive) throwGrenade('frag');
  if (input.pressed('KeyF') && playerAgent.alive) throwGrenade('flash');
  // Digits buy while the shop is open (the mouse is pointer-locked in play), and
  // switch weapons otherwise.
  if (buyOpen && phase === 'buy') {
    const cat = economy.catalog();
    for (let i = 0; i < cat.length; i += 1) {
      if (input.pressed(`Digit${i + 1}`)) buyItem(cat[i].id);
    }
  } else {
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      if (input.pressed(`Digit${i + 1}`) && owned.has(WEAPON_ORDER[i])) {
        weapon.equip(WEAPON_ORDER[i]);
        sfx.reload();
      }
    }
  }

  if (playerAgent.alive && phase !== 'match') {
    player.step(dt, keys);
    weapon.step(dt);
    // Footsteps.
    if (player.groundSpeed() > 1 && body.onGround) {
      stepSoundAt -= dt;
      if (stepSoundAt <= 0) {
        stepSoundAt = 0.38;
        sfx.step();
        combat.noise(body.position, 6);
      }
    }
    // Firing: autos hold, semi-autos need a fresh click.
    const def = weapon.def();
    const wantFire = input.state.firing && (def.auto || !wasFiring);
    if (wantFire && weapon.ready() && (phase === 'live' || phase === 'buy' || shot)) shootPlayer();
    if (keys.has('KeyR')) weapon.reload();
    weapon.state.aiming = input.state.aiming;
    // Planting: carrier holds E inside a site.
    if (phase === 'live' && combat.spike.carrier === playerAgent && keys.has('KeyE')) {
      const site = rounds.siteAt(body.position.x, body.position.z);
      combat.plantTick(dt, site, !!site);
    } else if (combat.spike.carrier === playerAgent) {
      combat.plantTick(0, null, false);
    }
    // Pick up a dropped spike.
    if (combat.spike.state === 'dropped') {
      const s = combat.spike.pos;
      if (Math.hypot(s.x - body.position.x, s.z - body.position.z) < 1.2) {
        combat.spike.state = 'carried';
        combat.spike.carrier = playerAgent;
        combat.spike.mesh.visible = false;
        hud.banner('Spike recovered — take it to A or B');
      }
    }
  }

  // Teammates pick up a dropped spike.
  if (combat.spike.state === 'dropped') {
    const s = combat.spike.pos;
    for (const bot of bots.bots) {
      if (bot.agent.team !== 'vanguard' || !bot.agent.alive) continue;
      if (Math.hypot(s.x - bot.agent.body.position.x, s.z - bot.agent.body.position.z) < 1.2) {
        combat.spike.state = 'carried';
        combat.spike.carrier = bot.agent;
        combat.spike.mesh.visible = false;
        break;
      }
    }
  }

  bots.step(dt, elapsed, { phase, spike: combat.spike });
  combat.step(dt, elapsed, camera);
  rounds.step(dt, {
    playerAlive: playerAgent.alive,
    vanguardAlive: bots.aliveCount('vanguard') + (playerAgent.alive ? 1 : 0),
    cinderAlive: bots.aliveCount('cinder'),
    spike: combat.spike,
    playerIsCarrier: combat.spike.carrier === playerAgent,
    planting: keys.has('KeyE'),
    playerPos: body.position,
  });

  wasFiring = input.state.firing;
  mapAt -= dt;
  if (mapAt <= 0) {
    mapAt = 0.1;
    hud.drawMinimap(body, bots.bots.filter((b) => b.agent.team === 'vanguard').map((b) => b.agent), combat.spike);
  }
  pushHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAgent.alive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.position.set(0, 0, 15);
  body.yaw = 0;
  body.pitch = 0;
  if (name === 'start') {
    settle(20);
    aimAt(new THREE.Vector3(-6, 2, -6));
    hud.showBuy(economy.catalog(), economy.state.money, buyItem);
    hud.banner('Round 1 — buy phase');
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 86;
    body.position.set(-2, 0, 4);
    settle(30);
    const enemy = bots.bots.find((b) => b.agent.team === 'cinder' && b.agent.alive);
    if (enemy) {
      enemy.agent.body.position.set(-2, 0, -6);
      enemy.agent.group.position.copy(enemy.agent.body.position);
      aimAt(new THREE.Vector3(-2, 1.2, -6));
      shootPlayer();
      settle(6);
      aimAt(new THREE.Vector3(-2, 1.2, -6));
      shootPlayer();
      settle(2);
    }
  } else if (name === 'plant') {
    rounds.state.phase = 'live';
    rounds.state.timer = 54;
    body.position.set(-11, 0, -6);
    body.yaw = 0;
    body.pitch = 0;
    combat.spike.state = 'carried';
    combat.spike.carrier = playerAgent;
    const mate = bots.bots.find((b) => b.agent.team === 'vanguard' && b.agent.alive);
    if (mate) {
      mate.agent.body.position.set(-13, 0, -8.5);
      mate.agent.body.yaw = Math.PI * 0.8;
      mate.agent.group.position.copy(mate.agent.body.position);
    }
    const foe = bots.bots.find((b) => b.agent.team === 'cinder' && b.agent.alive);
    if (foe) {
      foe.agent.body.position.set(-17.5, 0, -13);
      foe.agent.body.yaw = Math.PI * 0.75;
      foe.agent.group.position.copy(foe.agent.body.position);
    }
    settle(4);
    aimAt(new THREE.Vector3(-15, 1.2, -11));
    // Set the plant progress after settling: step() resets it while no key is held.
    combat.spike.plant = 2.1;
    hud.setSpike('planting', 0, 2.1 / 3);
  } else if (name === 'end') {
    rounds.state.wins.vanguard = 1;
    rounds.state.round = 1;
    rounds.state.phase = 'end';
    rounds.state.winner = 'vanguard';
    rounds.state.reason = 'Cinder team eliminated';
    body.position.set(2, 0, 8);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.banner('Round won — Cinder team eliminated');
  }
  pushHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  if (shot) return;
  sfx.unlock();
  if (rounds.state.phase === 'match') {
    restartMatch();
    input.requestLock();
    return;
  }
  if (!matchStarted) {
    matchStarted = true;
    resetAgents();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    hud.hideBuy();
    buyOpen = false;
  } else if (rounds.state.phase !== 'match' && playerAgent.alive) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
  started = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  get phase() { return rounds.state.phase; },
  get round() { return rounds.state.round; },
  get wins() { return { ...rounds.state.wins }; },
  get playerHealth() { return playerAgent.health; },
  get playerAlive() { return playerAgent.alive; },
  get vanguardAlive() { return bots.aliveCount('vanguard') + (playerAgent.alive ? 1 : 0); },
  get cinderAlive() { return bots.aliveCount('cinder'); },
  get spikeState() { return combat.spike.state; },
  get money() { return economy.state.money; },
  get elapsed() { return elapsed; },
};

syncCamera();
pushHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
