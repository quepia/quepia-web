import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD")
const digits = (value: string) => value.replace(/\D/g, "")

export const RECEIVER_CONDITIONS = [
  "consumidor_final",
  "responsable_inscripto",
  "monotributo",
  "exento",
  "no_alcanzado",
] as const

export const receiverSchema = z
  .object({
    condition: z.enum(RECEIVER_CONDITIONS),
    doc_type: z.enum(["cuit", "dni"]).optional(),
    doc_number: z.string().trim().max(20).transform(digits).optional(),
    name: z.string().trim().max(200).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.doc_type) !== Boolean(value.doc_number)) {
      context.addIssue({
        code: "custom",
        message: "doc_type y doc_number van juntos",
        path: ["doc_number"],
      })
    }
    if (value.doc_type === "cuit" && !/^\d{11}$/.test(value.doc_number ?? "")) {
      context.addIssue({
        code: "custom",
        message: "El CUIT tiene 11 dígitos",
        path: ["doc_number"],
      })
    }
    if (value.doc_type === "dni" && !/^\d{7,8}$/.test(value.doc_number ?? "")) {
      context.addIssue({
        code: "custom",
        message: "El DNI tiene 7 u 8 dígitos",
        path: ["doc_number"],
      })
    }
    if (value.condition !== "consumidor_final" && value.doc_type !== "cuit") {
      context.addIssue({
        code: "custom",
        message: "Un receptor que no es consumidor final necesita CUIT",
        path: ["doc_type"],
      })
    }
  })

export const issueInvoiceRequestSchema = z
  .object({
    payment_id: z.uuid(),
    receiver: receiverSchema,
    // Detalle impreso en la factura; no viaja a ARCA.
    description: z.string().trim().min(1).max(500).optional(),
    voucher_date: isoDate.optional(),
    service_from: isoDate.optional(),
    service_to: isoDate.optional(),
    payment_due_date: isoDate.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.service_from && value.service_to && value.service_to < value.service_from) {
      context.addIssue({ code: "custom", message: "El período termina antes de empezar", path: ["service_to"] })
    }
    if (value.voucher_date && value.payment_due_date && value.payment_due_date < value.voucher_date) {
      context.addIssue({
        code: "custom",
        message: "El vencimiento para el pago no puede ser anterior a la fecha de emisión",
        path: ["payment_due_date"],
      })
    }
  })

export type IssueInvoiceRequest = z.infer<typeof issueInvoiceRequestSchema>

// Nota de crédito: total anula la factura entera; partial acredita `amount`
// (pesos con hasta dos decimales, como "1500.50").
export const issueCreditNoteRequestSchema = z
  .object({
    invoice_id: z.uuid(),
    mode: z.enum(["total", "partial"]),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Usá un importe como 1500.50")
      .optional(),
    description: z.string().trim().min(1).max(500),
    voucher_date: isoDate.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "partial" && !value.amount) {
      context.addIssue({ code: "custom", message: "Una nota parcial necesita el importe", path: ["amount"] })
    }
    if (value.mode === "total" && value.amount) {
      context.addIssue({ code: "custom", message: "Una nota total no lleva importe", path: ["amount"] })
    }
  })

export type IssueCreditNoteRequest = z.infer<typeof issueCreditNoteRequestSchema>

/** "1500.5" → 150050, sin pasar por coma flotante. */
export function amountToCents(amount: string): number {
  const [pesos, decimals = ""] = amount.split(".")
  return Number(pesos) * 100 + Number(decimals.padEnd(2, "0"))
}
