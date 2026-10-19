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

## Deploy
Static site: upload `dist/` to GitHub Pages / Netlify / itch.io.
For GitHub Pages, set base path in vite.config.ts if deploying to a subpath.

## Status
Step 1 complete: project setup, board + pieces load, starting position placed.
Steps 2-9 pending (pixel pipeline, input, AI, timers, cinematics, skins UI, multiplayer, polish).