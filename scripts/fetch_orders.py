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


def fetch_orders_from_api(api_user: str, api_password: str):
    """
    Fetch orders from Curiara API with pagination.
    
    Returns tuple of (orders list, stats dict)
    """
    base_url = "https://apicuriara.azurewebsites.net/api/OrderBreakdown"
    
    today = datetime.now()
    fixed_start = datetime(2025, 12, 14)
    
    start_date = format_date_for_api(fixed_start)
    end_date = format_date_for_api(today)
    
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
        
        orders, stats = fetch_orders_from_api(api_user, api_password)
        
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
