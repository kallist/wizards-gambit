import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { BoardProps } from "./Board2D";
import { file, pieceName, row, squareName } from "../domain/types";
import { makeSculpture, stoneMaterial } from "./sculptures";
import { buildStarRoom } from "./starRoom";
import { TACTICAL_CAMERA } from "./camera";

const position = (at: number) =>
  new THREE.Vector3(file(at) - 3.5, 0.16, row(at) - 3.5);

export default function Board3D(
  props: BoardProps & {
    onFailure: () => void;
    cameraReset: number;
  },
) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef(props);
  current.current = props;
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      current.current.onFailure();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const software =
      rendererInfo &&
      /SwiftShader|llvmpipe|Software/i.test(
        String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)),
      );
    const pixelBudget = software ? 400_000 : 1_000_000;
    const frameRate = software ? 15 : 30;
    let frameFence: WebGLSync | null = null;
    renderer.domElement.setAttribute(
      "aria-label",
      "三维魔法棋盘，拖动旋转、滚轮或双指缩放，复位镜头后也可使用键盘棋格走棋",
    );
    renderer.domElement.setAttribute("role", "img");
    container.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = null;
    const pmrem = new THREE.PMREMGenerator(renderer),
      environment = new RoomEnvironment(),
      env = pmrem.fromScene(environment, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.28;
    environment.dispose();
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(
      TACTICAL_CAMERA.fov,
      1,
      0.1,
      100,
    );
    camera.position.set(...TACTICAL_CAMERA.position);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...TACTICAL_CAMERA.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.minDistance = 11;
    controls.maxDistance = 26;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.update();
    scene.add(new THREE.HemisphereLight("#9aa8d3", "#191b2b", 0.65));
    const sun = new THREE.DirectionalLight("#ead9bf", 2);
    sun.position.set(-4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
    sun.shadow.camera.right = sun.shadow.camera.top = 6;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#eeb881", 1.1);
    rim.position.set(5, 5, -7);
    scene.add(rim);
    const gold = new THREE.MeshStandardMaterial({
      color: "#b99a60",
      metalness: 0.78,
      roughness: 0.29,
    });
    const white = stoneMaterial("#d0cbc0", 0.58);
    const black = stoneMaterial("#414450", 0.52);
    const oak = new THREE.MeshStandardMaterial({
      color: "#181b27",
      metalness: 0.42,
      roughness: 0.44,
    });
    const sceneMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    };
    sceneMesh(new THREE.BoxGeometry(9.1, 0.5, 9.1), oak, 0, -0.26, 0);
    sceneMesh(new THREE.BoxGeometry(9.16, 0.055, 9.16), gold, 0, -0.035, 0);
    sceneMesh(new THREE.BoxGeometry(8.95, 0.07, 8.95), oak, 0, 0.015, 0);
    const squares: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] =
      [];
    for (let at = 0; at < 64; at++) {
      const material = new THREE.MeshStandardMaterial({
        color: (file(at) + row(at)) % 2 ? "#393d4d" : "#bab8af",
        metalness: 0.22,
        roughness: 0.52,
      });
      const tile = sceneMesh(
        new THREE.BoxGeometry(0.99, 0.09, 0.99),
        material,
        file(at) - 3.5,
        0.08,
        row(at) - 3.5,
      ) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      tile.userData.square = at;
      squares.push(tile);
    }
    const indicators = Array.from({ length: 64 }, (_, at) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.022, 6, 32),
        new THREE.MeshBasicMaterial({
          color: "#edce86",
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(position(at));
      ring.position.y = 0.16;
      scene.add(ring);
      return ring;
    });
    const auras = Array.from({ length: 64 }, (_, at) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.026, 6, 32),
        new THREE.MeshBasicMaterial({
          color: "#b9dfcf",
          transparent: true,
          opacity: 0.8,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(position(at));
      ring.position.y = 0.23;
      scene.add(ring);
      return ring;
    });
    for (const z of [-4.27, 4.27])
      for (let i = 0; i < 8; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#d4bd87";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "34px Georgia";
        context.fillText("ABCDEFGH"[i], 32, 32);
        const tex = new THREE.CanvasTexture(canvas),
          label = new THREE.Mesh(
            new THREE.PlaneGeometry(0.25, 0.25),
            new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              depthWrite: false,
            }),
          );
        label.rotation.x = -Math.PI / 2;
        label.position.set(i - 3.5, 0.09, z);
        scene.add(label);
      }
    const room = buildStarRoom(scene);
    const glow = new THREE.PointLight("#ffd08c", 0, 10);
    scene.add(glow);
    const pieces = new Map<
      string,
      {
        mesh: THREE.Group;
        kind: string;
        at: number;
        start: THREE.Vector3;
        target: THREE.Vector3;
        movedAt: number;
        duration: number;
      }
    >();
    const ghosts: {
      mesh: THREE.Group;
      at: number;
      due: number;
      color: string;
    }[] = [];
    const particles: {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      born: number;
      life: number;
    }[] = [];
    const rings: { mesh: THREE.Mesh; born: number }[] = [];
    const particleGeometry = new THREE.DodecahedronGeometry(0.105);
    const removePiece = (mesh: THREE.Group) => {
      scene.remove(mesh);
      mesh.traverse((child) => {
        const shape = child as THREE.Mesh;
        shape.geometry?.dispose();
      });
    };
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let previousVersion = "",
      previousEvent = -1,
      lastImpact = -10,
      animation = 0,
      down = { x: 0, y: 0 };
    const pointers = new Set<number>();
    let dragged = false;
    const pointerDown = (e: PointerEvent) => {
      if (!pointers.size) {
        down = { x: e.clientX, y: e.clientY };
        dragged = false;
      }
      pointers.add(e.pointerId);
      if (pointers.size > 1 || e.button !== 0) dragged = true;
    };
    const pointerMove = (e: PointerEvent) => {
      if (
        pointers.size &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
      )
        dragged = true;
    };
    const pointerCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      dragged = true;
    };
    const pointerUp = (e: PointerEvent) => {
      const click =
        pointers.has(e.pointerId) &&
        pointers.size === 1 &&
        !dragged &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6;
      pointers.delete(e.pointerId);
      if (!click || current.current.disabled) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        [...squares, ...Array.from(pieces.values(), (piece) => piece.mesh)],
        true,
      );
      for (const hit of hits) {
        let picked: THREE.Object3D | null = hit.object;
        while (picked && picked.userData.square === undefined)
          picked = picked.parent;
        if (picked) {
          current.current.onSquare(picked.userData.square);
          return;
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerCancel);
    let lastReset = -1,
      lastFlipped = !current.current.flipped;
    const reportCamera = () => {
      container.parentElement!.dataset.cameraPose = camera.position
        .toArray()
        .map((n) => n.toFixed(3))
        .join(",");
    };
    controls.addEventListener("change", reportCamera);
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio,
          1.5,
          Math.sqrt(pixelBudget / (width * height)),
        ),
      );
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resize.observe(container);
    const burst = (at: number, color: string, now: number) => {
      const center = position(at);
      lastImpact = now;
      glow.position.copy(center).add(new THREE.Vector3(0, 1.2, 0));
      for (let i = 0; i < (current.current.comfort ? 12 : 68); i++) {
        const material = new THREE.MeshStandardMaterial({
          color: i % 6 === 0 ? "#e4c47c" : color,
          metalness: 0.4,
          roughness: 0.48,
          transparent: true,
        });
        const mesh = new THREE.Mesh(particleGeometry, material);
        mesh.position
          .copy(center)
          .add(new THREE.Vector3(0, 0.4 + Math.random() * 0.6, 0));
        const size = 0.5 + Math.random() * 1.5;
        mesh.scale.set(size, size * 0.65, size * 1.2);
        scene.add(mesh);
        const angle = i * 2.399;
        particles.push({
          mesh,
          velocity: new THREE.Vector3(
            Math.cos(angle) * (1.3 + Math.random() * 3),
            2 + Math.random() * 3,
            Math.sin(angle) * (1.3 + Math.random() * 3),
          ),
          born: now,
          life: current.current.comfort ? 0.4 : 0.8 + Math.random() * 0.4,
        });
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.025, 6, 48),
        new THREE.MeshBasicMaterial({
          color: "#efd295",
          transparent: true,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(center);
      ring.position.y = 0.19;
      scene.add(ring);
      rings.push({ mesh: ring, born: now });
    };
    let lastTime = -1;
    const render = () => {
      animation = requestAnimationFrame(render);
      const now = performance.now() / 1000,
        dt = Math.min(0.04, now - lastTime);
      // A turn-based scene needs no 60 Hz GPU saturation. Leave compositor
      // time for the HUD, input and screenshots on software/low-power GPUs.
      if (now - lastTime < 1 / frameRate) return;
      // Bound GPU work to one outstanding frame. On software/mobile GPUs,
      // unchecked command queues delay both pointer feedback and compositing.
      if (frameFence) {
        if (gl.clientWaitSync(frameFence, 0, 0) === gl.TIMEOUT_EXPIRED) return;
        gl.deleteSync(frameFence);
        frameFence = null;
      }
      lastTime = now;
      const p = current.current;
      controls.enableDamping = !p.comfort;
      if (lastReset !== p.cameraReset || lastFlipped !== p.flipped) {
        // Discard damping inertia before restoring a deterministic tactical view.
        controls.enableDamping = false;
        controls.update();
        const direction = p.flipped ? -1 : 1;
        camera.position.set(
          TACTICAL_CAMERA.position[0] * direction,
          TACTICAL_CAMERA.position[1],
          TACTICAL_CAMERA.position[2] * direction,
        );
        controls.target.set(
          TACTICAL_CAMERA.target[0] * direction,
          TACTICAL_CAMERA.target[1],
          TACTICAL_CAMERA.target[2],
        );
        controls.update();
        reportCamera();
        lastReset = p.cameraReset;
        lastFlipped = p.flipped;
      }
      const signature = `${p.state.version}:${p.state.board.map((piece, i) => (piece ? `${piece.id}:${piece.kind}:${i}` : ".")).join("|")}`;
      if (signature !== previousVersion) {
        renderer.shadowMap.needsUpdate = true;
        const ids = new Set(
          p.state.board.filter(Boolean).map((piece) => piece!.id),
        );
        const capture = p.lastEvent?.captured && previousEvent !== p.eventId;
        for (const [id, item] of pieces)
          if (!ids.has(id)) {
            pieces.delete(id);
            if (capture)
              ghosts.push({
                mesh: item.mesh,
                at: item.at,
                due: now + (p.comfort ? 0.05 : 0.23),
                color: id.startsWith("white") ? "#e6dec7" : "#213b32",
              });
            else removePiece(item.mesh);
          }
        p.state.board.forEach((piece, at) => {
          if (!piece) return;
          let item = pieces.get(piece.id);
          if (item && item.kind !== piece.kind) {
            removePiece(item.mesh);
            pieces.delete(piece.id);
            item = undefined;
          }
          if (!item) {
            const mesh = makeSculpture(
              piece,
              piece.color === "white" ? white : black,
              gold,
            );
            mesh.position.copy(position(at));
            mesh.userData.square = at;
            scene.add(mesh);
            item = {
              mesh,
              kind: piece.kind,
              at,
              start: position(at),
              target: position(at),
              movedAt: now - 1,
              duration: 0.32,
            };
            pieces.set(piece.id, item);
          }
          if (item.at !== at) {
            item.start.copy(item.mesh.position);
            item.target.copy(position(at));
            item.at = at;
            item.mesh.userData.square = at;
            item.movedAt = now;
            item.duration = p.comfort ? 0.14 : capture ? 0.32 : 0.28;
          }
        });
        previousVersion = signature;
        previousEvent = p.eventId;
      }
      for (const item of pieces.values()) {
        const t = Math.min(1, (now - item.movedAt) / item.duration),
          eased = 1 - Math.pow(1 - t, 3);
        item.mesh.position.lerpVectors(item.start, item.target, eased);
        if (!p.comfort && t < 1)
          item.mesh.position.y += Math.sin(t * Math.PI) * 0.3;
        if (t < 1) renderer.shadowMap.needsUpdate = true;
      }
      for (let i = ghosts.length - 1; i >= 0; i--)
        if (now >= ghosts[i].due) {
          const g = ghosts.splice(i, 1)[0];
          removePiece(g.mesh);
          burst(g.at, g.color, now);
        }
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i],
          age = now - particle.born;
        if (age >= particle.life) {
          scene.remove(particle.mesh);
          (particle.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
          continue;
        }
        particle.velocity.y -= 10 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.rotation.x += dt * 5;
        particle.mesh.rotation.z += dt * 4;
        if (particle.mesh.position.y < 0.18) {
          particle.mesh.position.y = 0.18;
          particle.velocity.y = Math.abs(particle.velocity.y) * 0.25;
        }
        (particle.mesh.material as THREE.MeshStandardMaterial).opacity =
          1 - age / particle.life;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i],
          age = now - ring.born;
        if (age > 0.6) {
          scene.remove(ring.mesh);
          ring.mesh.geometry.dispose();
          (ring.mesh.material as THREE.Material).dispose();
          rings.splice(i, 1);
        } else {
          ring.mesh.scale.setScalar(1 + age * 5);
          (ring.mesh.material as THREE.MeshBasicMaterial).opacity =
            1 - age / 0.6;
        }
      }
      glow.intensity = Math.max(0, 1 - (now - lastImpact) / 0.25) * 30;
      squares.forEach((tile, at) => {
        const selected = p.selected === at,
          target = p.targets.includes(at),
          spell = p.castTargets.includes(at),
          magic = p.state.tiles.find((t) => t.square === at);
        const effects = p.state.board[at]?.effects ?? [];
        auras[at].visible = effects.length > 0;
        auras[at].position.y =
          0.23 + (p.comfort ? 0 : Math.sin(now * 2.3 + at) * 0.025);
        auras[at].material.color.set(
          effects.some((e) =>
            ["frozen", "slow", "noCapture", "diagonal"].includes(e.type),
          )
            ? "#94c9f2"
            : "#edc980",
        );
        tile.material.emissive.set(
          selected
            ? "#d3aa4e"
            : spell
              ? "#619ead"
              : magic?.type === "fire"
                ? "#8b321e"
                : magic?.type === "wall"
                  ? "#614d97"
                  : "#000000",
        );
        tile.material.emissiveIntensity = selected ? 0.45 : 0.28;
        indicators[at].visible = target || spell;
        (indicators[at].material as THREE.MeshBasicMaterial).color.set(
          spell ? "#a4e1dc" : "#f0d291",
        );
      });
      controls.update();
      const shake = !p.comfort
        ? Math.max(0, 1 - (now - lastImpact) / 0.18) * 0.045
        : 0;
      camera.position.x += Math.sin(now * 95) * shake;
      renderer.render(scene, camera);
      frameFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      camera.position.x -= Math.sin(now * 95) * shake;
    };
    render();
    return () => {
      cancelAnimationFrame(animation);
      if (frameFence) gl.deleteSync(frameFence);
      resize.disconnect();
      controls.dispose();
      room.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      controls.removeEventListener("change", reportCamera);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          for (const mat of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            materials.add(mat);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        const map = (m as THREE.MeshBasicMaterial).map;
        map?.dispose();
        m.dispose();
      });
      env.texture.dispose();
      env.dispose();
      particleGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="board-3d" data-testid="board-3d" data-camera="free">
      <div className="three-host" ref={host} />
      <div className="sr-grid" aria-label="三维棋盘键盘操作">
        {props.state.board.map((p, at) => (
          <button
            key={at}
            disabled={props.disabled}
            onClick={() => props.onSquare(at)}
            aria-label={`${squareName(at)}${p ? ` ${p.color === "white" ? "白" : "黑"}${pieceName[p.kind]}` : " 空格"}`}
          >
            {squareName(at)}
          </button>
        ))}
      </div>
    </div>
  );
}
