import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import materialAtlas from "../assets/dorm-materials-v3.webp";

// A furnished adult-return AU suite. Static objects share materials and are
// batched; only candle/fire meshes and their lights animate.
export function buildChessRoom(scene: THREE.Scene) {
  const architecture = new THREE.Group();
  scene.add(architecture);
  let disposed = false;
  const maps: THREE.Texture[] = [];
  const atlas = new THREE.TextureLoader().load(materialAtlas, () => {
    if (disposed) {
      atlas.dispose();
      return;
    }
    for (const map of maps) map.needsUpdate = true;
  });
  atlas.colorSpace = THREE.SRGBColorSpace;
  maps.push(atlas);
  const textured = (
    column: number,
    row: number,
    color: string,
    roughness = 0.85,
  ) => {
    // Defer GPU upload until the shared image has finished loading.
    const map = new THREE.Texture();
    map.source = atlas.source;
    map.colorSpace = THREE.SRGBColorSpace;
    map.repeat.set(0.495, 0.495);
    map.offset.set(column * 0.5 + 0.0025, row * 0.5 + 0.0025);
    maps.push(map);
    return new THREE.MeshStandardMaterial({ map, color, roughness });
  };
  const stone = textured(0, 1, "#b7b3b0"),
    wood = textured(1, 1, "#b0a29a", 0.52),
    red = textured(0, 0, "#bda2a5"),
    rug = textured(1, 0, "#c7bdac"),
    oak = new THREE.MeshStandardMaterial({ color: "#302018", roughness: 0.54 }),
    bronze = new THREE.MeshStandardMaterial({
      color: "#bc9256",
      metalness: 0.76,
      roughness: 0.3,
    }),
    green = new THREE.MeshStandardMaterial({
      color: "#243e38",
      roughness: 0.94,
    }),
    cream = new THREE.MeshStandardMaterial({ color: "#d3c4a8", roughness: 1 }),
    leather = new THREE.MeshStandardMaterial({
      color: "#422b26",
      roughness: 0.64,
    }),
    black = new THREE.MeshStandardMaterial({
      color: "#15151b",
      roughness: 0.9,
    }),
    porcelain = new THREE.MeshStandardMaterial({
      color: "#ece0cb",
      roughness: 0.3,
      metalness: 0.08,
    });
  const mesh = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    architecture.add(o);
    return o;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material = oak,
  ) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cylinder = (
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material = bronze,
  ) => mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 12), m, x, y, z);
  const ball = (
    r: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material = bronze,
  ) => mesh(new THREE.SphereGeometry(r, 12, 8), m, x, y, z);
  const torus = (
    r: number,
    tube: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material = bronze,
  ) => mesh(new THREE.TorusGeometry(r, tube, 6, 24), m, x, y, z);
  // Warm parquet, skirting, stone walls and structural timber.
  box(60, 0.3, 60, 0, -3.3, 0, oak);
  for (let x = -28; x <= 28; x += 4)
    for (let z = -28; z <= 28; z += 4)
      box(3.98, 0.035, 3.98, x, -3.13, z, wood);
  for (const side of [-1, 1]) {
    box(60, 15, 0.6, 0, 4.2, side * 29, stone);
    box(0.6, 15, 60, side * 29, 4.2, 0, stone);
    box(60, 0.3, 0.35, 0, -2.8, side * 28.6, oak);
    for (let n = -24; n <= 24; n += 6) {
      box(0.3, 15, 0.4, n, 4.2, side * 28.5, oak);
      box(0.4, 15, 0.3, side * 28.5, 4.2, n, oak);
    }
  }
  // A woven carpet under the chess table; table legs meet the floor.
  box(15, 0.055, 13, 0, -3.06, 0, red);
  box(14.4, 0.025, 12.4, 0, -3.018, 0, rug);
  for (const x of [-3.9, 3.9])
    for (const z of [-3.9, 3.9]) {
      cylinder(0.21, 2.7, x, -1.7, z, oak);
      ball(0.3, x, -2.9, z);
      box(0.48, 0.25, 0.48, x, -0.65, z, bronze);
    }
  box(8.7, 0.35, 0.3, 0, -0.9, -4.15);
  box(0.3, 0.35, 8.7, -4.15, -0.9, 0);
  // Four-poster bed: carved posts, canopy, layered bedding and drawn curtains.
  box(5.4, 0.55, 7, -11, -2.25, -8, oak);
  box(5, 0.55, 6.7, -11, -1.7, -8, cream);
  box(5.05, 0.18, 4.6, -11, -1.3, -6.9, green);
  box(5.6, 3.1, 0.35, -11, -1.15, -11.45, oak);
  box(4.8, 2.1, 0.12, -11, -1.0, -11.2, red);
  for (const x of [-13.6, -8.4])
    for (const z of [-11.5, -4.5]) {
      cylinder(0.15, 7.3, x, 0.55, z, oak);
      ball(0.25, x, 4.3, z);
      cylinder(0.24, 0.18, x, 3.9, z);
      cylinder(0.24, 0.18, x, -2.7, z);
    }
  box(5.7, 0.22, 7.6, -11, 4, -8, oak);
  box(5.3, 0.12, 7.2, -11, 3.86, -8, red);
  for (const x of [-13.4, -8.6]) {
    for (let i = 0; i < 7; i++) {
      const curtain = box(
        0.12,
        5.2,
        0.16,
        x + Math.sin(i * 1.3) * 0.07,
        1.08,
        -10.8 + i * 0.24,
        red,
      );
      curtain.rotation.y = Math.sin(i) * 0.15;
    }
    torus(0.28, 0.035, x, -0.35, -10.3);
  }
  for (const x of [-12.2, -9.8]) {
    const pillow = box(1.9, 0.38, 1.2, x, -1.18, -10.1, cream);
    pillow.rotation.x = -0.14;
  }
  // Fireplace, carved mantel, logs, brass guard and a glowing hearth.
  box(6.8, 0.35, 2.8, 9, -2.9, -12.5, stone);
  for (const x of [6.2, 11.8]) box(0.8, 4.8, 1.2, x, -0.65, -13, stone);
  box(6.8, 0.6, 1.8, 9, 1.9, -13, stone);
  box(6.1, 6, 0.8, 9, 4.3, -13.65, stone);
  box(4.9, 3.8, 0.5, 9, -1, -13.8, black);
  for (let i = 0; i < 4; i++) {
    const log = cylinder(0.18, 2.1, 8 + i * 0.6, -2.55, -12.9, oak);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i % 2 ? 1 : -1) * 0.35;
  }
  for (let i = 0; i < 12; i++)
    cylinder(0.026, 1.3, 6.65 + i * 0.43, -2.05, -11.5);
  box(5.4, 0.05, 0.08, 9, -1.4, -11.5, bronze);
  // Upholstered sofa and cushions beside a tea table.
  box(5.9, 0.7, 2.4, 10, -2.3, -5.5, leather);
  box(5.9, 1.5, 0.6, 10, -1.4, -6.65, leather);
  for (const x of [7, 13]) box(0.55, 1.2, 2.6, x, -1.9, -5.5, leather);
  for (let i = 0; i < 3; i++)
    box(1.7, 0.25, 1.9, 8.2 + i * 1.8, -1.8, -5.35, green);
  for (const x of [8, 12]) {
    const cushion = box(1.1, 1.0, 0.36, x, -1.1, -6.15, red);
    cushion.rotation.z = x === 8 ? -0.2 : 0.2;
  }
  box(4.3, 0.16, 2.3, 10, -2.0, -1.8, wood);
  for (const x of [8.2, 11.8])
    for (const z of [-2.6, -1]) cylinder(0.07, 1, x, -2.55, z, oak);
  const cup = (x: number, y: number, z: number) => {
    cylinder(0.28, 0.035, x, y, z, porcelain);
    cylinder(0.16, 0.23, x, y + 0.13, z, porcelain);
    torus(0.1, 0.025, x + 0.18, y + 0.14, z, porcelain);
  };
  cup(9, -1.89, -1.7);
  cup(11, -1.89, -1.7);
  ball(0.34, 10, -1.55, -1.7, porcelain);
  cylinder(0.14, 0.07, 10, -1.2, -1.7, bronze);
  const spout = cylinder(0.08, 0.5, 10.36, -1.5, -1.7, porcelain);
  spout.rotation.z = -0.8;
  // Bookcases, writing desk, letter, inkwell and floating astronomy globe.
  const books = ["#345445", "#713a38", "#3d4a6a", "#ab8a4a", "#644962"].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  for (const center of [-5, 2]) {
    box(5, 7.5, 0.4, center, 0.6, -17.2);
    for (const x of [center - 2.5, center + 2.5])
      box(0.22, 7.8, 1.2, x, 0.6, -16.8);
    for (let shelf = 0; shelf < 5; shelf++) {
      const y = -2.9 + shelf * 1.5;
      box(5, 0.15, 1.3, center, y, -16.65);
      for (let i = 0; i < 11; i++) {
        const height = 0.75 + ((i * 17 + shelf * 7) % 5) * 0.1;
        box(
          0.24 + (i % 3) * 0.045,
          height,
          0.55,
          center - 2.15 + i * 0.4,
          y + height / 2 + 0.1,
          -16.45,
          books[(i + shelf) % books.length],
        );
        box(
          0.2,
          0.028,
          0.015,
          center - 2.15 + i * 0.4,
          y + 0.26,
          -16.16,
          bronze,
        );
      }
    }
    box(5.6, 0.3, 1.5, center, 4.6, -16.8, bronze);
  }
  box(5.6, 0.22, 2.4, -8, -0.75, 9, wood);
  for (const x of [-10.4, -5.6])
    for (const z of [8.1, 9.9]) box(0.18, 2.25, 0.18, x, -1.95, z);
  box(1.4, 0.025, 1.05, -8, -0.61, 9, cream);
  ball(0.13, -6.4, -0.5, 9, black);
  const quill = cylinder(0.018, 0.85, -6.4, -0.05, 9, cream);
  quill.rotation.z = -0.4;
  ball(
    0.85,
    -9.6,
    0.36,
    9,
    new THREE.MeshStandardMaterial({
      color: "#334c69",
      roughness: 0.5,
      metalness: 0.2,
    }),
  );
  torus(1.05, 0.035, -9.6, 0.36, 9);
  cylinder(0.09, 0.5, -9.6, -0.35, 9);
  // Tall arched windows, mullions and moonlit panes on two walls.
  const glass = new THREE.MeshStandardMaterial({
    color: "#536d8e",
    emissive: "#4b678a",
    emissiveIntensity: 0.42,
    roughness: 0.2,
    metalness: 0.3,
  });
  for (const x of [-15, -7, 1, 9, 17]) {
    box(4.4, 7.5, 0.15, x, 3.2, -28.6, glass);
    for (const dx of [-2.3, 0, 2.3])
      box(0.16, 8.2, 0.28, x + dx, 3.5, -28.3, bronze);
    for (const y of [0, 3, 6.2]) box(4.7, 0.15, 0.28, x, y, -28.3, bronze);
    const arch = torus(2.3, 0.13, x, 6.4, -28.3, oak);
    arch.scale.y = 1.4;
  }
  // Framed portraits, travel trunks, bedside cabinets and a broom rack.
  for (const [x, z] of [
    [-16, 4],
    [14, 10],
  ]) {
    box(3.1, 1.6, 2, x, -2.3, z, leather);
    for (const dx of [-1.1, 1.1])
      box(0.1, 1.65, 2.05, x + dx, -2.28, z, bronze);
    box(0.5, 0.3, 0.08, x, -2.2, z + 1.05, bronze);
  }
  box(2, 1.9, 1.7, -14.8, -2.15, -8);
  for (let i = 0; i < 3; i++) {
    box(1.75, 0.53, 0.12, -14.8, -2.75 + i * 0.6, -7.1, wood);
    ball(0.06, -14.8, -2.75 + i * 0.6, -6.98);
  }
  for (const x of [-13, 9, 17]) {
    box(2.8, 3.5, 0.15, x, 4, -18, bronze);
    box(2.45, 3.15, 0.16, x, 4, -17.9, books[2]);
    ball(0.48, x, 4.35, -17.75, cream);
    box(1.3, 1.25, 0.18, x, 3.15, -17.72, green);
  }
  for (let i = 0; i < 3; i++) {
    const broom = cylinder(0.035, 4.8, 16 + i * 0.5, -0.6, 4, oak);
    broom.rotation.z = -0.12;
    mesh(
      new THREE.ConeGeometry(0.32, 1.1, 10),
      bronze,
      16.3 + i * 0.5,
      -2.7,
      4,
    );
  }
  const flames: {
    mesh: THREE.Mesh;
    light?: THREE.PointLight;
    phase: number;
  }[] = [];
  const fireMaterial = new THREE.MeshBasicMaterial({
    color: "#ffc278",
    transparent: true,
    opacity: 0.85,
  });
  for (let i = 0; i < 8; i++) {
    const f = mesh(
      new THREE.ConeGeometry(0.22, 0.9, 8),
      fireMaterial,
      7.6 + i * 0.4,
      -2.05,
      -12.65,
    );
    flames.push({ mesh: f, phase: i });
  }
  const hearth = new THREE.PointLight("#ffb065", 65, 25, 2);
  hearth.position.set(9, -1.2, -11.8);
  scene.add(hearth);
  flames[0].light = hearth;
  for (const [x, y, z] of [
    [-14.8, -0.95, -8],
    [7, 2.4, -13],
    [11, 2.4, -13],
    [-6, -0.5, 9],
  ]) {
    cylinder(0.2, 0.05, x, y, z);
    cylinder(0.045, 0.65, x, y + 0.35, z);
    cylinder(0.07, 0.4, x, y + 0.85, z, cream);
    const flame = mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      fireMaterial,
      x,
      y + 1.13,
      z,
    );
    flame.scale.y = 2.2;
    flames.push({ mesh: flame, phase: x });
  }
  const warm = new THREE.PointLight("#e5b986", 85, 38, 2);
  warm.position.set(-9, 5, -6);
  scene.add(warm);
  // Merge opaque static props into one draw call per material.
  architecture.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    sources: THREE.Mesh[] = [];
  architecture.traverse((o) => {
    if (
      !(o instanceof THREE.Mesh) ||
      Array.isArray(o.material) ||
      o.material.transparent
    )
      return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const batch = batches.get(o.material) ?? [];
    batch.push(g);
    batches.set(o.material, batch);
    sources.push(o);
  });
  for (const [m, gs] of batches) {
    const geometry = mergeGeometries(gs);
    if (geometry) {
      const item = new THREE.Mesh(geometry, m);
      item.receiveShadow = true;
      scene.add(item);
    }
    gs.forEach((g) => g.dispose());
  }
  for (const source of sources) {
    source.removeFromParent();
    source.geometry.dispose();
  }
  return {
    update(time: number, comfort: boolean) {
      for (const f of flames) {
        f.mesh.scale.y = comfort
          ? 1.3
          : 1.3 + Math.sin(time * 7 + f.phase) * 0.2;
        if (f.light)
          f.light.intensity = comfort ? 65 : 65 + Math.sin(time * 5) * 5;
      }
    },
    dispose() {
      disposed = true;
      maps.forEach((m) => m.dispose());
    },
  };
}
