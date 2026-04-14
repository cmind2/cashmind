/**
 * /functions/send-tg.js
 * Envoie des notifications Telegram de manière sécurisée.
 * Le TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID ne sont JAMAIS exposés au frontend.
 * Configurez-les dans : Cloudflare Pages → Settings → Environment Variables
 */
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // Vérification token et chat_id configurés
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.warn('[send-tg] Variables TELEGRAM non configurées');
      return new Response(JSON.stringify({ success: false, error: 'Config manquante' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    if (!body.text) {
      return new Response(JSON.stringify({ success: false, error: 'Paramètre text manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: body.text,
          parse_mode: 'HTML'
        })
      }
    );

    if (!tgResponse.ok) {
      const err = await tgResponse.text();
      console.error('[send-tg] Erreur Telegram API:', err);
      return new Response(JSON.stringify({ success: false, error: 'Telegram API error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('[send-tg] Exception:', e.message);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Bloquer les méthodes non-POST
export async function onRequest(context) {
  return new Response('Method Not Allowed', { status: 405 });
}