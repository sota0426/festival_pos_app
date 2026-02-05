// Database types for Supabase

export interface Branch {
  id: string;
  branch_code: string;
  branch_name: string;
  sales_target: number;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Menu {
  id: string;
  branch_id: string;
  menu_name: string;
  price: number;
  stock_management: boolean;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'paypay' | 'voucher' | 'cash';

export interface Transaction {
  id: string;
  branch_id: string;
  transaction_code: string;
  total_amount: number;
  payment_method: PaymentMethod;
  received_amount?: number; // 現金受取額
  change_amount?: number;   // お釣り
  status: 'completed' | 'cancelled';
  created_at: string;
  cancelled_at: string | null;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  menu_id: string;
  menu_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// Local storage types for offline support
export interface PendingTransaction {
  id: string;
  branch_id: string;
  transaction_code: string;
  total_amount: number;
  payment_method: PaymentMethod;
  received_amount?: number;
  change_amount?: number;
  items: Omit<TransactionItem, 'id' | 'transaction_id'>[];
  created_at: string;
  synced: boolean;
}

// Store settings
export type PaymentMode = 'cashless' | 'cash';

export interface StoreSettings {
  payment_mode: PaymentMode;
}

export interface LocalStorage {
  pending_transactions: PendingTransaction[];
  menus: Menu[];
  branch: Branch | null;
  last_sync_time: string | null;
}

// Cart types for register screen
export interface CartItem {
  menu_id: string;
  menu_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

// Aggregation types for HQ dashboard
export interface SalesAggregation {
  total_sales: number;
  transaction_count: number;
  average_order: number;
  paypay_sales: number;
  voucher_sales: number;
}

export interface BranchSales extends SalesAggregation {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  sales_target: number;
  achievement_rate: number;
}

export interface MenuSales {
  menu_id: string;
  menu_name: string;
  quantity_sold: number;
  total_sales: number;
}

export interface HourlySales {
  hour: number;
  sales: number;
  transaction_count: number;
}

// Visitor counter types
export interface VisitorCount {
  id: string;
  branch_id: string;
  count: number;
  timestamp: string; // ISO string
}

export interface PendingVisitorCount {
  id: string;
  branch_id: string;
  count: number;
  timestamp: string;
  synced: boolean;
}

export interface HalfHourlyVisitors {
  time_slot: string; // "10:00", "10:30", "11:00" etc.
  count: number;
}

export interface BranchVisitors {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  total_visitors: number;
  half_hourly: HalfHourlyVisitors[];
}
