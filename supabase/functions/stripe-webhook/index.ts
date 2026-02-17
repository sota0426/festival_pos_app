// Supabase Edge Function: Stripe Webhook ハンドラー
// デプロイ: supabase functions deploy stripe-webhook --no-verify-jwt
// 環境変数: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const LOGIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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
        const plan = session.metadata?.plan;
        const subscriptionId = session.subscription;

        console.log('[Webhook] checkout.session.completed', {
          sessionId: session.id,
          userId,
          plan,
          subscriptionId,
          customer: session.customer,
        });

        if (userId && plan && subscriptionId) {
          // Stripe Subscription の詳細を取得
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

          let organizationId: string | null = null;
          if (plan === 'organization') {
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

          // サブスクリプション更新（最重要）
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: session.customer,
              plan_type: plan,
              organization_id: organizationId,
              status: 'active',
              current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          if (updateError) {
            console.error('[Webhook] subscriptions update FAILED:', updateError.message);
            throw updateError;
          }
          console.log('[Webhook] subscriptions update SUCCESS for', userId, '→', plan);

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
          console.warn('[Webhook] Missing metadata:', { userId, plan, subscriptionId });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const stripeSubId = subscription.id;

        console.log('[Webhook] customer.subscription.updated', { stripeSubId, status: subscription.status });

        const { error: subUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscription.status === 'active' ? 'active' :
                    subscription.status === 'trialing' ? 'trialing' :
                    subscription.status === 'past_due' ? 'past_due' :
                    'canceled',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', stripeSubId);

        if (subUpdateError) {
          console.error('[Webhook] subscription.updated FAILED:', subUpdateError.message);
          throw subUpdateError;
        }
        console.log('[Webhook] subscription.updated SUCCESS for', stripeSubId);
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
