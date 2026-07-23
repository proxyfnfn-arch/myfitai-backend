/* ============================================================
   MyFitAI — helper compartido por las funciones de /api
   ------------------------------------------------------------
   Lee el cuerpo de la petición como texto y lo parsea a JSON a
   mano (usamos Content-Type: text/plain a propósito desde el
   cliente para evitar el preflight de CORS, así que Vercel no
   lo parsea solo). Además valida que venga un token de sesión.
   ============================================================ */

export function setCors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export async function readJsonBody(req){
  // req.body puede llegar ya parseado (objeto) o como string/Buffer según
  // el Content-Type; cubrimos ambos casos.
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try { return JSON.parse(req.body); } catch { /* sigue abajo */ }
  }
  // Último recurso: leer el stream a mano.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function requireToken(body){
  const token = body?.idToken;
  if (!token) throw new Error("No autorizado.");
  return token;
}
