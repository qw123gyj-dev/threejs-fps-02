// Bots: two Vanguard teammates and four Cinder defenders. Each bot walks a waypoint graph
// (BFS paths), holds angles, investigates gunfire it hears, and fights in bursts with a
// reaction delay and aim error that grows with distance and movement. After the spike is
// planted, Cinder bots push the site to defuse and Vanguard bots fall back to guard it.
import * as THREE from 'three';
import { createMover } from './player.js';
import { WAYPOINTS, EDGES, SITES, SPAWNS } from './world.js';
import { PALETTE } from './palette.js';

const REACTION = [0.35, 0.7];
const VISION_RANGE = 55;
const HEAR_RADIUS = 20;
const BOT_SPEED = 4.3;

const TEAM_STYLE = {
  vanguard: { body: '#efe9dc', accent: '#ffb02e', dark: '#3a3348' },
  cinder: { body: '#c23b2e', accent: '#ff5a2e', dark: '#241d22' },
};

const LOADOUTS = {
  vanguard: [
    { name: 'Ash', weapon: 'longshot', route: 'A' },
    { name: 'Rook', weapon: 'kestrel', route: 'B' },
  ],
  cinder: [
    { name: 'Vex', weapon: 'longshot', site: 'A' },
    { name: 'Marrow', weapon: 'longshot', site: 'A' },
    { name: 'Hollow', weapon: 'kestrel', site: 'B' },
    { name: 'Sable', weapon: 'heron', site: 'mid' },
  ],
};

// BFS over the waypoint graph. Returns node ids from start to goal, excluding start.
function findPath(start, goal) {
  if (start === goal) return [];
  const prev = new Map([[start, -1]]);
  const queue = [start];
  const adj = new Map();
  for (const [a, b] of EDGES) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  while (queue.length) {
    const node = queue.shift();
    for (const next of adj.get(node) || []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === goal) {
        const path = [goal];
        let cur = goal;
        while (prev.get(cur) !== start && prev.get(cur) !== -1) {
          cur = prev.get(cur);
          path.unshift(cur);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [goal];
}

function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function createBots(scene, world, combat, random) {
  const bots = [];
  const eye = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  function buildBody(team, name) {
    const style = TEAM_STYLE[team];
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.body), roughness: 0.65, metalness: 0.05 });
    const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.accent), roughness: 0.5, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.dark), roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), bodyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), accentMat);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), darkMat);
    visor.position.set(0, 1.55, -0.14);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), darkMat);
    legL.position.set(-0.14, 0.28, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
    gun.position.set(0.28, 1.15, -0.25);
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x51d88a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    bar.position.y = 1.95;
    group.add(torso, head, visor, legL, legR, gun, bar);
    group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; } });
    scene.add(group);
    return { group, torso, head, bar };
  }

  function makeBot(team, def, spawn) {
    const mover = createMover(world.colliders, spawn[0], spawn[1]);
    const parts = buildBody(team, def.name);
    const agent = combat.addAgent({
      id: `${team}-${def.name}`,
      name: def.name,
      team,
      isPlayer: false,
      health: 100,
      armor: 0,
      alive: true,
      body: mover.body,
      group: parts.group,
      torso: parts.torso,
      head: parts.head,
      bar: parts.bar,
      weaponId: def.weapon,
      blindUntil: 0,
    });
    const bot = {
      agent,
      mover,
      def,
      state: 'idle',
      path: [],
      holdNode: -1,
      holdYaw: 0,
      holdUntil: 0,
      target: null,
      reactUntil: 0,
      burstLeft: 0,
      burstGap: 0,
      pauseUntil: 0,
      seeTimer: 0,
      strafeDir: 1,
      strafeUntil: 0,
      home: [...spawn],
    };
    bots.push(bot);
    return bot;
  }

  for (const def of LOADOUTS.vanguard) makeBot('vanguard', def, SPAWNS.vanguard[bots.filter((b) => b.agent.team === 'vanguard').length]);
  for (const def of LOADOUTS.cinder) makeBot('cinder', def, SPAWNS.cinder[bots.filter((b) => b.agent.team === 'cinder').length]);

  function routeTarget(bot, ctx) {
    // Where this bot wants to be, by role and by the spike.
    if (ctx.spike.state === 'planted' && ctx.spike.site) {
      const site = SITES.find((s) => s.key === ctx.spike.site);
      if (bot.agent.team === 'cinder') return nearestNode(site.center[0], site.center[1]);
      return nearestNode(site.center[0] + (bot.def.name === 'Ash' ? -4 : 4), site.center[1] + 5);
    }
    if (bot.agent.team === 'vanguard') {
      const site = SITES.find((s) => s.key === bot.def.route);
      return nearestNode(site.center[0], site.center[1] + 3);
    }
    if (bot.def.site === 'A') return nearestNode(-15, -7);
    if (bot.def.site === 'B') return nearestNode(15, -7);
    return nearestNode(0, -6);
  }

  function acquire(bot, time) {
    const enemies = combat.enemiesOf(bot.agent.team);
    let best = null;
    let bestD = Infinity;
    eye.copy(bot.agent.body.position).setY(bot.agent.body.position.y + bot.agent.body.eye);
    for (const enemy of enemies) {
      targetPos.copy(enemy.body.position).setY(enemy.body.position.y + 1.2);
      const dist = eye.distanceTo(targetPos);
      if (dist > VISION_RANGE) continue;
      // Field of view, unless the bot was just shot (it turns to the threat).
      const dx = targetPos.x - eye.x;
      const dz = targetPos.z - eye.z;
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - bot.agent.body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.1 && time - (bot.agent.hurtAt || 0) > 1.5) continue;
      if (!combat.los(eye, targetPos)) continue;
      if (dist < bestD) { bestD = dist; best = enemy; }
    }
    return best ? { enemy: best, dist: bestD } : null;
  }

  function fireBurst(bot, time, ctx) {
    if (bot.burstLeft <= 0) {
      if (time < bot.pauseUntil) return;
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.pauseUntil = time + 0.5 + random() * 0.5;
    }
    if (time < bot.burstGap) return;
    bot.burstGap = time + (bot.agent.weaponId === 'kestrel' ? 0.09 : 0.12);
    bot.burstLeft -= 1;
    const target = bot.target.enemy;
    if (!target.alive) { bot.target = null; return; }
    // Hit chance: close and still is deadly, far and moving is not.
    const dist = bot.target.dist;
    const targetSpeed = Math.hypot(target.body.velocity.x, target.body.velocity.z);
    const moving = Math.hypot(bot.agent.body.velocity.x, bot.agent.body.velocity.z);
    let chance = 0.45 - dist * 0.011 - targetSpeed * 0.03 - moving * 0.02;
    if (bot.agent.weaponId === 'heron') chance += 0.15;
    chance = Math.max(0.05, Math.min(0.85, chance));
    const muzzle = eye.copy(bot.agent.body.position).setY(bot.agent.body.position.y + 1.3);
    const hitPoint = targetPos.copy(target.body.position).setY(target.body.position.y + 1.2);
    if (random() < chance) {
      const head = random() < 0.12;
      const dmg = bot.agent.weaponId === 'heron' ? 70 : bot.agent.weaponId === 'kestrel' ? 20 : 24;
      combat.spawnTracer(muzzle, hitPoint);
      combat.damage(target, dmg * (head ? 2 : 1), bot.agent, head ? 'head' : 'torso');
    } else {
      hitPoint.x += (random() - 0.5) * 1.6;
      hitPoint.y += (random() - 0.5) * 1.2;
      combat.spawnTracer(muzzle, hitPoint);
    }
    combat.noise(bot.agent.body.position, 16);
  }

  function stepBot(bot, dt, time, ctx) {
    const agent = bot.agent;
    if (!agent.alive) return;
    const blinded = time < (agent.blindUntil || 0);
    // Bots only fight while the round is live: during buy time they hold at spawn,
    // so nobody is shot before the round starts.
    if (ctx.phase !== 'live') {
      bot.target = null;
      bot.burstLeft = 0;
      agent.group.position.copy(agent.body.position);
      agent.group.rotation.y = agent.body.yaw;
      return;
    }
    // Vision, staggered.
    bot.seeTimer -= dt;
    if (bot.seeTimer <= 0 && !blinded) {
      bot.seeTimer = 0.15 + random() * 0.1;
      const found = acquire(bot, time);
      if (found && !bot.target) bot.reactUntil = time + REACTION[0] + random() * (REACTION[1] - REACTION[0]);
      if (!found) bot.target = null;
      else bot.target = found;
    }
    if (blinded) bot.target = null;

    const engaging = bot.target && time >= bot.reactUntil;
    let forward = 0;
    let strafe = 0;
    let speedScale = 1;

    if (engaging) {
      const t = bot.target.enemy;
      const dx = t.body.position.x - agent.body.position.x;
      const dz = t.body.position.z - agent.body.position.z;
      agent.body.yaw = Math.atan2(-dx, -dz);
      // Strafe sideways, flipping direction every second or so.
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.6 + random() * 0.8;
      }
      strafe = bot.strafeDir * 0.7;
      speedScale = 0.6;
      fireBurst(bot, time, ctx);
    } else if (ctx.phase === 'live') {
      // Spike carrier: walk to the nearest site and plant. The plant progress lives
      // in combat; this bot only drives it while it stands inside the site.
      if (ctx.spike.carrier === agent && ctx.spike.state !== 'planted') {
        let site = SITES[0];
        let bestD = Infinity;
        for (const s of SITES) {
          const d = Math.hypot(s.center[0] - agent.body.position.x, s.center[1] - agent.body.position.z);
          if (d < bestD) { bestD = d; site = s; }
        }
        const inZone = Math.abs(agent.body.position.x - site.center[0]) <= site.half[0]
          && Math.abs(agent.body.position.z - site.center[1]) <= site.half[1];
        if (inZone) {
          combat.plantTick(dt, site, true);
        } else {
          const here = nearestNode(agent.body.position.x, agent.body.position.z);
          const goal = nearestNode(site.center[0], site.center[1]);
          if (!bot.path.length) bot.path = findPath(here, goal);
          const node = WAYPOINTS[bot.path[0]];
          const dx = node[0] - agent.body.position.x;
          const dz = node[1] - agent.body.position.z;
          if (Math.hypot(dx, dz) < 0.9) bot.path.shift();
          else {
            agent.body.yaw = Math.atan2(-dx, -dz);
            forward = 1;
          }
        }
        bot.mover.step(dt, forward, strafe, false, false, speedScale * (BOT_SPEED / 5.2));
        agent.group.position.copy(agent.body.position);
        agent.group.rotation.y = agent.body.yaw;
        return;
      }
      // Hear gunfire and go look.
      const noises = combat.recentNoises(time);
      if (bot.state !== 'investigate' && noises.length && random() < 0.5) {
        const n = noises[noises.length - 1];
        const dx = n.x - agent.body.position.x;
        const dz = n.z - agent.body.position.z;
        if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS) {
          bot.state = 'investigate';
          bot.path = findPath(nearestNode(agent.body.position.x, agent.body.position.z), nearestNode(n.x, n.z));
        }
      }
      if (bot.state === 'idle' || bot.state === 'investigate' || !bot.path.length) {
        const goal = routeTarget(bot, ctx);
        const here = nearestNode(agent.body.position.x, agent.body.position.z);
        if (here !== goal || bot.state === 'investigate') {
          bot.path = findPath(here, goal);
          bot.state = 'route';
        } else {
          bot.state = 'hold';
          bot.holdUntil = time + 2 + random() * 3;
          bot.holdYaw = agent.body.yaw + (random() - 0.5) * 1.2;
        }
      }
      if (bot.state === 'route' && bot.path.length) {
        const node = WAYPOINTS[bot.path[0]];
        const dx = node[0] - agent.body.position.x;
        const dz = node[1] - agent.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) {
          bot.path.shift();
          if (!bot.path.length) { bot.state = 'idle'; }
        } else {
          agent.body.yaw = Math.atan2(-dx, -dz);
          forward = 1;
        }
      } else if (bot.state === 'hold') {
        agent.body.yaw += (bot.holdYaw - agent.body.yaw) * Math.min(1, dt * 2);
        if (time > bot.holdUntil) bot.state = 'idle';
      }
      // Defuse: only the closest Cinder bot kneels on a planted spike, so the
      // progress never advances twice as fast with two bots on it.
      if (ctx.spike.state === 'planted' && agent.team === 'cinder') {
        const s = ctx.spike.pos;
        const d = Math.hypot(s.x - agent.body.position.x, s.z - agent.body.position.z);
        if (d < 1.6) {
          let closest = true;
          for (const other of bots) {
            if (other === bot || other.agent.team !== 'cinder' || !other.agent.alive) continue;
            const od = Math.hypot(s.x - other.agent.body.position.x, s.z - other.agent.body.position.z);
            if (od < d) { closest = false; break; }
          }
          if (closest) {
            forward = 0;
            strafe = 0;
            combat.defuseTick(dt, true);
          }
        }
      }
    }

    bot.mover.step(dt, forward, strafe, false, false, speedScale * (BOT_SPEED / 5.2));
    agent.group.position.copy(agent.body.position);
    agent.group.rotation.y = agent.body.yaw;
    // Walk cycle: legs swing while moving.
    const speed = bot.mover.groundSpeed();
    const swing = Math.sin(time * 9) * Math.min(1, speed / 4) * 0.35;
    agent.group.children[3].rotation.x = swing;
    agent.group.children[4].rotation.x = -swing;
  }

  return {
    bots,
    step(dt, time, ctx) {
      for (const bot of bots) stepBot(bot, dt, time, ctx);
    },
    reset(round) {
      for (const bot of bots) {
        const team = bot.agent.team;
        const idx = bots.filter((b) => b.agent.team === team).indexOf(bot);
        const spawn = SPAWNS[team][idx % SPAWNS[team].length];
        bot.agent.health = 100;
        bot.agent.armor = 0;
        bot.agent.alive = true;
        bot.agent.body.position.set(spawn[0], 0, spawn[1]);
        bot.agent.body.velocity.set(0, 0, 0);
        bot.agent.body.yaw = team === 'vanguard' ? Math.PI : 0;
        bot.agent.group.visible = true;
        bot.agent.group.position.copy(bot.agent.body.position);
        bot.state = 'idle';
        bot.path = [];
        bot.target = null;
        bot.burstLeft = 0;
        bot.blindUntil = 0;
      }
    },
    aliveCount(team) {
      return bots.filter((b) => b.agent.team === team && b.agent.alive).length;
    },
  };
}
