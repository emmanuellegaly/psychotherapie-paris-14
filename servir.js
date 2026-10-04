#!/usr/bin/env node
// Petit serveur local pour prévisualiser docs/ comme le fera GitHub Pages.
// Usage : node servir.js   puis ouvrir http://localhost:8080   (Ctrl+C pour arrêter)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, 'docs');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

function repondre(req, res) {
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Requête invalide'); }
  const fichier = path.normalize(path.join(DOCS, chemin));
  if (!fichier.startsWith(DOCS)) { res.writeHead(403); return res.end('Interdit'); }
  let cible = fichier;
  if (fs.existsSync(cible) && fs.statSync(cible).isDirectory()) {
    if (!chemin.endsWith('/')) { res.writeHead(301, { Location: chemin + '/' }); return res.end(); } // comme GitHub Pages
    cible = path.join(cible, 'index.html');
  }
  if (!fs.existsSync(cible)) {
    const page404 = path.join(DOCS, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(fs.existsSync(page404) ? fs.readFileSync(page404) : 'Page introuvable');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(cible).pipe(res);
}

function demarrer(port = 8080) {
  return new Promise((ok, erreur) => {
    const serveur = http.createServer(repondre);
    serveur.once('error', erreur);
    serveur.listen(port, '127.0.0.1', () => ok(serveur));
  });
}

module.exports = { demarrer };

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  demarrer(port).then(() => console.log(`Prévisualisation : http://localhost:${port}  (Ctrl+C pour arrêter)`))
    .catch(e => { console.error('Impossible de démarrer le serveur : ' + e.message); process.exit(1); });
}
