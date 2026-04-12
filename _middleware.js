export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    let text = await response.text();

    const envScript = `
      <script>
        window.__ENV__ = {
          SUPABASE_URL: "${context.env.SUPABASE_URL}",
          SUPABASE_KEY: "${context.env.SUPABASE_KEY}",
          TELEGRAM_BOT_TOKEN: "${context.env.TELEGRAM_BOT_TOKEN}",
          TELEGRAM_CHAT_ID: "${context.env.TELEGRAM_CHAT_ID}"
        };
      </script>
    `;

    text = text.replace("</head>", envScript + "</head>");

    return new Response(text, {
      headers: response.headers
    });
  }

  return response;
}
