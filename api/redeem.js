/* ============================================================
   MyFitAI — /api/redeem (Vercel Serverless Function)
   ------------------------------------------------------------
   Valida códigos premium. Para empezar gratis, los códigos
   viven aquí mismo en el código.
   ============================================================ */

const PREMIUM_CODES = {
  "MYFITAI2026": 30, // código -> días de premium que otorga
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const { code } = req.body || {};
  const days = PREMIUM_CODES[(code || "").toUpperCase()];
  if (!days) return res.status(200).json({ success: false });

  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  return res.status(200).json({ success: true, expiresAt });
}
