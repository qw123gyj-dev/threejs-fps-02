// Combat: the one place that resolves shots, damage, grenades and the spike. The player's
// shots are raycast against bot bodies (torso and head meshes); bots fire by hit chance, so
// the simulation stays cheap with seven agents. Tracers come from a fixed pool: nothing is
// allocated in a hot loop.
import * as THREE from 'three';
import { GRENADES } from './weapons.js';

const TRACER_COUNT = 24;
const TRACER_LIFE = 0.07;
const GRENADE_GRAVITY = 12;
const SPIKE_FUSE = 35;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

export function createCombat(scene, world, hooks) {
  const agents = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const shootables = [...world.shootables];
  const tracerPool = [];
  const grenades = [];
  const noises = [];
  const dir = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const spike = { state: 'carried', site: null, pos: new THREE.Vector3(), fuse: 0, plant: 0, defuse: 0, carrier: null, mesh: null, beep: 0 };
  const spikeMesh = new THREE.Group();
  const spikeBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffb02e'), roughness: 0.4, metalness: 0.4, emissive: new THREE.Color('#ff5a2e'), emissiveIntensity: 0.6 }),
  );
  const spikeLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a1e }),
  );
  spikeLight.position.y = 0.16;
  spikeMesh.add(spikeBox, spikeLight);
  spikeMesh.visible = false;
  scene.add(spikeMesh);
  spike.mesh = spikeMesh;

  function addAgent(agent) {
    agents.push(agent);
    if (agent.torso) {
      agent.torso.userData.agent = agent;
      agent.head.userData.agent = agent;
      shootables.push(agent.torso, agent.head);
    }
    return agent;
  }

  function spawnTracer(a, b) {
    const t = tracerPool[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = TRACER_LIFE;
  }

  function los(a, b) {
    dir.copy(b).sub(a);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.divideScalar(dist);
    raycaster.set(a, dir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function damage(agent, amount, attacker, part) {
    if (!agent.alive) return 0;
    let rest = amount;
    if (agent.armor > 0) {
      const absorbed = Math.min(agent.armor, rest * 0.5);
      agent.armor -= absorbed;
      rest -= absorbed;
    }
    agent.health -= rest;
    hooks.onDamage?.(agent, rest, attacker);
    if (agent.health <= 0) {
      agent.health = 0;
      agent.alive = false;
      if (agent.group) agent.group.visible = false;
      hooks.onKill?.(agent, attacker, part);
    }
    return rest;
  }

  // Player raycast shot. Returns the hit agent (or null) and the end point of the bullet.
  function shoot(origin, direction, def, shooter, random) {
    raycaster.set(origin, direction);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(shootables, false);
    const hit = hits[0];
    const end = new THREE.Vector3();
    if (!hit) {
      end.copy(origin).addScaledVector(direction, def.range);
      return { agent: null, part: null, point: end, blocked: false };
    }
    end.copy(hit.point);
    const target = hit.object.userData.agent;
    if (target && target.alive && target !== shooter) {
      const part = hit.object.userData.part || 'torso';
      const falloff = Math.max(0.5, 1 - hit.distance / (def.range * 1.6));
      const amount = def.damage * (part === 'head' ? def.headMult : 1) * falloff;
      damage(target, amount, shooter, part);
      return { agent: target, part, point: end, blocked: false, damage: amount };
    }
    return { agent: null, part: null, point: end, blocked: true };
  }

  function noise(pos, radius) {
    noises.push({ x: pos.x, z: pos.z, radius, at: performance.now() / 1000 });
    if (noises.length > 24) noises.shift();
    hooks.onNoise?.(pos, radius);
  }

  function recentNoises(now) {
    return noises.filter((n) => now - n.at < 6);
  }

  function throwGrenade(kind, origin, direction, owner) {
    grenades.push({
      kind,
      owner,
      pos: origin.clone(),
      vel: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: kind === 'frag' ? 1.7 : 1.4,
      mesh: null,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(kind === 'frag' ? '#3a3348' : '#efe9dc'), roughness: 0.5, metalness: 0.5 }),
    );
    grenades[grenades.length - 1].mesh = mesh;
    scene.add(mesh);
    hooks.onThrow?.(kind, owner);
  }

  function explodeGrenade(g, time) {
    scene.remove(g.mesh);
    if (g.kind === 'frag') {
      const def = GRENADES.frag;
      for (const agent of agents) {
        if (!agent.alive || agent === g.owner) continue;
        from.copy(agent.body.position).setY(agent.body.position.y + 1.1);
        const dist = from.distanceTo(g.pos);
        if (dist > def.radius) continue;
        const blocked = !los(g.pos, from);
        const amount = def.damage * (1 - dist / def.radius) * (blocked ? 0.4 : 1);
        damage(agent, amount, g.owner, 'frag');
      }
      hooks.onExplode?.(g.pos, 'frag');
    } else {
      const def = GRENADES.flash;
      for (const agent of agents) {
        if (!agent.alive) continue;
        from.copy(agent.body.position).setY(agent.body.position.y + 1.3);
        const dist = from.distanceTo(g.pos);
        if (dist > def.radius || !los(g.pos, from)) continue;
        // Facing the flash matters: a turned back halves the blind.
        to.copy(g.pos).sub(from).normalize();
        const facing = Math.cos(agent.body.yaw) * -to.z + Math.sin(agent.body.yaw) * -to.x;
        const strength = Math.max(0.3, 1 - dist / def.radius) * (facing > 0 ? 1 : 0.45);
        agent.blindUntil = Math.max(agent.blindUntil || 0, time + def.blind * strength);
        if (agent.isPlayer) hooks.onFlash?.(strength);
      }
      hooks.onExplode?.(g.pos, 'flash');
    }
  }

  function step(dt, time, camera) {
    for (const t of tracerPool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = Math.max(0, (t.life / TRACER_LIFE) * 0.9);
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRENADE_GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        g.vel.y *= -0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        explodeGrenade(g, time);
        grenades.splice(i, 1);
      }
    }
    // Spike fuse and beeps.
    if (spike.state === 'planted') {
      spike.fuse -= dt;
      spike.beep -= dt;
      if (spike.beep <= 0) {
        spike.beep = Math.max(0.35, spike.fuse / SPIKE_FUSE);
        spikeLight.material.color.setHex(spike.fuse < 10 ? 0xff2a1e : 0xffb02e);
        hooks.onBeep?.();
      }
      if (spike.fuse <= 0) {
        spike.state = 'detonated';
        spikeMesh.visible = false;
        hooks.onDetonate?.();
      }
    }
    // Health bars face the camera.
    for (const agent of agents) {
      if (!agent.bar || !agent.alive) continue;
      agent.bar.lookAt(camera.position);
      agent.bar.scale.x = Math.max(0.001, agent.health / 100);
      agent.bar.material.color.setHSL(0.33 * (agent.health / 100), 0.85, 0.55);
    }
  }

  function resetSpike(carrier) {
    spike.state = 'carried';
    spike.site = null;
    spike.fuse = 0;
    spike.plant = 0;
    spike.defuse = 0;
    spike.carrier = carrier;
    spikeMesh.visible = false;
  }

  function dropSpike(pos) {
    spike.state = 'dropped';
    spike.pos.copy(pos);
    spike.pos.y = 0.12;
    spikeMesh.position.copy(spike.pos);
    spikeMesh.visible = true;
    spike.carrier = null;
  }

  function plantTick(dt, site, inZone) {
    if (spike.state !== 'carried' && spike.state !== 'dropped') return spike.state;
    if (!inZone) { spike.plant = 0; return spike.state; }
    spike.plant += dt;
    if (spike.plant >= PLANT_TIME) {
      spike.state = 'planted';
      spike.site = site;
      spike.fuse = SPIKE_FUSE;
      spike.beep = 0;
      spike.pos.set(site.center[0], 0.12, site.center[1]);
      spikeMesh.position.copy(spike.pos);
      spikeMesh.visible = true;
      hooks.onPlant?.(site);
    }
    return spike.state;
  }

  function defuseTick(dt, nearSpike) {
    if (spike.state !== 'planted') return spike.state;
    if (!nearSpike) { spike.defuse = 0; return spike.state; }
    spike.defuse += dt;
    if (spike.defuse >= DEFUSE_TIME) {
      spike.state = 'defused';
      spikeMesh.visible = false;
      hooks.onDefuse?.();
    }
    return spike.state;
  }

  return {
    agents,
    spike,
    addAgent,
    shoot,
    damage,
    los,
    noise,
    recentNoises,
    throwGrenade,
    spawnTracer,
    plantTick,
    defuseTick,
    resetSpike,
    dropSpike,
    step,
    enemiesOf(team) { return agents.filter((a) => a.team !== team && a.alive); },
    teammatesOf(team) { return agents.filter((a) => a.team === team && a.alive); },
  };
}
