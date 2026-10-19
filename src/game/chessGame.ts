import { Chess } from 'chess.js';

export type Color = 'w' | 'b';

export class ChessGame {
  chess = new Chess();
  reset(): void { this.chess.reset(); }
  load(fen: string): void { this.chess.load(fen); }
  fen(): string { return this.chess.fen(); }
  turn(): Color { return this.chess.turn(); }
  moves(from?: string): any[] { return this.chess.moves({ square: from as any, verbose: true }); }
  move(from: string, to: string, promotion?: string): any | null {
    try { return this.chess.move({ from, to, promotion }); } catch { return null; }
  }
  undo(): void { this.chess.undo(); }
  history(): string[] { return this.chess.history(); }
  isGameOver(): boolean { return this.chess.isGameOver(); }
  isCheck(): boolean { return this.chess.isCheck(); }
  isCheckmate(): boolean { return this.chess.isCheckmate(); }
  isStalemate(): boolean { return this.chess.isStalemate(); }
  isDraw(): boolean { return this.chess.isDraw(); }
  result(): '1-0' | '0-1' | '1/2-1/2' | '*' {
    if (this.chess.isCheckmate()) return this.turn() === 'w' ? '0-1' : '1-0';
    if (this.chess.isDraw() || this.chess.isStalemate()) return '1/2-1/2';
    return '*';
  }
  captured(): { w: string[]; b: string[] } {
    // derive from history not trivial; return empty placeholder, filled by caller tracking
    return { w: [], b: [] };
  }
}