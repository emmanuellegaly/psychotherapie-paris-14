#!/usr/bin/env node
// Construit le site statique dans docs/ à partir de contenu/, gabarits/ et ressources/.
// Aucune dépendance : Node.js seul. Usage : node construire.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = __dirname;
const SORTIE = path.join(RACINE, 'docs');
const CONTENU = path.join(RACINE, 'contenu');
const GABARITS = path.join(RACINE, 'gabarits');
const RESSOURCES = path.join(RACINE, 'ressources');
const site = JSON.parse(lire(path.join(CONTENU, 'site.json')));
const avertissements = [];

function lire(f) { return fs.readFileSync(f, 'utf8'); }
function echapper(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function gabarit(nom) { return lire(path.join(GABARITS, nom)); }
// Remplace {{cle}} par vals[cle] (déjà en HTML) ; {{site.cle}} par la valeur échappée de site.json
function remplir(modele, vals) {
  return modele.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, cle) => {
    if (cle.startsWith('site.')) return echapper(site[cle.slice(5)] ?? '');
    if (cle in vals) return vals[cle];
    avertissements.push('Variable inconnue dans un gabarit : ' + cle);
    return '';
  });
}

// ---------- Lecture des sources (front matter + corps HTML ou Markdown) ----------
function lireSource(fichier) {
  const brut = lire(fichier).replace(/^\uFEFF/, '');
  const m = brut.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('Métadonnées (entre ---) absentes : ' + fichier);
  const meta = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const i = ligne.indexOf(':');
    if (i > 0 && !ligne.trimStart().startsWith('#')) meta[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  let corps = m[2];
  if (fichier.endsWith('.md')) corps = markdown(corps);
  meta.source = path.relative(RACINE, fichier);
  return { meta, corps };
}
function listerSources(dossier) {
  const d = path.join(CONTENU, dossier);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => !f.startsWith('_') && /\.(html|md)$/.test(f)).map(f => lireSource(path.join(d, f)));
}

// Markdown simple : ## titres, paragraphes, listes - et 1., > citation, **gras**, *italique*, [lien](url).
// Une ligne qui commence par < ou [[ est recopiée telle quelle (HTML ou raccourci).
function markdown(texte) {
  const enLigne = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  const blocs = texte.replace(/\r/g, '').split(/\n\s*\n/);
  return blocs.map(b => {
    b = b.trim();
    if (!b) return '';
    if (b.startsWith('<') || b.startsWith('[[')) return b;
    const h = b.match(/^(#{2,4})\s+(.*)$/);
    if (h) return `<h${h[1].length}>${enLigne(h[2])}</h${h[1].length}>`;
    const lignes = b.split('\n');
    if (lignes.every(l => /^[-*]\s+/.test(l))) return '<ul>\n' + lignes.map(l => `<li>${enLigne(l.replace(/^[-*]\s+/, ''))}</li>`).join('\n') + '\n</ul>';
    if (lignes.every(l => /^\d+\.\s+/.test(l))) return '<ol>\n' + lignes.map(l => `<li>${enLigne(l.replace(/^\d+\.\s+/, ''))}</li>`).join('\n') + '\n</ol>';
    if (lignes.every(l => l.startsWith('>'))) return '<blockquote><p>' + enLigne(lignes.map(l => l.replace(/^>\s?/, '')).join(' ')) + '</p></blockquote>';
    return '<p>' + enLigne(lignes.join('<br>\n')) + '</p>';
  }).join('\n');
}

// ---------- Images : dimensions lues dans les fichiers, variantes nom-<largeur>.<ext> ----------
const DOSSIER_IMAGES = path.join(RESSOURCES, 'images');
function dimensions(fichier) {
  const b = fs.readFileSync(fichier);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { l: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8 ') return { l: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { l: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8X') return { l: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marq = b[i + 1], long = b.readUInt16BE(i + 2);
      if (marq >= 0xc0 && marq <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marq)) return { h: b.readUInt16BE(i + 5), l: b.readUInt16BE(i + 7) };
      i += 2 + long;
    }
  }
  throw new Error('Format d\'image non reconnu : ' + fichier);
}
let catalogueImages = null;
function variantes(nom) {
  if (!catalogueImages) {
    catalogueImages = {};
    for (const f of fs.readdirSync(DOSSIER_IMAGES)) {
      const m = f.match(/^(.+)-(\d+)\.(jpg|png|webp)$/);
      if (!m) continue;
      (catalogueImages[m[1]] ||= []).push({ fichier: f, ...dimensions(path.join(DOSSIER_IMAGES, f)) });
    }
    for (const v of Object.values(catalogueImages)) v.sort((a, b) => a.l - b.l);
  }
  const v = catalogueImages[nom];
  if (!v) throw new Error('Image introuvable dans ressources/images : ' + nom);
  return v;
}
function plusGrande(nom) { const v = variantes(nom); return v[v.length - 1]; }
// Balise <img> responsive. opts : alt, tailles (attribut sizes), prioritaire (pas de chargement différé)
function balisesImage(nom, opts = {}) {
  const v = variantes(nom);
  const defaut = v.find(x => x.l >= 800) || v[v.length - 1];
  const srcset = v.length > 1 ? ` srcset="${v.map(x => `/images/${x.fichier} ${x.l}w`).join(', ')}" sizes="${echapper(opts.tailles || '(min-width: 960px) 640px, 100vw')}"` : '';
  const charge = opts.prioritaire ? ' fetchpriority="high"' : ' loading="lazy"';
  if (opts.alt === undefined) avertissements.push('Image sans texte alternatif : ' + nom);
  const classe = opts.classe ? ` class="${echapper(opts.classe)}"` : '';
  return `<img${classe} src="/images/${defaut.fichier}"${srcset} width="${defaut.l}" height="${defaut.h}" alt="${echapper(opts.alt || '')}"${charge} decoding="async">`;
}
function attributs(s) {
  const a = {};
  for (const m of s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] === undefined ? true : m[2];
  return a;
}

// ---------- Raccourcis utilisables dans les contenus ----------
// [[image nom="..." alt="..." classe="..." legende="..." tailles="..." lien="grand" prioritaire]]
// [[inclure nom-du-fragment]]   (gabarits/fragments/nom-du-fragment.html)
// [[liste-articles]]  [[articles-recents nombre="3"]]
let articles = [];
function raccourcis(html, profondeur = 0) {
  if (profondeur > 5) throw new Error('Inclusions imbriquées trop profondes');
  return html.replace(/\[\[(\w[\w-]*)([^\]]*)\]\]/g, (tout, nom, reste) => {
    const a = attributs(reste.trim());
    switch (nom) {
      case 'image': {
        let img = balisesImage(a.nom, { alt: a.alt, tailles: a.tailles, prioritaire: a.prioritaire });
        if (a.lien === 'grand') img = `<a href="/images/${plusGrande(a.nom).fichier}" class="lien-image">${img}<span class="visuellement-cache"> (agrandir la photo)</span></a>`;
        const leg = a.legende ? `<figcaption>${a.legende}</figcaption>` : '';
        return `<figure class="${echapper(a.classe || 'image')}">${img}${leg}</figure>`;
      }
      case 'img': // image seule, sans <figure> : [[img nom="..." alt="..." classe="..." tailles="..." prioritaire]]
        return balisesImage(a.nom, { alt: a.alt, tailles: a.tailles, prioritaire: a.prioritaire, classe: a.classe });
      case 'articles-accueil': return articlesAccueil(articles.slice(0, Number(a.nombre || 4)));
      case 'inclure': {
        const nomFrag = Object.keys(a)[0];
        return raccourcis(remplir(gabarit(`fragments/${nomFrag}.html`), {}), profondeur + 1);
      }
      case 'liste-articles': return listeArticles(articles, true);
      case 'articles-recents': return listeArticles(articles.slice(0, Number(a.nombre || 3)), false);
      default:
        avertissements.push('Raccourci inconnu : ' + tout);
        return tout;
    }
  });
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateLongue(iso) { const [a, m, j] = iso.split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; }
function texteSeul(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/<(h[1-6]|figure)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
// Temps de lecture : environ 200 mots par minute, arrondi à la minute supérieure
function nombreMots(html) { return texteSeul(html).split(' ').filter(Boolean).length; }
function tempsLecture(html) { return Math.max(1, Math.ceil(nombreMots(html) / 200)); }
// Articles liés : d'abord ceux qui partagent une catégorie, puis les plus récents
function articlesLies(courant, nombre = 3) {
  const cats = (courant.meta.categories || '').split(',').map(c => c.trim()).filter(Boolean);
  const communs = a => (a.meta.categories || '').split(',').map(c => c.trim()).filter(c => cats.includes(c)).length;
  return articles.filter(a => a.meta.chemin !== courant.meta.chemin)
    .map((a, i) => ({ a, score: communs(a) * 100 - i }))
    .sort((x, y) => y.score - x.score).slice(0, nombre).map(x => x.a);
}
function extrait(a) {
  if (a.meta.extrait) return a.meta.extrait;
  const mots = texteSeul(a.corps).split(' ');
  return mots.slice(0, 32).join(' ') + (mots.length > 32 ? '…' : '');
}
// Article épinglé (champ « epingle: oui ») : toujours en tête des listes, avec la mention « À lire en premier »
function estEpingle(a) { return a.meta.epingle === 'oui' ? 1 : 0; }
const MENTION_EPINGLE = '<span class="badge-epingle">À lire en premier</span>';
function listeArticles(liste, avecExtrait) {
  return '<ul class="liste-articles">\n' + liste.map(a => {
    const img = a.meta.image ? balisesImage(a.meta.image, { alt: '', tailles: '(min-width: 700px) 240px, 100vw' }) : '';
    return `<li class="carte-article${estEpingle(a) ? ' carte-article--epingle' : ''}">
  ${img ? `<div class="carte-article__image">${img}</div>` : ''}
  <div class="carte-article__texte">
    <p class="carte-article__meta">${estEpingle(a) ? MENTION_EPINGLE : ''}<time datetime="${a.meta.date}">${dateLongue(a.meta.date)}</time>${a.meta.categories ? ' · ' + echapper(a.meta.categories) : ''}</p>
    <h3 class="carte-article__titre"><a href="${a.meta.chemin}">${echapper(a.meta.titre)}</a></h3>
    ${avecExtrait ? `<p>${echapper(extrait(a))}</p>` : ''}
  </div>
</li>`;
  }).join('\n') + '\n</ul>';
}

// Liste des derniers articles sur l'accueil (le plus récent mis en avant) : fonctionne avec 4 comme avec 40 articles.
function articlesAccueil(liste) {
  return '<ol class="articles apparait">\n' + liste.map((a, i) => {
    const cat = (a.meta.categories || '').split(',')[0].trim();
    return `<li class="article${i === 0 ? ' article-une' : ''}">
  <p class="article-meta">${estEpingle(a) ? MENTION_EPINGLE : ''}<time datetime="${a.meta.date}">${dateLongue(a.meta.date)}</time>${cat ? ' · ' + echapper(cat) : ''}</p>
  <h3><a href="${a.meta.chemin}">${echapper(a.meta.titre)}</a></h3>
  <p>${echapper(a.meta.extrait || a.meta.description || extrait(a))}</p>
</li>`;
  }).join('\n') + '\n</ol>';
}

// ---------- Morceaux communs ----------
function menuHtml(cheminCourant) {
  return site.menu.map(e => {
    const actif = e.chemin === cheminCourant || (e.chemin === '/blog/' && cheminCourant.startsWith('/articles/'));
    return `        <li><a href="${e.chemin}"${actif ? ' aria-current="page"' : ''}>${echapper(e.titre)}</a></li>`;
  }).join('\n');
}
function filAriane(elements) {
  if (!elements.length) return { html: '', jsonld: null };
  const tous = [{ titre: 'Accueil', chemin: '/' }, ...elements];
  const html = '<nav class="fil-ariane" aria-label="Fil d’Ariane"><ol>' + tous.map((e, i) => i === tous.length - 1
    ? `<li><span aria-current="page">${echapper(e.titre)}</span></li>`
    : `<li><a href="${e.chemin}">${echapper(e.titre)}</a></li>`).join('') + '</ol></nav>';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: tous.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.titre, item: site.url + e.chemin })),
  };
  return { html, jsonld };
}
function scriptJsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

// ---------- Construction d'une page ----------
let versionCss = '', versionAccueil = '', versionJs = '';
// Ouverture animée (respiration) de l'accueil : seulement si le mouvement est accepté, WebGL présent et l'onglet visible.
// Filet de sécurité par minuterie (indépendant de l'affichage) : quoi qu'il arrive, la photo est là après 4,5 s.
const SCRIPT_INTRO = `<script>
(function (d, w) {
  var h = d.documentElement;
  h.classList.add('js');
  try {
    if (!w.matchMedia('(prefers-reduced-motion: reduce)').matches && 'WebGLRenderingContext' in w && !d.hidden) {
      h.classList.add('intro');
      var finir = function () {
        if (h.classList.contains('intro')) { h.classList.remove('intro'); h.classList.add('intro-finie', 'porte-ouverte'); }
      };
      w.setTimeout(function () { if (!h.classList.contains('webgl-pret')) finir(); }, 2500);
      w.setTimeout(finir, 4500);
      d.addEventListener('visibilitychange', function () { if (d.hidden) finir(); });
    }
  } catch (e) {}
})(document, window);
</script>
`;
function construirePage(src, type) {
  const m = src.meta;
  for (const ch of ['titre', 'chemin']) if (!m[ch]) throw new Error(`Champ « ${ch} » manquant : ${m.source}`);
  const g = m.gabarit || (type === 'article' ? 'article' : 'page');
  const canonique = site.url + (m.canonique || m.chemin).replace(/^https?:\/\/[^/]+/, '');
  const titreSeo = m.titre_seo || `${m.titre} | ${site.nom}`;
  const description = m.description || extrait(src);
  if (!m.description) avertissements.push('Pas de description SEO : ' + m.source);

  // Fil d'Ariane
  let ariane = [];
  if (g === 'article') ariane = [{ titre: 'Blog', chemin: '/blog/' }, { titre: m.titre, chemin: m.chemin }];
  else if (m.chemin !== '/' && g !== 'erreur') ariane = [{ titre: m.titre_court || m.titre, chemin: m.chemin }];
  const fil = filAriane(ariane);

  const corps = raccourcis(remplir(src.corps, {}));
  let principal;
  if (g === 'accueil' || g === 'erreur') {
    principal = corps;
  } else if (g === 'libre') {
    // Page composée librement (titre h1 écrit dans le contenu) : conteneur large du site + fil d'Ariane, sans colonne de lecture
    principal = `<div class="page enveloppe page--libre${m.format ? ' page--' + echapper(m.format) : ''}">\n  ${fil.html}\n${corps}\n</div>`;
  } else {
    const minutes = tempsLecture(corps);
    const enTeteArticle = g === 'article'
      ? `<p class="page-entete__meta">Publié le <time datetime="${m.date}">${dateLongue(m.date)}</time>${m.categories ? ' · ' + echapper(m.categories) : ''} · Lecture : ${minutes} min</p>` : '';
    const lies = g === 'article' ? articlesLies(src) : [];
    const blocLies = lies.length
      ? `<section class="articles-lies" aria-labelledby="t-articles-lies">\n<h2 class="articles-lies__titre" id="t-articles-lies">À lire aussi</h2>\n${listeArticles(lies, false)}\n</section>` : '';
    const chapo = m.chapo ? `<p class="page-entete__chapo">${m.chapo}</p>` : '';
    const imageUne = m.image && g === 'article'
      ? `<figure class="image-une">${balisesImage(m.image, { alt: m.image_alt, prioritaire: true, tailles: '(min-width: 960px) 680px, 100vw' })}</figure>` : '';
    const lateral = m.barre_laterale === 'non' ? '' : raccourcis(remplir(gabarit(m.barre_laterale === 'sans-portrait' ? 'fragments/barre-laterale-sans-portrait.html' : 'fragments/barre-laterale.html'), {}));
    principal = remplir(gabarit('page.html'), {
      fil_ariane: fil.html, titre: echapper(m.titre), meta_article: enTeteArticle, chapo, image_une: imageUne,
      contenu: corps, barre_laterale: lateral, classe: (lateral ? 'avec-barre' : 'sans-barre') + (g === 'article' ? ' page--article' : '') + (m.format ? ' page--' + echapper(m.format) : ''),
      classe_texte: g === 'article' && !m.chapo ? ' texte--chapo-auto' : '',
      suite: g === 'article' ? raccourcis(remplir(gabarit('fragments/apres-article.html'), {})) + '\n' + blocLies : '',
    });
  }

  // Données structurées
  const jsonld = [site.jsonld];
  if (fil.jsonld) jsonld.push(fil.jsonld);
  if (g === 'accueil') jsonld.push({
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': site.url + '/#site', url: site.url + '/',
    name: site.nom_site, inLanguage: 'fr-FR', publisher: { '@id': site.url + '/#emmanuelle-galy' },
  });
  if (g === 'article') {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: m.titre, description,
      datePublished: m.date, dateModified: m.modifie || m.date, inLanguage: 'fr-FR', mainEntityOfPage: canonique,
      image: m.image ? site.url + '/images/' + plusGrande(m.image).fichier : undefined,
      articleSection: m.categories ? m.categories.split(',')[0].trim() : undefined,
      wordCount: nombreMots(src.corps), timeRequired: 'PT' + tempsLecture(src.corps) + 'M',
      author: { '@id': site.url + '/#emmanuelle-galy' }, publisher: { '@id': site.url + '/#cabinet' },
    });
  }
  const imagePartage = m.image_partage || (m.image && g === 'article' ? plusGrande(m.image).fichier : site.image_partage);
  const altPartage = m.image_partage_alt || (m.image && g === 'article' ? m.image_alt : site.image_partage_alt);
  const dimPartage = dimensions(path.join(DOSSIER_IMAGES, imagePartage));

  const html = remplir(gabarit('base.html'), {
    titre_seo: echapper(titreSeo), description: echapper(description), canonique: echapper(canonique),
    robots: m.robots ? `<meta name="robots" content="${echapper(m.robots)}">\n` : '',
    og_type: g === 'article' ? 'article' : 'website', og_titre: echapper(m.titre_og || titreSeo),
    og_image: `${site.url}/images/${imagePartage}`, og_image_l: String(dimPartage.l), og_image_h: String(dimPartage.h),
    og_image_alt: echapper(altPartage),
    og_article: g === 'article' ? `<meta property="article:published_time" content="${m.date}">\n<meta property="article:modified_time" content="${m.modifie || m.date}">\n` : '',
    jsonld: jsonld.map(scriptJsonLd).join('\n'),
    version_css: versionCss, version_js: versionJs,
    tete_page: g === 'accueil'
      ? `<link rel="stylesheet" href="/css/accueil.css?v=${versionAccueil}">\n${SCRIPT_INTRO}<script type="module" src="/js/seuil.js?v=${versionJs}"></script>\n` : '',
    classe_corps: g === 'accueil' ? 'page-accueil' : 'page-interieure',
    entete: remplir(gabarit('entete.html'), { menu: menuHtml(m.chemin) }),
    principal,
    pied: raccourcis(remplir(gabarit('pied.html'), {
      annee: String(new Date().getFullYear()),
      liens_pied_1: liensPied(0), liens_pied_2: liensPied(1),
    })),
  });
  ecrireSortie(m.fichier_sortie || path.join(m.chemin, 'index.html'), html);
  return { chemin: m.chemin, modifie: m.modifie || m.date, sitemap: m.sitemap !== 'non' && g !== 'erreur' && !m.canonique && !m.robots, poids: Buffer.byteLength(html) };
}

function liensPied(colonne) {
  const moitie = Math.ceil(site.liens_pied.length / 2);
  const liste = colonne === 0 ? site.liens_pied.slice(0, moitie) : site.liens_pied.slice(moitie);
  return liste.map(e => `        <li${e.discret ? ' class="pied-discret"' : ''}><a href="${e.chemin}">${echapper(e.titre)}</a></li>`).join('\n');
}

function pageRedirection(de, vers) {
  const cible = site.url + vers;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Page déplacée</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${cible}">
<meta http-equiv="refresh" content="0; url=${vers}">
</head>
<body>
<p>Cette page a été déplacée : <a href="${vers}">${cible}</a></p>
</body>
</html>
`;
  ecrireSortie(path.join(de, 'index.html'), html);
}

function ecrireSortie(rel, contenu) {
  const f = path.join(SORTIE, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // Le site publié ne garde aucun commentaire HTML (notes de travail des sources) : seul le texte des pages est public.
  if (rel.endsWith('.html')) {
    contenu = contenu.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  }
  fs.writeFileSync(f, contenu);
}
function copierDossier(de, vers) {
  fs.mkdirSync(vers, { recursive: true });
  for (const f of fs.readdirSync(de, { withFileTypes: true })) {
    if (f.name.startsWith('.') || f.name.startsWith('_')) continue;
    if (f.isDirectory()) copierDossier(path.join(de, f.name), path.join(vers, f.name));
    else fs.copyFileSync(path.join(de, f.name), path.join(vers, f.name));
  }
}

// ---------- Programme principal ----------
function construire() {
  fs.rmSync(SORTIE, { recursive: true, force: true });
  fs.mkdirSync(SORTIE, { recursive: true });

  // Feuille de style : thème (couleurs, polices) + mise en page, réunis en un seul fichier
  const css = ['theme.css', 'site.css'].map(f => lire(path.join(RESSOURCES, 'css', f))).join('\n');
  versionCss = crypto.createHash('sha1').update(css).digest('hex').slice(0, 8);
  ecrireSortie('css/site.css', css);
  const cssAccueil = lire(path.join(RESSOURCES, 'css', 'accueil.css'));
  versionAccueil = crypto.createHash('sha1').update(cssAccueil).digest('hex').slice(0, 8);
  ecrireSortie('css/accueil.css', cssAccueil);
  // Scripts (menu, apparitions, ouverture animée + Three.js) et polices auto-hébergées
  copierDossier(path.join(RESSOURCES, 'js'), path.join(SORTIE, 'js'));
  versionJs = crypto.createHash('sha1').update(fs.readdirSync(path.join(RESSOURCES, 'js')).sort()
    .map(f => lire(path.join(RESSOURCES, 'js', f))).join('')).digest('hex').slice(0, 8);
  copierDossier(path.join(RESSOURCES, 'polices'), path.join(SORTIE, 'fonts'));
  copierDossier(DOSSIER_IMAGES, path.join(SORTIE, 'images'));
  copierDossier(path.join(RESSOURCES, 'racine'), SORTIE);

  articles = listerSources('articles').filter(a => a.meta.statut !== 'brouillon')
    .sort((a, b) => (estEpingle(b) - estEpingle(a)) || b.meta.date.localeCompare(a.meta.date) || Number(b.meta.ordre || 0) - Number(a.meta.ordre || 0));  // épinglé d abord  // ordre : départage deux articles du même jour (le plus grand en premier)
  const pages = listerSources('pages').filter(p => p.meta.statut !== 'brouillon');

  const resultats = [];
  for (const p of pages) resultats.push(construirePage(p, 'page'));
  for (const a of articles) resultats.push(construirePage(a, 'article'));
  const chemins = new Set();
  for (const r of resultats) { if (chemins.has(r.chemin)) throw new Error('Adresse en double : ' + r.chemin); chemins.add(r.chemin); }

  const redirections = JSON.parse(lire(path.join(CONTENU, 'redirections.json')));
  for (const r of redirections) pageRedirection(r.de, r.vers);

  // Plan du site, robots.txt, CNAME
  const urls = resultats.filter(r => r.sitemap).sort((a, b) => a.chemin.localeCompare(b.chemin));
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${site.url}${u.chemin}</loc>${u.modifie ? `<lastmod>${u.modifie}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
  ecrireSortie('sitemap.xml', sitemap);
  ecrireSortie('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
  ecrireSortie('CNAME', new URL(site.url).hostname + '\n');
  ecrireSortie('.nojekyll', '');

  const poids = resultats.filter(r => !r.chemin.endsWith('.html')).map(r => r.poids);
  console.log(`Site construit dans docs/ : ${resultats.length} pages, ${redirections.length} redirection(s), ${urls.length} adresses dans le plan du site.`);
  console.log(`Poids HTML moyen : ${(poids.reduce((a, b) => a + b, 0) / poids.length / 1024).toFixed(1)} Ko ; feuille de style : ${(Buffer.byteLength(css) / 1024).toFixed(1)} Ko.`);
  for (const a of new Set(avertissements)) console.warn('Attention : ' + a);
}

construire();
