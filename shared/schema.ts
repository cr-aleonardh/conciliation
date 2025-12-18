import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, timestamp, boolean, integer, char } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const bankTransactions = pgTable("bank_transactions", {
  transactionHash: text("transaction_hash").primaryKey(),
  payerSender: text("payer_sender").notNull(),
  transactionDate: timestamp("transaction_date", { mode: 'string' }).notNull(),
  creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  extractedReference: text("extracted_reference"),
  matchReferenceFlag: boolean("match_reference_flag").notNull().default(false),
  matchNameScore: numeric("match_name_score", { precision: 5, scale: 2 }).notNull().default('0'),
  diffDays: integer("diff_days"),
  diffAmount: numeric("diff_amount", { precision: 12, scale: 2 }),
  reconciliationStatus: text("reconciliation_status").notNull().default('unmatched'),
  orderId: integer("order_id"),
  batchId: integer("batch_id"),
  importedAt: timestamp("imported_at", { mode: 'string' }).notNull().default(sql`now()`),
  reconciledAt: timestamp("reconciled_at", { mode: 'string' }),
});

export const orders = pgTable("orders", {
  orderId: integer("order_id").primaryKey(),
  orderBankReference: text("order_bank_reference"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 12, scale: 2 }).notNull(),
  amountTotalFee: numeric("amount_total_fee", { precision: 12, scale: 2 }).notNull(),
  orderTimestamp: timestamp("order_timestamp", { mode: 'string' }).notNull(),
  orderDate: timestamp("order_date", { mode: 'string' }).notNull(),
  customerName: text("customer_name").notNull(),
  remitecStatus: char("remitec_status", { length: 1 }),
  matchReferenceFlag: boolean("match_reference_flag").notNull().default(false),
  matchNameScore: numeric("match_name_score", { precision: 5, scale: 2 }).notNull().default('0'),
  diffDays: integer("diff_days"),
  diffAmount: numeric("diff_amount", { precision: 12, scale: 2 }),
  reconciliationStatus: text("reconciliation_status").notNull().default('unmatched'),
  batchId: integer("batch_id"),
  fetchedAt: timestamp("fetched_at", { mode: 'string' }).notNull().default(sql`now()`),
  reconciledAt: timestamp("reconciled_at", { mode: 'string' }),
  transactionIds: text("transaction_ids").array(),
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactions).omit({
  importedAt: true,
  reconciledAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  fetchedAt: true,
  reconciledAt: true,
});

export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactions.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
