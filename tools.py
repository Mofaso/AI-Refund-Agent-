import os
import datetime
import logging

logger = logging.getLogger(__name__)

# Initialize Firestore
from app.database import db

def get_customer_info(customer_id: str) -> dict:
    """
    Retrieve customer profile information, including their name, email, loyalty tier, and account creation date.
    
    Args:
        customer_id (str): The unique identifier of the customer (e.g., 'cust_101').
        
    Returns:
        dict: A dictionary containing customer profile details or an error message if not found.
    """
    try:
        doc = db.collection("customers").document(customer_id).get()
        if doc.exists:
            data = doc.to_dict()
            # Convert datetime objects to string representation for LLM compatibility
            if "created_at" in data and isinstance(data["created_at"], datetime.datetime):
                data["created_at"] = data["created_at"].isoformat()
            return data
        else:
            return {"error": f"Customer with ID '{customer_id}' not found."}
    except Exception as e:
        logger.error(f"Error in get_customer_info: {str(e)}")
        return {"error": f"Database error: {str(e)}"}

def get_customer_orders(customer_id: str) -> list:
    """
    Retrieve all orders placed by a specific customer, showing order IDs, totals, and transaction dates.
    
    Args:
        customer_id (str): The unique identifier of the customer (e.g., 'cust_101').
        
    Returns:
        list: A list of orders, each with purchase dates, status, total amount, and items.
    """
    try:
        orders_ref = db.collection("orders").where("customer_id", "==", customer_id)
        orders = []
        for doc in orders_ref.stream():
            data = doc.to_dict()
            # Convert datetime objects to string
            for field in ["purchase_date", "delivery_date"]:
                if field in data and isinstance(data[field], datetime.datetime):
                    data[field] = data[field].isoformat()
            orders.append(data)
        return orders
    except Exception as e:
        logger.error(f"Error in get_customer_orders: {str(e)}")
        return [{"error": f"Database error: {str(e)}"}]

def get_order_details(order_id: str) -> dict:
    """
    Retrieve detailed information for a specific order. This includes the order status (e.g., DELIVERED, SHIPPED), 
    delivery date, purchase date, and list of individual items (with their item IDs, prices, and whether they are 'final sale').
    
    Args:
        order_id (str): The unique identifier of the order (e.g., 'ord_2001').
        
    Returns:
        dict: Detailed order fields, including item-level details, or an error message.
    """
    try:
        doc = db.collection("orders").document(order_id).get()
        if doc.exists:
            data = doc.to_dict()
            for field in ["purchase_date", "delivery_date"]:
                if field in data and isinstance(data[field], datetime.datetime):
                    data[field] = data[field].isoformat()
            return data
        else:
            return {"error": f"Order with ID '{order_id}' not found."}
    except Exception as e:
        logger.error(f"Error in get_order_details: {str(e)}")
        return {"error": f"Database error: {str(e)}"}

def read_refund_policy() -> str:
    """
    Retrieve the Worknoon corporate refund and return policy document. 
    This policy outlines standard return timelines, loyalty tier exceptions (e.g., VIP extended windows), 
    exclusions (such as Final Sale items), and financial refund limits ($500.00 human escalation threshold).
    
    Returns:
        str: The full corporate refund policy in Markdown format.
    """
    try:
        policy_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "refund_policy.md")
        if not os.path.exists(policy_path):
            # Fallback path if run from root or differently structured
            policy_path = os.path.join("data", "refund_policy.md")
            
        with open(policy_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Error in read_refund_policy: {str(e)}")
        return "Error: Could not read corporate refund policy document."

def submit_refund_evaluation(order_id: str, item_ids: list, action: str, justification: str) -> dict:
    """
    Submit the formal refund decision (APPROVED, DENIED, or ESCALATED) for specific items in an order.
    The agent must calculate the refund total, check constraints, and record the output in Firestore.
    
    If APPROVED: The matching items in the order document will be updated to 'refunded: True' in the database.
    If ESCALATED: The ticket is registered for a human manager to review and approve/deny on their dashboard.
    If DENIED: The ticket is saved as DENIED with the agent's explanation.
    
    Args:
        order_id (str): The unique identifier of the order (e.g., 'ord_2001').
        item_ids (list): List of item_id strings inside the order that are requested for refund.
        action (str): The decision type. Must be exactly one of: 'APPROVED', 'DENIED', 'ESCALATED'.
        justification (str): A detailed explanation citing policy terms and order dates that supports this decision.
        
    Returns:
        dict: Success details and the calculated refund amount.
    """
    try:
        action = action.upper()
        if action not in ["APPROVED", "DENIED", "ESCALATED"]:
            return {"error": "Invalid action. Must be 'APPROVED', 'DENIED', or 'ESCALATED'."}
            
        # Get order details to fetch prices and verify items
        order_ref = db.collection("orders").document(order_id)
        order_doc = order_ref.get()
        if not order_doc.exists:
            return {"error": f"Order '{order_id}' not found."}
            
        order_data = order_doc.to_dict()
        customer_id = order_data["customer_id"]
        
        # Calculate refund total based on selected item prices
        refund_amount = 0.0
        matching_items = []
        
        order_items = order_data.get("items", [])
        for item in order_items:
            if item["item_id"] in item_ids:
                refund_amount += item["price"]
                matching_items.append(item)
                
        if not matching_items:
            return {"error": f"None of the provided item IDs {item_ids} were found in order '{order_id}'."}

        # Apply update if action is APPROVED
        if action == "APPROVED":
            # Update the items in the order doc to be marked as refunded
            updated_items = []
            for item in order_items:
                if item["item_id"] in item_ids:
                    item["refunded"] = True
                updated_items.append(item)
            order_ref.update({"items": updated_items})

        # Save the refund request ticket
        now = datetime.datetime.now(datetime.timezone.utc)
        refund_doc_ref = db.collection("refund_requests").document()
        refund_request_data = {
            "id": refund_doc_ref.id,
            "customer_id": customer_id,
            "order_id": order_id,
            "item_ids": item_ids,
            "items": matching_items,
            "amount": refund_amount,
            "status": action,
            "reason": justification,
            "timestamp": now,
            "resolved_by": "AI" if action != "ESCALATED" else None,
            "resolved_at": now if action != "ESCALATED" else None
        }
        
        refund_doc_ref.set(refund_request_data)
        
        # Format dates for JSON returning
        refund_request_data["timestamp"] = refund_request_data["timestamp"].isoformat()
        if refund_request_data.get("resolved_at"):
            refund_request_data["resolved_at"] = refund_request_data["resolved_at"].isoformat()

        return {
            "success": True,
            "ticket_id": refund_doc_ref.id,
            "action": action,
            "refund_amount": refund_amount,
            "data": refund_request_data
        }
        
    except Exception as e:
        logger.error(f"Error in submit_refund_evaluation: {str(e)}")
        return {"error": f"Database write error: {str(e)}"}
