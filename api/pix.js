const BASE = process.env.SHARPIFY_GATEWAY_URL || 'https://sharpify-pay.com';
// ATENÇÃO: o path tem o typo "paymnet" de propósito (é o que a Sharpify expõe)
const PATH = '/api/v1/gateway/payment/create-paymnet';

const headers = () => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'x-sharpify-client-id': process.env.SHARPIFY_CLIENT_ID || '',
  'x-sharpify-client-secret': process.env.SHARPIFY_CLIENT_SECRET || '',
});

// A resposta documentada é { data: PaymentLinkProps }. Aceitamos variações por segurança.
function extractLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return (
    raw.data?.paymentLink ||        // variação possível
    raw.paymentLink ||              // variação possível
    raw.data ||                     // padrão documentado
    raw
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  if (!process.env.SHARPIFY_CLIENT_ID || !process.env.SHARPIFY_CLIENT_SECRET) {
    return res.status(500).json({
      success: false,
      message: 'Configure SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET na Vercel.',
    });
  }

  const input = req.body || {};
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000) {
    return res.status(400).json({
      success: false,
      message: 'amount deve ser um número entre 0,01 e 1.000.',
    });
  }

  const meta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const op = String(meta.operadora || '').trim();
  const phone = String(meta.telefone || '').replace(/\D/g, '');

  const payload = {
    name: String(input.product_name || `Recarga${op ? ` ${op}` : ''}`).slice(0, 120),
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

  const url = `${BASE}${PATH}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let raw;
    try { raw = JSON.parse(text); } catch { raw = { _rawText: text }; }

    // 🔎 LOG CRU — aparece nos Logs da Vercel
    console.log('[SHARPIFY /api/pix]', {
      url,
      status: r.status,
      ok: r.ok,
      payload,
      response: raw,
    });

    if (!r.ok) {
      return res.status(r.status || 502).json({
        success: false,
        message: raw?.message || raw?.error || 'A Sharpify não conseguiu criar o pagamento Pix.',
        debug: {
          status: r.status,
          url,
          response: raw, // isso ajuda MUITO a diagnosticar
        },
      });
    }

    const link = extractLink(raw) || {};
    const payment = link.payment || null;
    const gd = payment?.gateway?.data || null;

    // O código copia-e-cola pode aparecer em vários lugares dependendo da versão
    const code =
      gd?.code ||
      gd?.payload ||
      gd?.pixCopyPaste ||
      payment?.pix?.code ||
      raw?.data?.code ||
      '';

    const id = link.id || raw?.paymentLinkId || raw?.id || null;

    if (!id || !code) {
      return res.status(502).json({
        success: false,
        message: 'A Sharpify respondeu, mas não encontramos o ID e o código Pix na resposta.',
        debug: { url, status: r.status, response: raw },
      });
    }

    return res.status(200).json({
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
  } catch (err) {
    console.error('[SHARPIFY /api/pix] fetch error:', err);
    return res.status(502).json({
      success: false,
      message: 'Não foi possível conectar ao Gateway Sharpify.',
      debug: { url, error: String(err?.message || err) },
    });
  }
}
