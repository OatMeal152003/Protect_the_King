// Skin configuration: maps a skin name to its asset paths, effect colors, and background.
// Do not hard-code skins elsewhere; import from here.

export interface SkinConfig {
  name: string;
  pieceBase: string; // folder containing white_*.glb / black_*.glb
  boardPath: string;
  effectColor: number;
  backgroundColor: number;
}

const BASE = `${import.meta.env.BASE_URL}assets`;

export const SKINS: Record<string, SkinConfig> = {
  classic: {
    name: 'classic',
    pieceBase: `${BASE}/models/classic`,
    boardPath: `${BASE}/boards/classic_board.glb`,
    effectColor: 0xffd700,
    backgroundColor: 0x1a1a2e,
  },
  medieval: {
    name: 'medieval',
    pieceBase: `${BASE}/models/medieval`,
    boardPath: `${BASE}/boards/medieval_board.glb`,
    effectColor: 0xff6b35,
    backgroundColor: 0x1e1208,
  },
  samurai: {
    name: 'samurai',
    pieceBase: `${BASE}/models/samurai`,
    boardPath: `${BASE}/boards/samurai_board.glb`,
    effectColor: 0xff4d6d,
    backgroundColor: 0x0d0d14,
  },
  undead: {
    name: 'undead',
    pieceBase: `${BASE}/models/undead`,
    boardPath: `${BASE}/boards/undead_board.glb`,
    effectColor: 0x39ff14,
    backgroundColor: 0x0a140a,
  },
};

export const SKIN_NAMES = Object.keys(SKINS) as (keyof typeof SKINS)[];

export const PIECE_TYPES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
export type PieceType = (typeof PIECE_TYPES)[number];
export type PieceColor = 'white' | 'black';

export function piecePath(skin: string, color: PieceColor, type: PieceType): string {
  return `${SKINS[skin].pieceBase}/${color}_${type}.glb`;
}