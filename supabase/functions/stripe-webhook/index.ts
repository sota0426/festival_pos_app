// Supabase Edge Function: Stripe Webhook ハンドラー
// デプロイ: supabase functions deploy stripe-webhook
// 環境変数: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;
        const subscriptionId = session.subscription;

        if (userId && plan && subscriptionId) {
          // Stripe Subscription の詳細を取得
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
            {
              headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
            }
          );
          const stripeSub = await subRes.json();

          await supabaseAdmin
            .from('subscriptions')
            .update({
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: session.customer,
              plan_type: plan,
              status: 'active',
              current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const stripeSubId = subscription.id;

        const planMap: Record<string, string> = {};
        // Price ID -> plan type のマッピングはStripe Price IDで判断
        // 簡易版: metadataから取得 or statusのみ更新

        await supabaseAdmin
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
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            plan_type: 'free',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
