import { z } from "zod";
import { type InsertOrder, insertOrderSchema } from "@shared/schema";

function parseNumericValue(val: unknown): number | null {
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? null : val;
  }
  if (typeof val !== 'string') {
    return null;
  }
  
  const trimmed = val.trim();
  if (trimmed === '') return null;
  
  if (/\s/.test(trimmed)) return null;
  
  const dotCount = (trimmed.match(/\./g) || []).length;
  const commaCount = (trimmed.match(/,/g) || []).length;
  
  if (dotCount > 1 && commaCount === 0) return null;
  if (commaCount > 1) return null;
  if (dotCount > 0 && commaCount > 0) {
    const lastDot = trimmed.lastIndexOf('.');
    const lastComma = trimmed.lastIndexOf(',');
    if (lastDot > lastComma) return null;
  }
  
  let normalized = trimmed;
  
  const isEuropeanFormat = commaCount === 1 && /,\d{1,2}$/.test(trimmed);
  
  if (isEuropeanFormat) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  
  const num = parseFloat(normalized);
  return isNaN(num) || !isFinite(num) ? null : num;
}

const numericString = z.unknown()
  .refine((val) => parseNumericValue(val) !== null, { 
    message: "Invalid numeric value - must be a valid number" 
  })
  .transform((val) => {
    const num = parseNumericValue(val)!;
    return num.toFixed(2);
  });

export const RawApiOrderSchema = z.object({
  orderId: z.number(),
  orderBankReference: z.string().nullable().optional(),
  amount: numericString,
  fee: numericString,
  amountTotalFee: numericString,
  orderTimestamp: z.string(),
  orderDate: z.string(),
  status: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
});

export type RawApiOrder = z.infer<typeof RawApiOrderSchema>;

function normalizeCustomerName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDateOnly(isoString: string): string {
  const datePart = isoString.split('T')[0];
  return `${datePart}T00:00:00`;
}

interface RequiredOrderFields {
  orderId: number;
  amount: string;
  fee: string;
  amountTotalFee: string;
  orderTimestamp: string;
  orderDate: string;
  customerName: string;
  orderBankReference?: string | null;
  remitecStatus?: string | null;
}

export function applyOrderDefaults(order: RequiredOrderFields): InsertOrder {
  return {
    orderId: order.orderId,
    orderBankReference: order.orderBankReference ?? null,
    amount: order.amount,
    fee: order.fee,
    amountTotalFee: order.amountTotalFee,
    orderTimestamp: order.orderTimestamp,
    orderDate: order.orderDate,
    customerName: order.customerName,
    remitecStatus: order.remitecStatus ?? null,
    matchReferenceFlag: false,
    matchNameScore: "0",
    reconciliationStatus: "unmatched",
    diffDays: null,
    diffAmount: null,
    transactionIds: null,
  };
}

export interface MapResult {
  orders: InsertOrder[];
  errors: string[];
}

export function mapAndValidateOrders(rawOrders: unknown[]): MapResult {
  const validOrders: InsertOrder[] = [];
  const errors: string[] = [];
  
  for (const raw of rawOrders) {
    try {
      const parsed = RawApiOrderSchema.safeParse(raw);
      
      if (!parsed.success) {
        const orderId = (raw as any)?.orderId || 'unknown';
        errors.push(`Order ${orderId}: ${parsed.error.message}`);
        continue;
      }
      
      const apiOrder = parsed.data;
      
      // Only include orders with status 'H'
      const status = apiOrder.status?.charAt(0);
      if (status !== 'H') {
        continue;
      }
      
      const mapped = applyOrderDefaults({
        orderId: apiOrder.orderId,
        orderBankReference: apiOrder.orderBankReference || null,
        amount: apiOrder.amount,
        fee: apiOrder.fee,
        amountTotalFee: apiOrder.amountTotalFee,
        orderTimestamp: apiOrder.orderTimestamp,
        orderDate: extractDateOnly(apiOrder.orderDate),
        customerName: normalizeCustomerName(apiOrder.customerName),
        remitecStatus: apiOrder.status?.charAt(0) || null,
      });
      
      const finalValidation = insertOrderSchema.safeParse(mapped);
      if (!finalValidation.success) {
        errors.push(`Order ${apiOrder.orderId}: Schema validation failed - ${finalValidation.error.message}`);
        continue;
      }
      
      validOrders.push(finalValidation.data);
      
    } catch (err: any) {
      const orderId = (raw as any)?.orderId || 'unknown';
      errors.push(`Order ${orderId}: ${err.message}`);
    }
  }
  
  return { orders: validOrders, errors };
}
