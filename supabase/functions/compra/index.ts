// Recebe o aviso de compra da Kiwify ou da Hotmart e libera (ou bloqueia) o acesso pelo e-mail do comprador.
// URL do webhook: https://SEU-PROJETO.supabase.co/functions/v1/compra?chave=SUA_CHAVE
// Segredos: WEBHOOK_CHAVE (obrigatório). Opcionais: HOTMART_HOTTOK, PRODUTO_CREDITOS (id do produto de créditos extras),
// CREDITOS_PACOTE (quantos créditos esse produto dá; padrão 20).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ok = (msg: string, status = 200) => new Response(msg, { status });

type Aviso = { origem: string; email: string; pedido: string; produto: string; situacao: "aprovado" | "cancelado" | "ignorar" };

function lerKiwify(b: any): Aviso | null {
  if (!b || !(b.Customer || b.order_status)) return null;
  const st = String(b.order_status || "").toLowerCase();
  const ev = String(b.webhook_event_type || "").toLowerCase();
  const situacao = st === "paid" || ev === "order_approved" ? "aprovado"
    : ["refunded", "chargedback"].includes(st) || ["order_refunded", "chargeback"].includes(ev) ? "cancelado" : "ignorar";
  return { origem: "kiwify", email: b.Customer?.email || "", pedido: String(b.order_id || b.order_ref || ""),
    produto: String(b.Product?.product_id || ""), situacao };
}

function lerHotmart(b: any): Aviso | null {
  if (!b || !b.event || !b.data) return null;
  const ev = String(b.event).toUpperCase();
  const situacao = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"].includes(ev) ? "aprovado"
    : ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED", "PURCHASE_PROTEST"].includes(ev) ? "cancelado" : "ignorar";
  return { origem: "hotmart", email: b.data.buyer?.email || "", pedido: String(b.data.purchase?.transaction || ""),
    produto: String(b.data.product?.id || ""), situacao };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok("use POST", 405);
  const chave = Deno.env.get("WEBHOOK_CHAVE");
  if (!chave || new URL(req.url).searchParams.get("chave") !== chave) return ok("chave inválida", 401);
  const hottok = Deno.env.get("HOTMART_HOTTOK");

  let b: any;
  try { b = await req.json(); } catch { return ok("json inválido", 400); }
  const aviso = lerHotmart(b) || lerKiwify(b);
  if (!aviso) return ok("formato desconhecido (ignorado)");
  if (aviso.origem === "hotmart" && hottok && req.headers.get("x-hotmart-hottok") !== hottok) return ok("hottok inválido", 401);
  if (aviso.situacao === "ignorar") return ok("evento ignorado");
  if (!aviso.email || !aviso.pedido) return ok("sem e-mail ou pedido", 400);

  const pacote = Deno.env.get("PRODUTO_CREDITOS");
  const ehPacote = !!pacote && aviso.produto === pacote;
  const { error } = aviso.situacao === "aprovado"
    ? await sb.rpc("registrar_compra", {
        p_email: aviso.email, p_pedido: aviso.pedido, p_origem: aviso.origem,
        p_creditos: ehPacote ? Number(Deno.env.get("CREDITOS_PACOTE") || 20) : null,
      })
    : ehPacote ? { error: null } // reembolso só do pacote de créditos não bloqueia o acesso vitalício
    : await sb.rpc("cancelar_compra", { p_email: aviso.email, p_pedido: aviso.pedido, p_origem: aviso.origem });

  if (error){ console.error(error); return ok("erro ao salvar", 500); } // a plataforma reenvia depois
  return ok("ok");
});
