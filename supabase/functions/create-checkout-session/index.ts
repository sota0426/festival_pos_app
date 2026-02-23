// Supabase Edge Function: Stripe Checkout Session 作成
// デプロイ: supabase functions deploy create-checkout-session
// 環境変数:
// STRIPE_SECRET_KEY, STRIPE_STORE_PRICE_ID,
// STRIPE_ORG_LIGHT_PRICE_ID, STRIPE_ORG_STANDARD_PRICE_ID, STRIPE_ORG_PREMIUM_PRICE_ID,
// (互換) STRIPE_ORG_PRICE_ID, APP_URL

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_STORE_PRICE_ID = Deno.env.get('STRIPE_STORE_PRICE_ID')!;
const STRIPE_ORG_LIGHT_PRICE_ID = Deno.env.get('STRIPE_ORG_LIGHT_PRICE_ID')!;
const STRIPE_ORG_STANDARD_PRICE_ID = Deno.env.get('STRIPE_ORG_STANDARD_PRICE_ID') || Deno.env.get('STRIPE_ORG_PRICE_ID')!;
const STRIPE_ORG_PREMIUM_PRICE_ID = Deno.env.get('STRIPE_ORG_PREMIUM_PRICE_ID')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://localhost:8081';

type CheckoutPlan = 'store' | 'org_light' | 'org_standard' | 'org_premium';

const PRICE_ID_BY_PLAN: Record<CheckoutPlan, string> = {
  store: STRIPE_STORE_PRICE_ID,
  org_light: STRIPE_ORG_LIGHT_PRICE_ID,
  org_standard: STRIPE_ORG_STANDARD_PRICE_ID,
  org_premium: STRIPE_ORG_PREMIUM_PRICE_ID,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        detail: authError?.message ?? 'No user found',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { plan } = await req.json();
    if (!plan || !(plan in PRICE_ID_BY_PLAN)) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const targetPlan = plan as CheckoutPlan;
    const priceId = PRICE_ID_BY_PLAN[targetPlan];

    // Stripe Customer を取得または作成
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: user.email!,
          'metadata[supabase_user_id]': user.id,
        }),
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    // Checkout Session 作成（3か月利用パス: 一回払い）
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId!,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        mode: 'payment',
        success_url: `${APP_URL}?checkout=success`,
        cancel_url: `${APP_URL}?checkout=cancel`,
        'metadata[supabase_user_id]': user.id,
        'metadata[plan]': targetPlan,
        'metadata[pass_duration_days]': '90',
      }),
    });

    const session = await sessionRes.json();

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
