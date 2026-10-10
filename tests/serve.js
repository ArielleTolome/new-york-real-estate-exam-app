// Minimal static server on an ephemeral port for the test scripts.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };

module.exports = function serve(url = process.argv[2]) {
  if (url) return Promise.resolve({ url, close() {} });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end();
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      // Byte ranges like nginx, so audio seeking behaves as in production.
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (!m) return res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes' }).end(buf);
      const start = m[1] === '' ? buf.length - +m[2] : +m[1];
      const end = m[1] !== '' && m[2] !== '' ? Math.min(+m[2], buf.length - 1) : buf.length - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Accept-Ranges': 'bytes' }).end(buf.subarray(start, end + 1));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () =>
    resolve({ url: `http://localhost:${server.address().port}`, close: () => server.close() })));
};
