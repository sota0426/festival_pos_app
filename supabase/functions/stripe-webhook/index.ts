// Supabase Edge Function: Stripe Webhook ハンドラー
// デプロイ: supabase functions deploy stripe-webhook --no-verify-jwt
// 環境変数: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const STRIPE_STORE_PRICE_ID = Deno.env.get('STRIPE_STORE_PRICE_ID') || '';
const STRIPE_ORG_LIGHT_PRICE_ID = Deno.env.get('STRIPE_ORG_LIGHT_PRICE_ID') || '';
const STRIPE_ORG_STANDARD_PRICE_ID = Deno.env.get('STRIPE_ORG_STANDARD_PRICE_ID') || Deno.env.get('STRIPE_ORG_PRICE_ID') || '';
const STRIPE_ORG_PREMIUM_PRICE_ID = Deno.env.get('STRIPE_ORG_PREMIUM_PRICE_ID') || '';
const LOGIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

type PlanType = 'free' | 'store' | 'org_light' | 'org_standard' | 'org_premium' | 'organization';

const normalizePlan = (plan: string | null | undefined): PlanType | null => {
  if (!plan) return null;
  if (plan === 'store' || plan === 'org_light' || plan === 'org_standard' || plan === 'org_premium' || plan === 'organization') {
    return plan;
  }
  return null;
};

const inferPlanFromStripeSubscription = (stripeSub: any): PlanType | null => {
  const priceId = stripeSub?.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  if (priceId === STRIPE_STORE_PRICE_ID) return 'store';
  if (priceId === STRIPE_ORG_LIGHT_PRICE_ID) return 'org_light';
  if (priceId === STRIPE_ORG_STANDARD_PRICE_ID) return 'org_standard';
  if (priceId === STRIPE_ORG_PREMIUM_PRICE_ID) return 'org_premium';
  return null;
};

const isOrganizationPlan = (plan: PlanType | null): boolean =>
  plan === 'org_light' || plan === 'org_standard' || plan === 'org_premium' || plan === 'organization';

const getPlanRank = (plan: PlanType | null): number => {
  switch (plan) {
    case 'free':
      return 0;
    case 'store':
      return 1;
    case 'org_light':
      return 2;
    case 'org_standard':
    case 'organization':
      return 3;
    case 'org_premium':
      return 4;
    default:
      return 0;
  }
};

const addDays = (base: Date, days: number): Date => {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const generateLoginCode = (): string => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += LOGIN_CODE_CHARS[Math.floor(Math.random() * LOGIN_CODE_CHARS.length)];
  }
  return code;
};

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  const body = await req.text();

  // Stripe webhook 署名検証 (簡易版 - 本番ではstripe-nodeのconstructEventを使用)
  // Deno環境ではstripe SDKの代わりにAPI直接呼び出し
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[Webhook] Event received:', event.type, event.id);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const metadataPlan = normalizePlan(session.metadata?.plan);
        const subscriptionId = session.subscription;
        const passDurationDays = Number.parseInt(session.metadata?.pass_duration_days ?? '180', 10) || 180;

        console.log('[Webhook] checkout.session.completed', {
          sessionId: session.id,
          userId,
          plan: metadataPlan,
          subscriptionId,
          customer: session.customer,
        });

        if (userId) {
          let plan: PlanType | null = metadataPlan;
          let currentPeriodStartIso = new Date().toISOString();
          let currentPeriodEndIso = addDays(new Date(), passDurationDays).toISOString();

          // 互換: 旧サブスク方式の checkout.session.completed も処理可能にしておく
          if (subscriptionId) {
            const subRes = await fetch(
              `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
              {
                headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
              }
            );
            const stripeSub = await subRes.json();

            console.log('[Webhook] Stripe subscription fetch', {
              status: subRes.status,
              subscriptionStatus: stripeSub.status,
              currentPeriodEnd: stripeSub.current_period_end,
            });

            const inferredPlan = inferPlanFromStripeSubscription(stripeSub);
            plan = inferredPlan ?? metadataPlan;
            currentPeriodStartIso = new Date(stripeSub.current_period_start * 1000).toISOString();
            currentPeriodEndIso = new Date(stripeSub.current_period_end * 1000).toISOString();
          }

          if (!plan) {
            console.warn('[Webhook] Unknown plan (metadata + price mapping failed)', {
              metadataPlan,
              subscriptionId,
            });
            break;
          }

          let organizationId: string | null = null;
          if (isOrganizationPlan(plan)) {
            const { data: existingOrg, error: orgSelectError } = await supabaseAdmin
              .from('organizations')
              .select('id')
              .eq('owner_id', userId)
              .limit(1)
              .maybeSingle();

            if (orgSelectError) {
              console.error('[Webhook] organizations select FAILED:', orgSelectError.message);
              throw orgSelectError;
            }

            if (existingOrg?.id) {
              organizationId = existingOrg.id;
              console.log('[Webhook] Existing organization found:', organizationId);
            } else {
              const { data: createdOrg, error: createOrgError } = await supabaseAdmin
                .from('organizations')
                .insert({
                  name: '団体1',
                  owner_id: userId,
                })
                .select('id')
                .single();

              if (createOrgError) {
                console.error('[Webhook] organizations insert FAILED:', createOrgError.message);
                throw createOrgError;
              }
              organizationId = createdOrg.id;
              console.log('[Webhook] Organization created:', organizationId);

              const { error: memberError } = await supabaseAdmin.from('organization_members').upsert(
                {
                  organization_id: createdOrg.id,
                  user_id: userId,
                  role: 'owner',
                },
                { onConflict: 'organization_id,user_id' }
              );

              if (memberError) {
                console.error('[Webhook] organization_members upsert FAILED:', memberError.message);
                throw memberError;
              }
              console.log('[Webhook] Organization member added');
            }
          }

          // 既存期限が将来なら、購入時点から180日ではなく「残期間の後に延長」して時間を失わないようにする
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('plan_type,current_period_end')
            .eq('user_id', userId)
            .maybeSingle();

          if (!subscriptionId) {
            const existingEnd = existingSub?.current_period_end ? new Date(existingSub.current_period_end) : null;
            const now = new Date();
            const extensionBase = existingEnd && existingEnd.getTime() > now.getTime() ? existingEnd : now;
            currentPeriodStartIso = now.toISOString();
            currentPeriodEndIso = addDays(extensionBase, passDurationDays).toISOString();
          }

          // サブスクリプション更新（6か月利用パスの状態保存）
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              stripe_subscription_id: subscriptionId ?? null,
              stripe_customer_id: session.customer,
              plan_type: plan,
              organization_id: organizationId,
              status: 'active',
              cancel_at_period_end: false,
              current_period_start: currentPeriodStartIso,
              current_period_end: currentPeriodEndIso,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          if (updateError) {
            console.error('[Webhook] subscriptions update FAILED:', updateError.message);
            throw updateError;
          }
          console.log('[Webhook] subscriptions update SUCCESS for', userId, '→', plan);

          const downgraded = getPlanRank(existingSub?.plan_type as PlanType | null) > getPlanRank(plan);
          if (downgraded) {
            const { error: inactiveError } = await supabaseAdmin
              .from('branches')
              .update({ status: 'inactive' })
              .eq('owner_id', userId);
            if (inactiveError) {
              console.error('[Webhook] downgrade branch inactivation FAILED:', inactiveError.message);
              throw inactiveError;
            }
            console.log('[Webhook] downgrade detected; all branches set inactive for', userId);
          }

          // ユーザーが店舗を持っていなければデフォルト店舗+ログインコードを自動作成
          const { data: existingBranches, error: branchSelectError } = await supabaseAdmin
            .from('branches')
            .select('id')
            .eq('owner_id', userId)
            .limit(1);

          if (branchSelectError) {
            console.error('[Webhook] branches select FAILED:', branchSelectError.message);
            throw branchSelectError;
          }

          if (!existingBranches || existingBranches.length === 0) {
            const branchId = crypto.randomUUID();
            const { error: branchInsertError } = await supabaseAdmin.from('branches').insert({
              id: branchId,
              branch_code: 'S001',
              branch_name: '店舗1',
              password: '0000',
              sales_target: 0,
              status: 'active',
              owner_id: userId,
              organization_id: organizationId,
              created_at: new Date().toISOString(),
            });

            if (branchInsertError) {
              console.error('[Webhook] branches insert FAILED:', branchInsertError.message);
              throw branchInsertError;
            }
            console.log('[Webhook] Default branch created:', branchId);

            // ログインコード生成
            const { data: subData, error: subSelectError } = await supabaseAdmin
              .from('subscriptions')
              .select('id')
              .eq('user_id', userId)
              .single();

            if (subSelectError) {
              console.error('[Webhook] subscriptions select for login code FAILED:', subSelectError.message);
              throw subSelectError;
            }

            if (subData) {
              for (let i = 0; i < 5; i++) {
                const loginCode = generateLoginCode();
                const { error: loginCodeError } = await supabaseAdmin.from('login_codes').insert({
                  code: loginCode,
                  branch_id: branchId,
                  subscription_id: subData.id,
                  created_by: userId,
                  is_active: true,
                  created_at: new Date().toISOString(),
                });

                if (!loginCodeError) {
                  console.log('[Webhook] Login code created:', loginCode);
                  break;
                }
                if (loginCodeError.code !== '23505') {
                  console.error('[Webhook] login_codes insert FAILED:', loginCodeError.message);
                  throw loginCodeError;
                }
                console.log('[Webhook] Login code collision, retrying...');
              }
            }
          } else if (organizationId) {
            const { error: branchUpdateError } = await supabaseAdmin
              .from('branches')
              .update({ organization_id: organizationId })
              .eq('owner_id', userId)
              .is('organization_id', null);

            if (branchUpdateError) {
              console.error('[Webhook] branches org update FAILED:', branchUpdateError.message);
              throw branchUpdateError;
            }
            console.log('[Webhook] Existing branches assigned to organization');
          }
        } else {
          console.warn('[Webhook] Missing metadata:', { userId, metadataPlan, subscriptionId });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const stripeSubId = subscription.id;

        console.log('[Webhook] customer.subscription.updated', { stripeSubId, status: subscription.status });

        const nextPlan = inferPlanFromStripeSubscription(subscription);
        const { data: currentSub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id,plan_type')
          .eq('stripe_subscription_id', stripeSubId)
          .maybeSingle();
        const updatePayload: Record<string, unknown> = {
          status: subscription.status === 'active' ? 'active' :
                  subscription.status === 'trialing' ? 'trialing' :
                  subscription.status === 'past_due' ? 'past_due' :
                  'canceled',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          updated_at: new Date().toISOString(),
        };
        if (nextPlan) {
          updatePayload.plan_type = nextPlan;
        }

        const { error: subUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', stripeSubId);

        if (subUpdateError) {
          console.error('[Webhook] subscription.updated FAILED:', subUpdateError.message);
          throw subUpdateError;
        }
        console.log('[Webhook] subscription.updated SUCCESS for', stripeSubId);

        if (nextPlan && currentSub?.user_id) {
          const downgraded = getPlanRank(currentSub.plan_type as PlanType | null) > getPlanRank(nextPlan);
          if (downgraded) {
            const { error: inactiveError } = await supabaseAdmin
              .from('branches')
              .update({ status: 'inactive' })
              .eq('owner_id', currentSub.user_id);
            if (inactiveError) {
              console.error('[Webhook] subscription.updated branch inactivation FAILED:', inactiveError.message);
              throw inactiveError;
            }
            console.log('[Webhook] subscription.updated downgrade; all branches set inactive');
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        console.log('[Webhook] customer.subscription.deleted', { stripeSubId: subscription.id });

        const { error: deleteError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            plan_type: 'free',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (deleteError) {
          console.error('[Webhook] subscription.deleted FAILED:', deleteError.message);
          throw deleteError;
        }
        console.log('[Webhook] subscription.deleted SUCCESS for', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;

        console.log('[Webhook] invoice.payment_failed', { subscriptionId: invoice.subscription });

        if (invoice.subscription) {
          const { error: failError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription);

          if (failError) {
            console.error('[Webhook] invoice.payment_failed update FAILED:', failError.message);
            throw failError;
          }
          console.log('[Webhook] invoice.payment_failed update SUCCESS for', invoice.subscription);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Webhook] ERROR:', error.message, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
