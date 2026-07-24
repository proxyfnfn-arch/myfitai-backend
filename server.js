/* ============================================================
   MyFitAI — Backend (Render, servidor Express)
   ------------------------------------------------------------
     POST /api/scan    -> analiza foto de comida (OpenRouter, visión)
     POST /api/coach   -> chat fitness/nutrición (Groq)
     POST /api/redeem  -> valida códigos premium

   Variables de entorno necesarias:
     GROQ_API_KEY        -> https://console.groq.com/keys
     OPENROUTER_API_KEY  -> https://openrouter.ai/keys

   Usamos dos proveedores distintos a propósito: si uno se queda
   sin cuota gratuita momentáneamente, el otro sigue funcionando.
   ============================================================ */
import express from "express";

const app = express();
app.use(express.text({ type: "*/*", limit: "15mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function parseBody(req){
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function requireToken(body){
  if (!body?.idToken) {
    const err = new Error("No autorizado.");
    err.status = 401;
    throw err;
  }
}

/** Extrae el primer bloque JSON de un texto, quitando ```json ... ``` si lo trae. */
function extractJson(text){
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("La IA no devolvió JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callGroq(model, messages, extra = {}){
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Error de Groq");
  return data;
}

async function callOpenRouter(model, messages, extra = {}){
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://myfit-ai.netlify.app",
      "X-Title": "MyFitAI",
    },
    body: JSON.stringify({ model, messages, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Error de OpenRouter");
  return data;
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "myfitai-backend (Groq + OpenRouter)" });
});

app.post("/api/scan", async (req, res) => {
  try {
    const body = parseBody(req);
    requireToken(body);

    const { imageBase64, mimeType, note } = body;
    if (!imageBase64) return res.status(400).json({ error: "Falta la imagen." });

    const prompt = `Eres un nutricionista experto analizando una foto de comida.
Identifica cada alimento visible, estima su peso en gramos y calcula sus
macros. Si no puedes estar seguro de algo, dilo en needsMoreInfo.
Nota del usuario: ${note || "(ninguna)"}.
Responde SOLO con este JSON exacto, sin texto antes ni después, sin
markdown ni backticks:
{
  "needsMoreInfo": boolean,
  "clarifyingQuestion": string|null,
  "totals": { "calories": number, "proteinG": number, "carbsG": number, "fatG": number },
  "items": [
    { "name": string, "estimatedGrams": number, "calories": number,
      "proteinG": number, "carbsG": number, "fatG": number,
      "fiberG": number, "sodiumMg": number, "sugarG": number,
      "confidence": "high"|"medium"|"low" }
  ]
}`;

    const data = await callOpenRouter("qwen/qwen2.5-vl-72b-instruct:free", [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } },
        ],
      },
    ], { temperature: 0.2 });

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("La IA no devolvió resultado.");
    return res.status(200).json(extractJson(text));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Error interno." });
  }
});

const COACH_SYSTEM_PROMPT = `Eres el Coach IA de MyFitAI, especializado únicamente en
fitness, nutrición, entrenamiento y hábitos saludables.
Si te preguntan algo que no tiene relación con eso, responde
amablemente que solo puedes ayudar con fitness y nutrición.
Basa tus consejos en el perfil del usuario cuando te lo den
(objetivo, nivel de actividad, experiencia, macros). Responde
en español, de forma cercana y con consejos concretos y
accionables. No inventes datos médicos ni reemplaces a un
profesional sanitario en temas de salud delicados.`;

app.post("/api/coach", async (req, res) => {
  try {
    const body = parseBody(req);
    requireToken(body);

    const { message, history, profile } = body;
    if (!message) return res.status(400).json({ error: "Falta el mensaje." });

    const contextText = profile
      ? `Perfil del usuario: objetivo=${profile.goal}, actividad=${profile.activityLevel}, experiencia=${profile.experience}, calorías objetivo=${profile.metrics?.calorieTarget}, proteína=${profile.metrics?.proteinG}g.`
      : "";

    const messages = [
      { role: "system", content: `${COACH_SYSTEM_PROMPT}\n\n${contextText}` },
      ...(history || []).map(h => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text,
      })),
      { role: "user", content: message },
    ];

    const data = await callGroq("openai/gpt-oss-120b", messages, { temperature: 0.6 });
    const reply = data.choices?.[0]?.message?.content || "No he podido generar una respuesta.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Error interno." });
  }
});

const PREMIUM_CODES = {
  "MYFITAI2026": 30,
};

app.post("/api/redeem", async (req, res) => {
  try {
    const body = parseBody(req);
    const days = PREMIUM_CODES[(body.code || "").toUpperCase()];
    if (!days) return res.status(200).json({ success: false });
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    return res.status(200).json({ success: true, expiresAt });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MyFitAI backend (Groq + OpenRouter) escuchando en el puerto ${PORT}`);
});
