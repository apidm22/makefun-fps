// Emberline — a three.js tactical FPS (make.fun threejs-fps-02 entry). Node 22,
// standard library only: the game is this directory's game/ folder, plain static
// files the browser loads as ES modules with three.js from an import map, and the
// program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. Put your PNG or JPEG screenshots in screenshots/
// (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://127.0.0.1:8000/.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

const gameStats = countFiles(join(out, 'game'));
const shotStats = countFiles(join(out, 'screenshots'));
console.log(`Emberline build written to ${out}`);
console.log(`  game/: ${gameStats.files} files, ${(gameStats.bytes / 1048576).toFixed(2)} MiB`);
console.log(`  screenshots/: ${shotStats.files} files, ${(shotStats.bytes / 1024).toFixed(0)} KiB`);
console.log(`  dossier.json: ${(statSync(join(out, 'dossier.json')).size / 1024).toFixed(1)} KiB`);
