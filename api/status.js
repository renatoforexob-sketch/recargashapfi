const BASE=process.env.SHARPIFY_GATEWAY_URL||'https://sharpify-pay.com';
const unwrap=d=>d?.data?.data||d?.data?.paymentLink||d?.paymentLink||d?.data||{};
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({success:false,message:'Método não permitido'});
 if(!process.env.SHARPIFY_CLIENT_ID||!process.env.SHARPIFY_CLIENT_SECRET)return res.status(500).json({success:false,message:'Configure SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET na Vercel.'});
 const id=String(req.query?.paymentLinkId||'').trim(); if(!id)return res.status(400).json({success:false,message:'paymentLinkId é obrigatório.'});
 try{const r=await fetch(`${BASE}/api/v1/gateway/payment/get-payment?paymentLinkId=${encodeURIComponent(id)}`,{headers:{'x-sharpify-client-id':process.env.SHARPIFY_CLIENT_ID,'x-sharpify-client-secret':process.env.SHARPIFY_CLIENT_SECRET,'Content-Type':'application/json'}}),d=await r.json().catch(()=>({})); if(!r.ok)return res.status(r.status||502).json({success:false,message:d?.message||d?.error||'Não foi possível consultar o pagamento na Sharpify.'}); const link=unwrap(d); return res.status(200).json({success:true,data:{paymentLinkId:link.id||id,status:link.status||'PENDING',payment:link.payment||null}});}catch{return res.status(502).json({success:false,message:'Não foi possível consultar o status do pagamento.'});}
}
