import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { builtinAvatars, type BuiltinAvatarId } from './avatars';
import { avatarMotions, type AvatarMotion } from './avatarMotions';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export type Mood = 'idle' | 'happy' | 'thinking' | 'encourage' | 'wave';
function binaryData(data: string) {
  const raw = atob(data.slice(data.indexOf(',') + 1)),
    bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
export default function VrmAvatar({
  data = '',
  small = false,
  mood = 'idle',
  variant = 'avatar-b',
  motion = true,
}: {
  data?: string;
  small?: boolean;
  mood?: Mood;
  variant?: BuiltinAvatarId;
  motion?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    moodRef = useRef(mood),
    talking = useRef(false),
    motionRef = useRef(motion);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    moodRef.current = mood;
    motionRef.current = motion;
  }, [mood, motion]);
  useEffect(() => {
    const listener = (e: Event) => {
      const value = (e as CustomEvent<boolean>).detail;
      talking.current = value;
      setSpeaking(value);
    };
    window.addEventListener('lingo-speech', listener);
    return () => window.removeEventListener('lingo-speech', listener);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    setError('');
    setReady(false);
    let disposed = false,
      frame = 0,
      vrm: VRM | undefined;
    let renderer: THREE.WebGLRenderer;
    let mixer: THREE.AnimationMixer | undefined;
    const root = ref.current,
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = new THREE.Vector2(),
      smooth = new THREE.Vector2();
    const controller = new AbortController();
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setError('3D 渲染不可用，请检查显卡驱动，或在设置中上传图片角色。');
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    root.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8793b2, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 3, 4);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xdceaff, 0.75);
    fill.position.set(-2, 1.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe5d5, 1.2);
    rim.position.set(-1, 2, -3);
    scene.add(rim);
    let modelHeight = 1.5,
      centerY = 0.8,
      bounds = root.getBoundingClientRect();
    function resize() {
      bounds = root.getBoundingClientRect();
      const { width, height } = bounds;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const visibleHeight = small ? modelHeight * 0.55 : modelHeight * 1.12;
      const distance = Math.max(
        visibleHeight / (2 * Math.tan(Math.PI / 12)),
        (modelHeight * 0.63) / camera.aspect,
      );
      camera.position.set(0, centerY, distance);
      camera.lookAt(0, centerY, 0);
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    let lastPointer: { x: number; y: number } | undefined;
    function updateLook() {
      if (!lastPointer || !bounds.width || !bounds.height) return;
      // Track across the app, with a soft range around the character's face.
      pointer.set(
        THREE.MathUtils.clamp((lastPointer.x - bounds.left - bounds.width / 2) / Math.max(bounds.width * 1.2, 240), -1, 1),
        THREE.MathUtils.clamp((lastPointer.y - bounds.top - bounds.height * 0.3) / Math.max(innerHeight * 0.5, 200), -1, 1),
      );
    }
    function look(e: PointerEvent) {
      if (e.pointerType === 'touch') return;
      lastPointer = { x: e.clientX, y: e.clientY };
      updateLook();
    }
    function resetLook() {
      lastPointer = undefined;
      pointer.set(0, 0);
    }
    function refreshBounds() {
      bounds = root.getBoundingClientRect();
      updateLook();
    }
    function onVisibility() {
      if (document.hidden) resetLook();
    }
    window.addEventListener('pointermove', look, { passive: true });
    document.documentElement.addEventListener('pointerleave', resetLook);
    window.addEventListener('blur', resetLook);
    window.addEventListener('scroll', refreshBounds, { passive: true, capture: true });
    window.addEventListener('resize', refreshBounds, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (!url.startsWith('data:') && !url.startsWith('blob:'))
        throw Error('请使用贴图内嵌的自包含 VRM');
      return url;
    });
    const loader = new GLTFLoader(manager);
    loader.register((parser) => new VRMLoaderPlugin(parser));
    async function load() {
      try {
        const modelUrl = builtinAvatars.find((a) => a.id === variant)!.url;
        const buffer = data
          ? binaryData(data)
          : await (await fetch(modelUrl, { signal: controller.signal })).arrayBuffer();
        if (disposed) return;
        loader.parse(
          buffer,
          '',
          (gltf) => {
            if (disposed) {
              VRMUtils.deepDispose(gltf.scene);
              return;
            }
            vrm = gltf.userData.vrm;
            if (!vrm) {
              VRMUtils.deepDispose(gltf.scene);
              setError('该文件不包含有效 VRM 角色');
              return;
            }
            VRMUtils.rotateVRM0(vrm);
            const bone = (name: string) => vrm!.humanoid.getNormalizedBoneNode(name as 'head');
            const leftArm = bone('leftUpperArm'),
              rightArm = bone('rightUpperArm'),
              rightForearm = bone('rightLowerArm'),
              head = bone('head'),
              chest = bone('chest') ?? bone('spine');
            scene.add(vrm.scene);
            const gazeTarget = new THREE.Object3D();
            scene.add(gazeTarget);
            if (vrm.lookAt) vrm.lookAt.target = gazeTarget;
            const headPosition = new THREE.Vector3();
            function armDrop(side: 'left' | 'right') {
              const upper = vrm!.humanoid.getRawBoneNode((side + 'UpperArm') as 'leftUpperArm');
              const lower = vrm!.humanoid.getRawBoneNode((side + 'LowerArm') as 'leftLowerArm');
              if (!upper || !lower) return 0;
              vrm!.scene.updateMatrixWorld(true);
              return (
                lower.getWorldPosition(new THREE.Vector3()).y -
                upper.getWorldPosition(new THREE.Vector3()).y
              );
            }
            // VRM 0.x and 1.0 can face opposite directions. Choose each arm's
            // relaxed rotation from the rendered skeleton rather than assuming a sign.
            const rest: Record<'left' | 'right', number> = { left: 1, right: 1 };
            for (const [side, arm] of [
              ['left', leftArm],
              ['right', rightArm],
            ] as const) {
              if (!arm) continue;
              arm.rotation.z = 1.14;
              vrm.humanoid.update();
              vrm.scene.updateMatrixWorld(true);
              const positive = armDrop(side);
              arm.rotation.z = -1.14;
              vrm.humanoid.update();
              vrm.scene.updateMatrixWorld(true);
              rest[side] = positive < armDrop(side) ? 1 : -1;
              arm.rotation.z = rest[side] * 1.14;
              vrm.humanoid.update();
              vrm.scene.updateMatrixWorld(true);
            }
            vrm.springBoneManager?.reset();
            root.dataset.restArms = JSON.stringify({
              left: armDrop('left'),
              right: armDrop('right'),
            });
            const box = new THREE.Box3().setFromObject(vrm.scene);
            modelHeight = Math.max(box.max.y - box.min.y, 0.5);
            centerY = small ? box.min.y + modelHeight * 0.78 : box.min.y + modelHeight * 0.51;
            resize();
            setReady(true);
            mixer = new THREE.AnimationMixer(vrm.scene);
            const actions: Partial<Record<AvatarMotion, THREE.AnimationAction>> = {};
            let activeAction: THREE.AnimationAction | undefined;
            let activeMotion: AvatarMotion | undefined;
            root.dataset.motionReady = 'false';
            root.dataset.variant = variant;
            async function loadMotions() {
              const motionLoader = new GLTFLoader(manager);
              motionLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
              await Promise.all(Object.entries(avatarMotions).map(async ([name, url]) => {
                try {
                  const response = await fetch(url, { signal: controller.signal });
                  if (!response.ok) throw Error('motion download');
                  const gltf = await motionLoader.parseAsync(await response.arrayBuffer(), '');
                  if (disposed || !vrm || !mixer) { VRMUtils.deepDispose(gltf.scene); return; }
                  const animation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined;
                  if (!animation) throw Error('motion missing');
                  // Facial expression and gaze follow the learning state, while the body uses captured motion.
                  animation.expressionTracks.preset.clear();
                  animation.expressionTracks.custom.clear();
                  animation.lookAtTrack = null;
                  const clip = createVRMAnimationClip(animation, vrm);
                  clip.tracks = clip.tracks.filter((track) => !track.name.endsWith('.position'));
                  const action = mixer.clipAction(clip);
                  if (name === 'cheer') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
                  actions[name as AvatarMotion] = action;
                  root.dataset.motionReady = String(Boolean(actions.idle && actions.speaking && actions.cheer));
                  VRMUtils.deepDispose(gltf.scene);
                } catch {
                  if (!disposed) root.dataset.motionFallback = 'true';
                }
              }));
            }
            void loadMotions();
            const headOffset = new THREE.Quaternion(), chestOffset = new THREE.Quaternion();
            const euler = new THREE.Euler();
            const clock = new THREE.Clock();
            let elapsed = 0,
              previousMood = moodRef.current,
              moodTime = 0,
              blinkAt = 2.8,
              waveBlend = 0;
            function draw() {
              if (disposed || !vrm) return;
              frame = requestAnimationFrame(draw);
              const dt = Math.min(clock.getDelta(), 0.05);
              if (document.hidden) return;
              elapsed += dt;
              moodTime += dt;
              const mood = moodRef.current,
                still = reduced.matches || !motionRef.current;
              if (previousMood !== mood) {
                moodTime = 0;
                previousMood = mood;
              }
              if (still) smooth.set(0, 0);
              else smooth.lerp(pointer, 1 - Math.exp(-dt * 6));
              const breathe = still ? 0 : Math.sin(elapsed * 1.7);
              waveBlend = THREE.MathUtils.lerp(waveBlend, !still && mood === 'wave' ? 1 : 0, 1 - Math.exp(-dt * 10));
              const nextMotion: AvatarMotion = mood === 'happy' && moodTime < (actions.cheer?.getClip().duration ?? 0) - 0.4
                ? 'cheer' : talking.current ? 'speaking' : 'idle';
              const nextAction = actions[nextMotion] ?? actions.idle;
              const captured = Boolean(nextAction && !still);
              if (captured && nextAction) {
                if (activeAction !== nextAction) {
                  const previous = activeAction;
                  nextAction.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
                  if (previous) nextAction.crossFadeFrom(previous, 0.4, false);
                  activeAction = nextAction;
                  activeMotion = nextMotion;
                }
                // Remove last frame's gaze offsets before the mixer writes this frame.
                if (head) head.quaternion.multiply(headOffset.invert());
                if (chest) chest.quaternion.multiply(chestOffset.invert());
                headOffset.identity(); chestOffset.identity();
                mixer?.update(dt);
                root.dataset.animation = activeMotion ?? 'idle';
                root.dataset.motionTime = (activeAction?.time ?? 0).toFixed(2);
              } else {
                if (activeAction) { mixer?.stopAllAction(); activeAction = undefined; activeMotion = undefined; }
                headOffset.identity(); chestOffset.identity();
                vrm.humanoid.resetNormalizedPose();
                root.dataset.animation = still ? 'paused' : 'procedural';
              }
              if (captured) {
                headOffset.setFromEuler(euler.set(smooth.y * 0.14, smooth.x * 0.32, mood === 'thinking' ? 0.09 : 0));
                chestOffset.setFromEuler(euler.set(0, smooth.x * 0.07, 0));
                head?.quaternion.multiply(headOffset);
                chest?.quaternion.multiply(chestOffset);
              }
              if (chest && !captured) {
                chest.rotation.x = breathe * 0.015;
                chest.rotation.y = still ? 0 : smooth.x * 0.07;
                chest.rotation.z = still ? 0 : Math.sin(elapsed * 0.7) * 0.018;
              }
              if (head && !captured) {
                head.rotation.x = still ? 0 : smooth.y * 0.16 + Math.sin(elapsed * 0.8) * 0.02;
                head.rotation.y = still ? 0 : smooth.x * 0.32;
                head.rotation.z = mood === 'thinking' ? 0.12 : mood === 'encourage' ? -0.07 : 0;
              }
              // Report the applied gaze offset separately from the captured idle pose.
              const gaze = still ? '0.000,0.000,0.000' : [smooth.x * 0.32, smooth.y * 0.14, smooth.x * 0.07]
                .map((value) => value.toFixed(3)).join(',');
              if (root.dataset.gaze !== gaze) root.dataset.gaze = gaze;
              root.dataset.tracking = String(!still);
              if (leftArm && !captured) leftArm.rotation.z = rest.left * (1.14 + (still ? 0 : breathe * 0.018));
              if (rightArm) {
                if (!captured) {
                  rightArm.rotation.z = rest.right * (mood === 'happy' ? 0.62 : 1.14);
                  rightArm.rotation.x = 0;
                }
                if (waveBlend > 0.001) {
                  rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, rest.right * -0.35, waveBlend);
                  rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -0.4, waveBlend);
                }
              }
              if (rightForearm) {
                if (!captured) rightForearm.rotation.z = 0;
                if (waveBlend > 0.001) rightForearm.rotation.z = THREE.MathUtils.lerp(
                  rightForearm.rotation.z, rest.right * (-1.7 + Math.sin(moodTime * 9) * 0.3), waveBlend,
                );
              }
              let blink = 0;
              if (!still && elapsed > blinkAt) {
                blink = Math.sin(Math.min((elapsed - blinkAt) / 0.19, 1) * Math.PI);
                if (elapsed > blinkAt + 0.19) blinkAt = elapsed + 3.2 + Math.sin(elapsed) * 0.7;
              }
              const values: Record<string, number> = {
                blink,
                happy: mood === 'happy' || mood === 'wave' ? 0.7 : mood === 'encourage' ? 0.25 : 0,
                sad: mood === 'encourage' ? 0.22 : 0,
                relaxed: mood === 'thinking' ? 0.35 : 0,
                aa: talking.current ? 0.15 + Math.abs(Math.sin(elapsed * 10)) * 0.38 : 0,
                ih: talking.current ? Math.max(0, Math.sin(elapsed * 7 + 1)) * 0.22 : 0,
                ou: talking.current ? Math.max(0, Math.sin(elapsed * 9 + 2)) * 0.2 : 0,
              };
              for (const [key, value] of Object.entries(values)) {
                const current = vrm.expressionManager?.getValue(key) ?? 0;
                vrm.expressionManager?.setValue(
                  key,
                  THREE.MathUtils.lerp(current, value, 1 - Math.exp(-dt * 14)),
                );
              }
              if (vrm.lookAt) {
                // A world-space target lets VRM apply the correct eye mapping for each model.
                vrm.lookAt.getLookAtWorldPosition(headPosition);
                gazeTarget.position.set(
                  headPosition.x + smooth.x * modelHeight * 0.9,
                  headPosition.y - smooth.y * modelHeight * 0.5,
                  headPosition.z + modelHeight * 2,
                );
              }
              vrm.update(dt);
              renderer.render(scene, camera);
            }
            draw();
          },
          () => {
            if (!disposed) setError('角色加载失败，请使用自包含的 VRM 0.x / 1.0 文件');
          },
        );
      } catch {
        if (!disposed) setError('3D 角色加载失败，请重新选择模型或恢复默认角色');
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', look);
      document.documentElement.removeEventListener('pointerleave', resetLook);
      window.removeEventListener('blur', resetLook);
      window.removeEventListener('scroll', refreshBounds, true);
      window.removeEventListener('resize', refreshBounds);
      document.removeEventListener('visibilitychange', onVisibility);
      mixer?.stopAllAction();
      if (vrm) { mixer?.uncacheRoot(vrm.scene); VRMUtils.deepDispose(vrm.scene); }
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [data, small, variant]);
  return (
    <div
      className={'vrm-avatar ' + (small ? 'small' : '')}
      ref={ref}
      role="img"
      aria-label="会动、有表情的 3D 陪练角色"
      data-ready={ready}
      data-mood={mood}
      data-speaking={speaking}
    >
      {!ready && !error && <span className="avatar-loading">正在唤醒 3D 角色…</span>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
