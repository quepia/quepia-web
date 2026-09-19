import crypto from "node:crypto"

/**
 * X-Zernio-Signature = HMAC-SHA256 hex en minúsculas del cuerpo crudo con el
 * secret configurado en POST /v1/webhooks/settings (docs.zernio.com/webhooks).
 * Comparación en tiempo constante; X-Late-Signature es el alias heredado.
 */
export function verifyZernioSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !signatureHeader) return false
  const provided = signatureHeader.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(provided)) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}
