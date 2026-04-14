export async function onRequest(context) {
  const { request, env } = context;

  // On récupère la réponse HTML originale
  const response = await context.next();

  // On vérifie que c’est bien une page HTML
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // 🔐 Variables sécurisées (Cloudflare ENV)
  const ENV = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_KEY: env.SUPABASE_KEY || "",
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || ""
  };

  // On injecte dans window.__ENV__
  const injectedScript = `
    <script>
      window.__ENV__ = ${JSON.stringify(ENV)};
    </script>
  `;

  // On modifie le HTML
  let body = await response.text();

  // Injecter juste avant </head>
  body = body.replace("</head>", `${injectedScript}</head>`);

  return new Response(body, {
    headers: response.headers,
    status: response.status
  });
}