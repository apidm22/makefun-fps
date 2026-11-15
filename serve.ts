// Dev server for the Emberline game folder. Serves game/ statically with the right
// MIME types (WebGL needs .js as JavaScript). The screenshots use ?shot=<name> URLs
// (start | play | plant | end, with &seed=N for a deterministic frame); a plain URL
// opens the game directly. Usage: node serve.ts [port]
// (Requires Node 22+ for the built-in HTTP server.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'game');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    const filePath = join(ROOT, path);
    if (!filePath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

const PORT = Number(process.argv[2] ?? 8000);
server.listen(PORT, () => console.log(`Emberline dev server on http://127.0.0.1:${PORT}/`));
