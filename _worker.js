/**
 * ═══════════════════════════════════════════════════════════════
 *  MindCash — Cloudflare Pages Worker (_worker.js)
 *  Placez ce fichier à la RACINE de votre projet Cloudflare Pages
 * ═══════════════════════════════════════════════════════════════
 *
 *  Ce Worker intercepte chaque requête vers index.html et injecte
 *  window.__ENV__ avec toutes les constantes sensibles AVANT
 *  l'envoi au navigateur. Les valeurs viennent des Variables
 *  d'environnement Cloudflare (jamais dans le code source).
 *
 *  CONFIGURATION :
 *  → Cloudflare Dashboard → Pages → Votre projet
 *  → Settings → Environment variables → Add variable
 *
 *  Variables à ajouter :
 *  ┌─────────────────────┬──────────────────────────────────────┐
 *  │ SUPABASE_URL         │ https://xxxx.supabase.co             │
 *  │ SUPABASE_KEY         │ eyJhbGci...  (anon key)              │
 *  │ TELEGRAM_BOT_TOKEN   │ 123456:ABC-DEF...                    │
 *  │ TELEGRAM_CHAT_ID     │ -1001234567890                       │
 *  │ DEPOT_MIN            │ 5000                                 │
 *  │ RETRAIT_MIN          │ 4450                                 │
 *  │ SHOP_DEPOT_MIN       │ 500                                  │
 *  │ SHOP_RETRAIT_MIN     │ 2500                                 │
 *  │ GAINS_RETRAIT_MIN    │ 2500                                 │
 *  │ FRAIS_PERCENT        │ 5                                    │
 *  │ TIMER_SEC            │ 120                                  │
 *  │ BONUS_N1             │ 2050                                 │
 *  │ BONUS_N2             │ 750                                  │
 *  │ DEPOT_H_DEBUT        │ 6                                    │
 *  │ DEPOT_H_FIN          │ 22                                   │
 *  │ RETRAIT_H_DEBUT      │ 7                                    │
 *  │ RETRAIT_H_FIN        │ 17                                   │
 *  │ RETRAIT_JOURS        │ 1,2,3,4,5                           │
 *  │ VENDOR_PERCENT       │ 80                                   │
 *  └─────────────────────┴──────────────────────────────────────┘
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // On n'intercepte que les requêtes vers index.html (ou /)
    const isPage =
      url.pathname === '/' ||
      url.pathname === '/index.html' ||
      !url.pathname.includes('.');  // Toutes les routes SPA

    if (!isPage) {
      // Fichiers statiques (CSS, JS, images) → passthrough normal
      return env.ASSETS.fetch(request);
    }

    // Récupère le HTML original depuis Cloudflare Pages Assets
    const originalResponse = await env.ASSETS.fetch(request);
    let html = await originalResponse.text();

    // Construit l'objet __ENV__ avec toutes les variables sécurisées
    const envScript = `
<script>
  window.__ENV__ = {
    SUPABASE_URL:       "${sanitize(env.SUPABASE_URL)}",
    SUPABASE_KEY:       "${sanitize(env.SUPABASE_KEY)}",
    TELEGRAM_BOT_TOKEN: "${sanitize(env.TELEGRAM_BOT_TOKEN)}",
    TELEGRAM_CHAT_ID:   "${sanitize(env.TELEGRAM_CHAT_ID)}",
    DEPOT_MIN:        ${num(env.DEPOT_MIN,        5000)},
    RETRAIT_MIN:      ${num(env.RETRAIT_MIN,      4450)},
    SHOP_DEPOT_MIN:   ${num(env.SHOP_DEPOT_MIN,   500)},
    SHOP_RETRAIT_MIN: ${num(env.SHOP_RETRAIT_MIN, 2500)},
    GAINS_RETRAIT_MIN:${num(env.GAINS_RETRAIT_MIN,2500)},
    FRAIS_PERCENT:    ${num(env.FRAIS_PERCENT,    5)},
    TIMER_SEC:        ${num(env.TIMER_SEC,         120)},
    BONUS_N1:         ${num(env.BONUS_N1,          2050)},
    BONUS_N2:         ${num(env.BONUS_N2,          750)},
    DEPOT_H_DEBUT:    ${num(env.DEPOT_H_DEBUT,    6)},
    DEPOT_H_FIN:      ${num(env.DEPOT_H_FIN,      22)},
    RETRAIT_H_DEBUT:  ${num(env.RETRAIT_H_DEBUT,  7)},
    RETRAIT_H_FIN:    ${num(env.RETRAIT_H_FIN,    17)},
    RETRAIT_JOURS:    [${parseJours(env.RETRAIT_JOURS)}],
    VENDOR_PERCENT:   ${num(env.VENDOR_PERCENT,   80)},
  };
<\/script>`;

    // Injecte le script AVANT le </head> (ou au début du body)
    if (html.includes('</head>')) {
      html = html.replace('</head>', envScript + '</head>');
    } else {
      html = envScript + html;
    }

    return new Response(html, {
      status: originalResponse.status,
      headers: {
        ...Object.fromEntries(originalResponse.headers),
        'Content-Type': 'text/html; charset=UTF-8',
        // Sécurité : empêche la mise en cache côté client du HTML
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  },
};

/* ── Helpers ── */
function sanitize(val) {
  if (!val) return '';
  // Échappe les guillemets et caractères dangereux
  return String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\u003c');
}

function num(val, fallback) {
  const n = parseInt(val);
  return isNaN(n) ? fallback : n;
}

function parseJours(val) {
  if (!val) return '1,2,3,4,5';
  // Accepte "1,2,3,4,5" ou tableau JSON
  return String(val).split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n)).join(',');
}
