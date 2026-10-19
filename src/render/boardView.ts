import * as THREE from 'three';
import { loadGLB } from './loader';
import { squareCenter } from '../game/board';
import { piecePath } from '../game/skins';
import type { PieceType, PieceColor } from '../game/skins';

const PIECE_CHAR: Record<string, PieceType> = {
  p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king',
};

export interface PieceMesh { mesh: THREE.Group; square: string; color: PieceColor; type: PieceType; }

export class BoardView {
  group: THREE.Group;
  skin: string;
  pieces = new Map<string, PieceMesh>(); // square -> piece
  markers: THREE.Object3D[] = [];
  markerGroup = new THREE.Group();

  constructor(group: THREE.Group, skin: string) {
    this.group = group;
    this.skin = skin;
    this.group.add(this.markerGroup);
  }

  setSkin(skin: string): void { this.skin = skin; }

  clearPieces(): void {
    for (const [, pm] of this.pieces) this.group.remove(pm.mesh);
    this.pieces.clear();
  }

  async loadBoard(boardPath: string): Promise<THREE.Group> {
    const b = await loadGLB(boardPath);
    this.group.add(b);
    return b;
  }

  async placeStart(): Promise<void> {
    // Build from a FEN-ish starting position using chess.js default
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    // white back rank j=0, pawns j=1; black j=7, pawns j=6
    const files = 'abcdefgh';
    const placements: { sq: string; color: PieceColor; type: PieceType }[] = [];
    for (let i = 0; i < 8; i++) {
      placements.push({ sq: `${files[i]}2`, color: 'white', type: 'pawn' });
      placements.push({ sq: `${files[i]}1`, color: 'white', type: PIECE_CHAR[back[i]] });
      placements.push({ sq: `${files[i]}7`, color: 'black', type: 'pawn' });
      placements.push({ sq: `${files[i]}8`, color: 'black', type: PIECE_CHAR[back[i]] });
    }
    for (const pl of placements) {
      await this.addPiece(pl.sq, pl.color, pl.type);
    }
  }

  async addPiece(square: string, color: PieceColor, type: PieceType): Promise<PieceMesh> {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    const mesh = await loadGLB(piecePath(this.skin, color, type));
    const c = squareCenter(file, rank);
    mesh.position.set(c.x, c.y, c.z);
    if (color === 'black') mesh.rotation.y = Math.PI;
    this.group.add(mesh);
    const pm: PieceMesh = { mesh, square, color, type };
    this.pieces.set(square, pm);
    return pm;
  }

  removePiece(square: string): PieceMesh | undefined {
    const pm = this.pieces.get(square);
    if (pm) { this.group.remove(pm.mesh); this.pieces.delete(square); }
    return pm;
  }

  movePiece(from: string, to: string, animate = true): PieceMesh | undefined {
    const pm = this.pieces.get(from);
    if (!pm) return;
    this.pieces.delete(from);
    const victim = this.pieces.get(to);
    if (victim) { this.group.remove(victim.mesh); this.pieces.delete(to); }
    this.pieces.set(to, pm);
    pm.square = to;
    const file = to.charCodeAt(0) - 97;
    const rank = parseInt(to[1]) - 1;
    const c = squareCenter(file, rank);
    const target = new THREE.Vector3(c.x, c.y, c.z);
    if (!animate) { pm.mesh.position.copy(target); return pm; }
    // slide animation
    const start = pm.mesh.position.clone();
    const t0 = performance.now();
    const dur = 180;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pm.mesh.position.lerpVectors(start, target, e);
      // slight arc
      pm.mesh.position.y = start.y + Math.sin(t * Math.PI) * 0.4;
      if (t < 1) requestAnimationFrame(step);
      else pm.mesh.position.copy(target);
    };
    requestAnimationFrame(step);
    return pm;
  }

  showLegalMoves(squares: string[], captures: Set<string> = new Set()): void {
    this.clearMarkers();
    for (const sq of squares) {
      const file = sq.charCodeAt(0) - 97;
      const rank = parseInt(sq[1]) - 1;
      const c = squareCenter(file, rank);
      const isCap = captures.has(sq);
      if (isCap) {
        // sword indicator floating above the victim piece's head
        const sword = this.makeReaper();
        sword.position.set(c.x, 2.6, c.z);
        this.markerGroup.add(sword);
        this.markers.push(sword);
        // subtle red glow on the square
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.35 });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(c.x, 0.03, c.z);
        this.markerGroup.add(m);
        this.markers.push(m);
      } else {
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24);
        const mat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(c.x, 0.03, c.z);
        this.markerGroup.add(m);
        this.markers.push(m);
      }
    }
  }

  makeReaper(): THREE.Group {
    const g = new THREE.Group();
    // Reaper of death: scythe + skull
    const staffMat = new THREE.MeshBasicMaterial({ color: 0x4a3a2a });
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xc0c0c0 });
    const boneMat = new THREE.MeshBasicMaterial({ color: 0xe8e0d0 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    // staff
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), staffMat);
    staff.position.y = 0.8;
    g.add(staff);

    // curved blade (scythe) - a few boxes forming a curve
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.05), bladeMat);
      seg.position.set(0.18 + i * 0.05, 1.5 + i * 0.06, 0);
      seg.rotation.z = -0.4 - i * 0.15;
      g.add(seg);
    }

    // skull
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), boneMat);
    skull.position.set(-0.15, 1.95, 0);
    g.add(skull);
    // eye sockets
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eyeL.position.set(-0.23, 1.98, 0.16);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eyeR.position.set(-0.07, 1.98, 0.16);
    g.add(eyeR);
    // jaw
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.18), boneMat);
    jaw.position.set(-0.15, 1.78, 0);
    g.add(jaw);

    return g;
  }

  animateMarkers(): void {
    const t = performance.now() * 0.004;
    for (const m of this.markers) {
      if (m instanceof THREE.Group) {
        m.rotation.y = t;
        m.position.y = 2.6 + Math.sin(t * 2) * 0.15;
      }
    }
  }

  clearMarkers(): void {
    for (const m of this.markers) this.markerGroup.remove(m);
    this.markers = [];
  }

  getPieceAt(square: string): PieceMesh | undefined { return this.pieces.get(square); }
}