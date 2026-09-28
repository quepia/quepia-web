import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
import type { TokenVerifier } from "../src/auth.js";
import { issueCreditNoteInputSchema, issueInvoiceInputSchema } from "../src/schemas.js";
import { availableToolNames } from "../src/tools.js";
import {
  accessContext,
  databaseFactory,
  databaseMock,
  type McpResponse,
  postMcp,
  testConfig,
  withHttpServer,
} from "./helpers.js";

const tokenVerifier: TokenVerifier = vi.fn(async (token) => ({
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1" as const,
  token,
}));

const PAYMENT_ID = "88888888-8888-4888-8888-888888888888";

describe("accounting_issue_invoice", () => {
  it("is offered only with accounting.invoice.write and never read-only", () => {
    expect(
      availableToolNames(
        accessContext({ capabilities: new Set(["accounting.income.write"]) }),
      ),
    ).not.toContain("accounting_issue_invoice");
    expect(
      availableToolNames(
        accessContext({ capabilities: new Set(["accounting.invoice.write"]) }),
      ),
    ).toContain("accounting_issue_invoice");
    expect(
      availableToolNames(
        accessContext({
          capabilities: new Set(["accounting.invoice.write"]),
          readOnly: true,
        }),
      ),
    ).not.toContain("accounting_issue_invoice");
  });

  it("requires a CUIT for any receiver other than consumidor final", () => {
    expect(
      issueInvoiceInputSchema.safeParse({
        payment_id: PAYMENT_ID,
        receiver: { condition: "consumidor_final" },
      }).success,
    ).toBe(true);
    expect(
      issueInvoiceInputSchema.safeParse({
        payment_id: PAYMENT_ID,
        receiver: { condition: "responsable_inscripto" },
      }).success,
    ).toBe(false);
    expect(
      issueInvoiceInputSchema.safeParse({
        payment_id: PAYMENT_ID,
        receiver: {
          condition: "monotributo",
          doc_type: "dni",
          doc_number: "30111222",
        },
      }).success,
    ).toBe(false);
    expect(
      issueInvoiceInputSchema.safeParse({
        payment_id: PAYMENT_ID,
        receiver: {
          condition: "responsable_inscripto",
          doc_type: "cuit",
          doc_number: "20123456786",
        },
      }).success,
    ).toBe(true);
  });

  it("forwards the request to the web issuer, not to a database RPC", async () => {
    const database = databaseMock(
      accessContext({ capabilities: new Set(["accounting.invoice.write"]) }),
      {
        ok: true,
        data: {
          outcome: "authorized",
          invoice: { environment: "test", voucher_number: 1, cae: "123" },
        },
      },
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });
    const toolArguments = {
      payment_id: PAYMENT_ID,
      receiver: { condition: "consumidor_final" },
    };

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 71,
        method: "tools/call",
        params: { name: "accounting_issue_invoice", arguments: toolArguments },
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as McpResponse;
      expect(payload.result?.structuredContent).toMatchObject({
        ok: true,
        data: { outcome: "authorized" },
      });
      expect(database.calls).toEqual([]);
      expect(database.invoiceCalls).toEqual([toolArguments]);
    });
  });
});

const INVOICE_ID = "99999999-9999-4999-8999-999999999999";

describe("accounting_issue_credit_note", () => {
  it("shares the invoice capability", () => {
    const tools = availableToolNames(
      accessContext({ capabilities: new Set(["accounting.invoice.write"]) }),
    );
    expect(tools).toContain("accounting_issue_credit_note");
    expect(
      availableToolNames(accessContext({ capabilities: new Set(["accounting.income.write"]) })),
    ).not.toContain("accounting_issue_credit_note");
  });

  it("requires an amount only for partial notes", () => {
    const base = { invoice_id: INVOICE_ID, description: "Anulación" };
    expect(issueCreditNoteInputSchema.safeParse({ ...base, mode: "total" }).success).toBe(true);
    expect(
      issueCreditNoteInputSchema.safeParse({ ...base, mode: "total", amount: "10.00" }).success,
    ).toBe(false);
    expect(issueCreditNoteInputSchema.safeParse({ ...base, mode: "partial" }).success).toBe(false);
    expect(
      issueCreditNoteInputSchema.safeParse({ ...base, mode: "partial", amount: "1500.5" }).success,
    ).toBe(true);
    expect(
      issueCreditNoteInputSchema.safeParse({ ...base, mode: "partial", amount: "1.500,50" }).success,
    ).toBe(false);
  });

  it("forwards the request to the web issuer", async () => {
    const database = databaseMock(
      accessContext({ capabilities: new Set(["accounting.invoice.write"]) }),
      { ok: true, data: { outcome: "authorized" } },
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });
    const toolArguments = { invoice_id: INVOICE_ID, mode: "total", description: "Anulación" };

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 72,
        method: "tools/call",
        params: { name: "accounting_issue_credit_note", arguments: toolArguments },
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as McpResponse;
      expect(payload.result?.structuredContent).toMatchObject({ ok: true });
      expect(database.calls).toEqual([]);
      expect(database.invoiceCalls).toEqual([{ credit_note: toolArguments }]);
    });
  });
});
