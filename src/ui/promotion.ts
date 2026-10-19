export function showPromotionPicker(_color: 'w' | 'b', onPick: (piece: string) => void): void {
  const existing = document.getElementById('promo');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'promo';
  div.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);z-index:20;';
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;gap:12px;padding:16px;background:#1a1a2e;border:2px solid #fff;';
  const pieces = ['q', 'r', 'b', 'n'];
  const labels: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  for (const p of pieces) {
    const btn = document.createElement('button');
    btn.textContent = labels[p];
    btn.style.cssText = 'padding:12px 16px;font-family:monospace;cursor:pointer;';
    btn.onclick = () => { div.remove(); onPick(p); };
    box.appendChild(btn);
  }
  div.appendChild(box);
  document.body.appendChild(div);
}