// functions/_middleware.js

export async function onRequest(context) {
  const { request, env, next } = context;

  const url = new URL(request.url);

  // ✅ On ne traite que les pages HTML
  if (
    !url.pathname.endsWith(".html") &&
    url.pathname !== "/" &&
    !url.pathname.endsWith("/")
  ) {
    return next();
  }

  // 🔄 Récupérer la réponse originale
  const response = await next();

  // ⚠️ Sécurité : vérifier que c'est bien du HTML
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const html = await response.text();

  // ✅ Variables injectées
  const envData = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_KEY: env.SUPABASE_KEY || "",
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || "",
  };

  const script = `<script>window.__ENV__=${JSON.stringify(envData)}</script>`;

  // 💉 Injection propre avant </head>
  const modifiedHTML = html.replace("</head>", script + "</head>");

  return new Response(modifiedHTML, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html;charset=UTF-8",
    },
  });
}
