import * as THREE from "three";

export interface GalaxyOptions {
  comfort: boolean;
  subdued: boolean;
}

const vertex = `
attribute float aSize;
attribute float aPhase;
varying vec3 vColor;
varying float vPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uOrbit;
void main() {
  vec3 p = position;
  float radius = length(p.xz);
  float angle = uTime * uOrbit * (0.025 + 0.16 / (radius + 2.0));
  p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(aSize * uPixelRatio * 300.0 / max(1.0, -view.z), 1.0, 96.0);
  vColor = color;
  vPhase = aPhase;
}`;

const fragment = `
varying vec3 vColor;
varying float vPhase;
uniform float uTime;
uniform float uOpacity;
uniform float uCloud;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float radius = length(uv);
  if (radius > 0.5) discard;
  float pulse = 0.82 + sin(uTime * 0.6 + vPhase) * 0.18;
  float star = exp(-radius*radius*30.0) + exp(-radius*radius*180.0)*0.6;
  float cloud = pow(max(0.0,1.0-radius*2.0),1.5);
  cloud *= 0.5 + noise(uv*7.0+vPhase)*0.3 + noise(uv*19.0)*0.2;
  float alpha = mix(star*pulse,cloud,uCloud) * uOpacity;
  gl_FragColor = vec4(vColor, alpha);
}`;

/** A real 3D spiral disc, volumetric cloud sprites and a surrounding star shell. */
export function mountGalaxy(canvas: HTMLCanvasElement, initial: GalaxyOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const device = debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : "";
  const software = /swiftshader|llvmpipe|software/i.test(device);
  renderer.setClearColor("#070611");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250);
  const galaxy = new THREE.Group();
  scene.add(galaxy);
  let seed = 90271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const normal = () => (random() + random() + random() + random() - 2) * 0.8;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  const palette = [
    new THREE.Color("#7695dd"),
    new THREE.Color("#ad82c8"),
    new THREE.Color("#6ea9b6"),
    new THREE.Color("#d7bf9a"),
  ];
  const create = (count: number, kind: "star" | "cloud" | "dust" | "shell") => {
    const positions = [],
      colors = [],
      sizes = [],
      phases = [];
    for (let i = 0; i < count; i++) {
      const radius = Math.pow(random(), kind === "star" ? 0.6 : 0.75) * 18;
      const arm = i % 4;
      const angle =
        (arm * Math.PI) / 2 +
        Math.log(radius + 1) * 2.05 +
        normal() * (kind === "star" ? 0.27 : 0.17) +
        (kind === "dust" ? 0.2 : 0);
      let x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      let y = normal() * (0.2 + (1 - radius / 18) * 0.6);
      if (kind === "shell") {
        const longitude = random() * Math.PI * 2,
          latitude = Math.acos(random() * 2 - 1);
        x = Math.sin(latitude) * Math.cos(longitude) * 100;
        y = Math.cos(latitude) * 100;
        z = Math.sin(latitude) * Math.sin(longitude) * 100;
      }
      positions.push(x, y, z);
      const core = new THREE.Color("#f3ddba");
      const color =
        kind === "dust"
          ? new THREE.Color("#10091a")
          : kind === "shell"
            ? new THREE.Color("#a8b5d0")
            : palette[i % 4].clone().lerp(core, Math.max(0, 1 - radius / 9));
      colors.push(color.r, color.g, color.b);
      sizes.push(
        kind === "star"
          ? 0.12 + Math.pow(random(), 8) * 0.5
          : kind === "shell"
            ? 0.2 + random() * 0.3
            : 3.0 + random() * 3.5,
      );
      phases.push(random() * 20);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute(
      "aPhase",
      new THREE.Float32BufferAttribute(phases, 1),
    );
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: kind === "dust" ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uOrbit: { value: kind === "shell" ? 0.04 : 1 },
        uOpacity: { value: 1 },
        uCloud: { value: kind === "star" || kind === "shell" ? 0 : 1 },
      },
    });
    material.userData.baseOpacity =
      kind === "cloud"
        ? 0.24
        : kind === "dust"
          ? 0.6
          : kind === "shell"
            ? 0.48
            : 0.9;
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = kind === "cloud" ? 0 : kind === "dust" ? 1 : 2;
    (kind === "shell" ? scene : galaxy).add(points);
    geometries.push(geometry);
    materials.push(material);
  };
  const count = software ? 11000 : 22000;
  const cloudGeometry = new THREE.PlaneGeometry(40, 40);
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.8 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv;uniform float uTime;uniform float uOpacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.28+noise(p*4.3)*.17;}
      void main(){
        vec2 p=(vUv-.5)*2.;float r=length(p);float angle=atan(p.y,p.x);
        float spin=uTime*(.025+.16/(r*18.+2.));
        float ridge=pow(.5+.5*cos((angle+spin)*4.-log(r*18.+1.)*8.2),4.);
        float clouds=fbm(p*15.+vec2(sin(spin),cos(spin)));
        float fine=fbm(p*42.);float edge=1.-smoothstep(.65,1.,r);
        float core=exp(-r*r*95.);float arm=ridge*(.2+clouds*.8)*exp(-r*1.3)*edge;
        float dust=smoothstep(.35,.6,fine)*.7+.3;
        vec3 color=mix(vec3(.19,.24,.55),vec3(.48,.22,.55),clouds);
        color=mix(color,vec3(1.,.79,.46),exp(-r*4.));
        gl_FragColor=vec4(color,(arm*dust*.85+core*.8)*uOpacity);
      }`,
  });
  cloudMaterial.userData.baseOpacity = 0.85;
  const cloudDisc = new THREE.Mesh(cloudGeometry, cloudMaterial);
  cloudDisc.rotation.x = -Math.PI / 2;
  cloudDisc.position.y = -0.3;
  cloudDisc.renderOrder = -1;
  galaxy.add(cloudDisc);
  geometries.push(cloudGeometry);
  materials.push(cloudMaterial);
  create(150, "cloud");
  create(110, "dust");
  create(count, "star");
  create(1000, "shell");
  canvas.dataset.renderEngine = "three-webgl";
  canvas.dataset.galaxyParticles = String(count + 1260);
  let options = initial,
    width = 1,
    height = 1,
    frame = 0,
    last = 0,
    rendered = 0;
  let fence: WebGLSync | null = null;
  let pointerX = 0,
    pointerY = 0,
    currentX = 0,
    currentY = 0,
    distance = 32;
  const start = performance.now();
  const draw = (now: number) => {
    frame = 0;
    if (document.hidden) return;
    if (fence) {
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) {
        frame = requestAnimationFrame(draw);
        return;
      }
      gl.deleteSync(fence);
      fence = null;
    }
    const interval = software
      ? options.subdued
        ? 80
        : 50
      : options.subdued
        ? 65
        : 33;
    if (!options.comfort && now - last < interval) {
      frame = requestAnimationFrame(draw);
      return;
    }
    last = now;
    const time = options.comfort ? 0 : (now - start) / 1000;
    currentX = options.comfort ? 0 : currentX + (pointerX - currentX) * 0.06;
    currentY = options.comfort ? 0 : currentY + (pointerY - currentY) * 0.06;
    const portrait = width < height;
    galaxy.rotation.set(0.12, 0, portrait ? -0.62 : -0.32);
    camera.position.set(
      currentX * 1.8,
      distance * 0.57 + currentY,
      distance * 0.82,
    );
    camera.lookAt(portrait ? -2 : -7, -3.8, 0);
    for (const material of materials) {
      material.uniforms.uTime.value = time;
      material.uniforms.uOpacity.value =
        material.userData.baseOpacity * (options.subdued ? 0.48 : 1);
    }
    renderer.render(scene, camera);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    canvas.dataset.galaxyFrame = String(++rendered);
    if (!options.comfort) frame = requestAnimationFrame(draw);
  };
  const resume = () => {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  };
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt((software ? 400000 : 1100000) / (width * height)),
    );
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    distance = 32 * Math.max(1, 0.9 / camera.aspect);
    for (const material of materials) material.uniforms.uPixelRatio.value = dpr;
    resume();
  };
  const move = (e: PointerEvent) => {
    pointerX = e.clientX / width - 0.5;
    pointerY = e.clientY / height - 0.5;
  };
  const leave = () => {
    pointerX = pointerY = 0;
  };
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else resume();
  };
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  resize();
  return {
    setOptions(next: GalaxyOptions) {
      options = next;
      resume();
    },
    dispose() {
      cancelAnimationFrame(frame);
      if (fence) gl.deleteSync(fence);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    },
  };
}
