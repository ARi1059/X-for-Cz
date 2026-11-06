'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';

type Props = { focusRef: RefObject<number>; onReady: () => void; onFail?: () => void };

type FrameData = { x: number; z: number; label: string };
const FRAMES: FrameData[] = [
  { x: -1.10, z: 0, label: '绿色 Dior' },
  { x: 0.90, z: -2.2, label: '红色长裙' },
  { x: -0.40, z: -4.4, label: '白色圣诞' },
  { x: 1.15, z: -6.6, label: '粉色楼梯' },
  { x: -0.90, z: -8.8, label: '白色皮草' },
];
const FRAME_W = 2.25;
const FRAME_H = 3.0;
/** The presentation plane every selected portrait glides onto. */
const STAGE_Z = 0.4;
/** Fixed camera rail. The background advances by bringing frames to the stage,
 *  not by pushing the lens through the corridor. */
const CAMERA_Z = 7.6;
const CAMERA_Y = 0.1;
const LOOK_Y = 0.45;
const FLOOR_Y = -1.2;
const MAX_FOCUS = FRAMES.length - 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

type FrameEntry = {
  group: THREE.Group;
  data: FrameData;
  width: number;
  photoMaterial: THREE.MeshBasicMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
  reflection: THREE.Mesh;
  reflectionMaterial: THREE.ShaderMaterial;
};

/** Five-frame corridor for the isolated Lusion Lab. Textures come from
 * public/lusion/01..05.jpg; the main site and its /media requests are untouched.
 *
 * Scroll model: the page supplies a continuous focus (0→4) through `focusRef`.
 * The scene eases toward it and samples one handoff at a time: the outgoing
 * lightbox settles back into the row while the incoming one reaches the stage.
 * The camera stays on a fixed z rail; the framing point leans toward the
 * incoming portrait, and lightboxes in front of it recede and dim just enough
 * to keep the new hero readable. There is no time-based selection here, so the
 * background can be scrubbed forwards, backwards, or stopped mid-transition. */
export function LusionScene({ focusRef, onReady, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady); ready.current = onReady;
  const fail = useRef(onFail); fail.current = onFail;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    try {
      // MSAA on a 2× retina canvas was the one setting that produced
      // intermittent compositor stalls during motion. The line work is already
      // two device pixels wide at that density, so skip it there and keep MSAA
      // for 1× screens where it costs little.
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: pixelRatio < 1.5, powerPreference: 'high-performance' });
    } catch {
      fail.current?.();
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    const initialFocus = clamp(focusRef.current, 0, MAX_FOCUS);
    const initialIndex = Math.round(initialFocus);
    const initialFrame = FRAMES[initialIndex]!;
    camera.position.set(initialFrame.x, CAMERA_Y, CAMERA_Z);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0c0907, 0);
    element.appendChild(renderer.domElement);
    let cleanupScene = () => { renderer.dispose(); element.replaceChildren(); };

    const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
    const remember = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(item: T) => { disposables.push(item); return item; };
    const frames: FrameEntry[] = [];

    const loader = new THREE.TextureLoader();
    let cancelled = false;
    void Promise.all(FRAMES.map((_, index) => loader.loadAsync(`/lusion/0${index + 1}.jpg`))).then(textures => {
      if (cancelled) { textures.forEach(texture => texture.dispose()); return; }
      textures.forEach(texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        remember(texture);
      });

      // The room: wall, floor, one warm pool, corridor dust.
      const wallCanvas = document.createElement('canvas');
      wallCanvas.width = 512; wallCanvas.height = 512;
      const wallCtx = wallCanvas.getContext('2d');
      if (wallCtx) {
        const wallGrad = wallCtx.createLinearGradient(0, 0, 0, 512);
        wallGrad.addColorStop(0, '#21140f'); wallGrad.addColorStop(0.5, '#120b08'); wallGrad.addColorStop(1, '#080504');
        wallCtx.fillStyle = wallGrad; wallCtx.fillRect(0, 0, 512, 512);
        const wallGlow = wallCtx.createRadialGradient(300, 210, 10, 300, 210, 260);
        wallGlow.addColorStop(0, 'rgba(120,78,42,.24)'); wallGlow.addColorStop(1, 'rgba(0,0,0,0)');
        wallCtx.fillStyle = wallGlow; wallCtx.fillRect(0, 0, 512, 512);
      }
      const wallTexture = remember(new THREE.CanvasTexture(wallCanvas));
      const wall = new THREE.Mesh(remember(new THREE.PlaneGeometry(12, 8)), remember(new THREE.MeshBasicMaterial({ map: wallTexture, transparent: true, opacity: 0.95, depthWrite: false })));
      wall.position.set(0, 1.6, -10.8); scene.add(wall);

      const floor = new THREE.Mesh(remember(new THREE.PlaneGeometry(14, 16)), remember(new THREE.MeshBasicMaterial({ color: 0x120b08, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide })));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR_Y, -4.2); scene.add(floor);

      const poolCanvas = document.createElement('canvas');
      poolCanvas.width = 512; poolCanvas.height = 512;
      const poolCtx = poolCanvas.getContext('2d');
      if (poolCtx) {
        const poolGrad = poolCtx.createRadialGradient(256, 256, 10, 256, 256, 256);
        poolGrad.addColorStop(0, 'rgba(230,199,155,.2)'); poolGrad.addColorStop(0.45, 'rgba(160,105,56,.08)'); poolGrad.addColorStop(1, 'rgba(0,0,0,0)');
        poolCtx.fillStyle = poolGrad; poolCtx.fillRect(0, 0, 512, 512);
      }
      const poolTexture = remember(new THREE.CanvasTexture(poolCanvas));
      const pool = new THREE.Mesh(remember(new THREE.PlaneGeometry(6.2, 6.2)), remember(new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
      pool.position.set(0.4, 1.1, -10.7); scene.add(pool);

      const dustCount = 260;
      const dustPositions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 10;
        dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 5;
        dustPositions[i * 3 + 2] = -Math.random() * 12 + 2;
      }
      const dustGeometry = remember(new THREE.BufferGeometry());
      dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
      const dust = new THREE.Points(dustGeometry, remember(new THREE.PointsMaterial({ color: 0xe6c79b, size: 0.014, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })));
      scene.add(dust);

      // Five lightboxes with a thin frame depth, gold edge and the existing halo.
      textures.forEach((texture, index) => {
        const data = FRAMES[index]!;
        const source = texture.image as { width?: number; height?: number } | undefined;
        const aspect = source?.width && source?.height ? source.width / source.height : FRAME_W / FRAME_H;
        const width = FRAME_H * aspect;
        const group = new THREE.Group();
        const isInitial = index === initialIndex;
        group.position.set(data.x, 0.45, isInitial ? STAGE_Z : data.z);
        const photoMaterial = remember(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: isInitial ? 1 : 0.8 }));
        const photo = new THREE.Mesh(remember(new THREE.PlaneGeometry(width, FRAME_H)), photoMaterial);
        const frameDepth = new THREE.Mesh(remember(new THREE.BoxGeometry(width + 0.08, FRAME_H + 0.08, 0.06)), remember(new THREE.MeshBasicMaterial({ color: 0x1a110d })));
        frameDepth.position.z = -0.16;
        const edgeMaterial = remember(new THREE.LineBasicMaterial({ color: 0xc5a574, transparent: true, opacity: isInitial ? 0.72 : 0.22 }));
        const edge = new THREE.LineSegments(remember(new THREE.EdgesGeometry(new THREE.PlaneGeometry(width + 0.02, FRAME_H + 0.02))), edgeMaterial);
        edge.position.z = 0.012;
        group.add(photo, frameDepth, edge);
        group.scale.setScalar(isInitial ? 1.045 : 1);
        scene.add(group);

        // Each lightbox carries its own floor reflection, so it stays exactly
        // under the portrait while that portrait travels to the stage.
        const reflectionMaterial = new THREE.ShaderMaterial({
          uniforms: { uMap: { value: texture }, uOpacity: { value: 0.15 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'varying vec2 vUv; uniform sampler2D uMap; uniform float uOpacity; void main(){ vec4 c = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)); float fade = smoothstep(0.0, 0.72, vUv.y); gl_FragColor = vec4(c.rgb, c.a * fade * uOpacity); }',
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        });
        remember(reflectionMaterial);
        const reflection = new THREE.Mesh(remember(new THREE.PlaneGeometry(width, FRAME_H)), reflectionMaterial);
        reflection.position.set(data.x, FLOOR_Y - FRAME_H / 2, group.position.z);
        scene.add(reflection);

        reflectionMaterial.uniforms.uOpacity!.value = 0.18 * photoMaterial.opacity * photoMaterial.opacity;
        frames.push({ group, data, width, photoMaterial, edgeMaterial, reflection, reflectionMaterial });
      });

      const ring = new THREE.Mesh(remember(new THREE.TorusGeometry(1.92, 0.007, 8, 140)), remember(new THREE.MeshBasicMaterial({ color: 0xc5a574, transparent: true, opacity: 0.26, depthWrite: false })));
      ring.position.set(initialFrame.x, 0.45, STAGE_Z - 0.6); scene.add(ring);

      const selectedGlowCanvas = document.createElement('canvas');
      selectedGlowCanvas.width = 512; selectedGlowCanvas.height = 512;
      const selectedGlowCtx = selectedGlowCanvas.getContext('2d');
      if (selectedGlowCtx) {
        const g = selectedGlowCtx.createRadialGradient(256, 256, 12, 256, 256, 256);
        g.addColorStop(0, 'rgba(230,199,155,.22)'); g.addColorStop(0.5, 'rgba(150,100,55,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        selectedGlowCtx.fillStyle = g; selectedGlowCtx.fillRect(0, 0, 512, 512);
      }
      const selectedGlowTexture = remember(new THREE.CanvasTexture(selectedGlowCanvas));
      const selectedGlow = new THREE.Mesh(remember(new THREE.PlaneGeometry(4.8, 4.8)), remember(new THREE.MeshBasicMaterial({ map: selectedGlowTexture, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
      selectedGlow.position.set(initialFrame.x, 0.45, STAGE_Z - 0.28); scene.add(selectedGlow);

      const floorLine = new THREE.Mesh(remember(new THREE.PlaneGeometry(3.0, 0.006)), remember(new THREE.MeshBasicMaterial({ color: 0xc5a574, transparent: true, opacity: 0.22, depthWrite: false })));
      floorLine.position.set(initialFrame.x, FLOOR_Y + 0.01, STAGE_Z + 0.02); scene.add(floorLine);

      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 256; shadowCanvas.height = 128;
      const shadowCtx = shadowCanvas.getContext('2d');
      if (shadowCtx) {
        const shadowGrad = shadowCtx.createRadialGradient(128, 64, 4, 128, 64, 120);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,.55)'); shadowGrad.addColorStop(0.55, 'rgba(0,0,0,.22)'); shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        shadowCtx.fillStyle = shadowGrad; shadowCtx.fillRect(0, 0, 256, 128);
      }
      const shadowTexture = remember(new THREE.CanvasTexture(shadowCanvas));
      const shadow = new THREE.Mesh(remember(new THREE.PlaneGeometry(2.9, 1.4)), remember(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(initialFrame.x, FLOOR_Y + 0.012, STAGE_Z); scene.add(shadow);

      const pointer = { x: 0, y: 0 };
      const pointerTarget = { x: 0, y: 0 };
      const resize = () => {
        const width = element.clientWidth || window.innerWidth;
        const height = element.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
      };
      const move = (event: PointerEvent) => {
        pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      const start = performance.now();
      let elapsed = 0;
      let last = start;
      let raf = 0;
      let started = false;
      // A short ease keeps trackpad and scrollbar jumps from feeling like a
      // cut, without lagging behind the scroll for long.
      let smoothFocus = initialFocus;

      const render = () => {
        raf = requestAnimationFrame(render);
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;
        elapsed += dt;
        const follow = 1 - Math.exp(-dt * 6.2);
        pointer.x += (pointerTarget.x - pointer.x) * follow;
        pointer.y += (pointerTarget.y - pointer.y) * follow;

        const targetFocus = clamp(focusRef.current, 0, MAX_FOCUS);
        smoothFocus += (targetFocus - smoothFocus) * (1 - Math.exp(-dt / 0.16));
        if (Math.abs(targetFocus - smoothFocus) < 0.0005) smoothFocus = targetFocus;
        const base = Math.min(MAX_FOCUS, Math.floor(smoothFocus + 0.0001));
        const next = Math.min(MAX_FOCUS, base + 1);
        const frac = next === base ? 0 : clamp(smoothFocus - base, 0, 1);
        const eased = smoothstep(frac);
        const opening = Math.sin(Math.PI * frac);
        const from = FRAMES[base]!;
        const to = FRAMES[next]!;

        const cameraX = lerp(from.x, to.x, eased);
        // The framing point leads the rail just enough to reveal the incoming
        // frame, returning to the rail at each station.
        const lookX = lerp(from.x, to.x, Math.min(1, eased + opening * 0.16));
        const breath = Math.sin(elapsed * 0.16) * 0.025;
        camera.position.set(cameraX + pointer.x * 0.07, CAMERA_Y - pointer.y * 0.05, CAMERA_Z + breath);
        camera.lookAt(lookX, LOOK_Y, STAGE_Z);

        const incomingZ = lerp(to.z, STAGE_Z, eased);
        frames.forEach((item, index) => {
          let z = item.data.z;
          let scale = 1;
          let photo = 0.8;
          let edge = 0.22;
          if (index === next && index === base) {
            // Last station: there is no outgoing segment, the final frame is
            // already the hero.
            z = STAGE_Z; scale = 1.045; photo = 1; edge = 0.72;
          } else if (index === next) {
            z = lerp(item.data.z, STAGE_Z, eased);
            scale = lerp(1, 1.045, eased);
            // The incoming portrait becomes fully opaque almost immediately;
            // otherwise the outgoing image ghosts through it at mid-scroll.
            photo = Math.min(1, 0.8 + eased * 4);
            edge = lerp(0.22, 0.72, eased);
          } else if (index === base) {
            z = lerp(STAGE_Z, item.data.z, eased);
            scale = lerp(1.045, 1, eased);
            photo = lerp(1, 0.8, eased);
            edge = lerp(0.72, 0.22, eased);
          }

          let dim = 0;
          if (index !== next) {
            // Frames in front of the incoming portrait move back and fade while
            // the handoff is in progress; at a station the envelope is zero.
            const overlap = Math.max(0, z - incomingZ + 1.3);
            const recede = Math.min(5.5, overlap) * opening;
            dim = Math.min(0.62, 0.34 + 0.28 * Math.min(1, overlap / 3.5)) * opening;
            z -= recede;
          }

          item.group.position.z = z;
          item.group.position.x = item.data.x;
          item.group.scale.setScalar(scale);
          const opacity = photo * (1 - dim);
          item.photoMaterial.opacity = opacity;
          item.edgeMaterial.opacity = edge * (1 - dim);
          item.group.rotation.y = (item.data.x - cameraX) * 0.026;
          item.reflection.position.set(item.data.x, FLOOR_Y - FRAME_H / 2, z);
          item.reflectionMaterial.uniforms.uOpacity!.value = 0.18 * opacity * opacity;
        });

        selectedGlow.position.x = lookX;
        selectedGlow.position.z = STAGE_Z - 0.28;
        ring.position.x = lookX;
        ring.position.z = STAGE_Z - 0.6;
        ring.rotation.z = 0.16 + elapsed * 0.02;
        floorLine.position.x = lookX;
        shadow.position.x = lookX;
        dust.rotation.y = elapsed * 0.008;
        renderer.render(scene, camera);
        if (!started) {
          started = true;
          element.classList.add('is-ready');
          ready.current();
        }
      };
      const visibility = () => {
        if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
        else if (!raf) { last = performance.now(); render(); }
      };
      resize();
      requestAnimationFrame(resize);
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(element);
      window.addEventListener('resize', resize, { passive: true });
      window.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('visibilitychange', visibility);
      render();

      cleanupScene = () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', move);
        document.removeEventListener('visibilitychange', visibility);
        disposables.forEach(item => item.dispose());
        renderer.dispose();
        element.replaceChildren();
      };
    }).catch(() => fail.current?.());

    return () => {
      cancelled = true;
      cleanupScene();
    };
  }, [focusRef]);

  return <div className="lg-lusion-scene" ref={host} aria-hidden="true" />;
}
