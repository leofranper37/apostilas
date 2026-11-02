// Modo automático: confere o login, gasta 1 crédito e pede o conteúdo ao Claude. Se der erro, devolve o crédito.
// Chave da IA: firebase functions:secrets:set ANTHROPIC_API_KEY
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

initializeApp();
const db = getFirestore();
const CHAVE = defineSecret("ANTHROPIC_API_KEY");
const MODELO = defineString("ANTHROPIC_MODEL", { default: "claude-opus-5-5" });
// "low" responde mais rápido; "medium" escreve com mais capricho e demora mais
const ESFORCO = defineString("ANTHROPIC_EFFORT", { default: "low" });
// Mesma lista de config.js e firestore.rules
const ADMINS = ["admin@apostilas.local"];

const SISTEMA = {
  json: "Você é o gerador de conteúdo do app Criador de Apostilas. Escreva apostilas didáticas corretas em português do Brasil e responda exatamente no formato JSON pedido, sem nenhum texto fora do JSON.",
  svg: "Você é o ilustrador do app Criador de Apostilas. Desenhe ilustrações didáticas em SVG e responda somente com o código SVG pedido, sem explicações.",
};

exports.gerar = onCall(
  { region: "southamerica-east1", secrets: [CHAVE], timeoutSeconds: 300, memory: "512MiB", maxInstances: 10 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Entre na sua conta de novo.");
    const { tipo, pedido } = req.data || {};
    if (!["json", "svg"].includes(tipo) || typeof pedido !== "string" || !pedido.trim() || pedido.length > 12000)
      throw new HttpsError("invalid-argument", "Pedido inválido.");

    const ehAdmin = ADMINS.includes(req.auth.token.email);
    const ref = db.collection("clientes").doc(req.auth.uid);
    if (!ehAdmin) {
      await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists || !s.get("ativo")) throw new HttpsError("permission-denied", "Seu acesso não está liberado.");
        if ((s.get("creditos") || 0) <= 0) throw new HttpsError("resource-exhausted", "Sem créditos.");
        t.update(ref, { creditos: FieldValue.increment(-1), usosIA: FieldValue.increment(1), ultimoAcesso: FieldValue.serverTimestamp() });
      });
    }
    const devolver = () => ehAdmin ? null : ref.update({ creditos: FieldValue.increment(1), usosIA: FieldValue.increment(-1) }).catch(() => {});

    try {
      const claude = new Anthropic({ apiKey: CHAVE.value() });
      const stream = claude.beta.messages.stream({
        model: MODELO.value(),
        max_tokens: tipo === "svg" ? 24000 : 32000,
        system: SISTEMA[tipo],
        messages: [{ role: "user", content: pedido }],
        output_config: { effort: ESFORCO.value() },
        // Se o filtro de segurança recusar por engano, a Anthropic tenta outro modelo no próprio servidor
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new Error("recusado");
      if (msg.stop_reason === "max_tokens") throw new Error("cortado");
      const texto = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      if (!texto) throw new Error("vazio");
      return { texto };
    } catch (e) {
      console.error("falha na IA:", e);
      await devolver();
      if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529))
        throw new HttpsError("unavailable", "A IA está muito ocupada agora. Espere um minuto e tente de novo; seu crédito foi devolvido.");
      throw new HttpsError("aborted", "Não consegui gerar agora. Seu crédito foi devolvido; tente de novo.");
    }
  }
);
