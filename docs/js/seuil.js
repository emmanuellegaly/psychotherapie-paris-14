/* Proposition A1 — ouverture « respiration » (Three.js r170, copie locale).
   - Un voile de lumière et un nuage de particules respirent lentement (environ 5,7 cycles par minute),
     puis s'ouvrent comme une porte sur la photo du cabinet (3,6 s au total, bouton pour passer).
   - Ensuite, très discrètement : la lumière de la fenêtre et quelques poussières dorées continuent de respirer.
   - Rien ne se lance si l'utilisateur préfère réduire les animations ; repli sur la photo fixe si WebGL échoue.
   - Pause quand l'onglet est caché ou que le premier écran n'est plus visible. */

const html = document.documentElement;
const cadre = document.querySelector('[data-seuil]');
const boutonPasser = document.querySelector('.seuil-passer');
const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');

function terminerIntro() {
  html.classList.remove('intro');
  html.classList.add('intro-finie');
}

if (cadre && !mouvementReduit.matches && 'WebGLRenderingContext' in window) {
  demarrer().catch(() => terminerIntro());
} else {
  terminerIntro();
}

async function demarrer() {
  const THREE = await import('./three-r170-sous-ensemble.min.js');
  // Si l'introduction a déjà été abandonnée (chargement lent, onglet caché), on garde seulement la respiration discrète.
  const avecIntro = html.classList.contains('intro') && !document.hidden;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let rendu;
  try {
    rendu = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch (e) {
    terminerIntro();
    return;
  }
  rendu.setClearColor(0x000000, 0);
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  rendu.setPixelRatio(ratio);
  cadre.insertBefore(canvas, cadre.querySelector('.seuil-voile'));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Couleurs du cabinet (sRGB)
  const c = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const BLANC = c(0xFDFCFA), LAITON = c(0xB8975A);
  // couleurs du tableau du cabinet (reprises de A1)
  const SABLE = c(0xE2B48C), BRUN_ROUGE = c(0x963A26), BRUN = c(0x3A1712), SAFRAN = c(0xDE8900), BLANC_CASSE = c(0xF6F1EA);

  const uniformes = {
    uTemps: { value: 0 },
    uSouffle: { value: 0 },
    uOuverture: { value: avecIntro ? 0 : 1 },
    uResidu: { value: 0 },
    uAspect: { value: 1 },
    uPx: { value: ratio },
    uBlanc: { value: BLANC },
    uChene: { value: SABLE },
    uLaiton: { value: LAITON },
  };

  // ---- Le voile de lumière (plein cadre) ----
  const voile = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: uniformes,
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uSouffle, uOuverture, uResidu, uAspect;
        uniform vec3 uBlanc, uChene, uLaiton;
        void main() {
          vec2 p = vUv - vec2(0.5, 0.56); p.x *= uAspect;
          float r = length(p);
          float rayon = 0.16 + 0.17 * uSouffle;
          float halo = exp(-pow(r / rayon, 2.0) * 1.4);
          vec3 coul = mix(uBlanc, uChene, halo * 0.42);
          coul = mix(coul, uLaiton, pow(halo, 4.0) * 0.22);

          // La porte : une bande qui s'ouvre depuis le centre, bordée de lumière
          float dx = abs(vUv.x - 0.5) * 2.0;
          float o = uOuverture;
          float largeur = o * 1.2;
          float masque = o <= 0.0 ? 1.0 : smoothstep(largeur - 0.10, largeur + 0.02, dx);
          float bord = exp(-pow((dx - largeur) / 0.06, 2.0)) * (1.0 - o) * smoothstep(0.0, 0.08, o);
          coul = min(coul + uLaiton * bord * 0.35, vec3(1.0));

          // Après l'ouverture : la lumière de la fenêtre respire, très doucement
          vec2 q = vUv - vec2(0.80, 0.62); q.x *= uAspect;
          float fenetre = exp(-dot(q, q) * 5.0);
          float aRes = uResidu * fenetre * (0.05 + 0.13 * uSouffle);

          float a = masque + aRes * (1.0 - masque);
          vec3 lumiere = vec3(1.0, 0.975, 0.92);
          gl_FragColor = vec4(mix(lumiere, coul, masque), a);
        }`,
    })
  );
  voile.renderOrder = 0;
  scene.add(voile);

  // ---- Le nuage de particules qui respire ----
  const nombre = window.innerWidth < 700 ? 520 : 950;
  const donnees = new Float32Array(nombre * 4);
  const couleurs = new Float32Array(nombre * 3);
  const palette = [BRUN_ROUGE, BRUN_ROUGE, BRUN_ROUGE, SAFRAN, SABLE, BLANC_CASSE, BRUN];
  for (let i = 0; i < nombre; i++) {
    const angle = Math.random() * Math.PI * 2;
    let r = 0.09 + 0.30 * Math.pow(Math.random(), 0.6);
    r *= 1 + 0.07 * Math.sin(3 * angle + 1.3) + 0.04 * Math.sin(5 * angle);
    donnees.set([angle, r, Math.random(), 1.4 + Math.random() * 3.2], i * 4);
    couleurs.set(palette[(Math.random() * palette.length) | 0], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nombre * 3), 3));
  geo.setAttribute('aDonnee', new THREE.BufferAttribute(donnees, 4));
  geo.setAttribute('aCouleur', new THREE.BufferAttribute(couleurs, 3));
  const particules = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: uniformes,
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 aDonnee;
      attribute vec3 aCouleur;
      uniform float uTemps, uSouffle, uOuverture, uResidu, uAspect, uPx;
      varying vec3 vCouleur;
      varying float vAlpha;
      void main() {
        float g = aDonnee.z;
        float ang = aDonnee.x + uTemps * 0.03 * (g - 0.5);
        float r = aDonnee.y * (0.70 + 0.42 * uSouffle) + 0.012 * sin(uTemps * 0.7 + g * 37.0);
        vec2 p = vec2(cos(ang), sin(ang)) * r;
        float o = uOuverture * uOuverture * (3.0 - 2.0 * uOuverture);
        vec2 cote = vec2(sign(p.x + 0.0001) * (0.56 * uAspect + g * 0.35), p.y * 1.4);
        p = mix(p, cote, o);
        float poussiere = step(g, 0.12);
        vec2 flot = vec2((fract(g * 13.7) - 0.5) * uAspect * 0.9, (fract(g * 7.3) - 0.5) * 0.9);
        flot += vec2(0.03 * cos(uTemps * 0.11 + g * 30.0), 0.04 * sin(uTemps * 0.13 + g * 50.0));
        p = mix(p, flot, uResidu * poussiere);
        gl_Position = vec4(p.x * 2.0 / uAspect, p.y * 2.0 + 0.12 * (1.0 - o), 0.0, 1.0);
        gl_PointSize = aDonnee.w * uPx * (0.85 + 0.35 * uSouffle);
        vCouleur = mix(aCouleur, vec3(1.0, 0.95, 0.84), uResidu * poussiere);
        float aIntro = (0.55 + 0.40 * uSouffle) * (1.0 - o);
        float aRes = uResidu * poussiere * (0.22 + 0.22 * uSouffle);
        vAlpha = max(aIntro, aRes);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCouleur;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCouleur, a);
      }`,
  }));
  particules.renderOrder = 1;
  particules.frustumCulled = false;
  scene.add(particules);

  // ---- Taille ----
  function ajuster() {
    const l = cadre.clientWidth, h = cadre.clientHeight;
    if (!l || !h) return;
    rendu.setSize(l, h, false);
    uniformes.uAspect.value = l / h;
  }
  ajuster();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(ajuster) : null;
  if (ro) ro.observe(cadre); else window.addEventListener('resize', ajuster);

  // ---- La respiration ----
  const PERIODE = 10.5;        // secondes par cycle, environ 5,7 respirations par minute
  const INSPIR = 0.42;         // part de l'inspiration dans le cycle
  const PREMIERE = 2.4;        // première inspiration de l'introduction
  const doux = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));
  function souffle(t) {
    if (t < PREMIERE) return 0.05 + 0.95 * doux(t / PREMIERE);
    let ph = (t - PREMIERE) / PERIODE + INSPIR;
    ph -= Math.floor(ph);
    return ph < INSPIR ? doux(ph / INSPIR) : 1 - doux((ph - INSPIR) / (1 - INSPIR));
  }
  const cubique = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  let t = avecIntro ? 0 : PREMIERE + 1.5;
  let debutOuverture = avecIntro ? 2.3 : -10;
  let dureeOuverture = 1.3;
  let porteOuverte = !avecIntro;
  let introTerminee = !avecIntro;

  function ouvrir(maintenant) {
    if (porteOuverte) return;
    porteOuverte = true;
    if (maintenant) { debutOuverture = t; dureeOuverture = 0.7; }
    html.classList.add('porte-ouverte');
    html.classList.remove('intro');           // la photo reprend doucement sa taille
    if (document.activeElement === boutonPasser) {
      const titre = document.getElementById('titre-principal');
      titre.setAttribute('tabindex', '-1');
      titre.focus({ preventScroll: true });
    }
  }
  if (boutonPasser) boutonPasser.addEventListener('click', () => ouvrir(true));
  cadre.addEventListener('click', () => { if (!porteOuverte) ouvrir(true); });

  // Sortie garantie, indépendante de requestAnimationFrame (onglet ouvert en arrière-plan, appareil lent) :
  // par minuterie, et dès que l'onglet est caché.
  function forcerFin() {
    if (introTerminee) return;
    porteOuverte = true;
    introTerminee = true;
    debutOuverture = Math.min(debutOuverture, t);
    dureeOuverture = 0.01;
    t = Math.max(t, debutOuverture + 3);   // état final : porte ouverte, respiration discrète
    canvas.style.visibility = 'hidden';    // l'image du voile ne doit pas rester affichée en attendant
    html.classList.add('porte-ouverte');
    terminerIntro();
  }
  if (avecIntro) {
    window.setTimeout(forcerFin, 4000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) forcerFin(); });
  }

  // ---- Boucle, avec pauses ----
  let enVue = true, actif = true, idImage = 0, precedent = performance.now(), dernierRendu = 0;
  function image(maintenant) {
    idImage = requestAnimationFrame(image);
    const dt = Math.min((maintenant - precedent) / 1000, 0.5);
    precedent = maintenant;
    t += dt;
    // une fois l'intro passée, 30 images par seconde suffisent
    if (introTerminee && maintenant - dernierRendu < 33) return;
    dernierRendu = maintenant;

    if (!porteOuverte && t >= debutOuverture) ouvrir(false);
    const o = Math.min(Math.max((t - debutOuverture) / dureeOuverture, 0), 1);
    uniformes.uTemps.value = t;
    uniformes.uSouffle.value = souffle(t);
    uniformes.uOuverture.value = cubique(o);
    uniformes.uResidu.value = doux((t - (debutOuverture + dureeOuverture) + 0.4) / 2.2);
    if (!introTerminee && o >= 1) {
      introTerminee = true;
      terminerIntro();
    }
    rendu.render(scene, camera);
    if (canvas.style.visibility) canvas.style.visibility = '';
  }
  function mettreAJour() {
    const doitTourner = enVue && !document.hidden;
    if (doitTourner && !actif) { actif = true; precedent = performance.now(); idImage = requestAnimationFrame(image); }
    if (!doitTourner && actif) { actif = false; cancelAnimationFrame(idImage); }
  }
  document.addEventListener('visibilitychange', mettreAJour);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { enVue = e[0].isIntersecting; mettreAJour(); }).observe(cadre);
  }

  function arreter() {
    cancelAnimationFrame(idImage);
    actif = false;
    if (ro) ro.disconnect();
    canvas.remove();
    rendu.dispose();
    html.classList.remove('porte-ouverte');
    terminerIntro();
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); arreter(); });
  mouvementReduit.addEventListener?.('change', (e) => { if (e.matches) arreter(); });

  // premier rendu, puis on retire le voile de secours
  uniformes.uSouffle.value = souffle(t);
  rendu.render(scene, camera);
  html.classList.add('webgl-pret');
  idImage = requestAnimationFrame(image);
}
