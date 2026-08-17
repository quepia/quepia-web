const ZERNIO_API_BASE = "https://zernio.com/api/v1"

type ZernioRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
}

export class ZernioApiError extends Error {
  status: number
  payload: Record<string, unknown> | null

  constructor(status: number, message: string, payload: Record<string, unknown> | null = null) {
    super(message)
    this.name = "ZernioApiError"
    this.status = status
    this.payload = payload
  }
}

function getApiKey() {
  const apiKey = process.env.ZERNIO_API_KEY?.trim()
  if (!apiKey) {
    throw new ZernioApiError(503, "ZERNIO_API_KEY no está configurada")
  }
  return apiKey
}

export async function zernioRequest<T>(path: string, options: ZernioRequestOptions = {}): Promise<T> {
  const response = await fetch(`${ZERNIO_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  })

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const nestedError = payload?.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null
    const message = typeof payload?.error === "string"
      ? payload.error
      : typeof nestedError?.message === "string"
        ? nestedError.message
        : typeof payload?.message === "string"
          ? payload.message
          : `Zernio respondió con estado ${response.status}`
    throw new ZernioApiError(response.status, message, payload)
  }

  return payload as T
}

export async function uploadMediaToZernio(input: {
  bytes: ArrayBuffer
  filename: string
  contentType: string
}) {
  const presigned = await zernioRequest<{
    uploadUrl: string
    publicUrl: string
  }>("/media/presign", {
    method: "POST",
    body: {
      filename: input.filename,
      contentType: input.contentType,
      size: input.bytes.byteLength,
    },
  })

  const uploadResponse = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: input.bytes,
  })

  if (!uploadResponse.ok) {
    throw new ZernioApiError(uploadResponse.status, "No se pudo transferir el asset a Zernio")
  }

  return presigned.publicUrl
}

export function toZernioMediaType(contentType: string): "image" | "video" | "document" {
  if (contentType.startsWith("image/")) return "image"
  if (contentType.startsWith("video/")) return "video"
  if (contentType === "application/pdf") return "document"
  throw new ZernioApiError(400, `Formato no compatible con Zernio: ${contentType}`)
}
