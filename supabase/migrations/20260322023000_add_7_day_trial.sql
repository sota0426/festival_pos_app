-- 新規ユーザーに7日間の無料トライアルを付与する

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  trial_start timestamptz := timezone('utc', now());
  trial_end timestamptz := timezone('utc', now()) + interval '7 days';
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', COALESCE(NEW.email, '')),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.subscriptions (
    user_id,
    plan_type,
    status,
    current_period_start,
    current_period_end
  )
  VALUES (
    NEW.id,
    'free',
    'trialing',
    trial_start,
    trial_end
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE public.subscriptions
SET
  status = 'trialing',
  current_period_start = COALESCE(current_period_start, created_at),
  current_period_end = COALESCE(current_period_end, created_at + interval '7 days'),
  updated_at = timezone('utc', now())
WHERE
  plan_type = 'free'
  AND status = 'active'
  AND current_period_end IS NULL
  AND created_at >= timezone('utc', now()) - interval '7 days';
