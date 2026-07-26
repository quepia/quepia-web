import { describe, expect, it } from "vitest";
import {
  commitExpenseInputSchema,
  currencySchema,
  cursorSchema,
  moneySchema,
  prepareExpenseInputSchema,
} from "../src/schemas.js";

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
    const result = prepareExpenseInputSchema.safeParse({
      amount: "28490.00",
      currency: "ARS",
      date: "2026-07-26",
      description: "Adobe",
      idempotency_key: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ambiguous duplicate entity selectors before the RPC", () => {
    const result = prepareExpenseInputSchema.safeParse({
      amount: "28490.00",
      currency: "ARS",
      date: "2026-07-26",
      description: "Adobe",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
      account_id: "55555555-5555-4555-8555-555555555555",
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

  it("prevents payload tampering during commit", () => {
    const result = commitExpenseInputSchema.safeParse({
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
