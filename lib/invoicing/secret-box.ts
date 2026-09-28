import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Formato guardado: "v1:<iv>:<tag>:<datos>" en base64. AES-256-GCM detecta
// cualquier alteración del texto cifrado, y el contexto (entorno) va como
// dato asociado: una clave de homologación no se puede pegar en producción.
const VERSION = "v1"

export class InvoicingKeyError extends Error {}

function masterKey(): Buffer {
  const raw = process.env.INVOICING_ENCRYPTION_KEY ?? ""
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new InvoicingKeyError(
      "Falta INVOICING_ENCRYPTION_KEY (32 bytes en base64) en el servidor.",
    )
  }
  return key
}

export function hasMasterKey(): boolean {
  try {
    masterKey()
    return true
  } catch {
    return false
  }
}

export function encryptSecret(plain: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

export function decryptSecret(sealed: string, context: string): string {
  const [version, iv, tag, data] = sealed.split(":")
  if (version !== VERSION || !iv || !tag || !data) {
    throw new InvoicingKeyError("La clave guardada tiene un formato desconocido.")
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"))
    decipher.setAAD(Buffer.from(context, "utf8"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  } catch (error) {
    if (error instanceof InvoicingKeyError) throw error
    throw new InvoicingKeyError(
      "No se pudo descifrar la clave privada: INVOICING_ENCRYPTION_KEY no es la misma con la que se guardó.",
    )
  }
}
