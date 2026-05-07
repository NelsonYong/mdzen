import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

mkdirSync(resolve(root, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, 'src/client/index.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  sourcemap: false,
  outfile: resolve(root, 'dist/client.js'),
  legalComments: 'none',
});

console.log('built dist/client.js');
