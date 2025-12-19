import os
import re
import hashlib
import unicodedata
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

app = Flask(__name__)
CORS(app)

def get_db_connection():
    """Create database connection using DATABASE_URL environment variable."""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url)

def normalize_text_ascii(text):
    """Normalize text to standard 7-bit ASCII, removing accents."""
    if pd.isna(text) or text is None:
        return ""
    text = str(text)
    normalized = unicodedata.normalize('NFKD', text)
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    return ascii_text

def normalize_payer_sender(name):
    """
    Normalize payer/sender name:
    - Remove accents, convert to ASCII
    - Strip punctuation (apostrophes, quotes, periods, commas)
    - Uppercase
    - Single spaces
    """
    if pd.isna(name) or name is None:
        return ""
    name = normalize_text_ascii(str(name))
    name = re.sub(r"['\"`.,;:!?()\\-]", "", name)
    name = name.upper()
    name = ' '.join(name.split())
    return name

def normalize_description(desc):
    """
    Normalize description:
    - Convert to UPPERCASE
    - Remove ALL whitespace
    - Normalize to ASCII
    """
    if pd.isna(desc) or desc is None:
        return ""
    desc = normalize_text_ascii(str(desc))
    desc = desc.upper()
    desc = re.sub(r'\s+', '', desc)
    return desc

def extract_reference(description):
    """Extract reference code using regex [A-Z]{2}\d{6}."""
    if pd.isna(description) or description is None:
        return None
    match = re.search(r'[A-Z]{2}\d{6}', str(description).upper())
    return match.group(0) if match else None

def parse_date(date_value):
    """
    Parse date from various formats.
    Handles dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd, ISO datetime strings, etc.
    Returns ISO format string (YYYY-MM-DD).
    """
    if pd.isna(date_value) or date_value is None:
        return None
    
    if isinstance(date_value, datetime):
        return date_value.strftime('%Y-%m-%d')
    
    if isinstance(date_value, pd.Timestamp):
        return date_value.strftime('%Y-%m-%d')
    
    date_str = str(date_value).strip()
    
    # Try pandas to_datetime first - handles ISO formats with time components
    try:
        parsed = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(parsed):
            return parsed.strftime('%Y-%m-%d')
    except Exception:
        pass
    
    # Fallback to manual format detection for ambiguous formats
    date_formats = [
        '%d.%m.%Y',
        '%d/%m/%Y',
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%d-%m-%Y',
        '%Y/%m/%d',
        '%d.%m.%y',
        '%d/%m/%y',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%S.%f',
        '%Y-%m-%dT%H:%M:%SZ',
    ]
    
    for fmt in date_formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    return None

def create_transaction_hash(row, column_mapping):
    """
    Create SHA256 hash for a transaction using Balance column for uniqueness.
    Uses Date, Payee/Sender, Credits, and Balance to create unique hash.
    column_mapping: dict mapping standard names to actual column names in the DataFrame
    """
    hash_components = []
    
    for standard_col in ['date', 'payer', 'credits', 'balance']:
        actual_col = column_mapping.get(standard_col)
        if actual_col and actual_col in row.index and pd.notna(row[actual_col]):
            hash_components.append(str(row[actual_col]))
        else:
            hash_components.append("")
    
    hash_string = "|".join(hash_components)
    return hashlib.sha256(hash_string.encode('utf-8')).hexdigest()

def find_header_row(df):
    """
    Find the row containing the header with columns like 'Date', 'Payee/Sender', 'Description'.
    Returns the row index.
    """
    target_headers = ['date', 'payee/sender', 'description']
    
    for idx, row in df.iterrows():
        row_values = [str(val).lower().strip() for val in row.values if pd.notna(val)]
        matches = sum(1 for header in target_headers if any(header in val for val in row_values))
        if matches >= 2:
            return idx
    
    return None

def read_file(file):
    """Read CSV or Excel file into DataFrame."""
    filename = file.filename.lower()
    
    if filename.endswith('.csv'):
        df = pd.read_csv(file, header=None, dtype=str)
    elif filename.endswith(('.xls', '.xlsx')):
        df = pd.read_excel(file, header=None, dtype=str)
    else:
        raise ValueError(f"Unsupported file format: {filename}")
    
    return df

def find_column(columns, keywords):
    """Find a column name that matches any of the keywords (case-insensitive)."""
    for col in columns:
        col_lower = col.lower().strip()
        for keyword in keywords:
            if keyword in col_lower:
                return col
    return None

def process_bank_file(file):
    """
    Process bank file and return list of transaction records.
    """
    df = read_file(file)
    
    header_row_idx = find_header_row(df)
    if header_row_idx is None:
        raise ValueError("Could not find header row containing 'Date', 'Payee/Sender', 'Description'")
    
    headers = df.iloc[header_row_idx].tolist()
    headers = [str(h).strip() if pd.notna(h) else f'Column_{i}' for i, h in enumerate(headers)]
    
    df = df.iloc[header_row_idx + 1:].reset_index(drop=True)
    df.columns = headers
    
    # Find Debits column (case-insensitive) and filter/drop
    debits_col = find_column(df.columns, ['debit'])
    if debits_col:
        df[debits_col] = pd.to_numeric(df[debits_col], errors='coerce').fillna(0)
        df = df[df[debits_col] == 0]
        df = df.drop(columns=[debits_col])
    
    # Build column mapping once (case-insensitive lookup)
    date_col = find_column(df.columns, ['date'])
    payer_col = find_column(df.columns, ['payee', 'sender'])
    desc_col = find_column(df.columns, ['description'])
    credits_col = find_column(df.columns, ['credit'])
    balance_col = find_column(df.columns, ['balance'])
    
    if not all([date_col, payer_col, desc_col, credits_col]):
        raise ValueError("Missing required columns: Date, Payee/Sender, Description, Credits")
    
    # Column mapping for hash function
    column_mapping = {
        'date': date_col,
        'payer': payer_col,
        'credits': credits_col,
        'balance': balance_col
    }
    
    transactions = []
    errors = []
    
    for idx, row in df.iterrows():
        try:
            credit_value = row.get(credits_col)
            if pd.isna(credit_value) or str(credit_value).strip() == '':
                continue
            
            try:
                credit_amount = float(str(credit_value).replace(',', '').replace('$', '').strip())
            except ValueError:
                errors.append(f"Row {idx + 1}: Invalid credit amount: {credit_value}")
                continue
            
            if credit_amount <= 0:
                continue
            
            transaction_hash = create_transaction_hash(row, column_mapping)
            transaction_date = parse_date(row.get(date_col))
            
            if not transaction_date:
                errors.append(f"Row {idx + 1}: Could not parse date: {row.get(date_col)}")
                continue
            
            payer_sender = normalize_payer_sender(row.get(payer_col))
            description = normalize_description(row.get(desc_col))
            extracted_reference = extract_reference(row.get(desc_col))
            
            transaction = {
                'transaction_hash': transaction_hash,
                'payer_sender': payer_sender,
                'transaction_date': transaction_date,
                'credit_amount': credit_amount,
                'description': description,
                'extracted_reference': extracted_reference,
                'match_reference_flag': False,
                'match_name_score': 0.0,
                'reconciliation_status': 'unmatched'
            }
            
            transactions.append(transaction)
            
        except Exception as e:
            errors.append(f"Row {idx + 1}: Error processing - {str(e)}")
    
    return transactions, errors

def insert_transactions(transactions):
    """Insert transactions into database."""
    if not transactions:
        return 0, 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    inserted_count = 0
    skipped_count = 0
    
    try:
        for txn in transactions:
            try:
                cursor.execute("""
                    INSERT INTO bank_transactions 
                    (transaction_hash, payer_sender, transaction_date, credit_amount, 
                     description, extracted_reference, match_reference_flag, 
                     match_name_score, reconciliation_status, imported_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (transaction_hash) DO NOTHING
                """, (
                    txn['transaction_hash'],
                    txn['payer_sender'],
                    txn['transaction_date'],
                    txn['credit_amount'],
                    txn['description'],
                    txn['extracted_reference'],
                    txn['match_reference_flag'],
                    txn['match_name_score'],
                    txn['reconciliation_status']
                ))
                
                if cursor.rowcount > 0:
                    inserted_count += 1
                else:
                    skipped_count += 1
                    
            except Exception as e:
                skipped_count += 1
                print(f"Error inserting transaction {txn['transaction_hash']}: {e}")
        
        conn.commit()
        
    finally:
        cursor.close()
        conn.close()
    
    return inserted_count, skipped_count

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'service': 'bank-upload'})

@app.route('/upload', methods=['POST'])
def upload_bank_file():
    """
    Handle bank file upload.
    Accepts CSV and XLS/XLSX files.
    """
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'message': 'No file provided'
        }), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({
            'success': False,
            'message': 'No file selected'
        }), 400
    
    allowed_extensions = ['.csv', '.xls', '.xlsx']
    file_ext = os.path.splitext(file.filename.lower())[1]
    
    if file_ext not in allowed_extensions:
        return jsonify({
            'success': False,
            'message': f'Invalid file format. Allowed formats: {", ".join(allowed_extensions)}'
        }), 400
    
    try:
        transactions, processing_errors = process_bank_file(file)
        
        if not transactions:
            return jsonify({
                'success': False,
                'message': 'No valid transactions found in file',
                'errors': processing_errors[:10]
            }), 400
        
        inserted_count, skipped_count = insert_transactions(transactions)
        
        return jsonify({
            'success': True,
            'message': f'Successfully imported {inserted_count} transactions',
            'details': {
                'total_processed': len(transactions),
                'inserted': inserted_count,
                'skipped_duplicates': skipped_count,
                'processing_errors': len(processing_errors)
            },
            'errors': processing_errors[:10] if processing_errors else []
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error processing file: {str(e)}'
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PYTHON_SERVICE_PORT', 5001))
    print(f"Starting Bank Upload Service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
