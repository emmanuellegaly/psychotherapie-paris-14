/* Script commun à toutes les pages (repris de l'accueil A1 et complété) :
   menu sur téléphone, barre de prise de rendez-vous fixée au défilement, carte Google chargée au clic,
   vérification du formulaire de contact, apparitions douces. Sans JavaScript, tout reste utilisable. */
(function () {
  'use strict';

  // ---- Menu sur téléphone ----
  var bouton = document.querySelector('.menu-bouton');
  var nav = document.getElementById('navigation');
  if (bouton && nav) {
    bouton.addEventListener('click', function () {
      var ouvert = bouton.getAttribute('aria-expanded') === 'true';
      bouton.setAttribute('aria-expanded', String(!ouvert));
      bouton.textContent = ouvert ? 'Menu' : 'Fermer';
      nav.classList.toggle('est-ouverte', !ouvert);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bouton.getAttribute('aria-expanded') === 'true') { bouton.click(); bouton.focus(); }
    });
  }

  // ---- Barre de prise de rendez-vous : visible une fois le premier écran (accueil) ou l'en-tête (autres pages) dépassé ----
  var barre = document.getElementById('barre-rdv');
  var repere = document.querySelector('.seuil') || document.querySelector('.entete');
  if (barre && repere) {
    barre.hidden = false;
    var visible = null;
    var verifierBarre = function () {
      var v = repere.getBoundingClientRect().bottom < 0;
      if (v === visible) return;
      visible = v;
      barre.classList.toggle('est-visible', v);
      if (v) barre.removeAttribute('inert'); else barre.setAttribute('inert', '');
    };
    window.addEventListener('scroll', verifierBarre, { passive: true });
    window.addEventListener('resize', verifierBarre, { passive: true });
    verifierBarre();
  }

  // ---- Carte du cabinet : chargée seulement à la demande (contenu Google) ----
  document.querySelectorAll('[data-carte]').forEach(function (carte) {
    var boutonCarte = carte.querySelector('.carte-bouton');
    if (!boutonCarte) return;
    boutonCarte.hidden = false;
    boutonCarte.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = carte.getAttribute('data-carte') || 'https://www.google.com/maps?q=32+rue+R%C3%A9my+Dumoncel,+75014+Paris&output=embed';
      f.title = "Plan d'accès au cabinet, 32 rue Rémy Dumoncel, Paris 14e";
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      f.setAttribute('allowfullscreen', '');
      var apercu = carte.querySelector('.carte-apercu');
      if (apercu) apercu.remove();
      carte.appendChild(f);
      f.focus();
    });
  });

  // ---- Formulaire : messages d'erreur clairs sous chaque champ ----
  document.querySelectorAll('form[data-validation]').forEach(function (form) {
    var champs = form.querySelectorAll('[data-erreur]');
    form.setAttribute('novalidate', '');
    var verifier = function (champ) {
      var message = document.getElementById(champ.id + '-erreur');
      var valide = champ.checkValidity();
      if (message) { message.hidden = valide; message.textContent = valide ? '' : champ.getAttribute('data-erreur'); }
      if (valide) champ.removeAttribute('aria-invalid'); else champ.setAttribute('aria-invalid', 'true');
      return valide;
    };
    form.addEventListener('submit', function (e) {
      var premier = null;
      champs.forEach(function (c) { if (!verifier(c) && !premier) premier = c; });
      if (premier) { e.preventDefault(); premier.focus(); }
    });
    champs.forEach(function (c) {
      c.addEventListener('blur', function () { if (c.value) verifier(c); });
      c.addEventListener('input', function () { if (c.getAttribute('aria-invalid') === 'true') verifier(c); });
    });
  });

  // ---- Apparitions douces au défilement ----
  var elements = document.querySelectorAll('.apparait');
  if (!elements.length) return;
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduit || !('IntersectionObserver' in window)) {
    elements.forEach(function (el) { el.classList.add('est-visible'); });
    return;
  }
  var obs = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('est-visible'); obs.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  elements.forEach(function (el) { obs.observe(el); });
})();

// ---- Carrousel des trajets à pied (section Venir) ----
document.querySelectorAll('.trajets').forEach(function (bloc) {
  var piste = bloc.querySelector('.trajets-piste');
  var diapos = Array.prototype.slice.call(bloc.querySelectorAll('.trajet'));
  var onglets = Array.prototype.slice.call(bloc.querySelectorAll('.trajets-points button'));
  if (!piste || !diapos.length) return;
  function courant() { return Math.round(piste.scrollLeft / piste.clientWidth); }
  var cible = null;
  function aller(i) {
    i = (i + diapos.length) % diapos.length;
    cible = i; marquer(i);
    piste.scrollTo({ left: i * piste.clientWidth });
  }
  // la liste des stations (à gauche) suit le carrousel et le pilote
  var section = bloc.closest('section, .venir, .contact-grille, main') || document;
  var choix = Array.prototype.slice.call(section.querySelectorAll('.acces-choix'));
  function marquer(i) {
    onglets.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    choix.forEach(function (b, k) { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
  }
  function maj() {
    var i = courant();
    if (cible !== null) { if (i !== cible) return; cible = null; }
    onglets.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    choix.forEach(function (b, k) { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
  }
  choix.forEach(function (b) {
    b.addEventListener('click', function () { aller(Number(b.getAttribute('data-trajet'))); });
  });
  bloc.querySelectorAll('.trajets-fleche').forEach(function (b) {
    b.addEventListener('click', function () { aller(courant() + Number(b.getAttribute('data-sens'))); });
  });
  onglets.forEach(function (b, k) { b.addEventListener('click', function () { aller(k); }); });
  piste.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); aller(courant() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); aller(courant() - 1); }
  });
  // Défilement automatique toutes les 5 s : en pause au survol, au clavier, hors écran ou onglet caché ;
  // il s'arrête définitivement dès que la personne choisit elle-même un trajet ; jamais si « réduire les animations ».
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var auto = !reduit, survol = false, visible = true, minuterie = null;
  function tic() { if (auto && !survol && visible && !document.hidden) aller(courant() + 1); }
  function stopAuto() { auto = false; clearInterval(minuterie); }
  if (auto) {
    minuterie = setInterval(tic, 5000);
    [bloc].concat(choix).forEach(function (el) {
      el.addEventListener('mouseenter', function () { survol = true; });
      el.addEventListener('mouseleave', function () { survol = false; });
      el.addEventListener('focusin', function () { survol = true; });
      el.addEventListener('focusout', function () { survol = false; });
    });
    bloc.querySelectorAll('.trajets-fleche, .trajets-points button').forEach(function (b) { b.addEventListener('click', stopAuto); });
    choix.forEach(function (b) { b.addEventListener('click', stopAuto); });
    piste.addEventListener('touchstart', stopAuto, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(bloc);
    }
  }
  var attente; piste.addEventListener('scroll', function () { clearTimeout(attente); attente = setTimeout(maj, 80); });
});
