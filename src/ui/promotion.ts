export function showPromotionPicker(_color: 'w' | 'b', onPick: (piece: string) => void): void {
  const existing = document.getElementById('promo');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'promo';
  div.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(18,20,22,0.6),rgba(18,20,22,0.92));z-index:20;animation:fadeIn 0.25s ease-out both;';
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:24px 30px;background:linear-gradient(180deg,rgba(57,49,44,0.95),rgba(28,27,25,0.95));border:3px solid #C89B42;border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,0.7);';
  const title = document.createElement('div');
  title.textContent = 'PROMOTE TO';
  title.style.cssText = "font-family:'Cinzel Decorative',serif;font-size:1.2rem;color:#C89B42;letter-spacing:3px;text-align:center;border-bottom:1px solid rgba(200,155,66,0.4);padding-bottom:8px;";
  box.appendChild(title);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;';
  const pieces = ['q', 'r', 'b', 'n'];
  const labels: Record<string, string> = { q: 'QUEEN', r: 'ROOK', b: 'BISHOP', n: 'KNIGHT' };
  const glyphs: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞' };
  for (const p of pieces) {
    const btn = document.createElement('button');
    btn.innerHTML = `<div style="font-size:2rem;line-height:1;">${glyphs[p]}</div><div style="font-size:0.75rem;letter-spacing:2px;margin-top:4px;">${labels[p]}</div>`;
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 16px;min-width:78px;background:linear-gradient(180deg,#65452C,#39312C);border:2px solid #C89B42;color:#F2E9D5;font-family:"Jersey 10",monospace;cursor:pointer;transition:all 0.12s;';
    btn.onmouseenter = () => { btn.style.background = 'linear-gradient(180deg,#B52E32,#8E1F22)'; btn.style.transform = 'translateY(-2px)'; };
    btn.onmouseleave = () => { btn.style.background = 'linear-gradient(180deg,#65452C,#39312C)'; btn.style.transform = 'none'; };
    btn.onclick = () => { div.remove(); onPick(p); };
    row.appendChild(btn);
  }
  box.appendChild(row);
  div.appendChild(box);
  document.body.appendChild(div);
}