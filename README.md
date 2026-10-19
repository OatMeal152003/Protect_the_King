# Protect the King

Pixelated 3D browser chess game. Three.js + Vite + TypeScript + chess.js + Stockfish WASM.

## Stack
- three, chess.js, gsap, @supabase/supabase-js, stockfish
- Dev: vite, typescript, @types/three
- Sauron AI harness (`.opencode/skills/`, `sauron.config.yaml`)

## Run
```
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc && vite build -> dist/
npm run preview  # preview production build
```

## Assets
Unzip the asset pack into `public/assets/` so it is served at `/assets/`.
Expected: `public/assets/models/<skin>/<color>_<piece>.glb`, `public/assets/boards/<skin>_board.glb`.

## Online multiplayer (Supabase)

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (in `.env` for dev, or in your host's env vars for prod) to enable real cross-device multiplayer. Without them, the app falls back to `LocalAdapter` (same-browser only).

Setup:
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Enable Realtime on `rooms` and `moves` (the schema does this via `alter publication`).
4. Copy the project URL + anon key into `.env`.

## Deploy notes
- For GitHub Pages, set `base` in `vite.config.ts` to your repo subpath (e.g. `/protect-the-king/`) and add the env vars as repo secrets injected at build time.

## Status
All 9 build steps implemented:
1. Project setup + board/pieces load
2. Pixel render pipeline (320x180, nearest-neighbor) + camera controls
3. Move input (chess.js), legal-move highlights, promotion, game-end detection
4. Stockfish AI (easy/medium/hard via UCI Skill Level + depth + blunders)
5. Timer modes (Blitz 3+2, Rapid 10+0, custom) + game-over screens
6. Capture cinematics (lunge/squash, hit flash, voxel burst, camera) + skip/short
7. Skin/board selection menus (live preview omitted; dropdowns persist)
8. Online multiplayer adapter (room codes via BroadcastChannel; Supabase swap-in ready)
9. Sound (procedural Web Audio), mobile touch, GitHub Pages/Netlify deploy configs

## Notes
- Assets must be placed in `public/assets/` (see Assets section).
- Stockfish wasm served from `public/stockfish/`.
- Multiplayer defaults to local BroadcastChannel adapter; set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY and implement SupabaseAdapter for production.