import { Router } from "express";
import { authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { asyncHandler as h } from "../../utils/asyncHandler";
import { sendXlsx } from "../../utils/excel";
import { ok } from "../../utils/respond";
import { buildCashBook, defaultMonths, monthsBetween } from "./cashbook.calc";
import {
  cashBookSchema,
  CashBookQuery,
  monthRangeSchema,
  MonthRangeQuery,
} from "./finance.schema";
import {
  expenseSummary,
  loadCashBook,
  METHOD_LABEL,
  monthlyFinance,
} from "./finance.service";

export const ledgerRouter = Router();

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10));
const firstOfMonth = () =>
  new Date(`${new Date().toISOString().slice(0, 8)}01T00:00:00Z`);

async function cashBook(qy: CashBookQuery) {
  const from = qy.from ?? firstOfMonth();
  const to = qy.to ?? todayUtc();
  if (from > to)
    throw ApiError.badRequest("The start date is after the end date");
  if (to.getTime() - from.getTime() > 400 * 86_400_000)
    throw ApiError.badRequest("Choose a range of at most 13 months");
  const { entries, opening, truncated } = await loadCashBook(
    from,
    to,
    qy.account,
  );
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    account: qy.account,
    truncated,
    ...buildCashBook(entries, opening),
  };
}
const qc = (qy: CashBookQuery) => qy.account;

function months(qy: MonthRangeQuery) {
  const d = defaultMonths();
  const from = qy.from ?? d.from;
  const to = qy.to ?? d.to;
  if (from > to)
    throw ApiError.badRequest("The start month is after the end month");
  if (monthsBetween(from, to).length > 36)
    throw ApiError.badRequest("Choose a range of at most 36 months");
  return { from, to };
}

// ---- Cash book (all, cash only, or bank and wallets) ----
ledgerRouter.get(
  "/cash-book",
  authorize("finance", "VIEW"),
  validate(cashBookSchema, "query"),
  h(async (req, res) =>
    ok(res, await cashBook(req.query as unknown as CashBookQuery)),
  ),
);

ledgerRouter.get(
  "/cash-book/export",
  authorize("finance", "EXPORT"),
  validate(cashBookSchema, "query"),
  h(async (req, res) => {
    const r = await cashBook(req.query as unknown as CashBookQuery);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "cash_book",
      newValues: {
        from: r.from,
        to: r.to,
        account: r.account,
        rows: r.rows.length,
      },
    });
    await sendXlsx(
      res,
      `cash-book-${r.from}-to-${r.to}`,
      "Cash book",
      [
        { header: "Date", key: "date", width: 13 },
        { header: "Reference", key: "ref", width: 18 },
        { header: "Description", key: "description", width: 50 },
        { header: "Method", key: "method", width: 14 },
        { header: "Received", key: "moneyIn", width: 16, money: true },
        { header: "Paid", key: "moneyOut", width: 16, money: true },
        { header: "Balance", key: "balance", width: 16, money: true },
      ],
      [
        { description: "Opening balance", balance: Number(r.totals.opening) },
        ...r.rows.map((x) => ({
          ...x,
          method: METHOD_LABEL[x.method],
          moneyIn: x.moneyIn ? Number(x.moneyIn) : "",
          moneyOut: x.moneyOut ? Number(x.moneyOut) : "",
          balance: Number(x.balance),
        })),
      ],
      {
        description: "Closing balance",
        moneyIn: Number(r.totals.in),
        moneyOut: Number(r.totals.out),
        balance: Number(r.totals.closing),
      },
    );
  }),
);

// ---- Income vs expense by month ----
ledgerRouter.get(
  "/income-vs-expense",
  authorize("finance", "VIEW"),
  validate(monthRangeSchema, "query"),
  h(async (req, res) => {
    const m = months(req.query as unknown as MonthRangeQuery);
    ok(res, { ...m, ...(await monthlyFinance(m.from, m.to)) });
  }),
);

ledgerRouter.get(
  "/income-vs-expense/export",
  authorize("finance", "EXPORT"),
  validate(monthRangeSchema, "query"),
  h(async (req, res) => {
    const m = months(req.query as unknown as MonthRangeQuery);
    const r = await monthlyFinance(m.from, m.to);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "income_vs_expense",
      newValues: m,
    });
    const num = (x: (typeof r.rows)[number]) => ({
      month: x.month,
      fees: +x.fees,
      refunds: +x.refunds,
      otherIncome: +x.otherIncome,
      income: +x.income,
      expenses: +x.expenses,
      net: +x.net,
    });
    await sendXlsx(
      res,
      `income-vs-expense-${m.from}-to-${m.to}`,
      "Income vs expense",
      [
        { header: "Month", key: "month", width: 12 },
        { header: "Fee collections", key: "fees", width: 18, money: true },
        { header: "Refunds", key: "refunds", width: 14, money: true },
        { header: "Other income", key: "otherIncome", width: 16, money: true },
        { header: "Total income", key: "income", width: 16, money: true },
        { header: "Expenses", key: "expenses", width: 16, money: true },
        { header: "Net", key: "net", width: 16, money: true },
      ],
      r.rows.map(num),
      num({ month: "Total", ...r.totals }),
    );
  }),
);

// ---- Expense summary (by category and by month) ----
ledgerRouter.get(
  "/expense-summary",
  authorize("finance", "VIEW"),
  validate(monthRangeSchema, "query"),
  h(async (req, res) => {
    const m = months(req.query as unknown as MonthRangeQuery);
    ok(res, { ...m, ...(await expenseSummary(m.from, m.to)) });
  }),
);

ledgerRouter.get(
  "/expense-summary/export",
  authorize("finance", "EXPORT"),
  validate(monthRangeSchema, "query"),
  h(async (req, res) => {
    const m = months(req.query as unknown as MonthRangeQuery);
    const r = await expenseSummary(m.from, m.to);
    await writeAudit(req, {
      action: "REPORT_EXPORTED",
      entity: "expense_summary",
      newValues: m,
    });
    await sendXlsx(
      res,
      `expense-summary-${m.from}-to-${m.to}`,
      "Expenses by category",
      [
        { header: "Category", key: "category", width: 24 },
        { header: "Expenses", key: "count", width: 12 },
        { header: "Amount", key: "amount", width: 18, money: true },
        { header: "Share %", key: "share", width: 12 },
      ],
      r.byCategory.map((c) => ({ ...c, amount: +c.amount })),
      { category: "Total", amount: +r.total },
    );
  }),
);
