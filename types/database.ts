// Database types for Supabase

// SaaS types
export type PlanType = 'free' | 'store' | 'organization';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
export type OrgRole = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  organization_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_type: PlanType;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginCode {
  id: string;
  code: string;
  branch_id: string;
  subscription_id: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface Branch {
  id: string;
  branch_code: string;
  branch_name: string;
  password: string;
  sales_target: number;
  status: 'active' | 'inactive';
  created_at: string;
  organization_id?: string | null;
  owner_id?: string | null;
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

export interface PrepIngredient {
  id: string;
  branch_id: string;
  ingredient_name: string;
  unit: string;
  current_stock: number;
  note: string;
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

// Restriction settings — controls which operations require admin password
export interface RestrictionSettings {
  menu_add: boolean;         // メニュー追加
  menu_edit: boolean;        // メニュー編集
  menu_delete: boolean;      // メニュー削除
  sales_cancel: boolean;     // 売上取消
  sales_history: boolean;    // 売上履歴閲覧
  sales_reset: boolean;      // 売上全削除
  payment_change: boolean;   // 支払い方法変更
  settings_access: boolean;  // 設定タブアクセス
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

// ============================================================
// Customer Order types (客向けモバイルオーダー機能)
// ============================================================

/** QRコード（卓番号）か タブレット端末名 かの識別種別 */
export type CustomerIdentifierType = 'table' | 'device';

/** 客の注文ステータス */
export type CustomerOrderStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

/** branches_public ビュー (未ログインでも取得可能な公開フィールドのみ) */
export interface BranchPublic {
  id: string;
  branch_code: string;
  branch_name: string;
}

/** 客からの注文ヘッダー */
export interface CustomerOrder {
  id: string;
  branch_id: string;
  /** ブラウザ sessionStorage に保存されるクライアント生成 UUID */
  session_id: string;
  identifier_type: CustomerIdentifierType;
  /** 生の識別値: "3" (卓番号) or "タブレットA" (端末名) */
  table_identifier: string;
  /** 表示用ラベル: "テーブル3番" or "タブレットA" */
  display_label: string;
  status: CustomerOrderStatus;
  /** スタッフ向け短縮コード: "S001-0421" */
  order_number: string;
  note: string;
  created_at: string;
  updated_at: string;
}

/** 注文明細 (注文時点のメニュー情報をスナップショット保存) */
export interface CustomerOrderItem {
  id: string;
  order_id: string;
  /** メニューが削除された場合は null になる可能性あり */
  menu_id: string | null;
  menu_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

/** Register.tsx の受信注文モーダルで使用する結合型 */
export interface CustomerOrderWithItems extends CustomerOrder {
  items: CustomerOrderItem[];
}
