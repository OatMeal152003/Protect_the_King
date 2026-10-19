# Pixel Chess Assets

48 voxel chess pieces (4 skins x 6 pieces x white/black) and 4 battlefield boards.

- `models/<skin>/<white|black>_<piece>.glb` - ready-to-use 3D models (glTF binary, vertex colors, no textures).
  Skins: classic, medieval, samurai, undead. Pieces: king, queen, rook, bishop, knight, pawn.
  Each model is centered on x/z with its base at y=0. One voxel = 0.1 units, so a piece is about 1.3 to 2.3 units tall.
  White faces +Z, black faces -Z (the knight's head points that way).
- `voxels.json` - the raw voxel data ([x, y, z, tag]) and skin colors, for engines or tools that want to build their own meshes.
- `chess-voxel-pieces.js` - the piece builders and skin palettes (ES module). `node gen.mjs` regenerates every .glb.

## Three.js example
```js
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
new GLTFLoader().load('models/medieval/white_knight.glb', g => {
  g.scene.traverse(o => { if (o.isMesh) o.material.vertexColors = true; });
  scene.add(g.scene);
});
```
For the pixel look, render to a small canvas (about 320x180) and scale it up with `image-rendering: pixelated`.
Godot and Unity also import .glb directly; turn on vertex colors in the material if your engine doesn't pick them up.

## Boards
- `boards/<skin>_board.glb` - one board per skin (classic, medieval, samurai, undead): 8x8 squares, a raised border, corner towers or props, and a ground arena around it. About 14 x 14 units wide.
- `chess-voxel-boards.js` - the board builder; `node gen-boards.mjs` regenerates the files.
- Squares are 1.4 units wide. The center of square (file i, rank j), with i and j from 0 to 7, is at `x = -4.95 + 1.4*i`, `y = 0`, `z = -4.95 + 1.4*j`. Put a piece's origin there.
- a1 (i=0, j=0) is a dark square. White starts on ranks j=0 and j=1 (negative z) and faces +Z; black starts on j=6 and j=7.
- Boards are large meshes (about 12 MB each), because every voxel face is kept. If you need them lighter, ask for a merged-face version.
