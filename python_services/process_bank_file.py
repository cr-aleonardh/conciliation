#!/usr/bin/env python3
"""
Bank Transaction File Processor
Processes CSV/XLS files and inserts transactions into the database
Run as: python process_bank_file.py <file_path> <file_type>
"""

import os
import re
import sys
import json
import hashlib
from datetime import datetime
import pandas as pd
from unidecode import unidecode
import psycopg2

COLUMN_MAPPING = {
    'date': ['date', 'fecha', 'transaction date', 'trans date', 'value date'],
    'payee/sender': ['payee/sender', 'payee', 'sender', 'payer', 'name', 'customer', 'remitente', 'pagador'],
    'credits': ['credits', 'credit', 'credit amount', 'amount', 'credito', 'monto'],
    'description': ['description', 'details', 'narrative', 'memo', 'reference', 'descripcion', 'detalle'],
    'balance': ['balance', 'saldo', 'running balance'],
    'debits': ['debits', 'debit', 'debit amount', 'debito']
}


def get_db_connection():
    """Create database connection using environment variable"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url)


def find_column(df_columns, target_column):
    """Find matching column in dataframe regardless of case"""
    possible_names = COLUMN_MAPPING.get(target_column, [target_column])
    df_columns_lower = [col.lower().strip() for col in df_columns]
    
    for name in possible_names:
        if name.lower() in df_columns_lower:
            idx = df_columns_lower.index(name.lower())
            return df_columns[idx]
    return None


def detect_header_row(df):
    """Find the row containing the header columns"""
    for idx, row in df.iterrows():
        row_values = [str(val).lower().strip() for val in row.values if pd.notna(val)]
        matches = 0
        for col in ['date', 'credits', 'balance']:
            for possible_name in COLUMN_MAPPING.get(col, [col]):
                if possible_name.lower() in row_values:
                    matches += 1
                    break
        if matches >= 2:
            return idx
    return 0


def parse_date(date_str):
    """Detect and parse date format, return ISO format string"""
    if pd.isna(date_str):
        return None
    
    date_str = str(date_str).strip()
    
    formats = [
        '%d.%m.%Y',
        '%d/%m/%Y',
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%d-%m-%Y',
        '%Y/%m/%d',
        '%d.%m.%y',
        '%d/%m/%y',
        '%m/%d/%y',
    ]
    
    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            continue
    
    try:
        if isinstance(date_str, (pd.Timestamp, datetime)):
            return date_str.strftime('%Y-%m-%d %H:%M:%S')
    except:
        pass
    
    return None


def normalize_payer_sender(name):
    """Normalize payer/sender name: ASCII, single space, uppercase"""
    if pd.isna(name) or not name:
        return ""
    
    name = str(name)
    name = unidecode(name)
    name = ' '.join(name.split())
    name = name.upper()
    
    return name


def normalize_description(desc):
    """Normalize description: uppercase, no whitespace, ASCII"""
    if pd.isna(desc) or not desc:
        return ""
    
    desc = str(desc)
    desc = unidecode(desc)
    desc = ''.join(desc.split())
    desc = desc.upper()
    
    return desc


def extract_reference(description):
    """Extract reference code using regex [A-Z]{2}\\d{6}"""
    if not description:
        return None
    
    pattern = r'[A-Z]{2}\d{6}'
    match = re.search(pattern, description)
    return match.group(0) if match else None


def create_transaction_hash(row_data):
    """Create unique SHA256 hash using Balance column"""
    balance = str(row_data.get('balance', ''))
    date = str(row_data.get('date', ''))
    amount = str(row_data.get('credit_amount', ''))
    payer = str(row_data.get('payer_sender', ''))
    
    hash_input = f"{balance}|{date}|{amount}|{payer}"
    return hashlib.sha256(hash_input.encode()).hexdigest()


def get_excel_engine(file_path):
    """Determine the appropriate Excel engine based on file extension"""
    if file_path.lower().endswith('.xls'):
        return 'xlrd'
    return 'openpyxl'


def find_header_row_in_file(file_path, file_type):
    """Find the header row by reading line by line"""
    header_keywords = ['date', 'credits', 'balance', 'payee', 'sender', 'amount']
    
    try:
        if file_type == 'csv':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                for idx, line in enumerate(f):
                    line_lower = line.lower()
                    matches = sum(1 for kw in header_keywords if kw in line_lower)
                    if matches >= 2:
                        return idx
        else:
            engine = get_excel_engine(file_path)
            df = pd.read_excel(file_path, header=None, engine=engine)
            for idx, row in df.iterrows():
                row_str = ' '.join(str(v).lower() for v in row.values if pd.notna(v))
                matches = sum(1 for kw in header_keywords if kw in row_str)
                if matches >= 2:
                    return idx
    except Exception:
        pass
    
    return 0


def process_file(file_path, file_type):
    """Process bank file and return transactions"""
    header_row = find_header_row_in_file(file_path, file_type)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(file_path, header=header_row, encoding='utf-8', encoding_errors='ignore')
        else:
            engine = get_excel_engine(file_path)
            df = pd.read_excel(file_path, header=header_row, engine=engine)
    except Exception as e:
        return None, str(e)
    
    date_col = find_column(df.columns, 'date')
    payer_col = find_column(df.columns, 'payee/sender')
    credits_col = find_column(df.columns, 'credits')
    desc_col = find_column(df.columns, 'description')
    balance_col = find_column(df.columns, 'balance')
    debits_col = find_column(df.columns, 'debits')
    
    missing_cols = []
    if not date_col:
        missing_cols.append('date')
    if not credits_col:
        missing_cols.append('credits')
    if not balance_col:
        missing_cols.append('balance')
    
    if missing_cols:
        return None, f"Missing required columns: {', '.join(missing_cols)}"
    
    if debits_col:
        df = df[pd.isna(df[debits_col]) | (df[debits_col] == '') | (df[debits_col] == 0)]
        df = df.drop(columns=[debits_col])
    
    transactions = []
    skipped_count = 0
    
    for idx, row in df.iterrows():
        try:
            credit_value = row.get(credits_col)
            if pd.isna(credit_value) or credit_value == '' or credit_value == 0:
                skipped_count += 1
                continue
            
            try:
                credit_amount = float(str(credit_value).replace(',', '').replace('$', '').strip())
            except ValueError:
                skipped_count += 1
                continue
            
            if credit_amount <= 0:
                skipped_count += 1
                continue
            
            transaction_date = parse_date(row.get(date_col))
            if not transaction_date:
                skipped_count += 1
                continue
            
            payer_sender = normalize_payer_sender(row.get(payer_col, ''))
            
            raw_description = str(row.get(desc_col, '')) if desc_col and pd.notna(row.get(desc_col)) else ''
            description = normalize_description(raw_description)
            
            extracted_reference = extract_reference(description)
            
            balance = row.get(balance_col, 0)
            
            transaction_data = {
                'date': transaction_date,
                'balance': balance,
                'credit_amount': credit_amount,
                'payer_sender': payer_sender
            }
            transaction_hash = create_transaction_hash(transaction_data)
            
            transactions.append({
                'transaction_hash': transaction_hash,
                'payer_sender': payer_sender,
                'transaction_date': transaction_date,
                'credit_amount': credit_amount,
                'description': description,
                'extracted_reference': extracted_reference,
            })
            
        except Exception as e:
            skipped_count += 1
            continue
    
    return transactions, f"Processed {len(transactions)} transactions, skipped {skipped_count} rows"


def insert_transactions(transactions):
    """Insert transactions into database"""
    if not transactions:
        return 0, 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    inserted = 0
    duplicates = 0
    
    try:
        for tx in transactions:
            try:
                cursor.execute("""
                    INSERT INTO bank_transactions (
                        transaction_hash, payer_sender, transaction_date, credit_amount,
                        description, extracted_reference, match_reference_flag,
                        match_name_score, diff_days, diff_amount,
                        reconciliation_status, order_id, imported_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    )
                    ON CONFLICT (transaction_hash) DO NOTHING
                """, (
                    tx['transaction_hash'],
                    tx['payer_sender'],
                    tx['transaction_date'],
                    tx['credit_amount'],
                    tx['description'],
                    tx['extracted_reference'],
                    False,
                    0,
                    None,
                    None,
                    'unmatched',
                    None
                ))
                
                if cursor.rowcount > 0:
                    inserted += 1
                else:
                    duplicates += 1
                    
            except Exception as e:
                duplicates += 1
                continue
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()
    
    return inserted, duplicates


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Usage: python process_bank_file.py <file_path> <file_type>'}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_type = sys.argv[2]
    
    if not os.path.exists(file_path):
        print(json.dumps({'success': False, 'error': f'File not found: {file_path}'}))
        sys.exit(1)
    
    try:
        transactions, message = process_file(file_path, file_type)
        
        if transactions is None:
            print(json.dumps({'success': False, 'error': message}))
            sys.exit(1)
        
        if not transactions:
            print(json.dumps({
                'success': True,
                'message': 'No valid credit transactions found',
                'inserted': 0,
                'duplicates': 0,
                'total_processed': 0
            }))
            sys.exit(0)
        
        inserted, duplicates = insert_transactions(transactions)
        
        print(json.dumps({
            'success': True,
            'message': f'Successfully imported {inserted} transactions',
            'inserted': inserted,
            'duplicates': duplicates,
            'total_processed': len(transactions),
            'process_details': message
        }))
        
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
