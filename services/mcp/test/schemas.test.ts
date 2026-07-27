import { describe, expect, it } from "vitest";
import {
  currencySchema,
  cursorSchema,
  moneySchema,
  recordExpenseInputSchema,
  recordIncomeInputSchema,
  recordTransferInputSchema,
  voidOperationInputSchema,
} from "../src/schemas.js";

const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ACCOUNT_ID = "88888888-8888-4888-8888-888888888888";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";

describe("tool input schemas", () => {
  it.each([
    "1",
    "1.2",
    "01.00",
    "0.00",
    "-1.00",
    "1,00",
    "1.000",
    "10000000000.00",
  ])(
    "rejects non-canonical money %s",
    (amount) => {
      expect(moneySchema.safeParse(amount).success).toBe(false);
    },
  );

  it.each(["0.01", "1.00", "28490.00", "9999999999.99"])(
    "accepts canonical money %s",
    (amount) => {
      expect(moneySchema.safeParse(amount).success).toBe(true);
    },
  );

  it("requires an account selector and a UUID idempotency key", () => {
    const result = recordExpenseInputSchema.safeParse({
      amount: "28490.00",
      currency: "ARS",
      date: "2026-07-26",
      description: "Adobe",
      idempotency_key: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ambiguous duplicate entity selectors before the RPC", () => {
    const result = recordExpenseInputSchema.safeParse({
      amount: "28490.00",
      currency: "ARS",
      date: "2026-07-26",
      description: "Adobe",
      idempotency_key: IDEMPOTENCY_KEY,
      account_id: ACCOUNT_ID,
      account_query: "Mercado Pago",
      category_id: "66666666-6666-4666-8666-666666666666",
      category_query: "Software",
      counterparty_id: "77777777-7777-4777-8777-777777777777",
      counterparty_query: "Adobe",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "account_id",
        "category_id",
        "counterparty_id",
      ]);
    }
  });

  it("accepts a complete expense", () => {
    const result = recordExpenseInputSchema.safeParse({
      amount: "28490.00",
      currency: "ARS",
      date: "2026-07-26",
      description: "Adobe",
      account_query: "Mercado Pago",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(result.success).toBe(true);
  });

  it("requires exactly one payer on an income", () => {
    const withoutPayer = recordIncomeInputSchema.safeParse({
      amount: "120000.00",
      currency: "ARS",
      date: "2026-07-26",
      account_id: ACCOUNT_ID,
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(withoutPayer.success).toBe(false);

    const withBothPayers = recordIncomeInputSchema.safeParse({
      amount: "120000.00",
      currency: "ARS",
      date: "2026-07-26",
      account_id: ACCOUNT_ID,
      project_query: "Quepia",
      client_name: "Cliente suelto",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(withBothPayers.success).toBe(false);

    const withOnePayer = recordIncomeInputSchema.safeParse({
      amount: "120000.00",
      currency: "ARS",
      date: "2026-07-26",
      account_id: ACCOUNT_ID,
      client_name: "Cliente suelto",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(withOnePayer.success).toBe(true);
  });

  it("rejects an income period that is not a real month", () => {
    const result = recordIncomeInputSchema.safeParse({
      amount: "120000.00",
      currency: "ARS",
      date: "2026-07-26",
      period: "2026-13",
      account_id: ACCOUNT_ID,
      client_name: "Cliente suelto",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a transfer that points at a single account", () => {
    const result = recordTransferInputSchema.safeParse({
      amount: "50000.00",
      date: "2026-07-26",
      from_account_id: ACCOUNT_ID,
      to_account_id: ACCOUNT_ID,
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero fees but rejects a malformed exchange rate", () => {
    const withFees = recordTransferInputSchema.safeParse({
      amount: "50000.00",
      date: "2026-07-26",
      from_account_id: ACCOUNT_ID,
      to_account_id: OTHER_ACCOUNT_ID,
      commission: "0.00",
      tax: "0.00",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(withFees.success).toBe(true);

    const withBadRate = recordTransferInputSchema.safeParse({
      amount: "50000.00",
      date: "2026-07-26",
      from_account_id: ACCOUNT_ID,
      to_account_id: OTHER_ACCOUNT_ID,
      exchange_rate: "0.0",
      idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(withBadRate.success).toBe(false);
  });

  it("prevents smuggling a payload into a void", () => {
    const result = voidOperationInputSchema.safeParse({
      operation_id: "33333333-3333-4333-8333-333333333333",
      amount: "999999.00",
    });
    expect(result.success).toBe(false);
  });

  it("only accepts the live accounting currencies", () => {
    expect(currencySchema.safeParse("ARS").success).toBe(true);
    expect(currencySchema.safeParse("USD").success).toBe(true);
    expect(currencySchema.safeParse("EUR").success).toBe(false);
  });

  it("accepts opaque base64url cursors and rejects standard base64 padding", () => {
    expect(cursorSchema.safeParse("eyJpZCI6IjEyMyJ9").success).toBe(true);
    expect(cursorSchema.safeParse("YWJjZA==").success).toBe(false);
    expect(cursorSchema.safeParse("abc+/def").success).toBe(false);
  });
});
