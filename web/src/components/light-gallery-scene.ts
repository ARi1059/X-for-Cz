import * as THREE from 'three';
import gsap from 'gsap';
import { cropTexture, galleryMoods, galleryPose } from './light-gallery-model.ts';

type Photo = { id: string; focalPoint?: { x: number; y: number } };
export type GalleryScene = ReturnType<typeof createGalleryScene>;

/** A shared renderer; native vertical scroll drives camera progress, protected images supply textures. */
export function createGalleryScene(host: HTMLElement, photos: Photo[], initial: number, callbacks: {
  select: (index: number) => void; enter: () => void; settled: () => void; failed: () => void;
}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor('#100b09', 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#100b09', 0.045);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  const rig = { index: initial, focus: 0, entrance: 1, pointerX: 0, pointerY: 0 };
  let target = initial, focused = false, disposed = false, mobile = false, elapsed = 0, previousTime = 0, frame = 0;
  let transition: gsap.core.Tween | undefined, entrance: gsap.core.Tween | undefined;
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures = new Map<number, THREE.Texture>();
  const cleanups: (() => void)[] = [];
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const material = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  function dispose() {
    if (disposed) return; disposed = true;
    transition?.kill(); entrance?.kill(); renderer.setAnimationLoop(null); cleanups.forEach(cleanup => cleanup());
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    delete host.dataset.particles; delete host.dataset.frames;
  }
  try {
    scene.add(new THREE.HemisphereLight('#f1dec2', '#1c120e', 2));
    const key = new THREE.DirectionalLight('#ffe4b7', 3.6); key.position.set(3, 5, 7); scene.add(key);
    const accent = new THREE.PointLight('#b5c5a2', 38, 25, 1.5); accent.position.set(0, 1, 3); scene.add(accent);
    const faceGeometry = geometry(new THREE.PlaneGeometry(2.38, 3.58));
    const glassGeometry = geometry(new THREE.BoxGeometry(2.58, 3.8, 0.11));
    const edgeV = geometry(new THREE.BoxGeometry(0.012, 3.82, 0.13)), edgeH = geometry(new THREE.BoxGeometry(2.6, 0.012, 0.13));
    const faces: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    const frames: { gold: THREE.MeshStandardMaterial; smoke: THREE.MeshPhysicalMaterial }[] = [];
    const groups = photos.map((_photo, i) => {
      const group = new THREE.Group();
      const gold = material(new THREE.MeshStandardMaterial({ color: '#b4a481', metalness: 0.85, roughness: 0.24, transparent: true }));
      const smoke = material(new THREE.MeshPhysicalMaterial({ color: '#a88862', roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false }));
      frames.push({ gold, smoke }); group.add(new THREE.Mesh(glassGeometry, smoke));
      [-1, 1].forEach(sign => {
        const v = new THREE.Mesh(edgeV, gold); v.position.x = sign * 1.29; group.add(v);
        const h = new THREE.Mesh(edgeH, gold); h.position.y = sign * 1.9; group.add(h);
      });
      const face = new THREE.Mesh(faceGeometry, material(new THREE.MeshBasicMaterial({ color: '#111a12', transparent: true, opacity: 0.2, toneMapped: false })));
      face.position.z = 0.07; face.userData.index = i; group.add(face); faces.push(face); scene.add(group); return group;
    });
    // GPU spiral particles. Seeded attributes are allocated once; animation updates uniforms only.
    const particleCount = 1800, seeds = new Float32Array(particleCount * 3), sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      seeds[i * 3] = ((i * 73) % 1801) / 1801; seeds[i * 3 + 1] = ((i * 337) % 1801) / 1801; seeds[i * 3 + 2] = ((i * 857) % 1801) / 1801;
      sizes[i] = 1.3 + ((i * 137) % 101) / 101 * 3.7;
    }
    const particleGeometry = geometry(new THREE.BufferGeometry());
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const particleMaterial = material(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScroll: { value: initial }, uSpeed: { value: 0 }, uPixelRatio: { value: 1 }, uTint: { value: new THREE.Color('#c6b989') } },
      vertexShader: [
        'attribute float aSize; uniform float uTime, uScroll, uSpeed, uPixelRatio; varying float vLight;',
        'void main() {',
        'float phase = position.y * 6.283185;',
        'float height = mod(position.x * 19.0 + uTime * 0.23, 19.0) - 9.5;',
        'float angle = height * 0.74 + phase * 0.4 + uTime * 0.085 + uScroll * 0.42;',
        'float radius = 1.95 + position.z * 0.82;',
        'vec3 p = vec3(sin(angle) * radius, height - uScroll * 4.45, -2.0 + cos(angle) * 0.9 - position.z * 2.8);',
        'p.x += sin(height * 0.38 + uTime * 0.1) * 0.5;',
        'vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
        'gl_PointSize = clamp(aSize * uPixelRatio * 19.0 / -mv.z * (1.0 + uSpeed * 0.14), 1.0, 7.0);',
        'vLight = (0.25 + 0.65 * pow(sin(phase + uTime * 0.5) * 0.5 + 0.5, 3.0)) * (1.0 + uSpeed * 0.4);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTint; varying float vLight;',
        'void main() { float d = length(gl_PointCoord - vec2(0.5)); if (d > 0.5) discard;',
        'float glow = exp(-d*d*16.0) * (1.0 - smoothstep(0.3, 0.5, d));',
        'gl_FragColor = vec4(uTint, glow * vLight * 0.86); }',
      ].join('\n'),
    }));
    const particles = new THREE.Points(particleGeometry, particleMaterial); particles.frustumCulled = false; scene.add(particles);
    const ambientGeometry = geometry(new THREE.BufferGeometry()), ambientPositions = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) { ambientPositions[i * 3] = Math.sin(i * 2.39996) * (3 + i % 5); ambientPositions[i * 3 + 1] = ((i * 17) % 101) / 101 * 20 - 10; ambientPositions[i * 3 + 2] = -3 - ((i * 7) % 13); }
    ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
    const ambient = new THREE.Points(ambientGeometry, material(new THREE.PointsMaterial({ color: '#e1bc83', size: 0.018, transparent: true, opacity: 0.45, depthWrite: false }))); scene.add(ambient);
    const ribbonGroup = new THREE.Group(); scene.add(ribbonGroup);
    const ribbonMaterial = material(new THREE.MeshStandardMaterial({ color: '#c0a078', emissive: '#5c3d22', emissiveIntensity: 0.2, metalness: 0.6, roughness: 0.45, transparent: true, opacity: 0.3 }));
    for (let i = 0; i < 3; i++) {
      const points = Array.from({ length: 80 }, (_, j) => { const y = j / 79 * 20 - 10; return new THREE.Vector3(Math.sin(y * 0.74 + i * 0.08) * (2.35 + i * 0.06), y, -2.3 + Math.cos(y * 0.74) * 0.7); });
      ribbonGroup.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 100, 0.005, 3, false)), ribbonMaterial));
    }
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const moodColors = galleryMoods.map(mood => new THREE.Color(mood.color)), tint = new THREE.Color(), warmTint = new THREE.Color('#e5bd83');
    let pointerStart: { x: number; y: number } | null = null, speed = 0;
    function resize() {
      if (disposed) return; const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
      mobile = matchMedia('(max-width:849px)').matches; const ratio = Math.min(window.devicePixelRatio, mobile ? 1.35 : 1.7);
      renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      particleMaterial.uniforms.uPixelRatio!.value = ratio;
      particleGeometry.setDrawRange(0, mobile ? 800 : particleCount); host.dataset.particles = String((mobile ? 800 : particleCount) + 160);
    }
    const observer = new ResizeObserver(resize); observer.observe(host); cleanups.push(() => observer.disconnect()); resize();
    function render(time: number) {
      if (disposed) return; const delta = previousTime ? Math.min(0.05, (time - previousTime) / 1000) : 0; previousTime = time; elapsed += delta;
      const prior = rig.index; rig.index += (target - rig.index) * (1 - Math.exp(-delta * 9)); if (Math.abs(target - rig.index) < 0.0001) rig.index = target;
      speed += (Math.min(3, Math.abs(rig.index - prior) / Math.max(0.001, delta)) - speed) * Math.min(1, delta * 7);
      // Fixed side-by-side columns need horizontal fit as well as vertical fit.
      const fitDistance = 2.6 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const selected = Math.round(target), distance = Math.max((mobile ? 6.8 : 7.8) - rig.focus * (mobile ? 0.25 : 0.9), fitDistance * (1.18 - rig.focus * 0.1)), cameraY = -rig.index * 4.45;
      camera.position.set(rig.pointerX * 0.12, cameraY + rig.pointerY * 0.06, distance + rig.entrance * 2); camera.lookAt(0, cameraY, 0); accent.position.y = cameraY + 1;
      groups.forEach((group, i) => {
        const pose = galleryPose(i, rig.index), away = Math.min(1, Math.abs(i - selected)), fade = 1 - rig.focus * away;
        group.position.set(pose.x, -i * 4.45 + Math.sin(elapsed * 0.3 + i) * 0.025, pose.z - rig.entrance);
        group.rotation.y = pose.rotation; group.rotation.z = Math.sin((i - rig.index) * 0.6) * 0.025; group.visible = fade > 0.005;
        frames[i]!.gold.opacity = fade; frames[i]!.smoke.opacity = fade * 0.16;
        if (textures.has(i)) faces[i]!.material.opacity = fade * (1 - Math.min(0.25, Math.abs(i - rig.index) * 0.12));
      });
      const lower = Math.floor(rig.index), fraction = rig.index - lower;
      tint.copy(moodColors[lower % moodColors.length]!).lerp(moodColors[(lower + 1) % moodColors.length]!, fraction); accent.color.copy(tint);
      particleMaterial.uniforms.uTime!.value = elapsed; particleMaterial.uniforms.uScroll!.value = rig.index; particleMaterial.uniforms.uSpeed!.value = speed;
      particleMaterial.uniforms.uTint!.value.copy(tint).lerp(warmTint, 0.8);
      ribbonGroup.position.y = cameraY; ribbonGroup.rotation.y = Math.sin(elapsed * 0.07) * 0.1 + rig.index * 0.12; ambient.position.y = cameraY; ambient.rotation.y = elapsed * 0.012;
      renderer.render(scene, camera); frame++;
      if (frame % 10 === 0) { host.dataset.frames = String(frame); host.dataset.cameraProgress = rig.index.toFixed(4); host.dataset.particleTime = elapsed.toFixed(3); host.dataset.camera = camera.position.y.toFixed(3); }
    }
    function pointerDown(event: PointerEvent) { pointerStart = { x: event.clientX, y: event.clientY }; }
    function pointerUp(event: PointerEvent) {
      if (!pointerStart) return; const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y; pointerStart = null;
      if (Math.abs(dx) + Math.abs(dy) > 12) return;
      const rect = host.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(faces.filter(face => face.parent?.visible))[0];
      if (hit) { const i = hit.object.userData.index as number; if (i === Math.round(target) && !focused) callbacks.enter(); else callbacks.select(i); }
    }
    function pointerMove(event: PointerEvent) { if (event.pointerType !== 'mouse') return; const r = host.getBoundingClientRect(); rig.pointerX = ((event.clientX - r.left) / r.width - 0.5) * 2; rig.pointerY = ((event.clientY - r.top) / r.height - 0.5) * 2; }
    function pointerLeave() { rig.pointerX = 0; rig.pointerY = 0; pointerStart = null; }
    function visibility() { if (document.hidden) { renderer.setAnimationLoop(null); transition?.pause(); entrance?.pause(); } else { previousTime = 0; renderer.setAnimationLoop(render); transition?.resume(); entrance?.resume(); } }
    function lost(event: Event) { event.preventDefault(); renderer.setAnimationLoop(null); callbacks.failed(); }
    host.addEventListener('pointerdown', pointerDown); host.addEventListener('pointerup', pointerUp); host.addEventListener('pointermove', pointerMove); host.addEventListener('pointerleave', pointerLeave); host.addEventListener('pointercancel', pointerLeave);
    document.addEventListener('visibilitychange', visibility); renderer.domElement.addEventListener('webglcontextlost', lost);
    cleanups.push(() => { host.removeEventListener('pointerdown', pointerDown); host.removeEventListener('pointerup', pointerUp); host.removeEventListener('pointermove', pointerMove); host.removeEventListener('pointerleave', pointerLeave); host.removeEventListener('pointercancel', pointerLeave); document.removeEventListener('visibilitychange', visibility); renderer.domElement.removeEventListener('webglcontextlost', lost); });
    entrance = gsap.to(rig, { entrance: 0, duration: 1.2, ease: 'power3.out' }); visibility();
    return {
      setImage(index: number, image: HTMLImageElement) {
        if (disposed || !photos[index]) return;
        textures.get(index)?.dispose(); const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace;
        const crop = cropTexture(image.naturalWidth, image.naturalHeight, 2.38 / 3.58, photos[index]!.focalPoint);
        texture.repeat.set(crop.repeatX, crop.repeatY); texture.offset.set(crop.offsetX, crop.offsetY); texture.needsUpdate = true;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); textures.set(index, texture);
        faces[index]!.material.map = texture; faces[index]!.material.color.set('#ffffff'); faces[index]!.material.opacity = 1; faces[index]!.material.needsUpdate = true;
        host.dataset.textures = String(textures.size);
      },
      scroll(value: number) { target = Math.max(0, Math.min(photos.length - 1, value)); },
      focus(value: boolean) {
        focused = value; transition?.kill(); entrance?.progress(1).kill();
        transition = gsap.to(rig, { focus: value ? 1 : 0, duration: 0.65, ease: 'power3.inOut', onComplete: callbacks.settled });
        if (document.hidden) transition.pause();
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
