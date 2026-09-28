import "server-only"

import type { IssueOutcome } from "facturas"

export type OutcomeKind = "authorized" | "rejected" | "indeterminate" | "conflict"

/** Lo que se guarda y lo que se le dice al usuario por cada resultado. */
export interface RecordedOutcome {
  ok: boolean
  outcome: OutcomeKind
  /** Estado que se guarda en la fila del comprobante. */
  status: "authorized" | "rejected" | "indeterminate" | "conflict" | "discarded"
  /** Campos para la RPC *_complete, sin el identificador del comprobante. */
  fields: Record<string, unknown>
  code?: string
  message: string
}

function summarize(outcome: IssueOutcome): Record<string, unknown> {
  switch (outcome.kind) {
    case "authorized":
      return {
        recovered_by_match: outcome.recoveredByMatch,
        header: outcome.voucher.header,
        amounts: outcome.voucher.amounts,
      }
    case "rejected":
      return { attempted: outcome.attempted }
    case "indeterminate":
      return { attempted: outcome.attempted, lookup: outcome.lookup }
    case "conflict":
      return { attempted: outcome.attempted, found: outcome.found, reason: outcome.reason }
  }
}

export function voucherLabel(voucherClass: string, salesPoint: number, number: number): string {
  return `${voucherClass} ${String(salesPoint).padStart(5, "0")}-${String(number).padStart(8, "0")}`
}

/**
 * Traduce los cuatro resultados de `facturas` a lo que se guarda y se informa.
 * `noun` es cómo se nombra el comprobante: "Factura" o "Nota de crédito".
 */
export function recordOutcome(outcome: IssueOutcome, noun: string): RecordedOutcome {
  const evidence = summarize(outcome)
  const lower = noun.toLowerCase()

  switch (outcome.kind) {
    case "authorized": {
      const { voucher } = outcome
      return {
        ok: true,
        outcome: "authorized",
        status: "authorized",
        fields: {
          voucher_class: voucher.voucherClass,
          voucher_type: voucher.voucherType,
          voucher_number: voucher.number,
          voucher_date: voucher.date,
          cae: voucher.cae,
          cae_expiry: voucher.caeExpiry,
          qr_url: voucher.qr ?? null,
          payment_due_date: voucher.header.paymentDueDate ?? null,
          evidence,
        },
        message: `${noun} ${voucherLabel(voucher.voucherClass, voucher.salesPoint, voucher.number)} autorizada. CAE ${voucher.cae}.`,
      }
    }
    case "rejected":
      return {
        ok: false,
        outcome: "rejected",
        status: "rejected",
        fields: {
          voucher_type: outcome.attempted.voucherType,
          voucher_number: outcome.attempted.number,
          issues: outcome.issues,
          evidence,
        },
        code: "arca_rejected",
        message: `ARCA rechazó la ${lower}: ${outcome.issues.map((issue) => issue.message).join(" · ") || "sin detalle"}`,
      }
    case "indeterminate": {
      // superseded: la secuencia siguió sin esta clave y nunca va a escribir.
      // Se descarta para que el próximo intento use una clave nueva.
      const superseded = outcome.lookup.kind === "superseded"
      return {
        ok: false,
        outcome: "indeterminate",
        status: superseded ? "discarded" : "indeterminate",
        fields: {
          voucher_type: outcome.attempted.voucherType,
          voucher_number: outcome.attempted.number,
          evidence,
          last_error: `lookup:${outcome.lookup.kind}`,
        },
        code: `arca_indeterminate_${outcome.lookup.kind}`,
        message: superseded
          ? `ARCA no emitió esta ${lower}. Volvé a emitirla: se usará un número nuevo.`
          : `No se pudo confirmar si ARCA emitió la ${lower}. Reintentá en unos minutos: el reintento consulta el mismo número y nunca duplica.`,
      }
    }
    case "conflict":
      return {
        ok: false,
        outcome: "conflict",
        status: "conflict",
        fields: {
          voucher_type: outcome.attempted.voucherType,
          voucher_number: outcome.attempted.number,
          evidence,
          last_error: outcome.reason,
        },
        code: "arca_conflict",
        message: "ARCA tiene otro comprobante en el número reservado. Revisalo en ARCA antes de volver a emitir.",
      }
  }
}
