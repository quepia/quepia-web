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

// Comisiones e impuestos pueden ser cero; un movimiento nunca.
export const feeSchema = z
  .string()
  .regex(
    /^(?:0\.\d{2}|[1-9]\d{0,9}\.\d{2})$/,
    "Amount must be a canonical decimal string with exactly two decimals",
  );

export const exchangeRateSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,5})\.\d{1,4}$/,
    "Exchange rate must be a decimal string with up to four decimals",
  )
  .refine(
    (value) => Number(value) > 0,
    "Exchange rate must be greater than zero",
  );

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

function requireExactlyOne(
  context: z.RefinementCtx,
  idValue: unknown,
  queryValue: unknown,
  idKey: string,
  queryKey: string,
): void {
  if (Boolean(idValue) === Boolean(queryValue)) {
    context.addIssue({
      code: "custom",
      message: `Supply exactly one of ${idKey} or ${queryKey}`,
      path: [idKey],
    });
  }
}

function rejectBoth(
  context: z.RefinementCtx,
  idValue: unknown,
  queryValue: unknown,
  idKey: string,
  queryKey: string,
): void {
  if (idValue && queryValue) {
    context.addIssue({
      code: "custom",
      message: `Supply at most one of ${idKey} or ${queryKey}`,
      path: [idKey],
    });
  }
}

export const recordExpenseInputSchema = z
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
    project_query: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().max(2_000).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    requireExactlyOne(
      context,
      value.account_id,
      value.account_query,
      "account_id",
      "account_query",
    );
    rejectBoth(
      context,
      value.category_id,
      value.category_query,
      "category_id",
      "category_query",
    );
    rejectBoth(
      context,
      value.counterparty_id,
      value.counterparty_query,
      "counterparty_id",
      "counterparty_query",
    );
    rejectBoth(
      context,
      value.project_id,
      value.project_query,
      "project_id",
      "project_query",
    );
  });

export const recordIncomeInputSchema = z
  .object({
    amount: moneySchema,
    currency: currencySchema,
    date: isoDateSchema,
    status: z.enum(["paid", "pending"]).optional(),
    period: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "period must use YYYY-MM")
      .optional(),
    account_id: uuidSchema.optional(),
    account_query: z.string().trim().min(1).max(120).optional(),
    project_id: uuidSchema.optional(),
    project_query: z.string().trim().min(1).max(160).optional(),
    client_name: z.string().trim().min(1).max(200).optional(),
    payment_method: z.string().trim().min(1).max(50).optional(),
    invoice_number: z.string().trim().min(1).max(100).optional(),
    notes: z.string().trim().max(2_000).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    requireExactlyOne(
      context,
      value.account_id,
      value.account_query,
      "account_id",
      "account_query",
    );
    rejectBoth(
      context,
      value.project_id,
      value.project_query,
      "project_id",
      "project_query",
    );
    // La contabilidad imputa cada cobro a un proyecto o a un cliente suelto.
    const hasProject = Boolean(value.project_id ?? value.project_query);
    if (hasProject === Boolean(value.client_name)) {
      context.addIssue({
        code: "custom",
        message:
          "Supply a project selector or client_name, not both and not neither",
        path: ["client_name"],
      });
    }
  });

export const recordTransferInputSchema = z
  .object({
    amount: moneySchema,
    date: isoDateSchema,
    from_account_id: uuidSchema.optional(),
    from_account_query: z.string().trim().min(1).max(120).optional(),
    to_account_id: uuidSchema.optional(),
    to_account_query: z.string().trim().min(1).max(120).optional(),
    exchange_rate: exchangeRateSchema.optional(),
    commission: feeSchema.optional(),
    tax: feeSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    requireExactlyOne(
      context,
      value.from_account_id,
      value.from_account_query,
      "from_account_id",
      "from_account_query",
    );
    requireExactlyOne(
      context,
      value.to_account_id,
      value.to_account_query,
      "to_account_id",
      "to_account_query",
    );
    if (
      value.from_account_id &&
      value.from_account_id === value.to_account_id
    ) {
      context.addIssue({
        code: "custom",
        message: "The origin and destination accounts must be different",
        path: ["to_account_id"],
      });
    }
  });

export const voidOperationInputSchema = z
  .object({
    operation_id: uuidSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const listRecentOperationsInputSchema = z
  .object({
    hours: z.number().int().min(1).max(720).default(24),
    limit: z.number().int().min(1).max(200).default(50),
    include_voided: z.boolean().default(true),
  })
  .strict();
