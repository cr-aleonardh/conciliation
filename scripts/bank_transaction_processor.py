#!/usr/bin/env python3
"""
Bank Transaction Processor
Handles import of bank transactions from CSV and XLS files.
"""

import os
import sys
import json
import re
import hashlib
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple

import pandas as pd
from unidecode import unidecode
import psycopg2
from psycopg2.extras import execute_values


def normalize_name(name: str) -> str:
    """
    Normalize name: remove accents, single space, all caps, ASCII only.
    """
    if pd.isna(name) or not name:
        return ""
    text = str(name)
    text = unidecode(text)
    text = text.upper()
    text = ' '.join(text.split())
    return text


def normalize_description(description: str) -> str:
    """
    Normalize description: UPPERCASE, remove ALL whitespace, ASCII only.
    """
    if pd.isna(description) or not description:
        return ""
    text = str(description)
    text = unidecode(text)
    text = text.upper()
    text = ''.join(text.split())
    return text


def extract_reference(description: str) -> Optional[str]:
    """
    Extract reference code using regex [A-Z]{2}\d{6} (e.g., AB123456).
    """
    if not description:
        return None
    pattern = r'[A-Z]{2}\d{6}'
    match = re.search(pattern, description)
    return match.group(0) if match else None


def parse_date(date_value: Any) -> Optional[str]:
    """
    Parse date from various formats (dd.mm.yyyy, dd/mm/yyyy, etc.)
    Returns ISO format string (YYYY-MM-DD HH:MM:SS).
    """
    if pd.isna(date_value):
        return None
    
    if isinstance(date_value, datetime):
        return date_value.strftime('%Y-%m-%d %H:%M:%S')
    
    if isinstance(date_value, pd.Timestamp):
        return date_value.strftime('%Y-%m-%d %H:%M:%S')
    
    date_str = str(date_value).strip()
    
    date_formats = [
        '%d.%m.%Y',
        '%d/%m/%Y',
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%d-%m-%Y',
        '%Y/%m/%d',
        '%d.%m.%y',
        '%d/%m/%y',
    ]
    
    for fmt in date_formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            continue
    
    return None


def create_hash(balance: Any, date_value: Any, amount: Any) -> str:
    """
    Create a unique SHA256 hash using Balance, date, and amount.
    """
    hash_input = f"{balance}|{date_value}|{amount}"
    return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()


def parse_amount(value: Any) -> Optional[float]:
    """
    Parse amount from various formats.
    """
    if pd.isna(value):
        return None
    
    if isinstance(value, (int, float)):
        return float(value)
    
    text = str(value).strip()
    text = text.replace(',', '')
    text = text.replace('$', '')
    text = text.replace('€', '')
    text = text.replace('£', '')
    
    try:
        return float(text)
    except ValueError:
        return None


def find_column(df: pd.DataFrame, possible_names: List[str]) -> Optional[str]:
    """
    Find a column by checking multiple possible names (case-insensitive).
    """
    df_columns_lower = {col.lower().strip(): col for col in df.columns}
    for name in possible_names:
        if name.lower() in df_columns_lower:
            return df_columns_lower[name.lower()]
    return None


def process_file(file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Process a CSV or XLS file and return processed transactions and errors.
    """
    errors = []
    transactions = []
    
    file_ext = os.path.splitext(file_path)[1].lower()
    
    try:
        if file_ext == '.csv':
            df = pd.read_csv(file_path)
        elif file_ext in ['.xls', '.xlsx']:
            df = pd.read_excel(file_path)
        else:
            return [], [f"Unsupported file format: {file_ext}"]
    except Exception as e:
        return [], [f"Error reading file: {str(e)}"]
    
    date_col = find_column(df, ['Date', 'Transaction Date', 'Trans Date', 'Fecha'])
    payee_col = find_column(df, ['Payee/Sender', 'Payee', 'Sender', 'Name', 'Payer', 'Pagador'])
    desc_col = find_column(df, ['Description', 'Desc', 'Details', 'Descripcion', 'Memo'])
    credits_col = find_column(df, ['Credits', 'Credit', 'Credit Amount', 'Amount In', 'Credito'])
    debits_col = find_column(df, ['Debits', 'Debit', 'Debit Amount', 'Amount Out', 'Debito'])
    balance_col = find_column(df, ['Balance', 'Running Balance', 'Saldo'])
    
    missing_cols = []
    if not date_col:
        missing_cols.append('Date')
    if not payee_col:
        missing_cols.append('Payee/Sender')
    if not desc_col:
        missing_cols.append('Description')
    if not credits_col:
        missing_cols.append('Credits')
    if not balance_col:
        missing_cols.append('Balance')
    
    if missing_cols:
        return [], [f"Missing required columns: {', '.join(missing_cols)}"]
    
    if debits_col:
        df = df[df[debits_col].isna() | (df[debits_col] == '') | (df[debits_col] == 0)]
    
    for idx, row in df.iterrows():
        try:
            credit_amount = parse_amount(row[credits_col])
            if credit_amount is None or credit_amount <= 0:
                continue
            
            transaction_date = parse_date(row[date_col])
            if not transaction_date:
                errors.append(f"Row {idx + 2}: Could not parse date '{row[date_col]}'")
                continue
            
            balance = row[balance_col] if balance_col else ''
            transaction_hash = create_hash(balance, row[date_col], credit_amount)
            
            payer_sender = normalize_name(row[payee_col])
            description = normalize_description(row[desc_col])
            extracted_reference = extract_reference(description)
            
            transaction = {
                'transaction_hash': transaction_hash,
                'payer_sender': payer_sender,
                'transaction_date': transaction_date,
                'credit_amount': credit_amount,
                'description': description,
                'extracted_reference': extracted_reference,
                'match_reference_flag': False,
                'match_name_score': 0.0,
                'diff_days': None,
                'diff_amount': None,
                'reconciliation_status': 'unmatched',
                'order_id': None,
            }
            
            transactions.append(transaction)
            
        except Exception as e:
            errors.append(f"Row {idx + 2}: Error processing - {str(e)}")
    
    return transactions, errors


def insert_transactions(transactions: List[Dict[str, Any]]) -> Tuple[int, List[str]]:
    """
    Insert transactions into the database.
    """
    if not transactions:
        return 0, []
    
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return 0, ["DATABASE_URL environment variable not set"]
    
    errors = []
    inserted = 0
    
    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        
        columns = [
            'transaction_hash', 'payer_sender', 'transaction_date', 'credit_amount',
            'description', 'extracted_reference', 'match_reference_flag', 
            'match_name_score', 'diff_days', 'diff_amount', 
            'reconciliation_status', 'order_id'
        ]
        
        values = []
        for t in transactions:
            values.append((
                t['transaction_hash'],
                t['payer_sender'],
                t['transaction_date'],
                t['credit_amount'],
                t['description'],
                t['extracted_reference'],
                t['match_reference_flag'],
                t['match_name_score'],
                t['diff_days'],
                t['diff_amount'],
                t['reconciliation_status'],
                t['order_id'],
            ))
        
        insert_query = f"""
            INSERT INTO bank_transactions ({', '.join(columns)})
            VALUES %s
            ON CONFLICT (transaction_hash) DO NOTHING
        """
        
        execute_values(cur, insert_query, values)
        inserted = cur.rowcount
        
        conn.commit()
        cur.close()
        conn.close()
        
    except Exception as e:
        errors.append(f"Database error: {str(e)}")
        return 0, errors
    
    return inserted, errors


def main():
    """
    Main entry point for the script.
    Expects file path as command line argument.
    Outputs JSON result to stdout.
    """
    if len(sys.argv) < 2:
        result = {
            'success': False,
            'error': 'No file path provided',
            'inserted': 0,
            'total_processed': 0,
            'errors': []
        }
        print(json.dumps(result))
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    if not os.path.exists(file_path):
        result = {
            'success': False,
            'error': f'File not found: {file_path}',
            'inserted': 0,
            'total_processed': 0,
            'errors': []
        }
        print(json.dumps(result))
        sys.exit(1)
    
    transactions, parse_errors = process_file(file_path)
    
    if not transactions and parse_errors:
        result = {
            'success': False,
            'error': parse_errors[0] if parse_errors else 'No transactions found',
            'inserted': 0,
            'total_processed': 0,
            'errors': parse_errors
        }
        print(json.dumps(result))
        sys.exit(1)
    
    inserted, db_errors = insert_transactions(transactions)
    
    all_errors = parse_errors + db_errors
    
    result = {
        'success': len(db_errors) == 0,
        'inserted': inserted,
        'total_processed': len(transactions),
        'skipped': len(transactions) - inserted,
        'errors': all_errors
    }
    
    print(json.dumps(result))
    sys.exit(0 if result['success'] else 1)


if __name__ == '__main__':
    main()
