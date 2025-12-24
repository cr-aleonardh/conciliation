#!/usr/bin/env python3
"""
Suggestion Matching Script
Finds potential matches between bank transactions and orders using:
1. Reference match + amount match (<=0.99 diff) + date match (bank 2 days before to 3 days after order)
2. Fuzzy name match (>70%) + amount match (<=0.99 diff) + date match (bank 2 days before to 3 days after order)
3. No reference on bank + name match (>70%) + amount match (<=0.99 diff) + date match
"""

import os
import re
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

def check_date_match(bank_date, order_date, days_before=2, days_after=3):
    """
    Check if dates match within allowed range.
    Bank can be up to days_before days BEFORE the order (bank is older).
    Bank can be up to days_after days AFTER the order (bank is newer).
    """
    bank_d = parse_date(bank_date)
    order_d = parse_date(order_date)
    if bank_d is None or order_d is None:
        return False
    diff = (bank_d - order_d).days
    return -days_before <= diff <= days_after

def check_reference_match(bank_ref, order_ref):
    """Check if references match (case-insensitive)"""
    if not bank_ref or not order_ref:
        return False
    return bank_ref.strip().lower() == order_ref.strip().lower()

def normalize_name(name):
    """Normalize name by stripping punctuation and extra whitespace"""
    if not name:
        return ""
    name = re.sub(r"['\"`.,;:!?()\\-]", "", str(name))
    name = ' '.join(name.strip().lower().split())
    return name

def check_name_match(bank_name, order_name, threshold=70):
    """Check if names match using fuzzy matching"""
    if not bank_name or not order_name:
        return 0
    bank_normalized = normalize_name(bank_name)
    order_normalized = normalize_name(order_name)
    score = fuzz.ratio(bank_normalized, order_normalized)
    return score

def suggest_transaction_links(conn, cur):
    """
    Find and suggest links between main payment transactions and commission transactions.
    A commission is a transaction with amount between 3.50 and 4.50.
    Links are suggested when main + commission have similar name/reference and close dates.
    """
    # Get unmatched commission transactions (3.50 - 4.50)
    cur.execute("""
        SELECT transaction_hash, payer_sender, transaction_date, 
               credit_amount, extracted_reference
        FROM bank_transactions 
        WHERE reconciliation_status = 'unmatched'
          AND CAST(credit_amount AS NUMERIC) >= 3.50 
          AND CAST(credit_amount AS NUMERIC) <= 4.50
    """)
    commission_txns = cur.fetchall()
    
    # Get unmatched main transactions (amount > 10, excluding commissions)
    cur.execute("""
        SELECT transaction_hash, payer_sender, transaction_date, 
               credit_amount, extracted_reference
        FROM bank_transactions 
        WHERE reconciliation_status = 'unmatched'
          AND CAST(credit_amount AS NUMERIC) > 10
    """)
    main_txns = cur.fetchall()
    
    # Get existing links to avoid duplicates
    cur.execute("""
        SELECT primary_transaction_hash, linked_transaction_hash 
        FROM transaction_links
    """)
    existing_links = set()
    for row in cur.fetchall():
        existing_links.add((row['primary_transaction_hash'], row['linked_transaction_hash']))
        existing_links.add((row['linked_transaction_hash'], row['primary_transaction_hash']))
    
    print(f"Found {len(commission_txns)} commission transactions (3.50-4.50)")
    print(f"Found {len(main_txns)} main transactions (>10)")
    
    links_count = 0
    linked_commissions = set()
    
    for commission in commission_txns:
        if commission['transaction_hash'] in linked_commissions:
            continue
            
        best_match = None
        best_score = 0
        
        for main in main_txns:
            # Check if link already exists
            if (main['transaction_hash'], commission['transaction_hash']) in existing_links:
                continue
            
            # Check date proximity (commission within 5 days of main)
            main_date = parse_date(main['transaction_date'])
            comm_date = parse_date(commission['transaction_date'])
            if main_date and comm_date:
                date_diff = abs((comm_date - main_date).days)
                if date_diff > 5:
                    continue
            else:
                continue
            
            # Check reference match
            ref_match = check_reference_match(
                commission['extracted_reference'],
                main['extracted_reference']
            )
            
            # Check name similarity
            name_score = check_name_match(
                commission['payer_sender'],
                main['payer_sender']
            )
            
            # Calculate overall score
            total_score = 0
            if ref_match:
                total_score = 100  # Perfect reference match
            elif name_score >= 80:
                total_score = name_score
            
            if total_score > best_score:
                best_score = total_score
                best_match = main
        
        # Create link if we found a good match
        if best_match and best_score >= 70:
            cur.execute("""
                INSERT INTO transaction_links 
                (primary_transaction_hash, linked_transaction_hash, link_type, status)
                VALUES (%s, %s, 'commission', 'suggested')
            """, (best_match['transaction_hash'], commission['transaction_hash']))
            
            linked_commissions.add(commission['transaction_hash'])
            links_count += 1
            print(f"Link suggested (score {best_score}): Main {best_match['transaction_hash'][:15]}... + Commission {commission['transaction_hash'][:15]}...")
    
    return links_count

def run_suggestions():
    """Main function to find and mark suggested matches"""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # First, suggest transaction links (main + commission)
        links_count = suggest_transaction_links(conn, cur)
        print(f"Transaction links suggested: {links_count}")
        
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
