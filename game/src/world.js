// The map: Emberline Works, a decommissioned solar foundry, 44 x 36 m. Three lanes run
// north from the Vanguard spawn: West lane to site A (Reactor), Mid through the reactor
// hall, East lane to site B (Smelter). Every box is a collider and a surface a bullet stops
// on. Waypoints form the graph bots walk; sites are the spike zones.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Sites: { key, name, center:[x,z], half:[hx,hz], color }
export const SITES = [
  { key: 'A', name: 'Reactor', center: [-15, -11], half: [4.5, 3.5], color: PALETTE.siteA },
  { key: 'B', name: 'Smelter', center: [15, -11], half: [4.5, 3.5], color: PALETTE.siteB },
];

export const SPAWNS = {
  vanguard: [[-2, 15], [0, 16], [2, 15]],
  cinder: [[-2, -15], [0, -16], [2, -15], [-6, -14]],
};

// Waypoint graph: nodes cover lanes, corners, sites and spawns; edges join neighbours.
// Bots pathfind over it with BFS; holds are nodes where a bot stops and watches an angle.
export const WAYPOINTS = [
  // id: [x, z]
  [0, 15], [-6, 12], [6, 12], [-14, 10], [0, 10], [14, 10],
  [-14, 2], [-6, 4], [0, 2], [6, 4], [14, 2],
  [-15, -5], [-6, -4], [0, -6], [6, -4], [15, -5],
  [-15, -11], [15, -11], [-8, -12], [8, -12], [0, -14],
  [-2, -15], [2, -15], [-14, -14], [14, -14],
];
export const EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 7], [4, 8],
  [4, 9], [5, 10], [6, 11], [7, 11], [7, 12], [8, 12], [8, 13], [9, 13], [9, 14],
  [10, 14], [11, 16], [11, 17], [12, 17], [12, 18], [13, 18], [13, 19], [14, 19],
  [14, 20], [16, 17], [16, 22], [17, 19], [17, 23], [18, 20], [19, 20], [20, 21],
  [21, 22], [22, 23], [11, 22], [14, 23], [6, 12], [10, 13], [3, 7], [5, 9],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'steel' ? 0.55 : 0.03,
      emissive: name === 'ember' ? new THREE.Color(PALETTE.ember) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'ember' ? 0.9 : 0,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls: 44 x 36 m, 4.6 m walls, open sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'floor');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // Site A reactor: glowing core cylinder on a plinth, ringed by pipes.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.9, 3.4, 18),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.85 }),
  );
  core.position.set(-15, 1.7, -11);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);
  colliders.push(new THREE.Box3().setFromObject(core));
  shootables.push(core);
  box(5.2, 0.5, 5.2, -15, 0.25, -11, 'steel');
  box(0.5, 2.2, 0.5, -18.4, 1.1, -13.6, 'steel');
  box(0.5, 2.2, 0.5, -11.6, 1.1, -13.6, 'steel');
  box(0.5, 2.2, 0.5, -18.4, 1.1, -8.4, 'steel');
  box(0.5, 2.2, 0.5, -11.6, 1.1, -8.4, 'steel');

  // Site B smelter: furnace block with a hot mouth and chimney.
  box(4.6, 3.0, 2.2, 15, 1.5, -14.6, 'steel');
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.1, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 1.2 }),
  );
  mouth.position.set(15, 0.9, -13.4);
  group.add(mouth);
  shootables.push(mouth);
  box(1.2, 4.4, 1.2, 18.2, 2.2, -15.4, 'hairline');

  // Mid hall: the reactor pillar splits the lane; a low platform you can jump onto.
  box(1.4, 3.6, 1.4, 0, 1.8, -6, 'hairline');
  box(4.0, 0.5, 3.0, 0, 0.25, 6.5, 'surface');
  box(2.2, 1.0, 1.2, -9, 0.5, 6, 'hairline');
  box(2.2, 1.0, 1.2, 9, 0.5, 6, 'hairline');

  // Lane cover: crates to crouch behind, containers to cut sightlines.
  box(3.6, 1.1, 1.2, -14, 0.55, 4, 'hairline');
  box(1.2, 1.1, 3.6, -8, 0.55, -1, 'hairline');
  box(3.6, 1.1, 1.2, 14, 0.55, 4, 'hairline');
  box(1.2, 1.1, 3.6, 8, 0.55, -1, 'hairline');
  box(2.4, 2.4, 1.2, -18, 1.2, -2, 'steel');
  box(2.4, 2.4, 1.2, 18, 1.2, -2, 'steel');
  box(1.6, 0.7, 1.6, -4, 0.35, -11, 'hairline');
  box(1.6, 0.7, 1.6, 4, 0.35, -11, 'hairline');
  box(2.0, 0.9, 1.2, -11, 0.45, 12, 'hairline');
  box(2.0, 0.9, 1.2, 11, 0.45, 12, 'hairline');
  box(1.2, 2.6, 1.2, -3.5, 1.3, -14, 'hairline');
  box(1.2, 2.6, 1.2, 3.5, 1.3, -14, 'hairline');

  // Site markers: flat glowing strips on the floor so a site reads at a glance.
  for (const site of SITES) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(site.half[0] * 2, 0.06, 0.5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(site.color), emissive: new THREE.Color(site.color), emissiveIntensity: 1.4, roughness: 0.5 }),
    );
    strip.position.set(site.center[0], 0.03, site.center[1] + site.half[1] + 0.4);
    group.add(strip);
    shootables.push(strip);
  }

  // Light: a low amber sun from the west, cool dusk fill, and a warm point over each site.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a3f5e'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  sun.position.set(-18, 12, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.75);
  fill.position.set(14, 10, -12);
  scene.add(fill);
  for (const site of SITES) {
    const glow = new THREE.PointLight(new THREE.Color(site.color), 14, 16, 1.6);
    glow.position.set(site.center[0], 3.2, site.center[1]);
    scene.add(glow);
  }
  const coreGlow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 22, 18, 1.5);
  coreGlow.position.set(-15, 3.6, -11);
  scene.add(coreGlow);

  return { colliders, shootables, group };
}
