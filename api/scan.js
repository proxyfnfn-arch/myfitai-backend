/* ============================================================
   MyFitAI — /api/scan (Vercel Serverless Function)
   ------------------------------------------------------------
   Analiza una foto de comida con Google Gemini. La API key
   vive en la variable de entorno GEMINI_API_KEY (la pones en
   el panel de Vercel, nunca en el código público).
   ============================================================ */

async function callGemini(apiKey, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Error de Gemini");
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvió resultado.");
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // cámbialo por tu dominio de Neocities cuando publiques
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "No autorizado." });

  try {
    const { imageBase64, mimeType, note } = req.body || {};
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

    const result = await callGemini(process.env.GEMINI_API_KEY, [
      { text: prompt },
      { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno." });
  }
}
