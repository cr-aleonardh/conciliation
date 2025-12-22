import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBankTransactionSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { processUploadedFile } from "./fileProcessor";
import { spawn } from "child_process";
import { mapAndValidateOrders } from "./orderMapper";

const upload = multer({ storage: multer.memoryStorage() });

const USERS = [
  { username: "curiara", password: "6W9XECy6zfpCrU", isAdmin: false },
  { username: "curiara_admin", password: "y47oZXU0dLReiV4", isAdmin: true }
];

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAuthenticated) {
    next();
  } else {
    res.status(401).json({ message: "Unauthorized" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    
    const user = USERS.find(u => u.username === username && u.password === password);
    if (user) {
      req.session.isAuthenticated = true;
      req.session.username = username;
      req.session.isAdmin = user.isAdmin;
      res.json({ success: true, message: "Login successful", isAdmin: user.isAdmin });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Logout failed" });
      } else {
        res.json({ success: true, message: "Logged out" });
      }
    });
  });

  app.get("/api/auth/status", (req, res) => {
    res.json({ 
      isAuthenticated: req.session?.isAuthenticated || false,
      username: req.session?.username || null,
      isAdmin: req.session?.isAdmin || false
    });
  });

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

  app.post("/api/reconcile-batch", async (req, res) => {
    try {
      const schema = z.object({
        matches: z.array(z.object({
          orderId: z.number(),
          transactionHashes: z.array(z.string())
        }))
      });
      const { matches } = schema.parse(req.body);
      const result = await storage.reconcileBatch(matches);
      res.json({ 
        success: true, 
        message: `Reconciliation completed with batch ID ${result.batchId}`,
        batchId: result.batchId
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Export reconciliation to XLSX file
  app.post("/api/export-reconciliation", async (req, res) => {
    try {
      const schema = z.object({
        orderIds: z.array(z.number())
      });
      const { orderIds } = schema.parse(req.body);
      
      if (orderIds.length === 0) {
        return res.status(400).json({ message: "No order IDs provided" });
      }
      
      const pythonProcess = spawn("python3", ["scripts/export_reconciliation.py"], {
        env: process.env,
        cwd: process.cwd()
      });
      
      const chunks: Buffer[] = [];
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        chunks.push(Buffer.from(data));
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.stdin.write(JSON.stringify({ orderIds }));
      pythonProcess.stdin.end();
      
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          console.error("Export script failed:", stderr);
          return res.status(500).json({ message: "Failed to generate export file" });
        }
        
        const xlsBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reconciliation.xlsx');
        res.send(xlsBuffer);
      });
      
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Get reconciled records grouped by batch
  app.get("/api/reconciled", async (req, res) => {
    try {
      const { transactions, orders } = await storage.getReconciledRecords();
      res.json({ transactions, orders });
    } catch (error: any) {
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

  // Fetch Orders from Curiara API - calls Python script, then uses storage layer
  app.post("/api/fetch-orders", async (req, res) => {
    try {
      console.log("Starting Python script to fetch orders...");
      
      const pythonProcess = spawn("python3", ["scripts/fetch_orders.py"], {
        env: process.env,
        cwd: process.cwd()
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log("Python:", data.toString().trim());
      });
      
      pythonProcess.on("close", async (code) => {
        if (code !== 0) {
          console.error("Python script failed with code:", code);
          console.error("stderr:", stderr);
          
          try {
            const result = JSON.parse(stdout);
            return res.status(500).json(result);
          } catch {
            return res.status(500).json({
              success: false,
              message: `Python script failed with code ${code}: ${stderr || stdout}`
            });
          }
        }
        
        try {
          const pythonResult = JSON.parse(stdout);
          
          if (!pythonResult.success) {
            return res.status(500).json(pythonResult);
          }
          
          if (!Array.isArray(pythonResult.orders)) {
            return res.status(500).json({
              success: false,
              message: "Invalid response from fetch script: orders is not an array"
            });
          }
          
          const { orders: ordersToUpsert, errors: validationErrors } = mapAndValidateOrders(pythonResult.orders);
          
          if (validationErrors.length > 0) {
            console.warn(`Validation issues with ${validationErrors.length} orders:`, validationErrors.slice(0, 5));
          }
          
          const dbResult = await storage.upsertOrders(ordersToUpsert);
          
          console.log(`Fetch complete: ${pythonResult.message}, inserted: ${dbResult.inserted}, updated: ${dbResult.updated}`);
          
          res.json({
            success: true,
            message: pythonResult.message,
            inserted: dbResult.inserted,
            updated: dbResult.updated,
            totalPages: pythonResult.totalPages,
            dateRange: pythonResult.dateRange
          });
          
        } catch (parseError: any) {
          console.error("Failed to process Python output:", parseError.message);
          console.error("stdout:", stdout);
          res.status(500).json({
            success: false,
            message: `Failed to process script output: ${parseError.message}`
          });
        }
      });
      
      pythonProcess.on("error", (error) => {
        console.error("Failed to start Python script:", error);
        res.status(500).json({
          success: false,
          message: `Failed to start Python script: ${error.message}`
        });
      });
      
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ 
        success: false, 
        message: `Error fetching orders: ${error.message}` 
      });
    }
  });

  // Fetch ALL Orders from Curiara API (no status filter)
  app.post("/api/fetch-orders-all", async (req, res) => {
    try {
      console.log("Starting Python script to fetch ALL orders (no status filter)...");
      
      const pythonProcess = spawn("python3", ["scripts/fetch_orders.py"], {
        env: process.env,
        cwd: process.cwd()
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log("Python:", data.toString().trim());
      });
      
      pythonProcess.on("close", async (code) => {
        if (code !== 0) {
          console.error("Python script failed with code:", code);
          console.error("stderr:", stderr);
          
          try {
            const result = JSON.parse(stdout);
            return res.status(500).json(result);
          } catch {
            return res.status(500).json({
              success: false,
              message: `Python script failed with code ${code}: ${stderr || stdout}`
            });
          }
        }
        
        try {
          const pythonResult = JSON.parse(stdout);
          
          if (!pythonResult.success) {
            return res.status(500).json(pythonResult);
          }
          
          if (!Array.isArray(pythonResult.orders)) {
            return res.status(500).json({
              success: false,
              message: "Invalid response from fetch script: orders is not an array"
            });
          }
          
          // Use skipStatusFilter: true to include all orders regardless of status
          const { orders: ordersToUpsert, errors: validationErrors } = mapAndValidateOrders(pythonResult.orders, { skipStatusFilter: true });
          
          if (validationErrors.length > 0) {
            console.warn(`Validation issues with ${validationErrors.length} orders:`, validationErrors.slice(0, 5));
          }
          
          const dbResult = await storage.upsertOrders(ordersToUpsert);
          
          console.log(`Fetch ALL complete: ${pythonResult.message}, inserted: ${dbResult.inserted}, updated: ${dbResult.updated}`);
          
          res.json({
            success: true,
            message: `Fetched ALL orders (no status filter). Inserted: ${dbResult.inserted}, Updated: ${dbResult.updated}`,
            inserted: dbResult.inserted,
            updated: dbResult.updated,
            totalPages: pythonResult.totalPages,
            dateRange: pythonResult.dateRange
          });
          
        } catch (parseError: any) {
          console.error("Failed to process Python output:", parseError.message);
          console.error("stdout:", stdout);
          res.status(500).json({
            success: false,
            message: `Failed to process script output: ${parseError.message}`
          });
        }
      });
      
      pythonProcess.on("error", (error) => {
        console.error("Failed to start Python script:", error);
        res.status(500).json({
          success: false,
          message: `Failed to start Python script: ${error.message}`
        });
      });
      
    } catch (error: any) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ 
        success: false, 
        message: `Error fetching all orders: ${error.message}` 
      });
    }
  });

  // Run suggestion matching script
  app.post("/api/suggestions/run", async (req, res) => {
    try {
      console.log("Running suggestion matching script...");
      
      const pythonProcess = spawn("python", ["scripts/suggest_matches.py"], {
        env: { ...process.env }
      });
      
      let stdout = "";
      let stderr = "";
      
      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log("Suggestion script output:", data.toString());
      });
      
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error("Suggestion script error:", data.toString());
      });
      
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          console.error("Suggestion script failed with code:", code);
          return res.status(500).json({
            success: false,
            message: `Script failed with code ${code}: ${stderr}`
          });
        }
        
        // Parse the output to get suggestions count
        const match = stdout.match(/Suggestions: (\d+)/);
        const count = match ? parseInt(match[1]) : 0;
        
        res.json({
          success: true,
          message: `Found ${count} potential matches`,
          suggestionsCount: count
        });
      });
      
      pythonProcess.on("error", (error) => {
        console.error("Failed to start suggestion script:", error);
        res.status(500).json({
          success: false,
          message: `Failed to start script: ${error.message}`
        });
      });
      
    } catch (error: any) {
      console.error("Error running suggestions:", error);
      res.status(500).json({ 
        success: false, 
        message: `Error running suggestions: ${error.message}` 
      });
    }
  });

  return httpServer;
}
