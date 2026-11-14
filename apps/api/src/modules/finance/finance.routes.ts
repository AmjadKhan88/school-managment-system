import { Router } from "express";
import { expenseCategoriesRouter, expensesRouter } from "./expenses.routes";
import { incomeRouter } from "./income.routes";
import { ledgerRouter } from "./ledger.routes";

export const financeRouter = Router();
financeRouter.use("/expense-categories", expenseCategoriesRouter);
financeRouter.use("/expenses", expensesRouter);
financeRouter.use("/income", incomeRouter);
financeRouter.use("/", ledgerRouter);
