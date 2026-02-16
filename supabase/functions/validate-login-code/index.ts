// Supabase Edge Function: ログインコード検証
// デプロイ: supabase functions deploy validate-login-code
// 注: クライアントからも直接 supabase テーブルクエリで検証可能だが、
//     RLSをバイパスする必要がある場合にこのEdge Functionを使用

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const upperCode = code.toUpperCase().trim();

    // ログインコード検証
    const { data: loginCode, error: codeError } = await supabaseAdmin
      .from('login_codes')
      .select('*, subscriptions!inner(status)')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (codeError || !loginCode) {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // サブスクリプション状態確認
    const subStatus = loginCode.subscriptions?.status;
    if (subStatus !== 'active' && subStatus !== 'trialing') {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 店舗データ取得
    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('*')
      .eq('id', loginCode.branch_id)
      .single();

    if (branchError || !branch) {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true, branch }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
