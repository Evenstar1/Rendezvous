import http from 'http';
import fs from 'fs';
import path from 'path';

const server = http.createServer((req, res) => {
  const filePath = path.join(process.cwd(), 'phase0-probe.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading probe page');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(5188, () => {
  console.log('Feasibility server running at http://localhost:5188');
});
