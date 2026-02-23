-- subscriptions.plan_type に段階制の団体プランを追加
-- 既存の 'organization' は互換のため残す（legacy）

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (
    plan_type IN (
      'free',
      'store',
      'org_light',
      'org_standard',
      'org_premium',
      'organization'
    )
  );
