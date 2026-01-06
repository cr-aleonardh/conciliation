#!/usr/bin/env python3
"""
Fetch orders from Curiara API and bulk upsert to PostgreSQL using Pandas and SQLAlchemy.

Usage: python scripts/fetch_orders.py [start_date] [end_date] [status_filter] [clean_old_orders]

Requires environment variables:
- CURIARA_API_USER: API username for Basic Auth
- CURIARA_API_PASSWORD: API password for Basic Auth
- DATABASE_URL: PostgreSQL connection string

Outputs JSON summary to stdout with stats.
"""

import os
import sys
import json
import time
import re
import unicodedata
import requests
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.dialects.postgresql import insert as pg_insert


def get_env_or_fail(name: str) -> str:
    """Get environment variable or exit with error."""
    value = os.environ.get(name)
    if not value:
        print(json.dumps({
            "success": False,
            "message": f"Missing environment variable: {name}",
            "inserted": 0,
            "updated": 0
        }))
        sys.exit(1)
    return value


def format_date_for_api(date: datetime) -> str:
    """Format date for API query parameter: yyyy.mm.dd"""
    return date.strftime("%Y.%m.%d")


def parse_numeric_value(val) -> float | None:
    """Parse numeric value from various formats (mirrors TypeScript logic)."""
    if isinstance(val, (int, float)):
        if pd.isna(val) or not pd.np.isfinite(val) if hasattr(pd, 'np') else (val != val or val == float('inf') or val == float('-inf')):
            return None
        return float(val)
    
    if not isinstance(val, str):
        return None
    
    trimmed = val.strip()
    if trimmed == '':
        return None
    
    if re.search(r'\s', trimmed):
        return None
    
    dot_count = trimmed.count('.')
    comma_count = trimmed.count(',')
    
    if dot_count > 1 and comma_count == 0:
        return None
    if comma_count > 1:
        return None
    if dot_count > 0 and comma_count > 0:
        last_dot = trimmed.rfind('.')
        last_comma = trimmed.rfind(',')
        if last_dot > last_comma:
            return None
    
    normalized = trimmed
    is_european_format = comma_count == 1 and re.search(r',\d{1,2}$', trimmed)
    
    if is_european_format:
        normalized = normalized.replace('.', '').replace(',', '.')
    
    if not re.match(r'^-?\d+(\.\d+)?$', normalized):
        return None
    
    try:
        num = float(normalized)
        if num != num or num == float('inf') or num == float('-inf'):
            return None
        return num
    except:
        return None


def normalize_customer_name(name: str | None) -> str:
    """Normalize customer name (mirrors TypeScript logic)."""
    if not name:
        return ""
    normalized = unicodedata.normalize("NFD", name.upper())
    normalized = re.sub(r'[\u0300-\u036f]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()


def extract_date_only(iso_string: str) -> str:
    """Extract date part and format as ISO timestamp."""
    date_part = iso_string.split('T')[0]
    return f"{date_part}T00:00:00"


def fetch_orders_from_api(api_user: str, api_password: str, custom_start_date: str = None, custom_end_date: str = None):
    """Fetch orders from Curiara API with pagination."""
    base_url = "https://apicuriara.azurewebsites.net/api/OrderBreakdown"
    
    today = datetime.now()
    
    if custom_start_date and custom_start_date != "null":
        try:
            start_dt = datetime.strptime(custom_start_date, "%Y-%m-%d")
        except ValueError:
            start_dt = datetime(2025, 12, 13)
    else:
        start_dt = datetime(2025, 12, 13)
    
    if custom_end_date and custom_end_date != "null":
        try:
            end_dt = datetime.strptime(custom_end_date, "%Y-%m-%d")
        except ValueError:
            end_dt = today
    else:
        end_dt = today
    
    start_date = format_date_for_api(start_dt)
    end_date = format_date_for_api(end_dt)
    
    all_orders = []
    current_page = 1
    total_pages = 1
    total_fetched = 0
    
    print(f"Fetching orders from {start_date} to {end_date}", file=sys.stderr)
    
    while current_page <= total_pages:
        url = f"{base_url}?startDate={start_date}&endDate={end_date}&pageNumber={current_page}"
        
        print(f"Fetching page {current_page}...", file=sys.stderr)
        
        response = requests.get(
            url,
            auth=(api_user, api_password),
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code != 200:
            raise Exception(f"API returned status {response.status_code}: {response.text}")
        
        data = response.json()
        total_pages = data["paging"]["totalPages"]
        total_fetched += len(data["data"])
        
        all_orders.extend(data["data"])
        
        current_page += 1
        
        if current_page <= total_pages:
            time.sleep(0.2)
    
    stats = {
        "totalFetched": total_fetched,
        "totalPages": total_pages,
        "startDate": start_date,
        "endDate": end_date
    }
    
    return all_orders, stats


def transform_orders(raw_orders: list, status_filter: str = None) -> pd.DataFrame:
    """Transform raw API orders into DataFrame matching orders table schema."""
    if not raw_orders:
        return pd.DataFrame()
    
    df = pd.DataFrame(raw_orders)
    
    df['paymentMethod_lower'] = df['paymentMethod'].fillna('').str.lower()
    df = df[df['paymentMethod_lower'] == 'transferencia bancaria']
    df = df.drop(columns=['paymentMethod_lower'])
    
    if df.empty:
        return pd.DataFrame()
    
    if status_filter and status_filter != "null":
        if status_filter.upper() == 'H':
            df = df[df['status'].fillna('').str.startswith('H')]
        elif status_filter.upper() in ('P', 'C'):
            df = df[df['status'].fillna('').str[0].isin(['P', 'C'])]
    else:
        df = df[df['status'].fillna('').str.startswith('H')]
    
    if df.empty:
        return pd.DataFrame()
    
    result = pd.DataFrame()
    result['order_id'] = df['orderId'].astype(int)
    result['order_bank_reference'] = df['orderBankReference'].fillna('')
    result['order_bank_reference'] = result['order_bank_reference'].replace('', None)
    
    result['amount'] = df['amount'].apply(parse_numeric_value).apply(lambda x: f"{x:.2f}" if x is not None else None)
    result['fee'] = df['fee'].apply(parse_numeric_value).apply(lambda x: f"{x:.2f}" if x is not None else None)
    result['amount_total_fee'] = df['amountTotalFee'].apply(parse_numeric_value).apply(lambda x: f"{x:.2f}" if x is not None else None)
    
    result['order_timestamp'] = df['orderTimestamp']
    result['order_date'] = df['orderDate'].apply(extract_date_only)
    result['customer_name'] = df['customerName'].apply(normalize_customer_name)
    result['remitec_status'] = df['status'].fillna('').str[0].replace('', None)
    
    result['match_reference_flag'] = False
    result['match_name_score'] = '0'
    result['reconciliation_status'] = 'unmatched'
    result['diff_days'] = None
    result['diff_amount'] = None
    result['transaction_ids'] = None
    result['batch_id'] = None
    
    result = result.dropna(subset=['amount', 'fee', 'amount_total_fee'])
    
    return result


def bulk_upsert_orders(engine, df: pd.DataFrame, clean_old_orders: bool = False) -> tuple[int, int]:
    """Perform bulk upsert of orders into PostgreSQL."""
    if df.empty:
        return 0, 0
    
    with engine.connect() as conn:
        if clean_old_orders:
            order_ids = df['order_id'].tolist()
            placeholders = ','.join([str(oid) for oid in order_ids])
            conn.execute(text(f"DELETE FROM orders WHERE order_id NOT IN ({placeholders})"))
        
        result = conn.execute(text("SELECT order_id FROM orders"))
        existing_ids = set(row[0] for row in result.fetchall())
        
        records = df.to_dict('records')
        
        inserted = 0
        updated = 0
        
        for record in records:
            order_id = record['order_id']
            
            if order_id in existing_ids:
                update_sql = text("""
                    UPDATE orders SET
                        order_bank_reference = :order_bank_reference,
                        amount = :amount,
                        fee = :fee,
                        amount_total_fee = :amount_total_fee,
                        order_timestamp = :order_timestamp,
                        order_date = :order_date,
                        customer_name = :customer_name,
                        remitec_status = :remitec_status,
                        fetched_at = NOW()
                    WHERE order_id = :order_id
                    AND reconciliation_status = 'unmatched'
                """)
                result = conn.execute(update_sql, record)
                if result.rowcount > 0:
                    updated += 1
            else:
                insert_sql = text("""
                    INSERT INTO orders (
                        order_id, order_bank_reference, amount, fee, amount_total_fee,
                        order_timestamp, order_date, customer_name, remitec_status,
                        match_reference_flag, match_name_score, reconciliation_status,
                        diff_days, diff_amount, transaction_ids, batch_id, fetched_at
                    ) VALUES (
                        :order_id, :order_bank_reference, :amount, :fee, :amount_total_fee,
                        :order_timestamp, :order_date, :customer_name, :remitec_status,
                        :match_reference_flag, :match_name_score, :reconciliation_status,
                        :diff_days, :diff_amount, :transaction_ids, :batch_id, NOW()
                    )
                """)
                conn.execute(insert_sql, record)
                inserted += 1
        
        conn.commit()
    
    return inserted, updated


def main():
    """Main entry point."""
    try:
        api_user = get_env_or_fail("CURIARA_API_USER")
        api_password = get_env_or_fail("CURIARA_API_PASSWORD")
        database_url = get_env_or_fail("DATABASE_URL")
        
        custom_start_date = None
        custom_end_date = None
        status_filter = None
        clean_old_orders = False
        
        if len(sys.argv) > 1:
            custom_start_date = sys.argv[1] if sys.argv[1] != "null" else None
        if len(sys.argv) > 2:
            custom_end_date = sys.argv[2] if sys.argv[2] != "null" else None
        if len(sys.argv) > 3:
            status_filter = sys.argv[3] if sys.argv[3] != "null" else None
        if len(sys.argv) > 4:
            clean_old_orders = sys.argv[4].lower() == "true"
        
        raw_orders, stats = fetch_orders_from_api(api_user, api_password, custom_start_date, custom_end_date)
        
        print(f"Total orders fetched: {stats['totalFetched']}", file=sys.stderr)
        
        df = transform_orders(raw_orders, status_filter)
        
        print(f"Orders after filtering and transformation: {len(df)}", file=sys.stderr)
        
        engine = create_engine(database_url)
        
        inserted, updated = bulk_upsert_orders(engine, df, clean_old_orders)
        
        print(f"Database operations complete - Inserted: {inserted}, Updated: {updated}", file=sys.stderr)
        
        result = {
            "success": True,
            "message": f"Fetched {stats['totalFetched']} orders, filtered to {len(df)} bank transfers with status filter",
            "inserted": inserted,
            "updated": updated,
            "totalFetched": stats["totalFetched"],
            "filteredCount": len(df),
            "totalPages": stats["totalPages"],
            "dateRange": {
                "startDate": stats["startDate"],
                "endDate": stats["endDate"]
            }
        }
        
        print(json.dumps(result))
            
    except requests.exceptions.RequestException as e:
        print(json.dumps({
            "success": False,
            "message": f"API request failed: {str(e)}",
            "inserted": 0,
            "updated": 0
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": f"Error: {str(e)}",
            "inserted": 0,
            "updated": 0
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
