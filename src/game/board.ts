// Board geometry helpers. 1 voxel = 0.1 units, square = 1.4 units.
export const SQUARE = 1.4;
export const BOARD_HALF = 4.95; // so square centers run -4.95 + 1.4*i

export function squareCenter(i: number, j: number): { x: number; y: number; z: number } {
  return { x: -BOARD_HALF + SQUARE * i, y: 0, z: -BOARD_HALF + SQUARE * j };
}

// a1 (i=0,j=0) is dark. Color of square (i,j): (i+j) even => dark? spec says a1 dark.
export function isDarkSquare(i: number, j: number): boolean {
  return (i + j) % 2 === 0;
}

// Starting position as FEN-ish piece list: [color, type, i, j]
export interface StartPiece { color: 'white' | 'black'; type: string; i: number; j: number; }
export function startPosition(): StartPiece[] {
  const out: StartPiece[] = [];
  const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let i = 0; i < 8; i++) {
    out.push({ color: 'white', type: 'pawn', i, j: 1 });
    out.push({ color: 'black', type: 'pawn', i, j: 6 });
    out.push({ color: 'white', type: back[i], i, j: 0 });
    out.push({ color: 'black', type: back[i], i, j: 7 });
  }
  return out;
}