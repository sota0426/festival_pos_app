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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function secrets',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { code } = await req.json();

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey
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
      if (codeError && codeError.code !== 'PGRST116') {
        console.error('login_codes lookup failed:', codeError);
      }
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
      if (branchError) {
        console.error('branches lookup failed:', branchError);
      }
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (branch.status === 'inactive') {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true, branch }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('validate-login-code unexpected error:', error);
    return new Response(
      JSON.stringify({ valid: false, error: error?.message ?? 'unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
