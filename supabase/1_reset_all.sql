-- ============================================
-- Festival POS: Supabase data reset SQL
-- ============================================
-- 注意:
-- - このSQLは public スキーマの業務データを全削除します。
-- - auth.users は削除しません（ログインユーザーは残します）。
-- - 実行前に必ずバックアップを取得してください。

BEGIN;

TRUNCATE TABLE
  public.transaction_items,
  public.transactions,
  public.visitor_counts,
  public.budget_expenses,
  public.budget_settings,
  public.menus,
  public.menu_categories,
  public.login_codes,
  public.organization_members,
  public.organizations,
  public.subscriptions,
  public.branches
RESTART IDENTITY CASCADE;

COMMIT;
