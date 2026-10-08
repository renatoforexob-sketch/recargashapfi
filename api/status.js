export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const BASE = process.env.SHARPIFY_GATEWAY_URL || 'https://sharpify-pay.com';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function unwrap(d) {
  return d?.data?.data || d?.data?.paymentLink || d?.paymentLink || d?.data || {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, { success: false, message: 'Método não permitido' });
    }

    if (!process.env.SHARPIFY_CLIENT_ID || !process.env.SHARPIFY_CLIENT_SECRET) {
      return json(res, 500, {
        success: false,
        message: 'Configure SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET na Vercel.',
      });
    }

    const id = String(req.query?.paymentLinkId || '').trim();
    if (!id) {
      return json(res, 400, { success: false, message: 'paymentLinkId é obrigatório.' });
    }

    if (typeof fetch !== 'function') {
      return json(res, 500, { success: false, message: 'Node sem fetch global.' });
    }

    const url = `${BASE}/api/v1/gateway/payment/get-payment?paymentLinkId=${encodeURIComponent(id)}`;

    let r, text;
    try {
      r = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID,
          'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET,
        },
      });
      text = await r.text();
    } catch (netErr) {
      console.error('[SHARPIFY /api/status] NET ERROR', netErr);
      return json(res, 502, {
        success: false,
        message: 'Falha de rede ao consultar a Sharpify.',
        debug: { url, error: String(netErr?.message || netErr) },
      });
    }

    let raw;
    try { raw = JSON.parse(text); } catch { raw = { _rawText: text }; }

    if (!r.ok) {
      return json(res, r.status || 502, {
        success: false,
        message: raw?.message || raw?.error || 'Não foi possível consultar o pagamento.',
        debug: { status: r.status, url, response: raw },
      });
    }

    const link = unwrap(raw) || {};
    return json(res, 200, {
      success: true,
      data: {
        paymentLinkId: link.id || id,
        status: link.status || 'PENDING',
        payment: link.payment || null,
      },
    });
  } catch (fatal) {
    console.error('[SHARPIFY /api/status] FATAL', fatal);
    return json(res, 500, {
      success: false,
      message: 'Erro interno na função /api/status.',
      debug: { error: String(fatal?.message || fatal) },
    });
  }
}
