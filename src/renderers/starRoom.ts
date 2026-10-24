import * as THREE from "three";

/** Decorative space only. No gameplay RNG, animation loop, or room furniture. */
export function buildStarRoom(scene: THREE.Scene) {
  const positions: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < 112; i++) {
    const longitude = i * 2.3999632297;
    const y = 1 - (2 * (i + 0.5)) / 112;
    const radius = Math.sqrt(1 - y * y);
    positions.push(
      Math.cos(longitude) * radius * 44,
      y * 44,
      Math.sin(longitude) * radius * 44,
    );
    const brightness = 0.15 + (i % 5) * 0.025;
    colors.push(brightness * 0.85, brightness * 0.95, brightness);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.055,
    sizeAttenuation: true,
    vertexColors: true,
    toneMapped: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return {
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
