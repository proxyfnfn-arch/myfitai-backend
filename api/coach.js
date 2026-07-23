/* ============================================================
   MyFitAI — /api/coach (Vercel Serverless Function)
   ------------------------------------------------------------
   Chat con Gemini, restringido SOLO a fitness y nutrición.
   ============================================================ */

const SYSTEM_PROMPT = `Eres el Coach IA de MyFitAI, especializado únicamente en
fitness, nutrición, entrenamiento y hábitos saludables.
Si te preguntan algo que no tiene relación con eso, responde
amablemente que solo puedes ayudar con fitness y nutrición.
Basa tus consejos en el perfil del usuario cuando te lo den
(objetivo, nivel de actividad, experiencia, macros). Responde
en español, de forma cercana y con consejos concretos y
accionables. No inventes datos médicos ni reemplaces a un
profesional sanitario en temas de salud delicados.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "No autorizado." });

  try {
    const { message, history, profile } = req.body || {};
    if (!message) return res.status(400).json({ error: "Falta el mensaje." });

    const contextText = profile
      ? `Perfil del usuario: objetivo=${profile.goal}, actividad=${profile.activityLevel}, experiencia=${profile.experience}, calorías objetivo=${profile.metrics?.calorieTarget}, proteína=${profile.metrics?.proteinG}g.`
      : "";

    const contents = [
      { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${contextText}` }] },
      { role: "model", parts: [{ text: "Entendido, listo para ayudar solo con fitness y nutrición." }] },
      ...(history || []).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.6 } }),
    });
    const data = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(data.error?.message || "Error de Gemini");

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No he podido generar una respuesta.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno." });
  }
}
