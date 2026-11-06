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
// Pedidos de IA que 1 crédito cobre numa mesma apostila (mesmo número em app/index.html: LIMITE_IA)
const LIMITE = 40;

const SISTEMA = {
  json: "Você é o gerador de conteúdo do app Criador de Apostilas. Escreva apostilas didáticas corretas em português do Brasil e responda exatamente no formato JSON pedido, sem nenhum texto fora do JSON.",
  svg: "Você é o ilustrador do app Criador de Apostilas. Desenhe ilustrações didáticas em SVG e responda somente com o código SVG pedido, sem explicações.",
};

exports.gerar = onCall(
  { region: "southamerica-east1", secrets: [CHAVE], timeoutSeconds: 300, memory: "512MiB", maxInstances: 10 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Entre na sua conta de novo.");
    const { tipo, pedido, apostila } = req.data || {};
    if (!["json", "svg"].includes(tipo) || typeof pedido !== "string" || !pedido.trim() || pedido.length > 12000)
      throw new HttpsError("invalid-argument", "Pedido inválido.");
    // 1 crédito vale para uma apostila inteira: o primeiro pedido dela desconta 1 crédito; os seguintes
    // (páginas, "gerar novamente", contracapa) não descontam, até LIMITE pedidos. Passou disso, desconta mais 1.
    if (typeof apostila !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(apostila))
      throw new HttpsError("invalid-argument", "Apostila inválida. Atualize a página e tente de novo.");

    const ehAdmin = ADMINS.includes(req.auth.token.email);
    const ref = db.collection("clientes").doc(req.auth.uid);
    const gRef = ref.collection("geracoes").doc(apostila);
    let cobrou = false, antes = 0, usos = 0;
    if (!ehAdmin) {
      await db.runTransaction(async (t) => {
        const s = await t.get(ref), g = await t.get(gRef);
        if (!s.exists || !s.get("ativo")) throw new HttpsError("permission-denied", "Seu acesso não está liberado.");
        antes = g.exists ? (g.get("usos") || 0) : -1;   // -1: apostila nova
        const agora = FieldValue.serverTimestamp();
        if (antes < 0 || antes >= LIMITE) {
          if ((s.get("creditos") || 0) <= 0) throw new HttpsError("resource-exhausted", "Sem créditos.");
          t.update(ref, { creditos: FieldValue.increment(-1), usosIA: FieldValue.increment(1), ultimoAcesso: agora });
          t.set(gRef, { usos: 1, creditos: FieldValue.increment(1), ultimoUso: agora, ...(antes < 0 ? { criadoEm: agora } : {}) }, { merge: true });
          cobrou = true; usos = 1;
        } else {
          t.update(gRef, { usos: FieldValue.increment(1), ultimoUso: agora });
          t.update(ref, { ultimoAcesso: agora });
          usos = antes + 1;
        }
      });
    }
    // deu errado: desfaz exatamente o que este pedido fez
    const devolver = async () => {
      if (ehAdmin) return;
      try {
        if (!cobrou) return await gRef.update({ usos: FieldValue.increment(-1) });
        const b = db.batch();
        b.update(ref, { creditos: FieldValue.increment(1), usosIA: FieldValue.increment(-1) });
        if (antes < 0) b.delete(gRef); else b.update(gRef, { usos: antes, creditos: FieldValue.increment(-1) });
        await b.commit();
      } catch (_) {}
    };

    try {
      const texto = await pedirGemini(tipo, pedido);
      return { texto, cobrou, usos: ehAdmin ? 0 : usos, limite: LIMITE };
    } catch (e) {
      console.error("falha na IA:", e);
      await devolver();
      if (e.status === 429 || e.status === 503)
        throw new HttpsError("unavailable", "A IA está muito ocupada agora (ou a cota grátis do dia acabou). Espere um pouco e tente de novo; seu crédito foi devolvido.");
      throw new HttpsError("aborted", "Não consegui gerar agora. Seu crédito foi devolvido; tente de novo.");
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
