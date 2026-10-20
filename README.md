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

The host picks the time control (untimed, bullet, blitz, rapid, classical) and side when creating a room. The joiner takes the opposite side and receives the same clock over the join handshake, so both boards and clocks start in sync. Untimed rooms hide the clock row.

Setup:
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Enable Realtime on `rooms` and `moves` (the schema does this via `alter publication`).
4. Copy the project URL + anon key into `.env`.

## Deploy

The build is a static site in `dist/`. The Supabase variables must exist **at build time**; they are baked into the bundle.

```
npm ci
npm run build
npm run preview   # local production check
```

Use the **anon** key only. Never put a Supabase service-role key in this frontend.

### Netlify (recommended)
1. Push the repo to GitHub/GitLab, or run `npm run build` locally for a drag-and-drop deploy.
2. In Netlify: **Add new site → Import an existing project**.
3. Build command: `npm run build`; publish directory: `dist` (already set in `netlify.toml`).
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Site configuration → Environment variables**.
5. Deploy. `netlify.toml` also provides the SPA fallback redirect.

For a quick test, build locally with your `.env` present and drag the `dist/` folder into Netlify Drop.

### GitHub Pages
1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Push to `main`. `.github/workflows/deploy.yml` builds and deploys automatically.
5. Open the URL shown in the workflow's `deploy` job.

`vite.config.ts` uses `base: './'`, so the same build works at a root domain or a `/<repo>/` subpath. Board, piece, background, and Stockfish URLs are base-relative.

### Supabase
Run `supabase/schema.sql` once in the SQL Editor and keep Realtime enabled on `rooms` and `moves`. RLS is enabled, so the anon key is safe to ship. Without the env vars, online mode falls back to the same-browser `BroadcastChannel` adapter.

## Status
All 9 build steps implemented:
1. Project setup + board/pieces load
2. Pixel render pipeline (320x180, nearest-neighbor) + camera controls
3. Move input (chess.js), legal-move highlights, promotion, game-end detection
4. Stockfish AI (easy/medium/hard via UCI Skill Level + depth + blunders)
5. Timer modes (untimed, bullet, blitz, rapid, classical) + game-over screens
6. Capture cinematics (lunge/squash, hit flash, voxel burst, camera) + skip/short
7. Skin/board selection menus with large draggable 3D preview; choices persist
8. Online multiplayer (Supabase Realtime rooms, host-chosen time/side, cross-device clock and move sync; BroadcastChannel fallback)
9. Sound (procedural Web Audio), mobile touch, GitHub Pages/Netlify deploy configs

## Notes
- Assets must be placed in `public/assets/` (see Assets section).
- Stockfish wasm served from `public/stockfish/`.
- Without Supabase keys the app uses the local BroadcastChannel adapter; set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY for cross-device play.