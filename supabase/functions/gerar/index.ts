// Modo automático do site próprio: confere a conta, gasta 1 crédito e pede o conteúdo ao Claude.
// Segredos (Supabase > Edge Functions > Secrets): ANTHROPIC_API_KEY. Opcionais: ANTHROPIC_MODEL, ANTHROPIC_EFFORT.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const claude = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MODELO = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-5-5";
// "low" responde mais rápido (a função tem limite de tempo); suba para "medium" se quiser textos mais caprichados
const ESFORCO = Deno.env.get("ANTHROPIC_EFFORT") || "low";

const SISTEMA = {
  json: "Você é o gerador de conteúdo do app Criador de Apostilas. Escreva apostilas didáticas corretas em português do Brasil e responda exatamente no formato JSON pedido, sem nenhum texto fora do JSON.",
  svg: "Você é o ilustrador do app Criador de Apostilas. Desenhe ilustrações didáticas em SVG e responda somente com o código SVG pedido, sem explicações.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { erro: "metodo" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return responder(401, { erro: "login", mensagem: "Entre na sua conta de novo." });

  let corpo: { tipo?: string; pedido?: string };
  try { corpo = await req.json(); } catch { return responder(400, { erro: "pedido" }); }
  const tipo = corpo.tipo === "svg" ? "svg" : corpo.tipo === "json" ? "json" : null;
  const pedido = typeof corpo.pedido === "string" ? corpo.pedido.trim() : "";
  if (!tipo || !pedido || pedido.length > 12000) return responder(400, { erro: "pedido", mensagem: "Pedido inválido." });

  const { data: resto, error: erroCredito } = await sb.rpc("usar_credito", { p_id: user.id });
  if (erroCredito) return responder(500, { erro: "falha", mensagem: "Não consegui verificar seus créditos. Tente de novo." });
  if (resto === null) return responder(402, { erro: "sem_credito", creditos: 0 });

  try {
    const stream = claude.beta.messages.stream({
      model: MODELO,
      max_tokens: tipo === "svg" ? 24000 : 32000,
      system: SISTEMA[tipo],
      messages: [{ role: "user", content: pedido }],
      // @ts-ignore: campos recentes que a tipagem do SDK pode ainda não ter
      output_config: { effort: ESFORCO },
      // Se o filtro de segurança recusar por engano, o próprio servidor da Anthropic tenta outro modelo
      // @ts-ignore
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("recusado");
    const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!texto) throw new Error("vazio");
    if (msg.stop_reason === "max_tokens") throw new Error("cortado");
    return responder(200, { texto, creditos: resto });
  } catch (e) {
    console.error("falha na IA:", e);
    const { data: devolvido } = await sb.rpc("devolver_credito", { p_id: user.id });
    const ocupado = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529);
    return responder(ocupado ? 429 : 502, {
      erro: ocupado ? "rate_limited" : "falha",
      mensagem: ocupado ? "A IA está muito ocupada agora. Espere um minuto e tente de novo; seu crédito foi devolvido."
                        : "Não consegui gerar agora. Seu crédito foi devolvido; tente de novo.",
      creditos: typeof devolvido === "number" ? devolvido : undefined,
    });
  }
});
