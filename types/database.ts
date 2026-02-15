// Database types for Supabase

export interface Branch {
  id: string;
  branch_code: string;
  branch_name: string;
  password: string;
  sales_target: number;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface MenuCategory {
  id: string;
  branch_id: string;
  category_name: string;
  sort_order: number;
  created_at: string;
}

export interface Menu {
  id: string;
  branch_id: string;
  menu_name: string;
  price: number;
  menu_number?: number;
  sort_order?: number;
  category_id: string | null;
  stock_management: boolean;
  stock_quantity: number;
  is_active: boolean;
  is_show:boolean
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'paypay' | 'voucher' | 'cash';

export type FulfillmentStatus = 'pending' | 'served';

export interface Transaction {
  id: string;
  branch_id: string;
  transaction_code: string;
  total_amount: number;
  payment_method: PaymentMethod;
  status: 'completed' | 'cancelled';
  fulfillment_status: FulfillmentStatus;
  created_at: string;
  cancelled_at: string | null;
  served_at: string | null;
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
  items: Omit<TransactionItem, 'id' | 'transaction_id'>[];
  created_at: string;
  synced: boolean;
}

// Store settings
export type PaymentMode = 'cashless' | 'cash';

export interface PaymentMethodSettings {
  cash: boolean;
  cashless: boolean;
  voucher: boolean;
}

export interface StoreSettings {
  payment_mode: PaymentMode;
  payment_methods: PaymentMethodSettings;
  order_board_enabled: boolean;
  sub_screen_mode: boolean;
  sync_enabled: boolean;
}

export interface LocalStorage {
  pending_transactions: PendingTransaction[];
  menus: Menu[];
  branch: Branch | null;
  last_sync_time: string | null;
}

// Order board types
export interface OrderBoardItem {
  transaction: Transaction;
  items: TransactionItem[];
}

// Budget management types
export type ExpenseCategory = 'material' | 'decoration' | 'equipment' | 'other';
export type ExpensePaymentMethod = 'cash' | 'online' | 'cashless';

export interface BudgetExpense {
  id: string;
  branch_id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  recorded_by: string;
  payment_method: ExpensePaymentMethod;
  memo: string;
  receipt_image: string | null;
  created_at: string;
  synced: boolean;
}

export interface BudgetSettings {
  branch_id: string;
  initial_budget: number;
  target_sales: number;
}

export interface BreakevenParams {
  product_name: string;
  selling_price: number;
  variable_cost: number;
  fixed_cost: number;
}

// Cart types for register screen
export interface CartItem {
  menu_id: string;
  menu_name: string;
  unit_price: number;
  discount: number;
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

export type VisitorGroup = string;

export interface VisitorCounterGroup {
  id: VisitorGroup;
  name: string;
  color: string;
}

export interface PendingVisitorCount {
  id: string;
  branch_id: string;
  group:VisitorGroup;
  count: number;
  timestamp: string;
  synced: boolean;
}

export interface HalfHourlyVisitors {
  time_slot: string; // "10:00", "10:30", "11:00" etc.
  count: number;
}

export interface QuarterHourlyGroupVisitors {
  time_slot: string;
  count: number;
  group_counts: Record<VisitorGroup, number>;
}

export interface DailyVisitorTrend {
  date_key: string;
  date_label: string;
  total: number;
  max_slot: number;
  slots: QuarterHourlyGroupVisitors[];
}

export interface BranchVisitors {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  total_visitors: number;
  half_hourly: HalfHourlyVisitors[];
}
