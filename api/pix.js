const BASE = process.env.SHARPIFY_GATEWAY_URL || 'https://sharpify-pay.com';
const PATH = '/api/v1/gateway/payment/create-paymnet';
const headers = () => ({'Content-Type':'application/json','x-sharpify-client-id':process.env.SHARPIFY_CLIENT_ID||'','x-sharpify-client-secret':process.env.SHARPIFY_CLIENT_SECRET||''});
const unwrap = d => d?.data?.data || d?.data?.paymentLink || d?.paymentLink || d?.data || null;
export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).json({success:false,message:'Método não permitido'});
 if(!process.env.SHARPIFY_CLIENT_ID||!process.env.SHARPIFY_CLIENT_SECRET) return res.status(500).json({success:false,message:'Configure SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET na Vercel.'});
 const input=req.body||{}, amount=Number(input.amount);
 if(!Number.isFinite(amount)||amount<.01||amount>1000) return res.status(400).json({success:false,message:'amount deve ser um número entre 0,01 e 1.000.'});
 const meta=input.metadata&&typeof input.metadata==='object'?input.metadata:{};
 const op=String(meta.operadora||'').trim(), phone=String(meta.telefone||'').replace(/\D/g,'');
 const payload={name:String(input.product_name||`Recarga${op?` ${op}`:''}`).slice(0,120),description:`Recarga de celular${op?` - ${op}`:''}${phone?` - ${phone}`:''}`.slice(0,500),amount:Number(amount.toFixed(2)),gatewayMethod:'PIX'};
 if(process.env.SHARPIFY_WEBHOOK_URL){payload.webhook={callbackURL:process.env.SHARPIFY_WEBHOOK_URL};if(process.env.SHARPIFY_WEBHOOK_SECRET)payload.webhook.headers=[{key:'x-webhook-secret',value:process.env.SHARPIFY_WEBHOOK_SECRET}];}
 try{
  const r=await fetch(`${BASE}${PATH}`,{method:'POST',headers:headers(),body:JSON.stringify(payload)}), d=await r.json().catch(()=>({}));
  if(!r.ok)return res.status(r.status||502).json({success:false,message:d?.message||d?.error||'A Sharpify não conseguiu criar o pagamento Pix.'});
  const link=unwrap(d), payment=link?.payment, gd=payment?.gateway?.data, id=link?.id||d?.paymentLinkId||d?.id, code=gd?.code||'';
  if(!id||!code)return res.status(502).json({success:false,message:'A Sharpify não retornou o ID e o código Pix esperados.'});
  return res.status(200).json({success:true,data:{paymentLinkId:id,status:link?.status||'PENDING',paymentData:{copyPaste:code,qrCodeBase64:null,qrCode:gd?.qrCode||null,paymentLink:gd?.paymentLink||null},transactionId:payment?.id||null,amount:payment?.amount??link?.pricing?.total??amount,amountDisplay:amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}});
 }catch{return res.status(502).json({success:false,message:'Não foi possível conectar ao Gateway Sharpify.'});}
}
