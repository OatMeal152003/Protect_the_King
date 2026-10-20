export type Difficulty = 'easy' | 'medium' | 'hard';

export interface MoveResult { from: string; to: string; promotion?: string; }

const PRESETS: Record<Difficulty, { skill: number; depth: number; blunder: number }> = {
  easy: { skill: 2, depth: 2, blunder: 0.25 },
  medium: { skill: 10, depth: 5, blunder: 0 },
  hard: { skill: 20, depth: 14, blunder: 0 },
};

export class AI {
  worker: Worker;
  private listeners: ((line: string) => void)[] = [];
  private readyPromise: Promise<void>;

  constructor() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`);
    this.readyPromise = new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : e.data?.data ?? String(e.data);
        if (line.includes('uciok')) { resolve(); }
        this.listeners.forEach((l) => l(line));
      };
      this.worker.onmessage = handler;
      this.worker.postMessage('uci');
    });
  }

  async init(): Promise<void> { await this.readyPromise; this.worker.postMessage('isready'); }

  async bestMove(fen: string, difficulty: Difficulty, legalMoves: string[]): Promise<MoveResult | null> {
    await this.readyPromise;
    const preset = PRESETS[difficulty];
    if (preset.blunder > 0 && Math.random() < preset.blunder && legalMoves.length) {
      const r = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return parseUci(r);
    }
    this.worker.postMessage(`setoption name Skill Level value ${preset.skill}`);
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${preset.depth}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.worker.removeEventListener('message', wrap as any);
        resolve(null);
      }, 15000);
      const handler = (line: string) => {
        if (line.startsWith('bestmove')) {
          clearTimeout(timeout);
          this.worker.removeEventListener('message', wrap as any);
          const parts = line.split(/\s+/);
          const uci = parts[1];
          if (!uci || uci === '(none)') { resolve(null); return; }
          resolve(parseUci(uci));
        }
      };
      const wrap = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data);
        handler(line);
      };
      this.worker.addEventListener('message', wrap);
    });
  }

  terminate(): void { this.worker.terminate(); }
}

function parseUci(uci: string): MoveResult {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}