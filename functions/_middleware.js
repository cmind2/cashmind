// functions/_middleware.js
export async function onRequest(context) {
  const response = await context.next();
  const html = await response.text();

  const env = {
    SUPABASE_URL:       context.env.SUPABASE_URL,
    SUPABASE_KEY:       context.env.SUPABASE_KEY,
    TELEGRAM_BOT_TOKEN: context.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID:   context.env.TELEGRAM_CHAT_ID,
  };

  const injected = html.replace(
    '</head>',
    `<script>window.__ENV__=${JSON.stringify(env)}</script></head>`
  );

  return new Response(injected, {
    headers: response.headers,
    status: response.status,
  });
}
