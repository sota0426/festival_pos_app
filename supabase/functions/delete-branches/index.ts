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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { branchIds } = await req.json();
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'branchIds is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedBranchIds = Array.from(
      new Set(branchIds.filter((id) => typeof id === 'string' && id.length > 0))
    );
    if (normalizedBranchIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid branch ids' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: branches, error: branchesError } = await supabaseAdmin
      .from('branches')
      .select('id, owner_id, organization_id')
      .in('id', normalizedBranchIds);
    if (branchesError) throw branchesError;

    const { data: ownedOrganizations, error: ownedOrgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id);
    if (ownedOrgError) throw ownedOrgError;

    const { data: adminMemberships, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin']);
    if (memberError) throw memberError;

    const manageableOrgIds = new Set<string>([
      ...(ownedOrganizations ?? []).map((row) => row.id),
      ...(adminMemberships ?? []).map((row) => row.organization_id),
    ]);

    const deletableBranchIds = (branches ?? [])
      .filter((branch) => {
        if (branch.owner_id === user.id) return true;
        if (!branch.organization_id) return false;
        return manageableOrgIds.has(branch.organization_id);
      })
      .map((branch) => branch.id);

    if (deletableBranchIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No deletable branches found',
          deletedIds: [],
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from('branches')
      .delete()
      .in('id', deletableBranchIds)
      .select('id');
    if (deleteError) throw deleteError;

    return new Response(
      JSON.stringify({
        success: true,
        deletedIds: (deletedRows ?? []).map((row) => row.id),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('delete-branches unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
