import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBankTransactionSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";

const uploadDir = path.join(os.tmpdir(), 'bank_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

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

  app.post("/api/upload-bank-file", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file provided" });
      }

      const { spawn } = await import('child_process');
      
      const originalName = req.file.originalname.toLowerCase();
      let fileType = 'csv';
      if (originalName.endsWith('.xls') || originalName.endsWith('.xlsx')) {
        fileType = 'excel';
      }
      
      const pythonScript = path.join(process.cwd(), 'python_services', 'process_bank_file.py');
      
      const pythonProcess = spawn('python', [pythonScript, req.file.path, fileType]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code: number) => {
        try {
          fs.unlinkSync(req.file!.path);
        } catch (e) {}
        
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ success: false, error: stderr || 'Failed to process file' });
        }
        
        try {
          const result = JSON.parse(stdout);
          res.json(result);
        } catch (e) {
          res.status(500).json({ success: false, error: 'Failed to parse Python output' });
        }
      });
      
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
