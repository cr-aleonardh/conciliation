#!/usr/bin/env python3
"""
Fetch orders from Curiara API and return raw data as JSON for Node.js to process.

Usage: python scripts/fetch_orders.py

Requires environment variables:
- CURIARA_API_USER: API username for Basic Auth
- CURIARA_API_PASSWORD: API password for Basic Auth

Outputs JSON to stdout with raw orders data. All transformation and database
operations are handled by Node.js to maintain schema consistency.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta


def get_env_or_fail(name: str) -> str:
    """Get environment variable or exit with error."""
    value = os.environ.get(name)
    if not value:
        print(json.dumps({
            "success": False,
            "message": f"Missing environment variable: {name}",
            "orders": []
        }))
        sys.exit(1)
    return value


def format_date_for_api(date: datetime) -> str:
    """Format date for API query parameter: yyyy.mm.dd"""
    return date.strftime("%Y.%m.%d")


def fetch_orders_from_api(api_user: str, api_password: str, custom_start_date: str = None, custom_end_date: str = None):
    """
    Fetch orders from Curiara API with pagination.
    
    Args:
        api_user: API username
        api_password: API password
        custom_start_date: Optional start date in YYYY-MM-DD format
        custom_end_date: Optional end date in YYYY-MM-DD format
    
    Returns tuple of (orders list, stats dict)
    """
    base_url = "https://apicuriara.azurewebsites.net/api/OrderBreakdown"
    
    today = datetime.now()
    
    # Use custom dates if provided, otherwise use defaults
    if custom_start_date:
        try:
            start_dt = datetime.strptime(custom_start_date, "%Y-%m-%d")
        except ValueError:
            start_dt = datetime(2025, 12, 13)
    else:
        start_dt = datetime(2025, 12, 13)
    
    if custom_end_date:
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
    filtered_count = 0
    payment_methods_seen = set()
    
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
        
        # Debug: collect unique payment methods
        for order in data["data"]:
            pm = order.get("paymentMethod", "N/A")
            if pm not in payment_methods_seen:
                payment_methods_seen.add(pm)
                print(f"Payment method found: {pm}", file=sys.stderr)
        
        filtered_orders = [
            order for order in data["data"]
            if order.get("paymentMethod", "").lower() == "transferencia bancaria"
        ]
        filtered_count += len(filtered_orders)
        
        all_orders.extend(filtered_orders)
        
        current_page += 1
        
        if current_page <= total_pages:
            time.sleep(0.2)
    
    stats = {
        "totalFetched": total_fetched,
        "filteredCount": filtered_count,
        "totalPages": total_pages,
        "startDate": start_date,
        "endDate": end_date
    }
    
    return all_orders, stats


def main():
    """Main entry point."""
    try:
        api_user = get_env_or_fail("CURIARA_API_USER")
        api_password = get_env_or_fail("CURIARA_API_PASSWORD")
        
        # Parse command-line arguments for custom dates
        custom_start_date = None
        custom_end_date = None
        
        if len(sys.argv) > 1:
            custom_start_date = sys.argv[1] if sys.argv[1] != "null" else None
        if len(sys.argv) > 2:
            custom_end_date = sys.argv[2] if sys.argv[2] != "null" else None
        
        orders, stats = fetch_orders_from_api(api_user, api_password, custom_start_date, custom_end_date)
        
        result = {
            "success": True,
            "message": f"Fetched {stats['totalFetched']} orders, filtered to {stats['filteredCount']} bank transfers",
            "orders": orders,
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
            "orders": []
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": f"Error: {str(e)}",
            "orders": []
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
