/// <reference lib="webworker" />

let engine: any = null;
let base = '/';

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'init') {
    base = msg.base || '/';
    try {
      const res = await fetch(base + 'stockfish/stockfish-19-lite-single.js');
      const code = await res.text();
      // eslint-disable-next-line no-eval
      (0, eval)(code);
      engine = (self as any).Stockfish();
      engine.onmessage = (line: string) => self.postMessage({ type: 'line', line });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  } else if (msg.type === 'cmd' && engine) {
    engine.postMessage(msg.cmd);
  }
};