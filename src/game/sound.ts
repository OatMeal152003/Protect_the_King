let ac: AudioContext | null = null;
function ctx(): AudioContext { if (!ac) ac = new AudioContext(); return ac; }

export function playBeep(freq: number, dur = 0.1, type: OscillatorType = 'square', vol = 0.05): void {
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(c.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  } catch { /* ignore */ }
}

export const SFX = {
  move: () => playBeep(440, 0.06, 'square', 0.04),
  capture: () => { playBeep(220, 0.08, 'sawtooth', 0.06); setTimeout(() => playBeep(150, 0.1, 'sawtooth', 0.05), 60); },
  check: () => playBeep(660, 0.12, 'triangle', 0.06),
  mate: () => { playBeep(330, 0.15, 'square', 0.07); setTimeout(() => playBeep(220, 0.2, 'square', 0.07), 150); },
  click: () => playBeep(800, 0.03, 'square', 0.03),
};