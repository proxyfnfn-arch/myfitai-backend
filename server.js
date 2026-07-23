/* ============================================================
   MyFitAI — Backend (Render, servidor Express normal)
   ------------------------------------------------------------
   Un servidor de verdad (no funciones sueltas), pensado para
   evitar los problemas de CORS/preflight que dieron guerra en
   Vercel. Expone:
     POST /api/scan    -> analiza foto de comida con Gemini
     POST /api/coach   -> chat de fitness/nutrición con Gemini
     POST /api/redeem  -> valida códigos premium

   Variable de entorno necesaria: GEMINI_API_KEY
   (se pone en Render -> tu servicio -> Environment)
   ============================================================ */
import express from "express";

const app = express();

// Aceptamos el cuerpo como texto plano SIEMPRE (sea cual sea el
// Content-Type que mande el navegador) y lo parseamos nosotros a
// mano. Así evitamos por completo el "preflight" de CORS que
// causaba los fallos en Vercel.
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

async function callGemini(contents, generationConfig = {}){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Error de Gemini");
  return data;
}

// Página de comprobación rápida: abrir la URL raíz en el navegador
// debe mostrar esto si el servidor está vivo.
app.get("/", (req, res) => {
  res.json({ ok: true, service: "myfitai-backend" });
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
Responde SOLO con este JSON exacto (sin texto extra):
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

    const data = await callGemini(
      [{
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
        ],
      }],
      { temperature: 0.2, responseMimeType: "application/json" }
    );

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini no devolvió resultado.");
    return res.status(200).json(JSON.parse(text));
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

    const contents = [
      { role: "user", parts: [{ text: `${COACH_SYSTEM_PROMPT}\n\n${contextText}` }] },
      { role: "model", parts: [{ text: "Entendido, listo para ayudar solo con fitness y nutrición." }] },
      ...(history || []).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const data = await callGemini(contents, { temperature: 0.6 });
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No he podido generar una respuesta.";
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
  console.log(`MyFitAI backend escuchando en el puerto ${PORT}`);
});
