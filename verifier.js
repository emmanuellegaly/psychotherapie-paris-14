#!/usr/bin/env node
// Vérifie le site construit : démarre le serveur local (port 8080), parcourt toutes les pages, puis l'arrête.
// Contrôles : chaque page répond, liens et images internes valides, plan du site correct,
// un seul H1, titre/description/canonique/langue présents, textes alternatifs, poids des pages.
// Usage : node verifier.js      (code de sortie 1 s'il y a une erreur)
'use strict';
const fs = require('fs');
const path = require('path');
const { demarrer } = require('./servir.js');

const PORT = Number(process.env.PORT || 8080);
const BASE = `http://localhost:${PORT}`;
const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'contenu', 'site.json'), 'utf8'));
const erreurs = [], remarques = [];

const attr = (balise, nom) => (balise.match(new RegExp(`\\s${nom}="([^"]*)"`)) || [])[1];
function liensDe(html) {
  const liens = new Set();
  for (const m of html.matchAll(/<(a|link|img|script|source)\b[^>]*>/g)) {
    const b = m[0];
    for (const n of ['href', 'src']) { const v = attr(b, n); if (v) liens.add(v); }
    const srcset = attr(b, 'srcset');
    if (srcset) srcset.split(',').forEach(s => liens.add(s.trim().split(/\s+/)[0]));
  }
  return [...liens];
}
const interne = u => u.startsWith('/') && !u.startsWith('//') || u.startsWith(site.url);
const normaliser = u => u.replace(site.url, '').split('#')[0].split('?')[0] || '/';

(async () => {
  let serveur;
  try { serveur = await demarrer(PORT); }
  catch (e) { console.error(`Port ${PORT} occupé : arrêtez l'autre serveur ou lancez avec PORT=8081.`); process.exit(1); }
  const cache = new Map();
  async function obtenir(u) {
    if (!cache.has(u)) {
      const r = await fetch(BASE + u, { redirect: 'manual' });
      const corps = Buffer.from(await r.arrayBuffer());
      cache.set(u, { statut: r.status, type: r.headers.get('content-type') || '', corps, location: r.headers.get('location') });
    }
    return cache.get(u);
  }
  try {
    // 1. Plan du site
    const sm = await obtenir('/sitemap.xml');
    if (sm.statut !== 200) erreurs.push('sitemap.xml absent');
    const urlsPlan = [...sm.corps.toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    for (const u of urlsPlan) if (!u.startsWith(site.url + '/')) erreurs.push('Plan du site : adresse hors domaine ' + u);

    // 2. Parcours de toutes les pages à partir de l'accueil et du plan du site
    const aVoir = ['/', '/404.html', ...urlsPlan.map(normaliser)];
    const vues = new Set(), poids = [];
    while (aVoir.length) {
      const u = aVoir.shift();
      if (vues.has(u)) continue;
      vues.add(u);
      const r = await obtenir(u);
      if (r.statut === 301) { aVoir.push(r.location); continue; }
      if (r.statut !== 200) { erreurs.push(`${u} répond ${r.statut}`); continue; }
      if (!r.type.startsWith('text/html')) continue;
      const html = r.corps.toString();
      const estRedirection = /http-equiv="refresh"/.test(html);
      // Contrôles SEO et accessibilité
      if (!estRedirection) {
        const h1 = (html.match(/<h1[\s>]/g) || []).length;
        if (h1 !== 1) erreurs.push(`${u} : ${h1} titre(s) H1 au lieu d'un seul`);
        if (!/<html lang="fr">/.test(html)) erreurs.push(`${u} : langue fr absente`);
        if (!/<title>[^<]{10,}<\/title>/.test(html)) erreurs.push(`${u} : titre absent`);
        const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
        if (!desc) erreurs.push(`${u} : description absente`);
        else if (desc.length > 170) remarques.push(`${u} : description longue (${desc.length} caractères)`);
        const can = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
        if (!can) erreurs.push(`${u} : lien canonique absent`);
        else if (u !== '/404.html' && urlsPlan.includes(site.url + u) && can !== site.url + u) erreurs.push(`${u} : canonique inattendue ${can}`);
        if (!/og:image" content="https:\/\//.test(html)) erreurs.push(`${u} : image Open Graph absente`);
        for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) erreurs.push(`${u} : image sans attribut alt`);
        for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
          try { JSON.parse(m[1]); } catch { erreurs.push(`${u} : données structurées JSON-LD invalides`); }
        }
        if (/https?:\/\/(fonts\.googleapis|www\.google-analytics|www\.googletagmanager)/.test(html)) erreurs.push(`${u} : appel à un service tiers`);
        if (/wp-content|emmanuelle-galy-psychoth/.test(html)) erreurs.push(`${u} : reste d'adresse WordPress ou de l'ancien domaine`);
      }
      // Liens internes
      let total = r.corps.length;
      const eager = [];
      for (const l of liensDe(html)) {
        if (!interne(l)) continue;
        const cible = normaliser(l);
        const rc = await obtenir(cible);
        if (rc.statut === 301) { const rr = await obtenir(rc.location); if (rr.statut !== 200) erreurs.push(`${u} : lien cassé ${l}`); continue; }
        if (rc.statut !== 200) { erreurs.push(`${u} : lien cassé ${l} (${rc.statut})`); continue; }
        if (rc.type.startsWith('text/html')) aVoir.push(cible);
      }
      // Poids : HTML + CSS + images chargées tout de suite (src des <img> sans loading="lazy")
      for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) total += (await obtenir(normaliser(m[1]))).corps.length;
      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        if (/loading="lazy"/.test(m[0])) continue;
        const s = attr(m[0], 'src'); if (s && interne(s)) { total += (await obtenir(normaliser(s))).corps.length; eager.push(s); }
      }
      if (!estRedirection && u !== '/404.html') poids.push({ u, html: r.corps.length, total });
    }

    // 3. Toutes les pages du dossier docs/ sont-elles atteignables ?
    const fichiers = [];
    (function parcourir(d, rel) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) parcourir(path.join(d, f.name), rel + f.name + '/');
        else if (f.name === 'index.html') fichiers.push('/' + rel);
      }
    })(path.join(__dirname, 'docs'), '');
    for (const f of fichiers) if (!vues.has(f)) {
      const r = await obtenir(f);
      if (r.statut !== 200) erreurs.push(`${f} répond ${r.statut}`);
      remarques.push(`${f} : ancienne adresse conservée, non liée depuis les autres pages (voulu)`);
    }
    for (const u of urlsPlan) if ((await obtenir(normaliser(u))).statut !== 200) erreurs.push('Plan du site : ' + u + ' ne répond pas');

    // Bilan
    console.log(`Pages parcourues : ${poids.length} (+ page 404 et redirections) ; adresses dans le plan du site : ${urlsPlan.length}`);
    console.log('\nPoids par page (HTML seul / avec CSS et images affichées au chargement) :');
    for (const p of poids) console.log(`  ${p.u.padEnd(55)} ${(p.html / 1024).toFixed(1).padStart(5)} Ko / ${(p.total / 1024).toFixed(0).padStart(4)} Ko`);
    const moy = k => (poids.reduce((a, p) => a + p[k], 0) / poids.length / 1024);
    console.log(`  Moyenne : ${moy('html').toFixed(1)} Ko de HTML, ${moy('total').toFixed(0)} Ko au total au chargement.`);
    for (const r of remarques) console.log('Remarque : ' + r);
    if (erreurs.length) { console.log(`\n${erreurs.length} ERREUR(S) :`); for (const e of erreurs) console.log('  - ' + e); }
    else console.log('\nAucune erreur : toutes les pages répondent, aucun lien interne cassé, plan du site correct.');
    process.exitCode = erreurs.length ? 1 : 0;
  } finally {
    serveur.close();
  }
})();
