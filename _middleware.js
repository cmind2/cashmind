export async function onRequest(context) {
  const { request, env, next } = context;

  // On ne traite que les requêtes vers index.html
  const url = new URL(request.url);
  if (!url.pathname.endsWith('.html') && url.pathname !== '/' && !url.pathname.endsWith('/')) {
    return next();
  }

  // Récupérer la page originale
  const response = await next();
  const html = await response.text();

  // Injecter les variables d'environnement dans le HTML
  const script = `<script>
window.__ENV__ = {
  SUPABASE_URL: "${env.SUPABASE_URL || ''}",
  SUPABASE_KEY: "${env.SUPABASE_KEY || ''}",
  TELEGRAM_BOT_TOKEN: "${env.TELEGRAM_BOT_TOKEN || ''}",
  TELEGRAM_CHAT_ID: "${env.TELEGRAM_CHAT_ID || ''}"
};
</script>`;

  // Insérer juste avant </head>
  const modified = html.replace('</head>', script + '</head>');

  return new Response(modified, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'content-type': 'text/html;charset=UTF-8',
    },
  });
}
