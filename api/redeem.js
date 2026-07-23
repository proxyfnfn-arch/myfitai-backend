/* ============================================================
   MyFitAI — /api/redeem (Vercel Serverless Function)
   ------------------------------------------------------------
   Valida códigos premium.
   ============================================================ */
import { setCors, readJsonBody } from "./_helpers.js";

const PREMIUM_CODES = {
  "MYFITAI2026": 30, // código -> días de premium que otorga
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  try {
    const body = await readJsonBody(req);
    const days = PREMIUM_CODES[(body.code || "").toUpperCase()];
    if (!days) return res.status(200).json({ success: false });

    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    return res.status(200).json({ success: true, expiresAt });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Error interno." });
  }
}
