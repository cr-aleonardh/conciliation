import { 
  type BankTransaction, 
  type InsertBankTransaction, 
  type Order, 
  type InsertOrder,
  bankTransactions,
  orders
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, or, ilike, sql, ne, not } from "drizzle-orm";

export interface IStorage {
  // Bank Transactions
  getBankTransactions(): Promise<BankTransaction[]>;
  getBankTransactionByHash(hash: string): Promise<BankTransaction | undefined>;
  createBankTransaction(transaction: InsertBankTransaction): Promise<BankTransaction>;
  createBankTransactions(transactions: InsertBankTransaction[]): Promise<BankTransaction[]>;
  updateBankTransaction(hash: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction | undefined>;
  deleteBankTransaction(hash: string): Promise<void>;

  // Orders
  getOrders(): Promise<Order[]>;
  getHiddenOrdersCount(): Promise<number>;
  getOrderById(id: number): Promise<Order | undefined>;
  getExistingOrderIds(orderIds: number[]): Promise<number[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrders(orders: InsertOrder[]): Promise<Order[]>;
  upsertOrders(orders: InsertOrder[]): Promise<{ inserted: number; updated: number }>;
  updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<void>;

  // Matching Operations
  matchTransactionToOrder(transactionHash: string, orderId: number, status: string, reasonToOverride?: string): Promise<void>;
  unmatchTransaction(transactionHash: string): Promise<void>;
  unconciliateTransactions(transactionHashes: string[], orderId: number): Promise<void>;
  reconcileMatches(transactionHashes: string[], orderIds: number[], reconciledBy: string): Promise<void>;
  reconcileBatch(matches: { orderId: number; transactionHashes: string[] }[], reconciledBy: string): Promise<{ batchId: number }>;
  
  // Reconciled Records
  getReconciledRecords(): Promise<{ transactions: BankTransaction[]; orders: Order[] }>;
}

export class DatabaseStorage implements IStorage {
  // Bank Transactions
  async getBankTransactions(): Promise<BankTransaction[]> {
    return await db.select().from(bankTransactions);
  }

  async getBankTransactionByHash(hash: string): Promise<BankTransaction | undefined> {
    const results = await db.select().from(bankTransactions).where(eq(bankTransactions.transactionHash, hash));
    return results[0];
  }

  async createBankTransaction(transaction: InsertBankTransaction): Promise<BankTransaction> {
    const results = await db.insert(bankTransactions).values(transaction).returning();
    return results[0];
  }

  async createBankTransactions(transactions: InsertBankTransaction[]): Promise<BankTransaction[]> {
    if (transactions.length === 0) return [];
    return await db.insert(bankTransactions).values(transactions).returning();
  }

  async updateBankTransaction(hash: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction | undefined> {
    const results = await db
      .update(bankTransactions)
      .set(data)
      .where(eq(bankTransactions.transactionHash, hash))
      .returning();
    return results[0];
  }

  async deleteBankTransaction(hash: string): Promise<void> {
    await db.delete(bankTransactions).where(eq(bankTransactions.transactionHash, hash));
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    // Filter out canceled orders that are not reconciled
    // Hide orders where remitec_status = 'C' AND reconciliationStatus = 'unmatched'
    // Include orders where remitecStatus is null (not canceled) or not 'C', or already reconciled
    return await db
      .select()
      .from(orders)
      .where(
        or(
          sql`${orders.remitecStatus} IS NULL`,
          ne(orders.remitecStatus, 'C'),
          ne(orders.reconciliationStatus, 'unmatched')
        )
      );
  }

  async getHiddenOrdersCount(): Promise<number> {
    // Count orders where remitec_status = 'C' AND reconciliationStatus = 'unmatched'
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.remitecStatus, 'C'),
          eq(orders.reconciliationStatus, 'unmatched')
        )
      );
    return Number(result[0]?.count || 0);
  }

  async getOrderById(id: number): Promise<Order | undefined> {
    const results = await db.select().from(orders).where(eq(orders.orderId, id));
    return results[0];
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const results = await db.insert(orders).values(order).returning();
    return results[0];
  }

  async createOrders(ordersList: InsertOrder[]): Promise<Order[]> {
    if (ordersList.length === 0) return [];
    return await db.insert(orders).values(ordersList).returning();
  }

  async getExistingOrderIds(orderIds: number[]): Promise<number[]> {
    if (orderIds.length === 0) return [];
    const results = await db
      .select({ orderId: orders.orderId })
      .from(orders)
      .where(inArray(orders.orderId, orderIds));
    return results.map(r => r.orderId);
  }

  async upsertOrders(ordersList: InsertOrder[]): Promise<{ inserted: number; updated: number }> {
    if (ordersList.length === 0) return { inserted: 0, updated: 0 };
    
    const orderIds = ordersList.map(o => o.orderId);
    const existingIds = new Set(await this.getExistingOrderIds(orderIds));
    
    const toInsert = ordersList.filter(o => !existingIds.has(o.orderId));
    const toUpdate = ordersList.filter(o => existingIds.has(o.orderId));
    
    if (toInsert.length > 0) {
      await db.insert(orders).values(toInsert);
    }
    
    for (const order of toUpdate) {
      await db
        .update(orders)
        .set({
          orderBankReference: order.orderBankReference,
          amount: order.amount,
          fee: order.fee,
          amountTotalFee: order.amountTotalFee,
          orderTimestamp: order.orderTimestamp,
          orderDate: order.orderDate,
          customerName: order.customerName,
          remitecStatus: order.remitecStatus,
        })
        .where(eq(orders.orderId, order.orderId));
    }
    
    return { inserted: toInsert.length, updated: toUpdate.length };
  }

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const results = await db
      .update(orders)
      .set(data)
      .where(eq(orders.orderId, id))
      .returning();
    return results[0];
  }

  async deleteOrder(id: number): Promise<void> {
    await db.delete(orders).where(eq(orders.orderId, id));
  }

  // Matching Operations
  async matchTransactionToOrder(transactionHash: string, orderId: number, status: string, reasonToOverride?: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      // Update transaction
      await tx
        .update(bankTransactions)
        .set({ 
          orderId, 
          reconciliationStatus: status,
          reasonToOverride: reasonToOverride || null
        })
        .where(eq(bankTransactions.transactionHash, transactionHash));

      // Update order to include this transaction
      const order = await tx.select().from(orders).where(eq(orders.orderId, orderId));
      if (order[0]) {
        const currentTransactionIds = order[0].transactionIds || [];
        if (!currentTransactionIds.includes(transactionHash)) {
          await tx
            .update(orders)
            .set({ 
              transactionIds: [...currentTransactionIds, transactionHash],
              reconciliationStatus: status
            })
            .where(eq(orders.orderId, orderId));
        }
      }
    });
  }

  async unmatchTransaction(transactionHash: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      // Get the transaction to find its order
      const transaction = await tx
        .select()
        .from(bankTransactions)
        .where(eq(bankTransactions.transactionHash, transactionHash));
      
      if (transaction[0] && transaction[0].orderId) {
        const orderId = transaction[0].orderId;
        
        // Remove transaction from order's transaction_ids
        const order = await tx.select().from(orders).where(eq(orders.orderId, orderId));
        if (order[0]) {
          const updatedTransactionIds = (order[0].transactionIds || []).filter((id: string) => id !== transactionHash);
          await tx
            .update(orders)
            .set({ 
              transactionIds: updatedTransactionIds,
              reconciliationStatus: updatedTransactionIds.length > 0 ? order[0].reconciliationStatus : 'unmatched'
            })
            .where(eq(orders.orderId, orderId));
        }
        
        // Reset transaction
        await tx
          .update(bankTransactions)
          .set({ 
            orderId: null, 
            reconciliationStatus: 'unmatched' 
          })
          .where(eq(bankTransactions.transactionHash, transactionHash));
      }
    });
  }

  async unconciliateTransactions(transactionHashes: string[], orderId: number): Promise<void> {
    await db.transaction(async (tx: any) => {
      // Reset all transactions - clear orderId, batchId, reconciledAt, reconciledBy, and set status to unmatched
      if (transactionHashes.length > 0) {
        await tx
          .update(bankTransactions)
          .set({ 
            orderId: null,
            batchId: null,
            reconciledAt: null,
            reconciledBy: null,
            reconciliationStatus: 'unmatched'
          })
          .where(inArray(bankTransactions.transactionHash, transactionHashes));
      }

      // Update the order - remove transaction IDs and always reset to unmatched
      const order = await tx.select().from(orders).where(eq(orders.orderId, orderId));
      if (order[0]) {
        const currentTransactionIds = order[0].transactionIds || [];
        const updatedTransactionIds = currentTransactionIds.filter((id: string) => !transactionHashes.includes(id));
        
        // Always set order to unmatched when any transaction is unconciliated
        await tx
          .update(orders)
          .set({ 
            transactionIds: updatedTransactionIds.length > 0 ? updatedTransactionIds : null,
            reconciliationStatus: 'unmatched',
            batchId: null,
            reconciledAt: null,
            reconciledBy: null
          })
          .where(eq(orders.orderId, orderId));
      }
    });
  }

  async reconcileMatches(transactionHashes: string[], orderIds: number[], reconciledBy: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      const now = new Date().toISOString();
      
      // Update all transactions
      if (transactionHashes.length > 0) {
        await tx
          .update(bankTransactions)
          .set({ 
            reconciliationStatus: 'reconciled',
            reconciledAt: now,
            reconciledBy: reconciledBy
          })
          .where(inArray(bankTransactions.transactionHash, transactionHashes));
      }
      
      // Update all orders
      if (orderIds.length > 0) {
        await tx
          .update(orders)
          .set({ 
            reconciliationStatus: 'reconciled',
            reconciledAt: now,
            reconciledBy: reconciledBy
          })
          .where(inArray(orders.orderId, orderIds));
      }
    });
  }

  async reconcileBatch(matches: { orderId: number; transactionHashes: string[] }[], reconciledBy: string): Promise<{ batchId: number }> {
    return await db.transaction(async (tx: any) => {
      const now = new Date().toISOString();
      
      // Get the next batch_id (max existing + 1, or 1 if none)
      const maxBatchResult = await tx
        .select({ maxBatch: sql<number>`COALESCE(MAX(batch_id), 0)` })
        .from(bankTransactions);
      const maxOrderBatchResult = await tx
        .select({ maxBatch: sql<number>`COALESCE(MAX(batch_id), 0)` })
        .from(orders);
      
      const maxBatch = Math.max(
        maxBatchResult[0]?.maxBatch || 0,
        maxOrderBatchResult[0]?.maxBatch || 0
      );
      const newBatchId = maxBatch + 1;
      
      // Process each match group
      for (const match of matches) {
        const { orderId, transactionHashes } = match;
        
        // Update all transactions in this group
        if (transactionHashes.length > 0) {
          await tx
            .update(bankTransactions)
            .set({ 
              reconciliationStatus: 'reconciled',
              reconciledAt: now,
              reconciledBy: reconciledBy,
              batchId: newBatchId,
              orderId: orderId
            })
            .where(inArray(bankTransactions.transactionHash, transactionHashes));
        }
        
        // Update the order
        await tx
          .update(orders)
          .set({ 
            reconciliationStatus: 'reconciled',
            reconciledAt: now,
            reconciledBy: reconciledBy,
            batchId: newBatchId,
            transactionIds: transactionHashes
          })
          .where(eq(orders.orderId, orderId));
      }
      
      return { batchId: newBatchId };
    });
  }

  async getReconciledRecords(): Promise<{ transactions: BankTransaction[]; orders: Order[] }> {
    const reconciledTransactions = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.reconciliationStatus, 'reconciled'));
    
    const reconciledOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.reconciliationStatus, 'reconciled'));
    
    return { transactions: reconciledTransactions, orders: reconciledOrders };
  }
}

export const storage = new DatabaseStorage();
