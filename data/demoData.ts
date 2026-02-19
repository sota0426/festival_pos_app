import type {
  Branch,
  Menu,
  MenuCategory,
  PendingTransaction,
  PendingVisitorCount,
  BudgetSettings,
  BudgetExpense,
  PrepIngredient,
} from '../types/database';

// ============================================================
// デモ用店舗
// ============================================================
export const DEMO_BRANCHES: Branch[] = [
  {
    id: 'demo-1',
    branch_code: 'S001',
    branch_name: '焼きそば屋',
    password: '',
    sales_target: 50000,
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    branch_code: 'S002',
    branch_name: 'たこ焼き屋',
    password: '',
    sales_target: 40000,
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    branch_code: 'S003',
    branch_name: '焼き鳥屋',
    password: '',
    sales_target: 35000,
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-4',
    branch_code: 'S004',
    branch_name: 'クレープ屋',
    password: '',
    sales_target: 30000,
    status: 'active',
    created_at: new Date().toISOString(),
  },
];

export const resolveDemoBranchId = (branch: Pick<Branch, 'id' | 'branch_code'>): string | null => {
  if (DEMO_MENUS[branch.id]) return branch.id;
  const matched = DEMO_BRANCHES.find((item) => item.branch_code === branch.branch_code);
  return matched?.id ?? null;
};

// ============================================================
// デモ用メニューカテゴリ
// ============================================================
export const DEMO_MENU_CATEGORIES: Record<string, MenuCategory[]> = {
  'demo-1': [
    { id: 'cat-1-1', branch_id: 'demo-1', category_name: 'メイン', sort_order: 1, created_at: new Date().toISOString() },
    { id: 'cat-1-2', branch_id: 'demo-1', category_name: 'トッピング', sort_order: 2, created_at: new Date().toISOString() },
    { id: 'cat-1-3', branch_id: 'demo-1', category_name: 'ドリンク', sort_order: 3, created_at: new Date().toISOString() },
  ],
  'demo-2': [
    { id: 'cat-2-1', branch_id: 'demo-2', category_name: 'たこ焼き', sort_order: 1, created_at: new Date().toISOString() },
    { id: 'cat-2-2', branch_id: 'demo-2', category_name: 'ドリンク', sort_order: 2, created_at: new Date().toISOString() },
  ],
  'demo-3': [
    { id: 'cat-3-1', branch_id: 'demo-3', category_name: '焼き鳥', sort_order: 1, created_at: new Date().toISOString() },
    { id: 'cat-3-2', branch_id: 'demo-3', category_name: 'サイド', sort_order: 2, created_at: new Date().toISOString() },
    { id: 'cat-3-3', branch_id: 'demo-3', category_name: 'ドリンク', sort_order: 3, created_at: new Date().toISOString() },
  ],
  'demo-4': [
    { id: 'cat-4-1', branch_id: 'demo-4', category_name: 'クレープ', sort_order: 1, created_at: new Date().toISOString() },
    { id: 'cat-4-2', branch_id: 'demo-4', category_name: 'ドリンク', sort_order: 2, created_at: new Date().toISOString() },
  ],
};

// ============================================================
// デモ用メニュー
// ============================================================
const now = new Date().toISOString();

export const DEMO_MENUS: Record<string, Menu[]> = {
  'demo-1': [
    { id: 'menu-1-1', branch_id: 'demo-1', menu_name: '焼きそば（並）', price: 400, menu_number: 101, sort_order: 1, category_id: 'cat-1-1', stock_management: true, stock_quantity: 80, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-1-2', branch_id: 'demo-1', menu_name: '焼きそば（大）', price: 600, menu_number: 102, sort_order: 2, category_id: 'cat-1-1', stock_management: true, stock_quantity: 50, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-1-3', branch_id: 'demo-1', menu_name: '目玉焼きトッピング', price: 100, menu_number: 103, sort_order: 3, category_id: 'cat-1-2', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-1-4', branch_id: 'demo-1', menu_name: 'チーズトッピング', price: 100, menu_number: 104, sort_order: 4, category_id: 'cat-1-2', stock_management: false, stock_quantity: 0, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-1-5', branch_id: 'demo-1', menu_name: 'ラムネ', price: 200, menu_number: 201, sort_order: 5, category_id: 'cat-1-3', stock_management: true, stock_quantity: 60, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-1-6', branch_id: 'demo-1', menu_name: 'お茶', price: 150, menu_number: 202, sort_order: 6, category_id: 'cat-1-3', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
  ],
  'demo-2': [
    { id: 'menu-2-1', branch_id: 'demo-2', menu_name: 'たこ焼き（8個）', price: 500, menu_number: 1, sort_order: 1, category_id: 'cat-2-1', stock_management: true, stock_quantity: 60, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-2-2', branch_id: 'demo-2', menu_name: 'たこ焼き（12個）', price: 700, menu_number: 2, sort_order: 2, category_id: 'cat-2-1', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-2-3', branch_id: 'demo-2', menu_name: 'ねぎマヨたこ焼き', price: 600, menu_number: 3, sort_order: 3, category_id: 'cat-2-1', stock_management: true, stock_quantity: 30, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-2-4', branch_id: 'demo-2', menu_name: 'チーズたこ焼き', price: 650, menu_number: 4, sort_order: 4, category_id: 'cat-2-1', stock_management: true, stock_quantity: 30, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-2-5', branch_id: 'demo-2', menu_name: 'ジュース', price: 200, menu_number: 5, sort_order: 5, category_id: 'cat-2-2', stock_management: true, stock_quantity: 50, is_active: true, is_show: true, created_at: now, updated_at: now },
  ],
  'demo-3': [
    { id: 'menu-3-1', branch_id: 'demo-3', menu_name: 'もも串', price: 200, menu_number: 1, sort_order: 1, category_id: 'cat-3-1', stock_management: true, stock_quantity: 100, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-2', branch_id: 'demo-3', menu_name: 'ねぎま串', price: 200, menu_number: 2, sort_order: 2, category_id: 'cat-3-1', stock_management: true, stock_quantity: 80, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-3', branch_id: 'demo-3', menu_name: 'つくね串', price: 250, menu_number: 3, sort_order: 3, category_id: 'cat-3-1', stock_management: true, stock_quantity: 70, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-4', branch_id: 'demo-3', menu_name: '皮串', price: 200, menu_number: 4, sort_order: 4, category_id: 'cat-3-1', stock_management: true, stock_quantity: 60, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-5', branch_id: 'demo-3', menu_name: 'ポテト', price: 300, menu_number: 5, sort_order: 5, category_id: 'cat-3-2', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-6', branch_id: 'demo-3', menu_name: 'お茶', price: 150, menu_number: 6, sort_order: 6, category_id: 'cat-3-3', stock_management: true, stock_quantity: 50, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-3-7', branch_id: 'demo-3', menu_name: 'ラムネ', price: 200, menu_number: 7, sort_order: 7, category_id: 'cat-3-3', stock_management: true, stock_quantity: 50, is_active: true, is_show: true, created_at: now, updated_at: now },
  ],
  'demo-4': [
    { id: 'menu-4-1', branch_id: 'demo-4', menu_name: 'チョコバナナクレープ', price: 500, menu_number: 1, sort_order: 1, category_id: 'cat-4-1', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-4-2', branch_id: 'demo-4', menu_name: 'いちごクレープ', price: 550, menu_number: 2, sort_order: 2, category_id: 'cat-4-1', stock_management: true, stock_quantity: 35, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-4-3', branch_id: 'demo-4', menu_name: '生クリームクレープ', price: 450, menu_number: 3, sort_order: 3, category_id: 'cat-4-1', stock_management: true, stock_quantity: 40, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-4-4', branch_id: 'demo-4', menu_name: 'ツナマヨクレープ', price: 400, menu_number: 4, sort_order: 4, category_id: 'cat-4-1', stock_management: true, stock_quantity: 30, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-4-5', branch_id: 'demo-4', menu_name: 'アイスティー', price: 250, menu_number: 5, sort_order: 5, category_id: 'cat-4-2', stock_management: true, stock_quantity: 50, is_active: true, is_show: true, created_at: now, updated_at: now },
    { id: 'menu-4-6', branch_id: 'demo-4', menu_name: 'タピオカミルクティー', price: 400, menu_number: 6, sort_order: 6, category_id: 'cat-4-2', stock_management: true, stock_quantity: 30, is_active: true, is_show: true, created_at: now, updated_at: now },
  ],
};

// ============================================================
// デモ用取引データ生成ヘルパー
// ============================================================
const today = new Date();
const todayStr = today.toISOString().split('T')[0];

function makeTxTime(hour: number, minute: number): string {
  const d = new Date(today);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeTxCode(branchCode: string, seq: number, hour: number, minute: number): string {
  const mm = (today.getMonth() + 1).toString().padStart(2, '0');
  const dd = today.getDate().toString().padStart(2, '0');
  const hh = hour.toString().padStart(2, '0');
  const mi = minute.toString().padStart(2, '0');
  return `${branchCode}-${mm}${dd}-${hh}${mi}-${seq.toString().padStart(2, '0')}`;
}

// 焼きそば屋の取引
const txS001: PendingTransaction[] = [
  { id: 'demo-tx-1-01', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 1, 10, 5), total_amount: 500, payment_method: 'paypay', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-1-3', menu_name: '目玉焼きトッピング', quantity: 1, unit_price: 100, subtotal: 100 }], created_at: makeTxTime(10, 5), synced: false },
  { id: 'demo-tx-1-02', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 2, 10, 15), total_amount: 800, payment_method: 'voucher', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }, { menu_id: 'menu-1-5', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(10, 15), synced: false },
  { id: 'demo-tx-1-03', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 3, 10, 30), total_amount: 950, payment_method: 'paypay', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }], created_at: makeTxTime(10, 30), synced: false },
  { id: 'demo-tx-1-04', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 4, 10, 45), total_amount: 600, payment_method: 'cash', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }], created_at: makeTxTime(10, 45), synced: false },
  { id: 'demo-tx-1-05', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 5, 11, 0), total_amount: 550, payment_method: 'paypay', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-1-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(11, 0), synced: false },
  { id: 'demo-tx-1-06', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 6, 11, 15), total_amount: 1000, payment_method: 'voucher', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 2, unit_price: 400, subtotal: 800 }, { menu_id: 'menu-1-5', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(11, 15), synced: false },
  { id: 'demo-tx-1-07', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 7, 11, 30), total_amount: 700, payment_method: 'paypay', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }, { menu_id: 'menu-1-4', menu_name: 'チーズトッピング', quantity: 1, unit_price: 100, subtotal: 100 }], created_at: makeTxTime(11, 30), synced: false },
  { id: 'demo-tx-1-08', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 8, 11, 50), total_amount: 400, payment_method: 'cash', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }], created_at: makeTxTime(11, 50), synced: false },
  { id: 'demo-tx-1-09', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 9, 12, 10), total_amount: 1200, payment_method: 'paypay', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 2, unit_price: 600, subtotal: 1200 }], created_at: makeTxTime(12, 10), synced: false },
  { id: 'demo-tx-1-10', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 10, 12, 30), total_amount: 750, payment_method: 'voucher', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-1-3', menu_name: '目玉焼きトッピング', quantity: 1, unit_price: 100, subtotal: 100 }, { menu_id: 'menu-1-5', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-1-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(12, 30), synced: false },
  { id: 'demo-tx-1-11', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 11, 13, 0), total_amount: 400, payment_method: 'paypay', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }], created_at: makeTxTime(13, 0), synced: false },
  { id: 'demo-tx-1-12', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 12, 13, 20), total_amount: 800, payment_method: 'cash', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 2, unit_price: 400, subtotal: 800 }], created_at: makeTxTime(13, 20), synced: false },
  { id: 'demo-tx-1-13', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 13, 13, 45), total_amount: 600, payment_method: 'paypay', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }], created_at: makeTxTime(13, 45), synced: false },
  { id: 'demo-tx-1-14', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 14, 14, 0), total_amount: 550, payment_method: 'voucher', items: [{ menu_id: 'menu-1-1', menu_name: '焼きそば（並）', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-1-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(14, 0), synced: false },
  { id: 'demo-tx-1-15', branch_id: 'demo-1', transaction_code: makeTxCode('S001', 15, 14, 30), total_amount: 900, payment_method: 'paypay', items: [{ menu_id: 'menu-1-2', menu_name: '焼きそば（大）', quantity: 1, unit_price: 600, subtotal: 600 }, { menu_id: 'menu-1-3', menu_name: '目玉焼きトッピング', quantity: 1, unit_price: 100, subtotal: 100 }, { menu_id: 'menu-1-5', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(14, 30), synced: false },
];

// たこ焼き屋の取引
const txS002: PendingTransaction[] = [
  { id: 'demo-tx-2-01', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 1, 10, 10), total_amount: 700, payment_method: 'paypay', items: [{ menu_id: 'menu-2-2', menu_name: 'たこ焼き（12個）', quantity: 1, unit_price: 700, subtotal: 700 }], created_at: makeTxTime(10, 10), synced: false },
  { id: 'demo-tx-2-02', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 2, 10, 25), total_amount: 1000, payment_method: 'voucher', items: [{ menu_id: 'menu-2-1', menu_name: 'たこ焼き（8個）', quantity: 2, unit_price: 500, subtotal: 1000 }], created_at: makeTxTime(10, 25), synced: false },
  { id: 'demo-tx-2-03', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 3, 10, 40), total_amount: 800, payment_method: 'paypay', items: [{ menu_id: 'menu-2-3', menu_name: 'ねぎマヨたこ焼き', quantity: 1, unit_price: 600, subtotal: 600 }, { menu_id: 'menu-2-5', menu_name: 'ジュース', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(10, 40), synced: false },
  { id: 'demo-tx-2-04', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 4, 11, 0), total_amount: 650, payment_method: 'cash', items: [{ menu_id: 'menu-2-4', menu_name: 'チーズたこ焼き', quantity: 1, unit_price: 650, subtotal: 650 }], created_at: makeTxTime(11, 0), synced: false },
  { id: 'demo-tx-2-05', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 5, 11, 15), total_amount: 500, payment_method: 'paypay', items: [{ menu_id: 'menu-2-1', menu_name: 'たこ焼き（8個）', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(11, 15), synced: false },
  { id: 'demo-tx-2-06', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 6, 11, 30), total_amount: 1300, payment_method: 'voucher', items: [{ menu_id: 'menu-2-2', menu_name: 'たこ焼き（12個）', quantity: 1, unit_price: 700, subtotal: 700 }, { menu_id: 'menu-2-3', menu_name: 'ねぎマヨたこ焼き', quantity: 1, unit_price: 600, subtotal: 600 }], created_at: makeTxTime(11, 30), synced: false },
  { id: 'demo-tx-2-07', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 7, 12, 0), total_amount: 900, payment_method: 'paypay', items: [{ menu_id: 'menu-2-2', menu_name: 'たこ焼き（12個）', quantity: 1, unit_price: 700, subtotal: 700 }, { menu_id: 'menu-2-5', menu_name: 'ジュース', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(12, 0), synced: false },
  { id: 'demo-tx-2-08', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 8, 12, 20), total_amount: 500, payment_method: 'cash', items: [{ menu_id: 'menu-2-1', menu_name: 'たこ焼き（8個）', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(12, 20), synced: false },
  { id: 'demo-tx-2-09', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 9, 12, 45), total_amount: 1250, payment_method: 'paypay', items: [{ menu_id: 'menu-2-4', menu_name: 'チーズたこ焼き', quantity: 1, unit_price: 650, subtotal: 650 }, { menu_id: 'menu-2-3', menu_name: 'ねぎマヨたこ焼き', quantity: 1, unit_price: 600, subtotal: 600 }], created_at: makeTxTime(12, 45), synced: false },
  { id: 'demo-tx-2-10', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 10, 13, 10), total_amount: 700, payment_method: 'voucher', items: [{ menu_id: 'menu-2-2', menu_name: 'たこ焼き（12個）', quantity: 1, unit_price: 700, subtotal: 700 }], created_at: makeTxTime(13, 10), synced: false },
  { id: 'demo-tx-2-11', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 11, 13, 30), total_amount: 500, payment_method: 'paypay', items: [{ menu_id: 'menu-2-1', menu_name: 'たこ焼き（8個）', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(13, 30), synced: false },
  { id: 'demo-tx-2-12', branch_id: 'demo-2', transaction_code: makeTxCode('S002', 12, 14, 0), total_amount: 850, payment_method: 'cash', items: [{ menu_id: 'menu-2-4', menu_name: 'チーズたこ焼き', quantity: 1, unit_price: 650, subtotal: 650 }, { menu_id: 'menu-2-5', menu_name: 'ジュース', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(14, 0), synced: false },
];

// 焼き鳥屋の取引
const txS003: PendingTransaction[] = [
  { id: 'demo-tx-3-01', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 1, 10, 15), total_amount: 600, payment_method: 'paypay', items: [{ menu_id: 'menu-3-1', menu_name: 'もも串', quantity: 2, unit_price: 200, subtotal: 400 }, { menu_id: 'menu-3-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(10, 15), synced: false },
  { id: 'demo-tx-3-02', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 2, 10, 30), total_amount: 850, payment_method: 'voucher', items: [{ menu_id: 'menu-3-2', menu_name: 'ねぎま串', quantity: 2, unit_price: 200, subtotal: 400 }, { menu_id: 'menu-3-3', menu_name: 'つくね串', quantity: 1, unit_price: 250, subtotal: 250 }, { menu_id: 'menu-3-7', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(10, 30), synced: false },
  { id: 'demo-tx-3-03', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 3, 11, 0), total_amount: 700, payment_method: 'paypay', items: [{ menu_id: 'menu-3-1', menu_name: 'もも串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-4', menu_name: '皮串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-5', menu_name: 'ポテト', quantity: 1, unit_price: 300, subtotal: 300 }], created_at: makeTxTime(11, 0), synced: false },
  { id: 'demo-tx-3-04', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 4, 11, 20), total_amount: 450, payment_method: 'cash', items: [{ menu_id: 'menu-3-3', menu_name: 'つくね串', quantity: 1, unit_price: 250, subtotal: 250 }, { menu_id: 'menu-3-4', menu_name: '皮串', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(11, 20), synced: false },
  { id: 'demo-tx-3-05', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 5, 11, 45), total_amount: 800, payment_method: 'paypay', items: [{ menu_id: 'menu-3-1', menu_name: 'もも串', quantity: 2, unit_price: 200, subtotal: 400 }, { menu_id: 'menu-3-2', menu_name: 'ねぎま串', quantity: 2, unit_price: 200, subtotal: 400 }], created_at: makeTxTime(11, 45), synced: false },
  { id: 'demo-tx-3-06', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 6, 12, 0), total_amount: 1050, payment_method: 'voucher', items: [{ menu_id: 'menu-3-1', menu_name: 'もも串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-3', menu_name: 'つくね串', quantity: 2, unit_price: 250, subtotal: 500 }, { menu_id: 'menu-3-5', menu_name: 'ポテト', quantity: 1, unit_price: 300, subtotal: 300 }, { menu_id: 'menu-3-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(12, 0), synced: false },
  { id: 'demo-tx-3-07', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 7, 12, 30), total_amount: 600, payment_method: 'paypay', items: [{ menu_id: 'menu-3-2', menu_name: 'ねぎま串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-4', menu_name: '皮串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-7', menu_name: 'ラムネ', quantity: 1, unit_price: 200, subtotal: 200 }], created_at: makeTxTime(12, 30), synced: false },
  { id: 'demo-tx-3-08', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 8, 13, 0), total_amount: 500, payment_method: 'cash', items: [{ menu_id: 'menu-3-3', menu_name: 'つくね串', quantity: 2, unit_price: 250, subtotal: 500 }], created_at: makeTxTime(13, 0), synced: false },
  { id: 'demo-tx-3-09', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 9, 13, 30), total_amount: 400, payment_method: 'paypay', items: [{ menu_id: 'menu-3-1', menu_name: 'もも串', quantity: 2, unit_price: 200, subtotal: 400 }], created_at: makeTxTime(13, 30), synced: false },
  { id: 'demo-tx-3-10', branch_id: 'demo-3', transaction_code: makeTxCode('S003', 10, 14, 0), total_amount: 550, payment_method: 'voucher', items: [{ menu_id: 'menu-3-2', menu_name: 'ねぎま串', quantity: 1, unit_price: 200, subtotal: 200 }, { menu_id: 'menu-3-5', menu_name: 'ポテト', quantity: 1, unit_price: 300, subtotal: 300 }, { menu_id: 'menu-3-6', menu_name: 'お茶', quantity: 1, unit_price: 150, subtotal: 150 }], created_at: makeTxTime(14, 0), synced: false },
];

// クレープ屋の取引
const txS004: PendingTransaction[] = [
  { id: 'demo-tx-4-01', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 1, 10, 20), total_amount: 750, payment_method: 'paypay', items: [{ menu_id: 'menu-4-1', menu_name: 'チョコバナナクレープ', quantity: 1, unit_price: 500, subtotal: 500 }, { menu_id: 'menu-4-5', menu_name: 'アイスティー', quantity: 1, unit_price: 250, subtotal: 250 }], created_at: makeTxTime(10, 20), synced: false },
  { id: 'demo-tx-4-02', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 2, 10, 35), total_amount: 550, payment_method: 'voucher', items: [{ menu_id: 'menu-4-2', menu_name: 'いちごクレープ', quantity: 1, unit_price: 550, subtotal: 550 }], created_at: makeTxTime(10, 35), synced: false },
  { id: 'demo-tx-4-03', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 3, 11, 0), total_amount: 900, payment_method: 'paypay', items: [{ menu_id: 'menu-4-3', menu_name: '生クリームクレープ', quantity: 1, unit_price: 450, subtotal: 450 }, { menu_id: 'menu-4-1', menu_name: 'チョコバナナクレープ', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(11, 0), synced: false },
  { id: 'demo-tx-4-04', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 4, 11, 20), total_amount: 800, payment_method: 'cash', items: [{ menu_id: 'menu-4-4', menu_name: 'ツナマヨクレープ', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-4-6', menu_name: 'タピオカミルクティー', quantity: 1, unit_price: 400, subtotal: 400 }], created_at: makeTxTime(11, 20), synced: false },
  { id: 'demo-tx-4-05', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 5, 11, 45), total_amount: 1050, payment_method: 'paypay', items: [{ menu_id: 'menu-4-2', menu_name: 'いちごクレープ', quantity: 1, unit_price: 550, subtotal: 550 }, { menu_id: 'menu-4-1', menu_name: 'チョコバナナクレープ', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(11, 45), synced: false },
  { id: 'demo-tx-4-06', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 6, 12, 10), total_amount: 500, payment_method: 'voucher', items: [{ menu_id: 'menu-4-1', menu_name: 'チョコバナナクレープ', quantity: 1, unit_price: 500, subtotal: 500 }], created_at: makeTxTime(12, 10), synced: false },
  { id: 'demo-tx-4-07', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 7, 12, 30), total_amount: 850, payment_method: 'paypay', items: [{ menu_id: 'menu-4-3', menu_name: '生クリームクレープ', quantity: 1, unit_price: 450, subtotal: 450 }, { menu_id: 'menu-4-6', menu_name: 'タピオカミルクティー', quantity: 1, unit_price: 400, subtotal: 400 }], created_at: makeTxTime(12, 30), synced: false },
  { id: 'demo-tx-4-08', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 8, 13, 0), total_amount: 550, payment_method: 'cash', items: [{ menu_id: 'menu-4-2', menu_name: 'いちごクレープ', quantity: 1, unit_price: 550, subtotal: 550 }], created_at: makeTxTime(13, 0), synced: false },
  { id: 'demo-tx-4-09', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 9, 13, 30), total_amount: 650, payment_method: 'paypay', items: [{ menu_id: 'menu-4-4', menu_name: 'ツナマヨクレープ', quantity: 1, unit_price: 400, subtotal: 400 }, { menu_id: 'menu-4-5', menu_name: 'アイスティー', quantity: 1, unit_price: 250, subtotal: 250 }], created_at: makeTxTime(13, 30), synced: false },
  { id: 'demo-tx-4-10', branch_id: 'demo-4', transaction_code: makeTxCode('S004', 10, 14, 0), total_amount: 950, payment_method: 'voucher', items: [{ menu_id: 'menu-4-1', menu_name: 'チョコバナナクレープ', quantity: 1, unit_price: 500, subtotal: 500 }, { menu_id: 'menu-4-3', menu_name: '生クリームクレープ', quantity: 1, unit_price: 450, subtotal: 450 }], created_at: makeTxTime(14, 0), synced: false },
];

export const DEMO_TRANSACTIONS: Record<string, PendingTransaction[]> = {
  'demo-1': txS001,
  'demo-2': txS002,
  'demo-3': txS003,
  'demo-4': txS004,
};

// ============================================================
// デモ用来客カウントデータ
// ============================================================
function makeVisitorCounts(branchId: string): PendingVisitorCount[] {
  const counts: PendingVisitorCount[] = [];
  const groups = ['group1', 'group2', 'group3', 'group4'];
  let id = 0;

  for (let hour = 10; hour <= 14; hour++) {
    for (const quarter of [0, 15, 30, 45]) {
      for (const group of groups) {
        const count = Math.floor(Math.random() * 8) + 1;
        const d = new Date(today);
        d.setHours(hour, quarter, 0, 0);
        counts.push({
          id: `demo-vc-${branchId}-${++id}`,
          branch_id: branchId,
          group,
          count,
          timestamp: d.toISOString(),
          synced: false,
        });
      }
    }
  }

  return counts;
}

export const DEMO_VISITOR_COUNTS: Record<string, PendingVisitorCount[]> = {
  'demo-1': makeVisitorCounts('demo-1'),
  'demo-2': makeVisitorCounts('demo-2'),
  'demo-3': makeVisitorCounts('demo-3'),
  'demo-4': makeVisitorCounts('demo-4'),
};

// ============================================================
// デモ用予算設定
// ============================================================
export const DEMO_BUDGET_SETTINGS: Record<string, BudgetSettings> = {
  'demo-1': { branch_id: 'demo-1', initial_budget: 15000, target_sales: 50000 },
  'demo-2': { branch_id: 'demo-2', initial_budget: 12000, target_sales: 40000 },
  'demo-3': { branch_id: 'demo-3', initial_budget: 10000, target_sales: 35000 },
  'demo-4': { branch_id: 'demo-4', initial_budget: 8000, target_sales: 30000 },
};

// ============================================================
// デモ用経費データ
// ============================================================
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split('T')[0];

export const DEMO_BUDGET_EXPENSES: Record<string, BudgetExpense[]> = {
  'demo-1': [
    { id: 'demo-exp-1-1', branch_id: 'demo-1', date: yesterdayStr, category: 'material', amount: 8000, recorded_by: '田中', payment_method: 'cash', memo: '麺・キャベツ・豚肉', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
    { id: 'demo-exp-1-2', branch_id: 'demo-1', date: yesterdayStr, category: 'equipment', amount: 3000, recorded_by: '田中', payment_method: 'online', memo: '鉄板レンタル', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
    { id: 'demo-exp-1-3', branch_id: 'demo-1', date: todayStr, category: 'material', amount: 2000, recorded_by: '鈴木', payment_method: 'cash', memo: 'ソース・青のり追加', receipt_image: null, created_at: today.toISOString(), synced: false },
  ],
  'demo-2': [
    { id: 'demo-exp-2-1', branch_id: 'demo-2', date: yesterdayStr, category: 'material', amount: 6000, recorded_by: '佐藤', payment_method: 'cash', memo: 'たこ焼き粉・タコ', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
    { id: 'demo-exp-2-2', branch_id: 'demo-2', date: yesterdayStr, category: 'equipment', amount: 4000, recorded_by: '佐藤', payment_method: 'online', memo: 'たこ焼き器レンタル', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
  ],
  'demo-3': [
    { id: 'demo-exp-3-1', branch_id: 'demo-3', date: yesterdayStr, category: 'material', amount: 7000, recorded_by: '山田', payment_method: 'cash', memo: '鶏肉・ネギ', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
    { id: 'demo-exp-3-2', branch_id: 'demo-3', date: yesterdayStr, category: 'decoration', amount: 1500, recorded_by: '山田', payment_method: 'cash', memo: '看板材料', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
  ],
  'demo-4': [
    { id: 'demo-exp-4-1', branch_id: 'demo-4', date: yesterdayStr, category: 'material', amount: 5000, recorded_by: '高橋', payment_method: 'online', memo: '小麦粉・クリーム・フルーツ', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
    { id: 'demo-exp-4-2', branch_id: 'demo-4', date: yesterdayStr, category: 'equipment', amount: 2000, recorded_by: '高橋', payment_method: 'cash', memo: 'クレープ焼き器', receipt_image: null, created_at: yesterday.toISOString(), synced: false },
  ],
};

// ============================================================
// デモ用 下準備材料データ
// ============================================================
export const DEMO_PREP_INGREDIENTS: Record<string, PrepIngredient[]> = {
  'demo-1': [
    { id: 'prep-1-1', branch_id: 'demo-1', ingredient_name: '中華麺', unit: '玉', current_stock: 48, note: '最低10玉は確保', created_at: now, updated_at: now },
    { id: 'prep-1-2', branch_id: 'demo-1', ingredient_name: 'キャベツ', unit: '玉', current_stock: 6, note: '午後に追加搬入予定', created_at: now, updated_at: now },
    { id: 'prep-1-3', branch_id: 'demo-1', ingredient_name: 'ソース', unit: '本', current_stock: 9, note: '残り少なくなったら本部へ連絡', created_at: now, updated_at: now },
    { id: 'prep-1-4', branch_id: 'demo-1', ingredient_name: '豚肉', unit: 'kg', current_stock: 5, note: '冷蔵庫上段に保存', created_at: now, updated_at: now },
  ],
  'demo-2': [
    { id: 'prep-2-1', branch_id: 'demo-2', ingredient_name: 'たこ焼き粉', unit: '袋', current_stock: 14, note: '開封済みを優先', created_at: now, updated_at: now },
    { id: 'prep-2-2', branch_id: 'demo-2', ingredient_name: 'タコ', unit: 'kg', current_stock: 4, note: '残量が2kg以下なら補充', created_at: now, updated_at: now },
    { id: 'prep-2-3', branch_id: 'demo-2', ingredient_name: 'マヨネーズ', unit: '本', current_stock: 8, note: '予備は倉庫に3本', created_at: now, updated_at: now },
  ],
  'demo-3': [
    { id: 'prep-3-1', branch_id: 'demo-3', ingredient_name: '鶏もも肉', unit: 'kg', current_stock: 7, note: '串打ち済みは先に使用', created_at: now, updated_at: now },
    { id: 'prep-3-2', branch_id: 'demo-3', ingredient_name: 'ねぎ', unit: '束', current_stock: 10, note: '', created_at: now, updated_at: now },
    { id: 'prep-3-3', branch_id: 'demo-3', ingredient_name: '塩だれ', unit: '本', current_stock: 5, note: 'あと2本で発注', created_at: now, updated_at: now },
  ],
  'demo-4': [
    { id: 'prep-4-1', branch_id: 'demo-4', ingredient_name: 'クレープ生地', unit: '枚', current_stock: 52, note: '常に20枚以上キープ', created_at: now, updated_at: now },
    { id: 'prep-4-2', branch_id: 'demo-4', ingredient_name: '生クリーム', unit: '本', current_stock: 7, note: '冷蔵庫右側', created_at: now, updated_at: now },
    { id: 'prep-4-3', branch_id: 'demo-4', ingredient_name: 'いちご', unit: 'パック', current_stock: 4, note: '傷みやすいので先出し', created_at: now, updated_at: now },
  ],
};
