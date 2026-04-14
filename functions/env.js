/**
 * /functions/env.js
 * Injecte UNIQUEMENT les variables publiques nécessaires au frontend.
 * ❌ SUPABASE_SERVICE_ROLE_KEY — jamais ici
 * ❌ TELEGRAM_BOT_TOKEN — jamais ici
 * ❌ TELEGRAM_CHAT_ID   — jamais ici
 */
export async function onRequest(context) {
  const { env } = context;

  const script = `window.__ENV__ = {
  SUPABASE_URL: "${env.SUPABASE_URL || ''}",
  SUPABASE_ANON_KEY: "${env.SUPABASE_ANON_KEY || ''}"
};`;

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store'
    }
  });
}