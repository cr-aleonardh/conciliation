export type ReconciliationStatus = 'suggested_match' | 'temporarily_matched' | 'reconciled' | 'unmatched';

export interface BankTransaction {
  transaction_hash: string; // Primary Key
  payer_sender: string;
  transaction_date: string; // ISO Date string
  credit_amount: number;
  description: string;
  raw_description?: string;
  extracted_reference?: string;
  match_reference_flag: boolean;
  match_name_score: number; // 0-100
  diff_days?: number;
  diff_amount?: number;
  reconciliation_status: ReconciliationStatus;
  order_id?: number; // Foreign Key to Order
  imported_at: string; // ISO Timestamp
  reconciled_at?: string; // ISO Timestamp
}

export interface Order {
  order_id: number; // Primary Key
  order_bank_reference: string;
  amount: number; // Net amount
  fee: number;
  amount_total_fee: number; // Total amount (matches credit_amount)
  order_timestamp: string; // ISO DateTime
  order_date: string; // ISO Date string
  customer_name: string;
  match_reference_flag: boolean;
  match_name_score: number; // 0-100
  diff_days?: number;
  diff_amount?: number;
  reconciliation_status: ReconciliationStatus;
  fetched_at: string; // ISO Timestamp
  reconciled_at?: string; // ISO Timestamp
  transaction_ids?: string[]; // Array of transaction_hashes
}
