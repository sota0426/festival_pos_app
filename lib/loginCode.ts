import { supabase } from './supabase';
import type { Branch, LoginCode } from '../types/database';

// 紛らわしい文字（0/O/1/I/L）を除外した文字セット
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateLoginCode = (): string => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
};

export const createLoginCode = async (
  branchId: string,
  subscriptionId: string,
  createdBy: string
): Promise<LoginCode | null> => {
  for (let i = 0; i < 5; i++) {
    const code = generateLoginCode();
    const { data, error } = await supabase
      .from('login_codes')
      .insert({
        code,
        branch_id: branchId,
        subscription_id: subscriptionId,
        created_by: createdBy,
        is_active: true,
      })
      .select()
      .single();

    if (!error) {
      return data;
    }
    if (error.code !== '23505') {
      console.error('Failed to create login code:', error);
      return null;
    }
  }

  console.error('Failed to create login code: retry limit reached');
  return null;
};

export const validateLoginCode = async (
  code: string
): Promise<{ valid: boolean; branch?: Branch; loginCode?: LoginCode }> => {
  const upperCode = code.toUpperCase().trim();

  const { data: loginCode, error: codeError } = await supabase
    .from('login_codes')
    .select('*')
    .eq('code', upperCode)
    .eq('is_active', true)
    .single();

  if (codeError || !loginCode) {
    return { valid: false };
  }

  // サブスクリプションが有効か確認
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('id', loginCode.subscription_id)
    .single();

  if (subError || !subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
    return { valid: false };
  }

  // 店舗データを取得
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('*')
    .eq('id', loginCode.branch_id)
    .single();

  if (branchError || !branch) {
    return { valid: false };
  }

  return { valid: true, branch, loginCode };
};

export const regenerateLoginCode = async (
  loginCodeId: string,
  createdBy: string
): Promise<LoginCode | null> => {
  // 古いコードを無効化
  await supabase
    .from('login_codes')
    .update({ is_active: false })
    .eq('id', loginCodeId);

  // 元のコードの情報を取得
  const { data: oldCode } = await supabase
    .from('login_codes')
    .select('branch_id, subscription_id')
    .eq('id', loginCodeId)
    .single();

  if (!oldCode) return null;

  return createLoginCode(oldCode.branch_id, oldCode.subscription_id, createdBy);
};

export const getLoginCodesForUser = async (userId: string): Promise<LoginCode[]> => {
  const { data, error } = await supabase
    .from('login_codes')
    .select('*')
    .eq('created_by', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch login codes:', error);
    return [];
  }

  return data ?? [];
};
