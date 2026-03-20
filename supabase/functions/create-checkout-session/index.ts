// Supabase Edge Function: Stripe Checkout Session 作成
// デプロイ: supabase functions deploy create-checkout-session
// 環境変数:
// STRIPE_SECRET_KEY,
// STRIPE_STORE_PRICE_ID, STRIPE_ORG_STANDARD_PRICE_ID, STRIPE_ORG_PREMIUM_PRICE_ID,
// STRIPE_ORG_PREMIUM_UPGRADE_PRICE_ID,
// (互換) STRIPE_ORG_PRICE_ID, APP_URL

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_STORE_PRICE_ID = Deno.env.get('STRIPE_STORE_PRICE_ID')!;
const STRIPE_ORG_STANDARD_PRICE_ID = Deno.env.get('STRIPE_ORG_STANDARD_PRICE_ID') || Deno.env.get('STRIPE_ORG_PRICE_ID')!;
const STRIPE_ORG_PREMIUM_PRICE_ID = Deno.env.get('STRIPE_ORG_PREMIUM_PRICE_ID')!;
const STRIPE_ORG_PREMIUM_UPGRADE_PRICE_ID = Deno.env.get('STRIPE_ORG_PREMIUM_UPGRADE_PRICE_ID') || '';
const APP_URL = Deno.env.get('APP_URL') || 'https://localhost:8081';

type CheckoutPlan = 'store' | 'org_standard' | 'org_premium';

type DecodedJwt = {
  sub?: string;
  email?: string;
};

const PRICE_ID_BY_PLAN: Record<CheckoutPlan, string> = {
  store: STRIPE_STORE_PRICE_ID,
  org_standard: STRIPE_ORG_STANDARD_PRICE_ID,
  org_premium: STRIPE_ORG_PREMIUM_PRICE_ID,
};

const isTenStoreOrgPlan = (planType: string | null | undefined): boolean =>
  planType === 'org_light' || planType === 'org_standard' || planType === 'organization';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const decodeJwtPayload = (token: string): DecodedJwt | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as DecodedJwt;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    const bodyAccessToken =
      requestBody && typeof requestBody === 'object' && 'accessToken' in requestBody
        ? String(requestBody.accessToken ?? '').trim()
        : '';
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim() || bodyAccessToken;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    const decodedJwt = decodeJwtPayload(accessToken);
    const resolvedUserId = user?.id ?? decodedJwt?.sub ?? null;
    const resolvedEmail = user?.email ?? decodedJwt?.email ?? null;

    if (!resolvedUserId) {
      console.error('[create-checkout-session] auth failed', {
        authError: authError?.message ?? null,
        hasDecodedSub: Boolean(decodedJwt?.sub),
      });
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        detail: authError?.message ?? 'No user found',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plan =
      requestBody && typeof requestBody === 'object' && 'plan' in requestBody
        ? requestBody.plan
        : null;
    if (!plan || !(plan in PRICE_ID_BY_PLAN)) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, plan_type')
      .eq('user_id', resolvedUserId)
      .single();

    const targetPlan = plan as CheckoutPlan;
    const shouldUsePremiumUpgradePrice =
      targetPlan === 'org_premium' &&
      isTenStoreOrgPlan(sub?.plan_type) &&
      Boolean(STRIPE_ORG_PREMIUM_UPGRADE_PRICE_ID);
    const priceId = shouldUsePremiumUpgradePrice
      ? STRIPE_ORG_PREMIUM_UPGRADE_PRICE_ID
      : PRICE_ID_BY_PLAN[targetPlan];

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          ...(resolvedEmail ? { email: resolvedEmail } : {}),
          'metadata[supabase_user_id]': resolvedUserId,
        }),
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      await supabaseAdmin
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', resolvedUserId);
    }

    // Checkout Session 作成（6か月利用パス: 一回払い）
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
        'payment_method_types[0]': 'card',
        'payment_method_types[1]': 'paypay',
        success_url: `${APP_URL}?checkout=success`,
        cancel_url: `${APP_URL}?checkout=cancel`,
        'metadata[supabase_user_id]': resolvedUserId,
        'metadata[plan]': targetPlan,
        'metadata[price_mode]': shouldUsePremiumUpgradePrice ? 'upgrade' : 'standard',
        'metadata[pass_duration_days]': '365',
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
