import * as THREE from 'three';
import { SFX } from '../game/sound';
import { squareCenter } from '../game/board';

export interface CinematicCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: any;
  group: THREE.Group;
}

export type SkinTint = number;

export async function playCapture(
  ctx: CinematicCtx,
  attacker: THREE.Group,
  victim: THREE.Group | null,
  _fromSq: string,
  toSq: string,
  pieceType: string,
  skinTint: SkinTint,
  shortMode: boolean,
): Promise<void> {
  // lock controls
  if (ctx.controls) ctx.controls.enabled = false;
  const origCamPos = ctx.camera.position.clone();
  const origTarget = ctx.controls ? ctx.controls.target.clone() : new THREE.Vector3();

  // close-up position between attacker and victim
  const mid = attacker.position.clone();
  if (victim) mid.lerp(victim.position, 0.5);
  const closePos = mid.clone().add(new THREE.Vector3(0, 2.5, 3));

  // 1. move camera in
  await tweenCamera(ctx.camera, closePos, mid, shortMode ? 200 : 400);

  // 2. attack animation
  const dur = shortMode ? 300 : 600;
  await animateAttack(attacker, pieceType, dur);

  // hit flash + victim burst
  if (victim) {
    spawnHitFlash(ctx.scene, victim.position, skinTint);
    await scatterVoxel(ctx.scene, victim, skinTint, shortMode ? 300 : 500);
    ctx.group.remove(victim);
  }

  // 3. move attacker to square
  const file = toSq.charCodeAt(0) - 97;
  const rank = parseInt(toSq[1]) - 1;
  const c = squareCenter(file, rank);
  await tweenPosition(attacker, new THREE.Vector3(c.x, 0, c.z), shortMode ? 200 : 350);

  // 4. return camera
  await tweenCamera(ctx.camera, origCamPos, origTarget, shortMode ? 200 : 400);
  if (ctx.controls) { ctx.controls.enabled = true; ctx.controls.target.copy(origTarget); }
  SFX.capture();
}

function tweenCamera(camera: THREE.PerspectiveCamera, toPos: THREE.Vector3, lookAt: THREE.Vector3, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = camera.position.clone();
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(start, toPos, e);
      camera.lookAt(lookAt);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

function tweenPosition(obj: THREE.Object3D, to: THREE.Vector3, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = obj.position.clone();
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      obj.position.lerpVectors(start, to, e);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

function animateAttack(attacker: THREE.Group, type: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const startRot = attacker.rotation.clone();
    const startPos = attacker.position.clone();
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      // lunge forward + squash
      const lunge = Math.sin(t * Math.PI) * 0.6;
      attacker.position.z = startPos.z + (type === 'knight' ? lunge * 1.5 : lunge);
      attacker.scale.set(1 + 0.15 * Math.sin(t * Math.PI), 1 - 0.1 * Math.sin(t * Math.PI), 1 + 0.15 * Math.sin(t * Math.PI));
      attacker.rotation.y = startRot.y + (type === 'queen' ? t * Math.PI * 2 : t * 0.4);
      if (t < 1) requestAnimationFrame(step);
      else {
        attacker.scale.set(1, 1, 1);
        attacker.position.copy(startPos);
        attacker.rotation.copy(startRot);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function spawnHitFlash(scene: THREE.Scene, pos: THREE.Vector3, color: number): void {
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  flash.position.copy(pos);
  scene.add(flash);
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / 300;
    flash.scale.setScalar(1 + t * 2);
    (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    if (t < 1) requestAnimationFrame(step); else scene.remove(flash);
  };
  requestAnimationFrame(step);
}

function scatterVoxel(scene: THREE.Scene, victim: THREE.Group, color: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const cubes: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color }));
      c.position.copy(victim.position);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4);
      (c as any).vel = vel;
      scene.add(c);
      cubes.push(c);
    }
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / ms;
      for (const c of cubes) {
        const v = (c as any).vel as THREE.Vector3;
        c.position.addScaledVector(v, 0.016);
        v.y -= 0.12;
        c.rotation.x += 0.1; c.rotation.y += 0.1;
        (c.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      }
      if (t < 1) requestAnimationFrame(step);
      else { for (const c of cubes) scene.remove(c); resolve(); }
    };
    requestAnimationFrame(step);
  });
}