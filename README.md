# Recarga Fácil — Sharpify Gateway

Integração de pagamento Pix via **Sharpify Gateway**.

## Variáveis da Vercel

Configure no projeto:

```env
SHARPIFY_CLIENT_ID=...
SHARPIFY_CLIENT_SECRET=...
SHARPIFY_GATEWAY_URL=https://sharpify-pay.com
```

Opcionalmente, para webhook:

```env
SHARPIFY_WEBHOOK_URL=https://seu-dominio.com/api/sharpify-webhook
SHARPIFY_WEBHOOK_SECRET=...
```

As credenciais são usadas somente pelas funções serverless em `api/` e nunca são enviadas ao navegador.

## Fluxo

1. `POST /api/pix` chama `POST /api/v1/gateway/payment/create-paymnet`.
2. O Gateway é criado com `gatewayMethod: "PIX"` e retorna `paymentLinkId` + código Pix.
3. O frontend mostra QR Code e Pix copia e cola.
4. A cada 5 segundos, `GET /api/status?paymentLinkId=...` consulta `GET /api/v1/gateway/payment/get-payment`.
5. Os estados `APPROVED` e `CANCELLED` encerram a consulta automática.

## Permissões Sharpify

A credencial precisa ter:

- `CREATE_PAYMENT_LINK`
- `GET_PAYMENT_LINK`

O projeto não precisa expor nenhuma credencial no frontend.
