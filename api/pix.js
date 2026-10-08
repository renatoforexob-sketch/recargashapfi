function PaymentPage() {
  const saved = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('recargaData') || '{}'); }
    catch { return {}; }
  }, []);

  const operator = operators[saved.operator] || operators.claro;
  const amount = Number(
    new URLSearchParams(window.location.search).get('valor') || saved.amount || 40
  );
  const selectedBonus = saved.bonus || planBonus(amount);

  const [pix, setPix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('PENDING');

  // cria o Pix (uma única vez por paymentLinkId salvo)
  useEffect(() => {
    if (!saved.phone || !saved.operator) { go('/'); return; }

    // reaproveita Pix já criado nesta sessão
    const cached = sessionStorage.getItem('pixCache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.paymentData?.copyPaste && Number(parsed.amountInput) === amount) {
          setPix(parsed);
          setPaymentStatus(parsed.status || 'PENDING');
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
    }

    let cancelled = false;
    fetch('/api/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        product_name: `Recarga ${operator.name} ${money(amount)}`,
        metadata: { telefone: onlyDigits(saved.phone), operadora: operator.name },
      }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) {
          // extrai mensagem legível, seja string ou objeto
          const msg =
            (typeof d.message === 'string' && d.message) ||
            d.message?.message ||
            d.debug?.response?.message?.message ||
            d.debug?.response?.message ||
            d.debug?.response?.error ||
            `Falha ao gerar Pix (HTTP ${r.status}).`;
          const err = new Error(msg);
          err.debug = d.debug;
          throw err;
        }
        return d.data;
      })
      .then(data => {
        if (cancelled) return;
        setPix({ ...data, amountInput: amount });
        setPaymentStatus(data.status || 'PENDING');
        sessionStorage.setItem('pixCache', JSON.stringify({ ...data, amountInput: amount }));
      })
      .catch(e => {
        if (cancelled) return;
        console.error('[/api/pix] erro:', e, e?.debug);
        setError(e?.message || 'Erro desconhecido ao gerar Pix.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // desenha QR code
  useEffect(() => {
    if (pix?.paymentData?.copyPaste) {
      QRCode.toCanvas(
        document.getElementById('qr-code'),
        pix.paymentData.copyPaste,
        { width: 220, margin: 1 }
      ).catch(() => {});
    }
  }, [pix]);

  // polling de status
  useEffect(() => {
    if (!pix?.paymentLinkId) return;
    if (paymentStatus === 'APPROVED' || paymentStatus === 'CANCELLED') return;

    let tries = 0;
    const MAX = 120; // ~10 min
    const t = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(`/api/status?paymentLinkId=${encodeURIComponent(pix.paymentLinkId)}`);
        const d = await r.json();
        if (r.ok && d?.success) {
          setPaymentStatus(d.data.status || 'PENDING');
        }
      } catch { /* silencioso */ }
      if (tries >= MAX) clearInterval(t);
    }, 5000);

    return () => clearInterval(t);
  }, [pix?.paymentLinkId, paymentStatus]);

  const copy = async () => {
    if (!pix?.paymentData?.copyPaste) return;
    await navigator.clipboard.writeText(pix.paymentData.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const retry = () => {
    sessionStorage.removeItem('pixCache');
    window.location.reload();
  };

  const statusMessage =
    paymentStatus === 'APPROVED' ? 'Pagamento confirmado! Sua recarga foi aprovada.' :
    paymentStatus === 'CANCELLED' ? 'Este pagamento foi cancelado. Gere um novo Pix para continuar.' :
    'Aguardando confirmação do pagamento';

  return (
    <>
      <Header />
      <main className="payment-page">
        <button className="back" onClick={() => go(`/recarga-${operator.slug}`)}>
          ← Voltar e editar
        </button>
        <div className="payment-layout">
          <section className="payment-card">
            <div className="payment-header">
              <span className="eyebrow">ÚLTIMO PASSO</span>
              <h1>Pague com Pix.</h1>
              <p>Escaneie o QR Code ou copie o código para concluir sua recarga.</p>
            </div>

            {loading && (
              <div className="loading">
                <span className="spinner" /> Gerando seu código Pix...
              </div>
            )}

            {error && (
              <div className="api-error">
                <strong>Não foi possível gerar o Pix</strong>
                <p style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  textAlign: 'left',
                }}>{error}</p>
                <small>Verifique SHARPIFY_CLIENT_ID, SHARPIFY_CLIENT_SECRET e a permissão CREATE_PAYMENT_LINK na Vercel. Abra /api/diag para diagnóstico.</small>
                <button className="secondary" onClick={retry}>Tentar novamente</button>
              </div>
            )}

            {pix && !error && (
              <>
                <div className="qr-wrap">
                  <canvas id="qr-code" />
                  <span>Abra o app do seu banco<br />e escaneie o código.</span>
                </div>
                <div className="pix-copy">
                  <label>Código Pix copia e cola</label>
                  <div>
                    <input readOnly value={pix.paymentData.copyPaste} />
                    <button onClick={copy}>{copied ? 'Copiado!' : 'Copiar'}</button>
                  </div>
                </div>
                <div className={`waiting ${paymentStatus === 'APPROVED' ? 'success' : paymentStatus === 'CANCELLED' ? 'error' : ''}`}>
                  {paymentStatus === 'APPROVED' ? '✓' : paymentStatus === 'CANCELLED' ? '!' : '◷'} {statusMessage}
                </div>
              </>
            )}
          </section>

          <aside className="order-summary">
            <span className="eyebrow">RESUMO</span>
            <div className="summary-operator">
              <img src={operator.logo} alt={operator.name} />
              <div>
                <strong>Recarga {operator.name}</strong>
                <small>{saved.phone}</small>
              </div>
            </div>
            <div className="summary-line"><span>Número</span><strong>{saved.phone}</strong></div>
            <div className="summary-line"><span>Valor da recarga</span><strong>{money(amount)}</strong></div>
            <div className="summary-line bonus-line"><span>Bônus</span><strong>+{selectedBonus.replace(' • 30 dias', '')}</strong></div>
            <div className="summary-line"><span>Validade do bônus</span><strong>30 dias</strong></div>
            <div className="summary-line"><span>Pagamento</span><strong>Pix</strong></div>
            <hr />
            <div className="summary-total"><span>Total</span><strong>{money(amount)}</strong></div>
            <p>Confira o número e o valor antes de confirmar o pagamento.</p>
          </aside>
        </div>
      </main>
    </>
  );
}
