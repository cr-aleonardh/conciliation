import os
import sys
from datetime import datetime
import psycopg2
import pandas as pd

def get_db_connection():
    """Create database connection using DATABASE_URL environment variable."""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url)

def export_orders_to_excel():
    """Export orders to Excel file with specified columns."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT 
                order_id,
                amount_total_fee,
                order_bank_reference
            FROM orders
            ORDER BY order_id
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        df = pd.DataFrame(rows, columns=[
            'Order Number',
            'Order Value',
            'Bank Reference'
        ])
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'BankReconciliation-{timestamp}.xls'
        filepath = os.path.join('/tmp', filename)
        
        df.to_excel(filepath, index=False, engine='openpyxl')
        
        cursor.close()
        conn.close()
        
        print(filepath)
        return filepath
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    export_orders_to_excel()
