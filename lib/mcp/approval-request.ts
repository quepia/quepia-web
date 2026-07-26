const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/

export interface McpApprovalRequest {
  intent: "approve_expense"
  viewedHash: string
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function parseMcpApprovalRequest(
  value: unknown,
): McpApprovalRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (
    keys.length !== 2 ||
    keys[0] !== "intent" ||
    keys[1] !== "viewed_hash" ||
    record.intent !== "approve_expense" ||
    typeof record.viewed_hash !== "string" ||
    !PAYLOAD_HASH_PATTERN.test(record.viewed_hash)
  ) {
    return null
  }

  return {
    intent: "approve_expense",
    viewedHash: record.viewed_hash,
  }
}
