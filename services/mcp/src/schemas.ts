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

// --------------------------------------------------------------------------
// Tareas
// --------------------------------------------------------------------------

export const TASK_BATCH_MAX = 50;
export const TASK_SUBTASK_BATCH_MAX = 50;
export const TASK_LINK_BATCH_MAX = 20;
export const TASK_DEPENDENCY_MAX = 20;

const selectorTextSchema = z.string().trim().min(1).max(200);
const taskTitleSchema = z.string().trim().min(1).max(300);
const prioritySchema = z.enum(["P1", "P2", "P3", "P4"]);
// Una fecha sola se ancla al mediodia del dia, que es la convencion de la
// tabla; un instante ISO se respeta tal cual.
const deadlineSchema = z.union([isoDateSchema, z.iso.datetime({ offset: true })]);
const labelsSchema = z.array(z.string().trim().min(1).max(60)).max(10);
const estimatedHoursSchema = z.number().min(0).max(9_999.9);
const linkUrlSchema = z
  .string()
  .trim()
  .min(8)
  .max(2048)
  .regex(
    /^https?:\/\/[^\s/@]+(\/[^\s]*)?$/,
    "url must be an http(s) address without embedded credentials",
  );

function rejectBothSelectors(
  context: z.RefinementCtx,
  value: Record<string, unknown>,
  idKey: string,
  queryKey: string,
): void {
  rejectBoth(context, value[idKey], value[queryKey], idKey, queryKey);
}

function requireOneSelector(
  context: z.RefinementCtx,
  value: Record<string, unknown>,
  idKey: string,
  queryKey: string,
): void {
  requireExactlyOne(context, value[idKey], value[queryKey], idKey, queryKey);
}

export const listProjectsInputSchema = z
  .object({
    query: selectorTextSchema.optional(),
    page_size: z.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict();

export const listColumnsInputSchema = z
  .object({
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "project_id", "project_query");
  });

export const listMembersInputSchema = z
  .object({
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(context, value, "project_id", "project_query");
  });

export const searchTasksInputSchema = z
  .object({
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
    column_id: uuidSchema.optional(),
    column_query: selectorTextSchema.optional(),
    assignee_id: uuidSchema.optional(),
    assignee_query: selectorTextSchema.optional(),
    completed: z.boolean().optional(),
    priority: prioritySchema.optional(),
    deadline_from: deadlineSchema.optional(),
    deadline_to: deadlineSchema.optional(),
    query: selectorTextSchema.optional(),
    page_size: z.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(context, value, "project_id", "project_query");
    rejectBothSelectors(context, value, "column_id", "column_query");
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
    if (
      value.deadline_from &&
      value.deadline_to &&
      value.deadline_from > value.deadline_to
    ) {
      context.addIssue({
        code: "custom",
        message: "deadline_from must not be after deadline_to",
        path: ["deadline_from"],
      });
    }
  });

export const getTaskInputSchema = z
  .object({
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
    rejectBothSelectors(context, value, "project_id", "project_query");
  });

export const createTaskInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
    column_id: uuidSchema.optional(),
    column_query: selectorTextSchema.optional(),
    title: taskTitleSchema,
    description: z.string().trim().max(5_000).optional(),
    social_copy: z.string().trim().max(5_000).optional(),
    priority: prioritySchema.optional(),
    deadline: deadlineSchema.optional(),
    labels: labelsSchema.optional(),
    assignee_id: uuidSchema.optional(),
    assignee_query: selectorTextSchema.optional(),
    estimated_hours: estimatedHoursSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "project_id", "project_query");
    rejectBothSelectors(context, value, "column_id", "column_query");
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
  });

const batchTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: z.string().trim().max(5_000).optional(),
    social_copy: z.string().trim().max(5_000).optional(),
    priority: prioritySchema.optional(),
    deadline: deadlineSchema.optional(),
    labels: labelsSchema.optional(),
    assignee_id: uuidSchema.optional(),
    assignee_query: selectorTextSchema.optional(),
    column_id: uuidSchema.optional(),
    column_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
    rejectBothSelectors(context, value, "column_id", "column_query");
  });

export const createTasksBatchInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
    column_id: uuidSchema.optional(),
    column_query: selectorTextSchema.optional(),
    tasks: z.array(batchTaskSchema).min(1).max(TASK_BATCH_MAX),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "project_id", "project_query");
    rejectBothSelectors(context, value, "column_id", "column_query");
  });

export const updateTaskInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
    title: taskTitleSchema.optional(),
    // null limpia el campo; omitirlo lo deja como esta.
    description: z.string().trim().max(5_000).nullable().optional(),
    social_copy: z.string().trim().max(5_000).nullable().optional(),
    priority: prioritySchema.optional(),
    deadline: deadlineSchema.nullable().optional(),
    labels: labelsSchema.optional(),
    assignee_id: uuidSchema.nullable().optional(),
    assignee_query: selectorTextSchema.optional(),
    estimated_hours: estimatedHoursSchema.nullable().optional(),
    column_id: uuidSchema.optional(),
    column_query: selectorTextSchema.optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
    rejectBothSelectors(context, value, "project_id", "project_query");
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
    rejectBothSelectors(context, value, "column_id", "column_query");

    const changesTask = [
      "title",
      "description",
      "social_copy",
      "priority",
      "deadline",
      "labels",
      "assignee_id",
      "assignee_query",
      "estimated_hours",
      "column_id",
      "column_query",
      "completed",
    ].some((key) => key in value);
    if (!changesTask) {
      context.addIssue({
        code: "custom",
        message: "Supply at least one field to change",
        path: ["title"],
      });
    }
  });

const subtaskSchema = z
  .object({
    title: taskTitleSchema,
    assignee_id: uuidSchema.optional(),
    assignee_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
  });

export const addSubtasksInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    subtasks: z.array(subtaskSchema).min(1).max(TASK_SUBTASK_BATCH_MAX),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
  });

export const updateSubtaskInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    subtask_id: uuidSchema,
    title: taskTitleSchema.optional(),
    completed: z.boolean().optional(),
    assignee_id: uuidSchema.nullable().optional(),
    assignee_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(context, value, "assignee_id", "assignee_query");
    const changesSubtask = [
      "title",
      "completed",
      "assignee_id",
      "assignee_query",
    ].some((key) => key in value);
    if (!changesSubtask) {
      context.addIssue({
        code: "custom",
        message: "Supply at least one field to change",
        path: ["title"],
      });
    }
  });

export const setDependenciesInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    depends_on_task_ids: z.array(uuidSchema).max(TASK_DEPENDENCY_MAX),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
  });

const taskLinkSchema = z
  .object({
    url: linkUrlSchema,
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const addLinksInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    links: z.array(taskLinkSchema).min(1).max(TASK_LINK_BATCH_MAX),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
  });

export const createColumnInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    project_id: uuidSchema.optional(),
    project_query: selectorTextSchema.optional(),
    name: z.string().trim().min(1).max(120),
    wip_limit: z.number().int().min(1).max(999).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "project_id", "project_query");
  });

export const createProjectInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    parent_project_id: uuidSchema.optional(),
    parent_project_query: selectorTextSchema.optional(),
    columns: z.array(z.string().trim().min(1).max(120)).min(1).max(12).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectBothSelectors(
      context,
      value,
      "parent_project_id",
      "parent_project_query",
    );
  });

export const postTaskUpdateInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    task_id: uuidSchema.optional(),
    task_query: selectorTextSchema.optional(),
    message: z.string().trim().min(1).max(2_000),
    notify: z.boolean().optional(),
    recipient_id: uuidSchema.optional(),
    recipient_query: selectorTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireOneSelector(context, value, "task_id", "task_query");
    rejectBothSelectors(context, value, "recipient_id", "recipient_query");
  });
