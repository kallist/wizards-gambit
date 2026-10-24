import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Piece } from "../domain/types";

// Original, stylized armored sculptures. Static shapes merge by material so
// detail does not require a draw call for every shield, fold and battlement.
export function makeSculpture(
  p: Piece,
  stone: THREE.Material,
  trim: THREE.Material,
): THREE.Group {
  const model = new THREE.Group();
  const add = (
    g: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    material = stone,
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(...rotation);
    if (scale) mesh.scale.set(...scale);
    model.add(mesh);
    return mesh;
  };
  const cylinder = (
    top: number,
    bottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    mat = stone,
    segments = 16,
  ) =>
    add(
      new THREE.CylinderGeometry(top, bottom, height, segments),
      x,
      y,
      z,
      mat,
    );
  const orb = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat = stone,
  ) =>
    add(new THREE.SphereGeometry(1, 16, 12), x, y, z, mat, undefined, [
      sx,
      sy,
      sz,
    ]);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat = stone,
    rotation?: [number, number, number],
  ) => add(new THREE.BoxGeometry(w, h, d), x, y, z, mat, rotation);
  const shield = (x: number, y: number, z: number, size = 1) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.16, 0.18);
    shape.lineTo(0.16, 0.18);
    shape.lineTo(0.14, -0.06);
    shape.quadraticCurveTo(0.1, -0.17, 0, -0.23);
    shape.quadraticCurveTo(-0.12, -0.15, -0.15, -0.05);
    shape.closePath();
    add(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.045,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.012,
        bevelSegments: 1,
        steps: 1,
      }),
      x,
      y,
      z,
      stone,
      [0, -0.15, 0],
      [size, size, size],
    );
    box(0.022, 0.27 * size, 0.018, x, y, z - 0.018, trim);
    box(0.22 * size, 0.022, 0.018, x, y + 0.055 * size, z - 0.018, trim);
  };
  const head = (y: number, helmet = true, x = 0, z = 0) => {
    orb(x, y, z, 0.115, 0.14, 0.11);
    if (helmet) {
      cylinder(0.117, 0.12, 0.055, x, y + 0.06, z, trim);
      box(0.13, 0.026, 0.022, x, y, z - 0.105, trim);
      box(0.022, 0.12, 0.026, x, y + 0.01, z - 0.112, trim);
      box(0.035, 0.105, 0.16, x, y + 0.16, z, trim);
    } else {
      orb(x, y + 0.035, z + 0.04, 0.13, 0.14, 0.1);
    }
  };
  const limb = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    mat = stone,
  ) => {
    const direction = b.clone().sub(a),
      center = a.clone().add(b).multiplyScalar(0.5);
    const mesh = add(
      new THREE.CylinderGeometry(radius * 0.82, radius, direction.length(), 12),
      center.x,
      center.y,
      center.z,
      mat,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
  };
  const robe = (height: number, width: number) => {
    const points = [
      new THREE.Vector2(width, 0),
      new THREE.Vector2(width * 0.98, 0.07),
      new THREE.Vector2(width * 0.72, height * 0.38),
      new THREE.Vector2(width * 0.5, height * 0.65),
      new THREE.Vector2(width * 0.65, height * 0.88),
      new THREE.Vector2(width * 0.25, height),
    ];
    const geometry = new THREE.LatheGeometry(points, 24),
      pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        r = Math.hypot(x, z),
        angle = Math.atan2(z, x),
        wave = 1 + Math.cos(angle * 12) * 0.035;
      if (r > 0) {
        pos.setX(i, x * wave);
        pos.setZ(i, z * wave);
      }
    }
    geometry.computeVertexNormals();
    add(geometry, 0, 0.21, 0);
  };
  cylinder(0.33, 0.37, 0.1, 0, 0.05, 0);
  cylinder(0.32, 0.32, 0.028, 0, 0.116, 0, trim);
  cylinder(0.27, 0.31, 0.09, 0, 0.17, 0);
  if (p.kind === "p") {
    orb(-0.11, 0.26, -0.04, 0.09, 0.07, 0.13);
    orb(0.11, 0.26, -0.04, 0.09, 0.07, 0.13);
    box(0.26, 0.19, 0.18, 0, 0.37, 0);
    cylinder(0.18, 0.21, 0.3, 0, 0.6, 0);
    orb(-0.21, 0.68, 0, 0.085, 0.1, 0.09);
    orb(0.21, 0.68, 0, 0.085, 0.1, 0.09);
    head(0.88);
    shield(-0.16, 0.54, -0.17, 1.07);
    limb(
      new THREE.Vector3(0.2, 0.67, 0),
      new THREE.Vector3(0.25, 0.46, -0.11),
      0.055,
    );
    box(0.035, 0.45, 0.04, 0.25, 0.53, -0.12, trim);
    box(0.15, 0.035, 0.06, 0.25, 0.63, -0.12, trim);
  } else if (p.kind === "n") {
    for (const x of [-0.14, 0.14])
      for (const z of [-0.21, 0.21]) {
        cylinder(0.05, 0.07, 0.42, x, 0.4, z);
        box(0.13, 0.08, 0.16, x, 0.22, z - 0.02);
      }
    orb(0, 0.7, 0, 0.23, 0.23, 0.36);
    orb(0, 0.83, -0.29, 0.14, 0.27, 0.17);
    orb(0, 1.01, -0.43, 0.12, 0.13, 0.23);
    orb(0, 0.96, -0.56, 0.1, 0.075, 0.12);
    for (const x of [-0.07, 0.07])
      add(new THREE.ConeGeometry(0.035, 0.13, 8), x, 1.17, -0.4);
    box(0.06, 0.28, 0.1, 0, 0.99, -0.25, trim, [-0.35, 0, 0]);
    const tail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.85, 0.31),
      new THREE.Vector3(0, 0.62, 0.43),
      new THREE.Vector3(0, 0.3, 0.42),
    ]);
    add(new THREE.TubeGeometry(tail, 8, 0.045, 6, false), 0, 0, 0);
    box(0.26, 0.13, 0.26, 0, 0.91, 0.04, trim);
    cylinder(0.13, 0.16, 0.25, 0, 1.08, 0.04);
    head(1.32, true, 0, 0.04);
    limb(
      new THREE.Vector3(-0.12, 1.15, 0.04),
      new THREE.Vector3(-0.25, 0.99, -0.03),
      0.045,
    );
    shield(-0.24, 1.04, -0.08, 0.7);
    limb(
      new THREE.Vector3(0.13, 1.15, 0.04),
      new THREE.Vector3(0.24, 1.04, -0.08),
      0.045,
    );
    cylinder(0.014, 0.02, 0.85, 0.25, 1.25, -0.09, trim, 8);
    add(new THREE.ConeGeometry(0.045, 0.15, 8), 0.25, 1.75, -0.09, trim);
    for (const x of [-0.19, 0.19])
      limb(
        new THREE.Vector3(x, 0.96, 0.05),
        new THREE.Vector3(x * 1.3, 0.62, 0.02),
        0.06,
      );
  } else if (p.kind === "r") {
    cylinder(0.25, 0.28, 0.74, 0, 0.62, 0, stone, 24);
    for (const y of [0.34, 0.55, 0.76, 0.94])
      cylinder(0.285, 0.285, 0.045, 0, y, 0, trim, 24);
    cylinder(0.33, 0.29, 0.12, 0, 1.02, 0, stone, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(
        0.13,
        0.19,
        0.13,
        Math.cos(a) * 0.255,
        1.16,
        Math.sin(a) * 0.255,
        stone,
        [0, -a, 0],
      );
    }
    box(0.12, 0.28, 0.035, 0, 0.52, -0.27, trim);
    add(
      new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI),
      0,
      0.66,
      -0.282,
      trim,
    );
    for (const x of [-0.16, 0.16]) box(0.025, 0.13, 0.03, x, 0.83, -0.22, trim);
  } else if (p.kind === "b") {
    robe(0.79, 0.29);
    head(1.1, false);
    add(new THREE.ConeGeometry(0.14, 0.27, 4), 0, 1.32, 0.015, stone, [
      0,
      Math.PI / 4,
      0,
    ]);
    box(0.018, 0.2, 0.035, 0, 1.32, -0.1, trim);
    limb(
      new THREE.Vector3(-0.15, 0.9, 0),
      new THREE.Vector3(-0.2, 0.76, -0.12),
      0.06,
    );
    box(0.2, 0.22, 0.06, -0.19, 0.81, -0.16, trim, [0.15, -0.2, 0.1]);
    limb(
      new THREE.Vector3(0.15, 0.9, 0),
      new THREE.Vector3(0.25, 0.83, -0.07),
      0.06,
    );
    cylinder(0.018, 0.025, 1.06, 0.26, 0.77, -0.09, trim, 10);
    add(new THREE.OctahedronGeometry(0.095), 0.26, 1.35, -0.09, trim);
  } else {
    robe(p.kind === "q" ? 0.86 : 0.93, p.kind === "q" ? 0.29 : 0.32);
    head(p.kind === "q" ? 1.17 : 1.23, false);
    const crownY = p.kind === "q" ? 1.33 : 1.39;
    cylinder(0.14, 0.13, 0.06, 0, crownY, 0, trim);
    for (let i = 0; i < (p.kind === "q" ? 7 : 5); i++) {
      const a = (i * Math.PI * 2) / (p.kind === "q" ? 7 : 5);
      add(
        new THREE.ConeGeometry(0.032, 0.13, 5),
        Math.sin(a) * 0.12,
        crownY + 0.09,
        Math.cos(a) * 0.12,
        trim,
      );
    }
    // A carved cape with real folds, behind the torso.
    const cape = new THREE.PlaneGeometry(0.58, 0.91, 12, 16),
      pos = cape.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(
        i,
        0.18 +
          Math.cos(pos.getX(i) * 32) * 0.025 +
          (pos.getY(i) + 0.455) * 0.05,
      );
    }
    cape.computeVertexNormals();
    add(cape, 0, 0.72, 0.02, stone);
    if (p.kind === "k") {
      box(0.29, 0.3, 0.18, 0, 0.94, -0.015);
      orb(-0.2, 1.03, 0, 0.09, 0.09, 0.09);
      orb(0.2, 1.03, 0, 0.09, 0.09, 0.09);
      for (const x of [-0.18, 0.18])
        limb(
          new THREE.Vector3(x, 1, 0),
          new THREE.Vector3(x * 0.3, 0.78, -0.2),
          0.065,
        );
      box(0.04, 0.62, 0.04, 0, 0.58, -0.23, trim);
      box(0.25, 0.04, 0.055, 0, 0.86, -0.23, trim);
      orb(0, 0.95, -0.23, 0.04, 0.055, 0.04, trim);
    } else {
      limb(
        new THREE.Vector3(-0.15, 1, 0),
        new THREE.Vector3(-0.24, 0.83, -0.06),
        0.045,
      );
      limb(
        new THREE.Vector3(0.15, 1, 0),
        new THREE.Vector3(0.25, 1.13, -0.07),
        0.045,
      );
      cylinder(0.014, 0.02, 0.44, 0.25, 1.25, -0.07, trim, 8);
      orb(0.25, 1.5, -0.07, 0.055, 0.07, 0.055, trim);
      for (let i = 0; i < 5; i++)
        orb(Math.sin(i) * 0.12, 1.1 - i * 0.06, 0.1, 0.035, 0.14, 0.04);
    }
  }
  model.updateMatrixWorld(true);
  const result = new THREE.Group();
  for (const material of [stone, trim]) {
    const geometries: THREE.BufferGeometry[] = [];
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry || mesh.material !== material) return;
      const g = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      g.deleteAttribute("uv");
      geometries.push(g);
    });
    if (geometries.length) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = mesh.receiveShadow = true;
        result.add(mesh);
      }
      geometries.forEach((g) => g.dispose());
    }
  }
  model.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
  if (p.color === "black") result.rotation.y = Math.PI;
  result.userData.kind = p.kind;
  return result;
}

export function stoneMaterial(
  color: string,
  roughness = 0.62,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.08,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCarvedPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCarvedPosition = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCarvedPosition;",
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat vein = sin(vCarvedPosition.x*39.0 + sin(vCarvedPosition.z*26.0)*2.0 + vCarvedPosition.y*9.0);\nfloat grain = fract(sin(dot(floor(vCarvedPosition*135.0),vec3(12.9898,78.233,45.164)))*43758.5453);\ndiffuseColor.rgb *= 0.89 + grain*0.12 + smoothstep(0.76,1.0,abs(vein))*0.1;",
      );
  };
  return mat;
}
