export interface Customer {
  id: string;
  name: string;
  email: string;
  loyalty_tier: 'STANDARD' | 'GOLD' | 'VIP';
  created_at: string;
}

export interface OrderItem {
  item_id: string;
  name: string;
  price: number;
  is_final_sale: boolean;
  refunded: boolean;
}

export interface Order {
  id: string;
  customer_id: string;
  purchase_date: string;
  status: 'DELIVERED' | 'SHIPPED' | 'PROCESSING' | 'CANCELLED';
  delivery_date: string | null;
  total_amount: number;
  items: OrderItem[];
}

export interface RefundRequest {
  id: string;
  customer_id: string;
  order_id: string;
  item_ids: string[];
  items: OrderItem[];
  amount: number;
  status: 'APPROVED' | 'DENIED' | 'ESCALATED';
  reason: string;
  timestamp: string;
  resolved_by: 'AI' | 'ADMIN' | null;
  resolved_at: string | null;
}

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export interface ToolResponse {
  name: string;
  output: any;
}

export interface AgentLog {
  id: string;
  session_id: string;
  customer_id: string;
  step_index: number;
  timestamp: string;
  thought: string;
  tool_calls: ToolCall[];
  tool_responses: ToolResponse[];
  final_response: string;
}

export interface Metrics {
  total_customers: number;
  total_orders: number;
  total_refunds_submitted: number;
  approved_refunds: number;
  denied_refunds: number;
  escalated_refunds: number;
  total_amount_refunded: number;
}
