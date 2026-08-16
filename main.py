import os
import time
import datetime
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

from dotenv import load_dotenv
# Try loading from the root of the project (one level up from backend)
root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

from app.database import db
from scripts.seed import seed_database
from app.agent.agent import GeminiRefundAgent

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Verify Firestore and seed database upon application startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing application startup...")
    retries = 10
    connected = False
    
    # Wait for Firestore Emulator to be fully operational
    for i in range(retries):
        try:
            # Query arbitrary collection to test connection
            db.collection("customers").limit(1).get()
            connected = True
            logger.info("Firestore connection established.")
            break
        except Exception as e:
            logger.warning(f"Waiting for Firestore Emulator (attempt {i+1}/{retries}): {str(e)}")
            time.sleep(2)
            
    if connected:
        try:
            seed_database()
        except Exception as e:
            logger.error(f"Error seeding database on startup: {str(e)}")
    else:
        logger.error("Could not establish connection to Firestore Emulator. Seeding skipped.")
        
    yield
    logger.info("Shutting down application...")

# Initialize FastAPI App
app = FastAPI(
    title="Worknoon AI Customer Support Agent API",
    description="Backend API hosting the Gemini-powered refund agent loop with Firestore NoSQL storage.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local development and cross-container calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Agent
agent = GeminiRefundAgent()

# ==============================================================================
# Pydantic Schemas for API Requests & Responses
# ==============================================================================

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    content: str = Field(..., description="Message text")

class ChatRequest(BaseModel):
    session_id: str = Field(..., description="Unique chat session ID")
    customer_id: str = Field(..., description="The ID of the customer sending the message")
    message: str = Field(..., description="The user's input message")
    history: List[ChatMessage] = Field(default=[], description="Previous conversation history")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="The AI agent's response to the customer")

class ResolveEscalationRequest(BaseModel):
    status: str = Field(..., description="Decision status: APPROVED or DENIED")
    reason: str = Field(..., description="Reason for the manual resolution decision")

# ==============================================================================
# Customer Portal Endpoints
# ==============================================================================

@app.get("/api/customers")
def list_customers():
    """Retrieve all pre-seeded customer profiles for context impersonation."""
    try:
        customers_ref = db.collection("customers").stream()
        customers = []
        for doc in customers_ref:
            customers.append(doc.to_dict())
        # Sort by customer ID (cust_101, cust_102, etc.)
        customers.sort(key=lambda x: int(x["id"].split("_")[1]) if "_" in x["id"] else 0)
        return customers
    except Exception as e:
        logger.error(f"Error listing customers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/customers/{customer_id}/orders")
def get_customer_orders_endpoint(customer_id: str):
    """Retrieve order history for a specific customer."""
    try:
        orders_ref = db.collection("orders").where("customer_id", "==", customer_id).stream()
        orders = []
        for doc in orders_ref:
            data = doc.to_dict()
            # Convert datetime objects to string
            for field in ["purchase_date", "delivery_date"]:
                if field in data and isinstance(data[field], datetime.datetime):
                    data[field] = data[field].isoformat()
            orders.append(data)
        # Sort orders newest first
        orders.sort(key=lambda x: x.get("purchase_date", ""), reverse=True)
        return orders
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Route customer message through the Gemini AI agent loop.
    Triggers reasoning logging and database tools dynamically.
    """
    try:
        # Convert Pydantic schemas to standard dict formats
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
        
        # Execute chat turn using Gemini agent
        reply = agent.run_chat_turn(
            session_id=request.session_id,
            customer_id=request.customer_id,
            chat_history=history_dicts,
            new_message=request.message
        )
        
        return ChatResponse(reply=reply)
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Agent loop failed: {str(e)}")

# ==============================================================================
# Admin Dashboard & Metric Endpoints
# ==============================================================================

@app.get("/api/admin/metrics")
def get_admin_metrics():
    """Aggregate real-time metrics across Firestore collections."""
    try:
        # Customer Count
        customers_ref = db.collection("customers").get()
        total_customers = len(customers_ref)

        # Order Count
        orders_ref = db.collection("orders").get()
        total_orders = len(orders_ref)

        # Refund Request Stats
        refunds_ref = db.collection("refund_requests").get()
        
        approved_count = 0
        denied_count = 0
        escalated_count = 0
        total_refunded_cash = 0.0

        for doc in refunds_ref:
            data = doc.to_dict()
            status = data.get("status", "").upper()
            amount = data.get("amount", 0.0)
            
            if status == "APPROVED":
                approved_count += 1
                total_refunded_cash += amount
            elif status == "DENIED":
                denied_count += 1
            elif status == "ESCALATED":
                escalated_count += 1

        return {
            "total_customers": total_customers,
            "total_orders": total_orders,
            "total_refunds_submitted": len(refunds_ref),
            "approved_refunds": approved_count,
            "denied_refunds": denied_count,
            "escalated_refunds": escalated_count,
            "total_amount_refunded": round(total_refunded_cash, 2)
        }
    except Exception as e:
        logger.error(f"Error aggregating metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/logs")
def get_agent_logs(session_id: Optional[str] = None):
    """Retrieve detailed agent reasoning logs for the admin stream."""
    try:
        logs_ref = db.collection("agent_logs")
        if session_id:
            query = logs_ref.where("session_id", "==", session_id)
        else:
            query = logs_ref
            
        logs = []
        for doc in query.stream():
            data = doc.to_dict()
            # Convert datetime to string
            if "timestamp" in data and isinstance(data["timestamp"], datetime.datetime):
                data["timestamp"] = data["timestamp"].isoformat()
            logs.append(data)
            
        # Sort logs by timestamp ascending to show reasoning chronologically
        logs.sort(key=lambda x: x.get("timestamp", ""))
        return logs
    except Exception as e:
        logger.error(f"Error fetching agent logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/escalations")
def get_escalations():
    """Retrieve list of escalated refund tickets awaiting human decision."""
    try:
        escalations_ref = db.collection("refund_requests").where("status", "==", "ESCALATED").stream()
        escalations = []
        for doc in escalations_ref:
            data = doc.to_dict()
            if "timestamp" in data and isinstance(data["timestamp"], datetime.datetime):
                data["timestamp"] = data["timestamp"].isoformat()
            escalations.append(data)
        # Sort newest first
        escalations.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return escalations
    except Exception as e:
        logger.error(f"Error fetching escalations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/escalations/{request_id}/resolve")
def resolve_escalation(request_id: str, request: ResolveEscalationRequest):
    """
    Manually resolve an escalated refund ticket.
    Updates the refund ticket status and applies order item refunds if approved.
    """
    try:
        status = request.status.upper()
        if status not in ["APPROVED", "DENIED"]:
            raise HTTPException(status_code=400, detail="Status must be APPROVED or DENIED.")
            
        refund_ref = db.collection("refund_requests").document(request_id)
        refund_doc = refund_ref.get()
        
        if not refund_doc.exists:
            raise HTTPException(status_code=404, detail=f"Refund request '{request_id}' not found.")
            
        refund_data = refund_doc.to_dict()
        order_id = refund_data["order_id"]
        item_ids = refund_data["item_ids"]
        
        now = datetime.datetime.now(datetime.timezone.utc)
        
        # If human manager APPROVED, update the order items' refunded flags in Firestore
        if status == "APPROVED":
            order_ref = db.collection("orders").document(order_id)
            order_doc = order_ref.get()
            if order_doc.exists:
                order_data = order_doc.to_dict()
                order_items = order_data.get("items", [])
                updated_items = []
                for item in order_items:
                    if item["item_id"] in item_ids:
                        item["refunded"] = True
                    updated_items.append(item)
                order_ref.update({"items": updated_items})

        # Update refund request ticket
        refund_ref.update({
            "status": status,
            "reason": f"[Admin Resolution]: {request.reason} (Original request justification: {refund_data.get('reason', '')})",
            "resolved_by": "ADMIN",
            "resolved_at": now
        })
        
        return {
            "success": True,
            "message": f"Escalation request '{request_id}' has been manually resolved as {status}.",
            "ticket_id": request_id,
            "status": status
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error resolving escalation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
