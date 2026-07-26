import { z } from "zod/v4";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
export const currencySchema = z.enum(["ARS", "USD"]);
export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor must be an opaque base64url string");

export const moneySchema = z
  .string()
  .regex(
    /^(?:0\.\d{2}|[1-9]\d{0,9}\.\d{2})$/,
    "Amount must be a canonical decimal string with exactly two decimals",
  )
  .refine((value) => value !== "0.00", "Amount must be greater than zero");

export const idempotencyKeySchema = z.uuid();

export const rpcErrorOutputSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const rpcEnvelopeOutputSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: rpcErrorOutputSchema.nullish(),
});

export const listAccountsInputSchema = z
  .object({
    active_only: z.boolean().default(true),
    currency: currencySchema.optional(),
    page_size: z.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict();

export const listExpensesInputSchema = z
  .object({
    date_from: isoDateSchema.optional(),
    date_to: isoDateSchema.optional(),
    account_id: uuidSchema.optional(),
    category_id: uuidSchema.optional(),
    currency: currencySchema.optional(),
    query: z.string().trim().min(1).max(200).optional(),
    page_size: z.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.date_from ||
      !value.date_to ||
      value.date_from <= value.date_to,
    {
      message: "date_from must not be after date_to",
      path: ["date_from"],
    },
  );

export const prepareExpenseInputSchema = z
  .object({
    amount: moneySchema,
    currency: currencySchema,
    date: isoDateSchema,
    account_id: uuidSchema.optional(),
    account_query: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(500),
    category_id: uuidSchema.optional(),
    category_query: z.string().trim().min(1).max(120).optional(),
    counterparty_id: uuidSchema.optional(),
    counterparty_query: z.string().trim().min(1).max(160).optional(),
    project_id: uuidSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.account_id) === Boolean(value.account_query)) {
      context.addIssue({
        code: "custom",
        message: "Supply exactly one of account_id or account_query",
        path: ["account_id"],
      });
    }
    if (value.category_id && value.category_query) {
      context.addIssue({
        code: "custom",
        message: "Supply at most one of category_id or category_query",
        path: ["category_id"],
      });
    }
    if (value.counterparty_id && value.counterparty_query) {
      context.addIssue({
        code: "custom",
        message:
          "Supply at most one of counterparty_id or counterparty_query",
        path: ["counterparty_id"],
      });
    }
  });

export const getOperationInputSchema = z
  .object({
    operation_id: uuidSchema,
  })
  .strict();

export const commitExpenseInputSchema = z
  .object({
    operation_id: uuidSchema,
  })
  .strict();
