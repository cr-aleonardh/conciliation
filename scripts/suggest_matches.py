#!/usr/bin/env python3
"""
Suggestion Matching Script
Finds potential matches between bank transactions and orders using:
1. Reference match + amount match (<=0.99 diff) + date match (<=2 days diff)
2. Fuzzy name match (>70%) + amount match (<=0.99 diff) + date match (<=2 days diff)
"""

import os
import sys
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from fuzzywuzzy import fuzz

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_connection():
    if not DATABASE_URL:
        print("Error: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(DATABASE_URL)

def parse_date(date_val):
    """Parse date from various formats"""
    if date_val is None:
        return None
    if isinstance(date_val, datetime):
        return date_val.date()
    if isinstance(date_val, str):
        try:
            return datetime.strptime(date_val.split(' ')[0], '%Y-%m-%d').date()
        except:
            return None
    return None

def check_amount_match(bank_amount, order_amount, threshold=0.99):
    """Check if amounts match within threshold"""
    try:
        diff = abs(float(bank_amount) - float(order_amount))
        return diff <= threshold
    except:
        return False

def check_date_match(bank_date, order_date, max_days=2):
    """Check if dates match within max_days difference"""
    bank_d = parse_date(bank_date)
    order_d = parse_date(order_date)
    if bank_d is None or order_d is None:
        return False
    diff = abs((bank_d - order_d).days)
    return diff <= max_days

def check_reference_match(bank_ref, order_ref):
    """Check if references match (case-insensitive)"""
    if not bank_ref or not order_ref:
        return False
    return bank_ref.strip().lower() == order_ref.strip().lower()

def check_name_match(bank_name, order_name, threshold=70):
    """Check if names match using fuzzy matching"""
    if not bank_name or not order_name:
        return 0
    score = fuzz.ratio(bank_name.strip().lower(), order_name.strip().lower())
    return score

def run_suggestions():
    """Main function to find and mark suggested matches"""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        cur.execute("""
            SELECT transaction_hash, payer_sender, transaction_date, 
                   credit_amount, extracted_reference
            FROM bank_transactions 
            WHERE reconciliation_status = 'unmatched'
        """)
        bank_txns = cur.fetchall()
        
        cur.execute("""
            SELECT order_id, customer_name, order_date, 
                   amount_total_fee, order_bank_reference
            FROM orders 
            WHERE reconciliation_status = 'unmatched'
        """)
        orders = cur.fetchall()
        
        print(f"Found {len(bank_txns)} unmatched bank transactions")
        print(f"Found {len(orders)} unmatched orders")
        
        suggestions_count = 0
        matched_bank_ids = set()
        matched_order_ids = set()
        
        for bank in bank_txns:
            if bank['transaction_hash'] in matched_bank_ids:
                continue
                
            for order in orders:
                if order['order_id'] in matched_order_ids:
                    continue
                
                amount_match = check_amount_match(
                    bank['credit_amount'], 
                    order['amount_total_fee']
                )
                date_match = check_date_match(
                    bank['transaction_date'], 
                    order['order_date']
                )
                
                if not amount_match or not date_match:
                    continue
                
                ref_match = check_reference_match(
                    bank['extracted_reference'],
                    order['order_bank_reference']
                )
                
                name_score = check_name_match(
                    bank['payer_sender'],
                    order['customer_name']
                )
                
                if ref_match:
                    cur.execute("""
                        UPDATE bank_transactions 
                        SET reconciliation_status = 'suggested_match',
                            match_reference_flag = true,
                            match_name_score = %s,
                            diff_days = %s,
                            diff_amount = %s,
                            order_id = %s
                        WHERE transaction_hash = %s
                    """, (
                        name_score,
                        abs((parse_date(bank['transaction_date']) - parse_date(order['order_date'])).days),
                        abs(float(bank['credit_amount']) - float(order['amount_total_fee'])),
                        order['order_id'],
                        bank['transaction_hash']
                    ))
                    
                    cur.execute("""
                        UPDATE orders 
                        SET reconciliation_status = 'suggested_match',
                            match_reference_flag = true,
                            match_name_score = %s,
                            diff_days = %s,
                            diff_amount = %s,
                            transaction_ids = ARRAY[%s]
                        WHERE order_id = %s
                    """, (
                        name_score,
                        abs((parse_date(bank['transaction_date']) - parse_date(order['order_date'])).days),
                        abs(float(bank['credit_amount']) - float(order['amount_total_fee'])),
                        bank['transaction_hash'],
                        order['order_id']
                    ))
                    
                    matched_bank_ids.add(bank['transaction_hash'])
                    matched_order_ids.add(order['order_id'])
                    suggestions_count += 1
                    print(f"Reference match: Bank {bank['transaction_hash'][:20]}... -> Order {order['order_id']}")
                    break
                
                elif name_score > 70:
                    cur.execute("""
                        UPDATE bank_transactions 
                        SET reconciliation_status = 'suggested_match',
                            match_reference_flag = false,
                            match_name_score = %s,
                            diff_days = %s,
                            diff_amount = %s,
                            order_id = %s
                        WHERE transaction_hash = %s
                    """, (
                        name_score,
                        abs((parse_date(bank['transaction_date']) - parse_date(order['order_date'])).days),
                        abs(float(bank['credit_amount']) - float(order['amount_total_fee'])),
                        order['order_id'],
                        bank['transaction_hash']
                    ))
                    
                    cur.execute("""
                        UPDATE orders 
                        SET reconciliation_status = 'suggested_match',
                            match_reference_flag = false,
                            match_name_score = %s,
                            diff_days = %s,
                            diff_amount = %s,
                            transaction_ids = ARRAY[%s]
                        WHERE order_id = %s
                    """, (
                        name_score,
                        abs((parse_date(bank['transaction_date']) - parse_date(order['order_date'])).days),
                        abs(float(bank['credit_amount']) - float(order['amount_total_fee'])),
                        bank['transaction_hash'],
                        order['order_id']
                    ))
                    
                    matched_bank_ids.add(bank['transaction_hash'])
                    matched_order_ids.add(order['order_id'])
                    suggestions_count += 1
                    print(f"Name match ({name_score}%): Bank {bank['transaction_hash'][:20]}... -> Order {order['order_id']}")
                    break
        
        conn.commit()
        print(f"\nTotal suggestions created: {suggestions_count}")
        return suggestions_count
        
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    count = run_suggestions()
    print(f"Suggestions: {count}")
