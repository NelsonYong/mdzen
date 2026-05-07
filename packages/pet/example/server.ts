import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPet } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pet = createPet({ workspaceRoot: here });

const server = createServer(async (req, res) => {
  if (pet.matches(req)) return pet.handle(req, res);
  if (req.url === '/' || req.url === '/index.html') {
    const html = await readFile(resolve(here, 'index.html'), 'utf-8');
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html.replace('{{PET_SCRIPT}}', pet.scriptTag()));
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.listen(4000, () => console.log('http://localhost:4000'));
