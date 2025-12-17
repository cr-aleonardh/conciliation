import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';
import { storage } from './storage';
import type { InsertBankTransaction } from '@shared/schema';

const COLUMN_MAPPING: Record<string, string> = {
  'date': 'date',
  'datum': 'date',
  'bookingdate': 'date',
  'valuedate': 'date',
  'payername': 'payerName',
  'payeesender': 'payerName',
  'payer': 'payerName',
  'sender': 'payerName',
  'name': 'payerName',
  'payernaam': 'payerName',
  'description': 'description',
  'omschrijving': 'description',
  'details': 'description',
  'purpose': 'description',
  'credits': 'credits',
  'credit': 'credits',
  'af': 'credits',
  'bij': 'credits',
  'amount': 'credits',
  'debits': 'debits',
  'debit': 'debits',
  'balance': 'balance',
  'saldo': 'balance'
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], targetColumn: string): string | null {
  const normalizedTarget = normalizeColumnName(targetColumn);
  for (const header of headers) {
    const normalizedHeader = normalizeColumnName(header);
    if (normalizedHeader === normalizedTarget || COLUMN_MAPPING[normalizedHeader] === targetColumn) {
      return header;
    }
  }
  return null;
}

function normalizeText(text: string): string {
  if (!text) return '';
  let result = text.toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return result.replace(/[^\x00-\x7F]/g, '');
}

function extractReference(text: string): string | null {
  if (!text) return null;
  const match = text.match(/[A-Z]{2}\d{6}/);
  return match ? match[0] : null;
}

function parseDate(dateValue: any): string {
  if (!dateValue) return '';
  
  const str = dateValue.toString();
  
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
    const [day, month, year] = str.split('.');
    return `${year}-${month}-${day}`;
  }
  
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split('T')[0];
  }
  
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return str;
}

function parseNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  let str = value.toString().trim();
  
  const hasCommaDecimal = /\d,\d{2}$/.test(str);
  const hasDotDecimal = /\d\.\d{2}$/.test(str);
  
  if (hasCommaDecimal && !hasDotDecimal) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (hasDotDecimal && !hasCommaDecimal) {
    str = str.replace(/,/g, '');
  } else {
    str = str.replace(/[^\d.-]/g, '');
  }
  
  const cleaned = str.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

function generateHash(row: Record<string, any>, headers: string[]): string {
  const dateCol = findColumn(headers, 'date');
  const payerCol = findColumn(headers, 'payerName');
  const descCol = findColumn(headers, 'description');
  const creditCol = findColumn(headers, 'credits');
  const balanceCol = findColumn(headers, 'balance');
  
  const parts = [
    dateCol ? row[dateCol] : '',
    payerCol ? row[payerCol] : '',
    descCol ? row[descCol] : '',
    creditCol ? row[creditCol] : '',
    balanceCol ? row[balanceCol] : ''
  ];
  
  const hashString = parts.join('|');
  return createHash('sha256').update(hashString).digest('hex').substring(0, 16);
}

export async function processUploadedFile(buffer: Buffer, filename: string): Promise<{
  success: boolean;
  message: string;
  processed?: number;
  skipped?: number;
  duplicates?: number;
}> {
  try {
    const ext = filename.toLowerCase().split('.').pop();
    let rows: Record<string, any>[] = [];
    let headers: string[] = [];
    
    if (ext === 'csv') {
      const content = buffer.toString('utf-8');
      rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
      }
    } else if (ext === 'xls' || ext === 'xlsx') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(allRows.length, 20); i++) {
        const row = allRows[i];
        if (!row) continue;
        const rowValues = row.map((v: any) => normalizeColumnName(String(v || '')));
        if (rowValues.includes('date') || rowValues.includes('datum')) {
          headerRowIndex = i;
          break;
        }
      }
      
      if (headerRowIndex === -1) {
        return { success: false, message: 'Could not find transaction headers in file' };
      }
      
      headers = allRows[headerRowIndex].map((h: any) => String(h || '').trim());
      
      for (let i = headerRowIndex + 1; i < allRows.length; i++) {
        const rowData = allRows[i];
        if (!rowData || rowData.every((cell: any) => cell === null || cell === undefined || cell === '')) {
          continue;
        }
        const rowObj: Record<string, any> = {};
        headers.forEach((header, idx) => {
          if (header) {
            rowObj[header] = rowData[idx];
          }
        });
        rows.push(rowObj);
      }
    } else {
      return { success: false, message: `Unsupported file format: ${ext}` };
    }
    
    if (rows.length === 0) {
      return { success: false, message: 'No data found in file' };
    }
    
    const dateCol = findColumn(headers, 'date');
    const payerCol = findColumn(headers, 'payerName');
    const descCol = findColumn(headers, 'description');
    const creditCol = findColumn(headers, 'credits');
    const debitCol = findColumn(headers, 'debits');
    
    if (!dateCol) {
      return { success: false, message: 'Date column not found' };
    }
    
    const transactions: InsertBankTransaction[] = [];
    let skipped = 0;
    
    for (const row of rows) {
      const debits = debitCol ? parseNumber(row[debitCol]) : 0;
      if (debits > 0) {
        skipped++;
        continue;
      }
      
      const credits = creditCol ? parseNumber(row[creditCol]) : 0;
      if (credits <= 0) {
        skipped++;
        continue;
      }
      
      const hash = generateHash(row, headers);
      const payerName = payerCol ? normalizeText(row[payerCol]) : '';
      const description = descCol ? normalizeText(row[descCol]) : '';
      const reference = extractReference(description) || extractReference(payerName);
      
      transactions.push({
        transactionHash: hash,
        transactionDate: parseDate(row[dateCol]),
        payerSender: payerName,
        description: description,
        creditAmount: credits.toString(),
        reconciliationStatus: 'unmatched',
        orderId: null,
        matchReferenceFlag: false,
        matchNameScore: '0',
        diffDays: null,
        diffAmount: null,
        extractedReference: reference
      });
    }
    
    if (transactions.length === 0) {
      return { success: true, message: 'No valid credit transactions found', processed: 0, skipped };
    }
    
    let duplicates = 0;
    const insertedTransactions: InsertBankTransaction[] = [];
    
    for (const tx of transactions) {
      const existing = await storage.getBankTransactionByHash(tx.transactionHash);
      if (existing) {
        duplicates++;
      } else {
        insertedTransactions.push(tx);
      }
    }
    
    if (insertedTransactions.length > 0) {
      await storage.createBankTransactions(insertedTransactions);
    }
    
    return {
      success: true,
      message: `Successfully processed ${insertedTransactions.length} transactions`,
      processed: insertedTransactions.length,
      skipped,
      duplicates
    };
    
  } catch (error: any) {
    console.error('File processing error:', error);
    return { success: false, message: `Processing error: ${error.message}` };
  }
}
