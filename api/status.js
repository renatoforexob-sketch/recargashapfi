const BASE = process.env.SHARPIFY_GATEWAY_URL || 'https://sharpify-pay.com';
const PATH = '/api/v1/gateway/payment/create-paymnet';

export default async function handler(req, res) {
  const out = {
    env: {
      SHARPIFY_GATEWAY_URL: process.env.SHARPIFY_GATEWAY_URL || '(usando default)',
      SHARPIFY_CLIENT_ID: process.env.SHARPIFY_CLIENT_ID ? '✅ definido' : '❌ ausente',
      SHARPIFY_CLIENT_SECRET: process.env.SHARPIFY_CLIENT_SECRET ? '✅ definido' : '❌ ausente',
      SHARPIFY_WEBHOOK_URL: process.env.SHARPIFY_WEBHOOK_URL || '(não definido)',
    },
    url: `${BASE}${PATH}`,
    result: null,
  };

  if (!process.env.SHARPIFY_CLIENT_ID || !process.env.SHARPIFY_CLIENT_SECRET) {
    return res.status(200).json(out);
  }

  try {
    const r = await fetch(out.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID,
        'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET,
      },
      body: JSON.stringify({
        name: 'Teste diagnóstico',
        description: 'Teste de integração',
        amount: 1.0,
        gatewayMethod: 'PIX',
      }),
    });

    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    out.result = { status: r.status, ok: r.ok, body };
    return res.status(200).json(out);
  } catch (e) {
    out.result = { error: String(e?.message || e) };
    return res.status(200).json(out);
  }
}
