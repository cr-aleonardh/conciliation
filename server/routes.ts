import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBankTransactionSchema, insertOrderSchema, type InsertOrder } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { processUploadedFile } from "./fileProcessor";

const CURIARA_API_BASE = "https://apicuriara.azurewebsites.net";
const CURIARA_API_USER = process.env.CURIARA_API_USER || "";
const CURIARA_API_PASSWORD = process.env.CURIARA_API_PASSWORD || "";

function normalizeCustomerName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function extractDateOnly(isoString: string): string {
  const datePart = isoString.split('T')[0];
  return `${datePart}T00:00:00`;
}

interface CuriaraOrder {
  orderId: number;
  orderBankReference: string | null;
  amount: number;
  fee: number;
  amountTotalFee: number;
  orderTimestamp: string;
  orderDate: string;
  status: string;
  customerName: string;
  paymentMethod: string;
}

interface CuriaraApiResponse {
  paging: {
    totalItems: number;
    totalPages: number;
    pageNumber: number;
    pageSize: number;
  };
  data: CuriaraOrder[];
}

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Bank Transactions Routes
  app.get("/api/bank-transactions", async (req, res) => {
    try {
      const transactions = await storage.getBankTransactions();
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/bank-transactions/:hash", async (req, res) => {
    try {
      const transaction = await storage.getBankTransactionByHash(req.params.hash);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      res.json(transaction);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bank-transactions", async (req, res) => {
    try {
      const data = insertBankTransactionSchema.parse(req.body);
      const transaction = await storage.createBankTransaction(data);
      res.status(201).json(transaction);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bank-transactions/bulk", async (req, res) => {
    try {
      const data = z.array(insertBankTransactionSchema).parse(req.body);
      const transactions = await storage.createBankTransactions(data);
      res.status(201).json(transactions);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/bank-transactions/:hash", async (req, res) => {
    try {
      const data = insertBankTransactionSchema.partial().parse(req.body);
      const transaction = await storage.updateBankTransaction(req.params.hash, data);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      res.json(transaction);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/bank-transactions/:hash", async (req, res) => {
    try {
      await storage.deleteBankTransaction(req.params.hash);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Orders Routes
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrderById(parseInt(req.params.id));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const data = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(data);
      res.status(201).json(order);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/orders/bulk", async (req, res) => {
    try {
      const data = z.array(insertOrderSchema).parse(req.body);
      const orders = await storage.createOrders(data);
      res.status(201).json(orders);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const data = insertOrderSchema.partial().parse(req.body);
      const order = await storage.updateOrder(parseInt(req.params.id), data);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      await storage.deleteOrder(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Matching Operations
  app.post("/api/match", async (req, res) => {
    try {
      const schema = z.object({
        transactionHash: z.string(),
        orderId: z.number(),
        status: z.string()
      });
      const { transactionHash, orderId, status } = schema.parse(req.body);
      await storage.matchTransactionToOrder(transactionHash, orderId, status);
      res.json({ message: "Match created successfully" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/unmatch", async (req, res) => {
    try {
      const schema = z.object({
        transactionHash: z.string()
      });
      const { transactionHash } = schema.parse(req.body);
      await storage.unmatchTransaction(transactionHash);
      res.json({ message: "Match removed successfully" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/reconcile", async (req, res) => {
    try {
      const schema = z.object({
        transactionHashes: z.array(z.string()),
        orderIds: z.array(z.number())
      });
      const { transactionHashes, orderIds } = schema.parse(req.body);
      await storage.reconcileMatches(transactionHashes, orderIds);
      res.json({ message: "Reconciliation completed successfully" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Bank File Upload - Process directly in Node.js
  app.post("/api/upload-bank-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file provided" });
      }

      const result = await processUploadedFile(req.file.buffer, req.file.originalname);
      res.status(result.success ? 200 : 400).json(result);

    } catch (error: any) {
      console.error("Error processing file:", error);
      res.status(500).json({ 
        success: false, 
        message: `Error processing file: ${error.message}` 
      });
    }
  });

  // Fetch Orders from Curiara API
  app.post("/api/fetch-orders", async (req, res) => {
    try {
      if (!CURIARA_API_USER || !CURIARA_API_PASSWORD) {
        return res.status(500).json({ 
          success: false, 
          message: "API credentials not configured" 
        });
      }

      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      const startDate = formatDateForApi(threeDaysAgo);
      const endDate = formatDateForApi(today);

      const authHeader = "Basic " + Buffer.from(`${CURIARA_API_USER}:${CURIARA_API_PASSWORD}`).toString("base64");

      let allOrders: InsertOrder[] = [];
      let currentPage = 1;
      let totalPages = 1;
      let totalFetched = 0;
      let filteredCount = 0;

      console.log(`Fetching orders from ${startDate} to ${endDate}`);

      while (currentPage <= totalPages) {
        const url = `${CURIARA_API_BASE}/api/OrderBreakdown?startDate=${startDate}&endDate=${endDate}&pageNumber=${currentPage}`;
        
        console.log(`Fetching page ${currentPage}...`);
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}: ${await response.text()}`);
        }

        const data: CuriaraApiResponse = await response.json();
        totalPages = data.paging.totalPages;
        totalFetched += data.data.length;

        const filteredOrders = data.data.filter(
          order => order.paymentMethod === "Transferencia Bancaria"
        );
        filteredCount += filteredOrders.length;

        const mappedOrders: InsertOrder[] = filteredOrders.map(order => ({
          orderId: order.orderId,
          orderBankReference: order.orderBankReference || null,
          amount: String(order.amount),
          fee: String(order.fee),
          amountTotalFee: String(order.amountTotalFee),
          orderTimestamp: order.orderTimestamp,
          orderDate: extractDateOnly(order.orderDate),
          customerName: normalizeCustomerName(order.customerName),
          remitecStatus: order.status?.charAt(0) || null,
          matchReferenceFlag: false,
          matchNameScore: "0",
          reconciliationStatus: "unmatched",
        }));

        allOrders = allOrders.concat(mappedOrders);
        currentPage++;

        if (currentPage <= totalPages) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const result = await storage.upsertOrders(allOrders);

      console.log(`Fetch complete: ${totalFetched} total orders, ${filteredCount} with bank transfer, ${result.inserted} inserted, ${result.updated} updated`);

      res.json({
        success: true,
        message: `Fetched ${totalFetched} orders, filtered to ${filteredCount} bank transfers`,
        inserted: result.inserted,
        updated: result.updated,
        totalPages,
        dateRange: { startDate, endDate }
      });

    } catch (error: any) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ 
        success: false, 
        message: `Error fetching orders: ${error.message}` 
      });
    }
  });

  return httpServer;
}
