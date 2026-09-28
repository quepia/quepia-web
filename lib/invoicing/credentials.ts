import "server-only"

import forge from "node-forge"

// El mismo pedido de certificado que arma `npx facturas init`, siguiendo el
// instructivo de ARCA: RSA 2048, SHA-256 y el CUIT en serialNumber.
const RSA_BITS = 2048
const SUBJECT_TAX_ID = /^CUIT\s+(\d{11})$/

export interface KeyAndCsr {
  privateKeyPem: string
  csrPem: string
}

export function generateKeyAndCsr(taxId: string, commonName: string): Promise<KeyAndCsr> {
  return new Promise((resolve, reject) => {
    // La versión asincrónica no bloquea el servidor mientras busca primos.
    forge.pki.rsa.generateKeyPair({ bits: RSA_BITS, e: 0x10001, workers: -1 }, (error, keyPair) => {
      if (error) return reject(error)
      const request = forge.pki.createCertificationRequest()
      request.publicKey = keyPair.publicKey
      request.setSubject([
        { name: "countryName", value: "AR" },
        { name: "organizationName", value: taxId },
        { name: "commonName", value: commonName },
        { name: "serialNumber", value: `CUIT ${taxId}` },
      ])
      request.sign(keyPair.privateKey, forge.md.sha256.create())
      resolve({
        privateKeyPem: forge.pki.privateKeyInfoToPem(
          forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyPair.privateKey)),
        ),
        csrPem: forge.pki.certificationRequestToPem(request),
      })
    })
  })
}

/** Acepta el PEM tal como se copia de ARCA: con espacios, \r o sin saltos. */
export function normalizePem(value: string): string {
  const text = value.replace(/\r/g, "").trim()
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text)
  if (!match) return text
  const body = match[2].replace(/\s+/g, "")
  const lines = body.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${match[1]}-----\n${lines.join("\n")}\n-----END ${match[1]}-----\n`
}

export interface CertificateFacts {
  taxId: string | null
  commonName: string | null
  issuer: string | null
  notBefore: string
  notAfter: string
}

export function readCertificate(certificatePem: string): CertificateFacts {
  const certificate = forge.pki.certificateFromPem(certificatePem)
  const serial = certificate.subject.getField({ name: "serialNumber" })?.value
  const commonName = certificate.subject.getField({ name: "commonName" })?.value
  const issuer = certificate.issuer.getField({ name: "commonName" })?.value
  return {
    taxId: typeof serial === "string" ? SUBJECT_TAX_ID.exec(serial.trim())?.[1] ?? null : null,
    commonName: typeof commonName === "string" ? commonName : null,
    issuer: typeof issuer === "string" ? issuer : null,
    notBefore: certificate.validity.notBefore.toISOString(),
    notAfter: certificate.validity.notAfter.toISOString(),
  }
}

export function keyMatchesCertificate(certificatePem: string, privateKeyPem: string): boolean {
  const certificate = forge.pki.certificateFromPem(certificatePem)
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey
  return publicKey.n.compareTo(privateKey.n) === 0 && publicKey.e.compareTo(privateKey.e) === 0
}

/** Verifica que la clave privada sea una RSA válida; lanza si no lo es. */
export function assertPrivateKey(privateKeyPem: string): void {
  forge.pki.privateKeyFromPem(privateKeyPem)
}
