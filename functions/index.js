// Modo automático: confere o login, gasta 1 crédito e pede o conteúdo ao Google Gemini. Se der erro, devolve o crédito.
// Chave da IA (grátis em https://aistudio.google.com/apikey): firebase functions:secrets:set GEMINI_API_KEY
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
const CHAVE = defineSecret("GEMINI_API_KEY");
// "gemini-flash-latest" sempre aponta para o Flash mais novo, que tem cota grátis. Para trocar: GEMINI_MODEL em functions/.env
const MODELO = defineString("GEMINI_MODEL", { default: "gemini-flash-latest" });

// Erro da IA com o código HTTP, para avisar o cliente do jeito certo
class ErroIA extends Error { constructor(msg, status) { super(msg); this.status = status; } }

// Se o modelo principal estiver no limite da cota grátis, tenta este (cota grátis separada e maior)
const RESERVA = defineString("GEMINI_MODEL_RESERVA", { default: "gemini-flash-lite-latest" });
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Quanto o Gemini pediu para esperar (ex.: "retryDelay": "17s")
const esperaPedida = (dados) => {
  const d = ((dados.error && dados.error.details) || []).find((x) => x.retryDelay);
  return d ? Math.ceil(parseFloat(d.retryDelay) * 1000) : 0;
};

async function chamarGemini(modelo, tipo, pedido, ms) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE.value().trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA[tipo] }] },
      contents: [{ role: "user", parts: [{ text: pedido }] }],
      generationConfig: {
        maxOutputTokens: tipo === "svg" ? 24000 : 32000,
        ...(tipo === "json" ? { responseMimeType: "application/json" } : {}),
      },
    }),
    signal: AbortSignal.timeout(ms),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new ErroIA((dados.error && dados.error.message) || "erro " + r.status, r.status);
    e.espera = esperaPedida(dados);
    throw e;
  }
  // custo de cada uso (tokens): veja em Functions > Registros
  console.log("uso da IA", JSON.stringify({ tipo, modelo: dados.modelVersion, usage: dados.usageMetadata }));
  if (dados.promptFeedback && dados.promptFeedback.blockReason) throw new ErroIA("recusado");
  const c = (dados.candidates || [])[0];
  if (!c) throw new ErroIA("vazio");
  if (c.finishReason === "MAX_TOKENS") throw new ErroIA("cortado");
  if (c.finishReason && c.finishReason !== "STOP") throw new ErroIA("recusado: " + c.finishReason);
  const texto = ((c.content && c.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
  if (!texto) throw new ErroIA("vazio");
  return texto;
}

// Pede ao modelo principal; se estiver ocupado ou no limite, espera o que o Gemini pedir e tenta de novo,
// e depois passa para o modelo reserva. Tudo dentro de ~280 s (a função tem 300 s).
async function pedirGemini(tipo, pedido) {
  const fim = Date.now() + 280000;
  const modelos = [...new Set([MODELO.value(), RESERVA.value()].filter(Boolean))];
  let ultimo;
  for (const [i, modelo] of modelos.entries()) {
    const temReserva = i < modelos.length - 1;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const resta = fim - Date.now();
      if (resta < 15000) throw ultimo || new ErroIA("sem tempo", 503);
      try {
        // o principal tem no máximo 150 s, para sobrar tempo para o reserva (que é bem mais rápido)
        return await chamarGemini(modelo, tipo, pedido, temReserva ? Math.min(resta, 150000) : resta);
      } catch (e) {
        ultimo = e;
        const ocupado = e.status === 429 || e.status === 500 || e.status === 503;
        console.warn("Gemini falhou", JSON.stringify({ modelo, tentativa, status: e.status, erro: e.name, msg: String(e.message).slice(0, 400) }));
        // demorou demais, saiu cortado ou vazio: tenta logo o modelo reserva
        if (e.name === "TimeoutError" || /^(cortado|vazio)$/.test(e.message)) break;
        if (!ocupado) throw e;
        // cota do dia acabou: não adianta esperar, vai direto para o reserva
        if (/per.?day|PerDay/i.test(e.message)) break;
        const ms = Math.min(e.espera || tentativa * 5000, 30000);
        if (fim - Date.now() - ms < 15000) break;
        await espera(ms);
      }
    }
  }
  throw ultimo;
}
// Mesma lista de config.js e firestore.rules
const ADMINS = ["admin@apostilas.local"];
// 1 crédito = 1 página (ou atividade, seção ou ilustração) gerada pela IA.
// O planejamento e a contracapa ("extra") não gastam crédito, mas têm este limite por cliente por dia.
const LIMITE_EXTRAS = 30;

const SISTEMA = {
  json: "Você é o gerador de conteúdo do app Criador de Apostilas. Escreva apostilas didáticas corretas em português do Brasil e responda exatamente no formato JSON pedido, sem nenhum texto fora do JSON.",
  svg: "Você é o ilustrador do app Criador de Apostilas. Desenhe ilustrações didáticas em SVG e responda somente com o código SVG pedido, sem explicações.",
};

exports.gerar = onCall(
  { region: "southamerica-east1", secrets: [CHAVE], timeoutSeconds: 300, memory: "512MiB", maxInstances: 10 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Entre na sua conta de novo.");
    const { tipo, pedido } = req.data || {};
    const extra = (req.data || {}).extra === true;
    if (!["json", "svg"].includes(tipo) || typeof pedido !== "string" || !pedido.trim() || pedido.length > 12000)
      throw new HttpsError("invalid-argument", "Pedido inválido.");

    const ehAdmin = ADMINS.includes(req.auth.token.email);
    const ref = db.collection("clientes").doc(req.auth.uid);
    let cobrou = false, contouExtra = false;
    if (!ehAdmin) {
      await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists || !s.get("ativo")) throw new HttpsError("permission-denied", "Seu acesso não está liberado.");
        if ((s.get("creditos") || 0) <= 0) throw new HttpsError("resource-exhausted", "Sem créditos.");
        const agora = FieldValue.serverTimestamp();
        if (extra) {
          const hoje = new Date().toISOString().slice(0, 10);
          const usos = s.get("extrasDia") === hoje ? (s.get("extrasUsos") || 0) : 0;
          if (usos >= LIMITE_EXTRAS)
            throw new HttpsError("failed-precondition", "Você já fez muitos planejamentos hoje. Tente de novo amanhã.");
          t.update(ref, { extrasDia: hoje, extrasUsos: usos + 1, ultimoAcesso: agora });
          contouExtra = true;
        } else {
          t.update(ref, { creditos: FieldValue.increment(-1), usosIA: FieldValue.increment(1), ultimoAcesso: agora });
          cobrou = true;
        }
      });
    }
    // deu errado: desfaz o que este pedido fez
    const devolver = async () => {
      try {
        if (cobrou) await ref.update({ creditos: FieldValue.increment(1), usosIA: FieldValue.increment(-1) });
        else if (contouExtra) await ref.update({ extrasUsos: FieldValue.increment(-1) });
      } catch (_) {}
    };

    try {
      const texto = await pedirGemini(tipo, pedido);
      return { texto, cobrou };
    } catch (e) {
      console.error("falha na IA:", e);
      await devolver();
      if (e.status === 429 || e.status === 503)
        throw new HttpsError("unavailable", "A IA está muito ocupada agora (ou a cota grátis do dia acabou). Espere um pouco e tente de novo; seu crédito foi devolvido.");
      throw new HttpsError("aborted", "Não consegui gerar agora. Seu crédito foi devolvido; tente de novo.");
    }
  }
);

// ---------- Página ilustrada: a IA de imagem do Gemini desenha a página inteira (texto + ilustrações) ----------
// Não tem cota grátis: a chave do Gemini precisa estar com o faturamento ativo. Cada imagem gasta 1 crédito do cliente.
// "Pro" escreve bem textos longos em português; para economizar: GEMINI_IMAGE_MODEL=gemini-2.5-flash-image em functions/.env
const MODELO_IMG = defineString("GEMINI_IMAGE_MODEL", { default: "gemini-3-pro-image-preview" });

async function desenharGemini(pedido, ref) {
  const modelo = MODELO_IMG.value();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const partes = [{ text: pedido }];
  if (ref) partes.push({ inlineData: { mimeType: ref.mime, data: ref.data } });
  const corpo = JSON.stringify({
    contents: [{ role: "user", parts: partes }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      // 2:3 é o retrato mais perto do A4; o Pro aceita 2K (letras mais nítidas)
      imageConfig: { aspectRatio: "2:3", ...(/pro/i.test(modelo) ? { imageSize: "2K" } : {}) },
    },
  });
  const fim = Date.now() + 280000;
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const resta = fim - Date.now();
    if (resta < 20000) break;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE.value().trim() },
        body: corpo,
        signal: AbortSignal.timeout(resta),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new ErroIA((dados.error && dados.error.message) || "erro " + r.status, r.status);
        e.espera = esperaPedida(dados);
        throw e;
      }
      console.log("uso da IA (imagem)", JSON.stringify({ modelo: dados.modelVersion, usage: dados.usageMetadata }));
      const c = (dados.candidates || [])[0];
      const img = c && ((c.content && c.content.parts) || []).filter((x) => !x.thought).map((x) => x.inlineData || x.inline_data).find((x) => x && x.data);
      if (!img) throw new ErroIA("sem imagem: " + ((c && c.finishReason) || (dados.promptFeedback && dados.promptFeedback.blockReason) || "vazio"));
      return `data:${img.mimeType || img.mime_type || "image/png"};base64,${img.data}`;
    } catch (e) {
      ultimo = e;
      console.warn("Gemini imagem falhou", JSON.stringify({ modelo, tentativa, status: e.status, erro: e.name, msg: String(e.message).slice(0, 400) }));
      if (![429, 500, 503].includes(e.status)) throw e;
      await espera(Math.min(e.espera || tentativa * 8000, 30000));
    }
  }
  throw ultimo || new ErroIA("sem tempo", 503);
}

exports.gerarImagem = onCall(
  { region: "southamerica-east1", secrets: [CHAVE], timeoutSeconds: 300, memory: "1GiB", maxInstances: 10 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Entre na sua conta de novo.");
    const { pedido, referencia } = req.data || {};
    if (typeof pedido !== "string" || !pedido.trim() || pedido.length > 20000) throw new HttpsError("invalid-argument", "Pedido inválido.");
    let ref = null;
    if (referencia != null) {
      const m = typeof referencia === "string" && referencia.length < 4000000 && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(referencia);
      if (!m) throw new HttpsError("invalid-argument", "Imagem de referência inválida.");
      ref = { mime: m[1], data: m[2] };
    }
    const ehAdmin = ADMINS.includes(req.auth.token.email);
    const ref2 = db.collection("clientes").doc(req.auth.uid);
    if (!ehAdmin) {
      await db.runTransaction(async (t) => {
        const s = await t.get(ref2);
        if (!s.exists || !s.get("ativo")) throw new HttpsError("permission-denied", "Seu acesso não está liberado.");
        if ((s.get("creditos") || 0) <= 0) throw new HttpsError("resource-exhausted", "Sem créditos.");
        t.update(ref2, { creditos: FieldValue.increment(-1), usosImg: FieldValue.increment(1), ultimoAcesso: FieldValue.serverTimestamp() });
      });
    }
    try {
      return { imagem: await desenharGemini(pedido, ref), cobrou: !ehAdmin };
    } catch (e) {
      console.error("falha na IA de imagem:", e);
      if (!ehAdmin) await ref2.update({ creditos: FieldValue.increment(1), usosImg: FieldValue.increment(-1) }).catch(() => {});
      if (e.status === 429 || e.status === 503)
        throw new HttpsError("unavailable", "A IA de imagens está ocupada agora. Espere um pouco e tente de novo; seu crédito foi devolvido.");
      if (e.status === 400 || e.status === 403 || e.status === 404)
        throw new HttpsError("failed-precondition", "A geração de imagens ainda não está liberada no servidor. Seu crédito foi devolvido.");
      throw new HttpsError("aborted", "Não consegui desenhar esta página. Seu crédito foi devolvido; tente de novo.");
    }
  }
);

// Só o administrador: confere quem chamou e não deixa mexer em outra conta de administrador
async function clienteDoAdmin(req) {
  if (!req.auth || !ADMINS.includes(req.auth.token.email)) throw new HttpsError("permission-denied", "Só o administrador pode fazer isso.");
  const uid = (req.data || {}).uid;
  if (typeof uid !== "string" || !uid) throw new HttpsError("invalid-argument", "Cliente inválido.");
  const u = await getAuth().getUser(uid).catch(() => null);
  if (u && ADMINS.includes(u.email)) throw new HttpsError("permission-denied", "Não dá para mexer na conta do administrador.");
  return { uid, u };
}

// Cliente esqueceu a senha: o administrador define uma nova (as sessões abertas dele são encerradas)
exports.redefinirSenha = onCall({ region: "southamerica-east1", maxInstances: 5 }, async (req) => {
  const { uid, u } = await clienteDoAdmin(req);
  const senha = (req.data || {}).senha;
  if (typeof senha !== "string" || senha.length < 6 || senha.length > 100) throw new HttpsError("invalid-argument", "A senha precisa de pelo menos 6 caracteres.");
  if (!u) throw new HttpsError("not-found", "Essa conta não existe mais.");
  await getAuth().updateUser(uid, { password: senha });
  await getAuth().revokeRefreshTokens(uid);
  return { ok: true };
});

// Excluir de vez um cliente: login, dados da conta e todas as apostilas e imagens
exports.excluirCliente = onCall({ region: "southamerica-east1", maxInstances: 5, timeoutSeconds: 120 }, async (req) => {
  const { uid, u } = await clienteDoAdmin(req);
  await db.recursiveDelete(db.collection("clientes").doc(uid));
  if (u) await getAuth().deleteUser(uid);
  return { ok: true };
});
