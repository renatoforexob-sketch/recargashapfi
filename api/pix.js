export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const BASE = process.env.SHARPIFY_GATEWAY_URL || 'https://sharpify-pay.com';
const PATH = '/api/v1/gateway/payment/create-paymnet';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return json(res, 405, { success: false, message: 'Método não permitido' });
    }

    if (!process.env.SHARPIFY_CLIENT_ID || !process.env.SHARPIFY_CLIENT_SECRET) {
      return json(res, 500, {
        success: false,
        message: 'Configure SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET na Vercel.',
      });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000) {
      return json(res, 400, {
        success: false,
        message: 'amount deve ser um número entre 0,01 e 1.000.',
      });
    }

    const meta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const op = String(meta.operadora || '').trim();
    const phone = String(meta.telefone || '').replace(/\D/g, '');

    const payload = {
      name: String(body.product_name || `Recarga${op ? ` ${op}` : ''}`).slice(0, 120),
      description: `Recarga de celular${op ? ` - ${op}` : ''}${phone ? ` - ${phone}` : ''}`.slice(0, 500),
      amount: Number(amount.toFixed(2)),
      gatewayMethod: 'PIX',
    };

    if (process.env.SHARPIFY_WEBHOOK_URL) {
      payload.webhook = { callbackURL: process.env.SHARPIFY_WEBHOOK_URL };
      if (process.env.SHARPIFY_WEBHOOK_SECRET) {
        payload.webhook.headers = [
          { key: 'x-webhook-secret', value: process.env.SHARPIFY_WEBHOOK_SECRET },
        ];
      }
    }

    if (typeof fetch !== 'function') {
      return json(res, 500, {
        success: false,
        message: 'Node sem fetch global. Defina "engines": { "node": ">=18.0.0" } no package.json e redeploy.',
      });
    }

    const url = `${BASE}${PATH}`;
    console.log('[SHARPIFY /api/pix] REQ', { url, payload });

    let r, text;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID,
          'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET,
        },
        body: JSON.stringify(payload),
      });
      text = await r.text();
    } catch (netErr) {
      console.error('[SHARPIFY /api/pix] NET ERROR', netErr);
      return json(res, 502, {
        success: false,
        message: 'Falha de rede ao chamar a Sharpify.',
        debug: { url, error: String(netErr?.message || netErr) },
      });
    }

    let raw;
    try { raw = JSON.parse(text); } catch { raw = { _rawText: text }; }

    console.log('[SHARPIFY /api/pix] RES', { status: r.status, raw });

    if (!r.ok) {
      const msg =
        (typeof raw?.message === 'string' && raw.message) ||
        (typeof raw?.error === 'string' && raw.error) ||
        raw?.message?.message ||
        raw?.error?.message ||
        `Sharpify respondeu ${r.status}.`;
      return json(res, r.status || 502, {
        success: false,
        message: msg,
        debug: { status: r.status, url, response: raw },
      });
    }

    const link = raw?.data?.paymentLink || raw?.paymentLink || raw?.data || raw;
    const payment = link?.payment || null;
    const gd = payment?.gateway?.data || null;

    const code =
      gd?.code ||
      gd?.payload ||
      gd?.pixCopyPaste ||
      payment?.pix?.code ||
      raw?.data?.code ||
      '';

    const id = link?.id || raw?.paymentLinkId || raw?.id || null;

    if (!id || !code) {
      return json(res, 502, {
        success: false,
        message: 'Sharpify respondeu, mas o ID/código Pix não foram encontrados.',
        debug: { status: r.status, url, response: raw },
      });
    }

    return json(res, 200, {
      success: true,
      data: {
        paymentLinkId: id,
        status: link.status || 'PENDING',
        paymentData: {
          copyPaste: code,
          qrCodeBase64: gd?.qrCodeBase64 || null,
          qrCode: gd?.qrCode || null,
          paymentLink: gd?.paymentLink || null,
        },
        transactionId: payment?.id || null,
        amount: payment?.amount ?? link?.pricing?.total ?? amount,
        amountDisplay: amount.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }),
      },
    });
  } catch (fatal) {
    console.error('[SHARPIFY /api/pix] FATAL', fatal);
    return json(res, 500, {
      success: false,
      message: 'Erro interno na função /api/pix.',
      debug: { error: String(fatal?.message || fatal) },
    });
  }
}
