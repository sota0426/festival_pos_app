import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import {
  getBranchRecorderConfig,
  getBranchRecorders,
  getRecorderAccessLogs,
  saveBranchRecorderConfig,
  saveBranchRecorders,
  saveRecorderAccessLogs,
} from './storage';
import type {
  BranchRecorder,
  BranchRecorderConfig,
  RecorderAccessLog,
  RecorderRegistrationMode,
} from '../types/database';

type RegisterAccessInput = {
  branchId: string;
  recorderId: string | null;
  recorderName: string;
  deviceId: string;
  deviceName: string;
};

const sortRecorders = (items: BranchRecorder[]): BranchRecorder[] =>
  [...items].sort((a, b) => {
    if (a.group_id !== b.group_id) return a.group_id - b.group_id;
    return a.recorder_name.localeCompare(b.recorder_name, 'ja');
  });

const sortLogs = (items: RecorderAccessLog[]): RecorderAccessLog[] =>
  [...items].sort((a, b) => new Date(b.accessed_at).getTime() - new Date(a.accessed_at).getTime());

export const fetchBranchRecorderConfig = async (
  branchId: string,
  canSyncToSupabase: boolean,
): Promise<BranchRecorderConfig> => {
  const local = await getBranchRecorderConfig(branchId);
  if (!canSyncToSupabase) return local;

  const { data, error } = await supabase
    .from('branch_recorder_configs')
    .select('branch_id,registration_mode,updated_at')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) {
    console.error('fetchBranchRecorderConfig failed:', error);
    return local;
  }
  if (!data) {
    console.warn('fetchBranchRecorderConfig: no row found, fallback to local default');
    return local;
  }

  const normalized: BranchRecorderConfig = {
    branch_id: String(data.branch_id ?? branchId),
    registration_mode: data.registration_mode === 'open' ? 'open' : 'restricted',
    updated_at: String(data.updated_at ?? new Date().toISOString()),
  };
  await saveBranchRecorderConfig(branchId, normalized);
  return normalized;
};

export const saveBranchRecorderRegistrationMode = async (
  branchId: string,
  mode: RecorderRegistrationMode,
  canSyncToSupabase: boolean,
): Promise<BranchRecorderConfig> => {
  const normalized: BranchRecorderConfig = {
    branch_id: branchId,
    registration_mode: mode === 'open' ? 'open' : 'restricted',
    updated_at: new Date().toISOString(),
  };
  await saveBranchRecorderConfig(branchId, normalized);

  if (canSyncToSupabase) {
    const { error } = await supabase
      .from('branch_recorder_configs')
      .upsert(
        {
          branch_id: branchId,
          registration_mode: normalized.registration_mode,
          updated_at: normalized.updated_at,
        },
        { onConflict: 'branch_id' },
      );
    if (error) {
      throw error;
    }
  }

  return normalized;
};

export const fetchBranchRecorders = async (
  branchId: string,
  canSyncToSupabase: boolean,
): Promise<BranchRecorder[]> => {
  const local = await getBranchRecorders(branchId);
  const normalizedLocal = sortRecorders(
    local.map((item) => ({
      ...item,
      recorder_name: String(item.recorder_name ?? '').trim(),
      note: String(item.note ?? ''),
      group_id: Math.min(9, Math.max(1, Number(item.group_id ?? 1) || 1)),
      is_active: item.is_active !== false,
    })).filter((item) => item.recorder_name.length > 0 && item.is_active),
  );
  if (!canSyncToSupabase) {
    return normalizedLocal;
  }

  const { data, error } = await supabase
    .from('branch_recorders')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('recorder_name', { ascending: true });

  if (error) {
    console.error('fetchBranchRecorders failed:', error);
    return normalizedLocal;
  }
  if (!data) {
    console.warn('fetchBranchRecorders: no rows, fallback to local');
    return normalizedLocal;
  }

  const normalized = sortRecorders(
    (data as BranchRecorder[]).map((item) => ({
      ...item,
      recorder_name: String(item.recorder_name ?? '').trim(),
      note: String(item.note ?? ''),
      group_id: Math.min(9, Math.max(1, Number(item.group_id ?? 1) || 1)),
      is_active: item.is_active !== false,
    })).filter((item) => item.recorder_name.length > 0),
  );
  await saveBranchRecorders(branchId, normalized);
  return normalized;
};

export const createBranchRecorder = async (
  branchId: string,
  recorderName: string,
  note: string,
  groupId: number,
  canSyncToSupabase: boolean,
): Promise<{ ok: boolean; reason?: 'duplicate' | 'unknown'; recorders: BranchRecorder[] }> => {
  const normalizedName = recorderName.trim();
  const normalizedNote = note.trim();
  const normalizedGroupId = Math.min(9, Math.max(1, Number(groupId) || 1));
  const local = await getBranchRecorders(branchId);
  if (local.some((item) => item.recorder_name === normalizedName && item.is_active)) {
    return { ok: false, reason: 'duplicate', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }

  if (!canSyncToSupabase) {
    const now = new Date().toISOString();
    const next: BranchRecorder[] = sortRecorders([
      ...local,
      {
        id: Crypto.randomUUID(),
        branch_id: branchId,
        recorder_name: normalizedName,
        note: normalizedNote,
        group_id: normalizedGroupId,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    await saveBranchRecorders(branchId, next);
    return { ok: true, recorders: next.filter((item) => item.is_active) };
  }

  const { error } = await supabase
    .from('branch_recorders')
    .insert({
      branch_id: branchId,
      recorder_name: normalizedName,
      note: normalizedNote,
      group_id: normalizedGroupId,
      is_active: true,
    });

  if (error) {
    if (error.code === '23505') {
      const refreshed = await fetchBranchRecorders(branchId, canSyncToSupabase);
      return { ok: false, reason: 'duplicate', recorders: refreshed };
    }
    const fallback = sortRecorders(local.filter((item) => item.is_active));
    return { ok: false, reason: 'unknown', recorders: fallback };
  }

  const refreshed = await fetchBranchRecorders(branchId, canSyncToSupabase);
  return { ok: true, recorders: refreshed };
};

export const updateBranchRecorder = async (
  branchId: string,
  recorderId: string,
  updates: { recorderName: string; note: string; groupId: number },
  canSyncToSupabase: boolean,
): Promise<{ ok: boolean; reason?: 'duplicate' | 'not_found' | 'unknown'; recorders: BranchRecorder[] }> => {
  const normalizedName = updates.recorderName.trim();
  const normalizedNote = updates.note.trim();
  const normalizedGroupId = Math.min(9, Math.max(1, Number(updates.groupId) || 1));
  const local = await getBranchRecorders(branchId);
  const target = local.find((item) => item.id === recorderId);
  if (!target) {
    return { ok: false, reason: 'not_found', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }
  const duplicate = local.some(
    (item) => item.id !== recorderId && item.is_active && item.recorder_name === normalizedName,
  );
  if (duplicate) {
    return { ok: false, reason: 'duplicate', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }

  if (!canSyncToSupabase) {
    const now = new Date().toISOString();
    const next = sortRecorders(
      local.map((item) =>
        item.id === recorderId
          ? {
              ...item,
              recorder_name: normalizedName,
              note: normalizedNote,
              group_id: normalizedGroupId,
              updated_at: now,
            }
          : item,
      ),
    );
    await saveBranchRecorders(branchId, next);
    return { ok: true, recorders: next.filter((item) => item.is_active) };
  }

  const { error } = await supabase
    .from('branch_recorders')
    .update({
      recorder_name: normalizedName,
      note: normalizedNote,
      group_id: normalizedGroupId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recorderId)
    .eq('branch_id', branchId);

  if (error) {
    if (error.code === '23505') {
      const refreshed = await fetchBranchRecorders(branchId, canSyncToSupabase);
      return { ok: false, reason: 'duplicate', recorders: refreshed };
    }
    return { ok: false, reason: 'unknown', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }

  const refreshed = await fetchBranchRecorders(branchId, canSyncToSupabase);
  return { ok: true, recorders: refreshed };
};

export const deactivateBranchRecorder = async (
  branchId: string,
  recorderId: string,
  canSyncToSupabase: boolean,
): Promise<{ ok: boolean; reason?: 'not_found' | 'unknown'; recorders: BranchRecorder[] }> => {
  const local = await getBranchRecorders(branchId);
  const target = local.find((item) => item.id === recorderId);
  if (!target) {
    return { ok: false, reason: 'not_found', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }

  if (!canSyncToSupabase) {
    const now = new Date().toISOString();
    const next = sortRecorders(
      local.map((item) =>
        item.id === recorderId
          ? {
              ...item,
              is_active: false,
              updated_at: now,
            }
          : item,
      ),
    );
    await saveBranchRecorders(branchId, next);
    return { ok: true, recorders: next.filter((item) => item.is_active) };
  }

  const { error } = await supabase
    .from('branch_recorders')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recorderId)
    .eq('branch_id', branchId);

  if (error) {
    return { ok: false, reason: 'unknown', recorders: sortRecorders(local.filter((item) => item.is_active)) };
  }

  const refreshed = await fetchBranchRecorders(branchId, canSyncToSupabase);
  return { ok: true, recorders: refreshed };
};

export const registerRecorderAccess = async (
  input: RegisterAccessInput,
  canSyncToSupabase: boolean,
): Promise<void> => {
  const now = new Date().toISOString();
  const log: RecorderAccessLog = {
    id: Crypto.randomUUID(),
    branch_id: input.branchId,
    recorder_id: input.recorderId,
    recorder_name: input.recorderName,
    device_id: input.deviceId,
    device_name: input.deviceName,
    accessed_at: now,
    created_at: now,
  };

  const local = await getRecorderAccessLogs(input.branchId);
  const merged = sortLogs([log, ...local]).slice(0, 200);
  await saveRecorderAccessLogs(input.branchId, merged);

  if (!canSyncToSupabase) return;

  await supabase.from('branch_recorder_access_logs').insert({
    branch_id: input.branchId,
    recorder_id: input.recorderId,
    recorder_name: input.recorderName,
    device_id: input.deviceId,
    device_name: input.deviceName,
    accessed_at: now,
  });
};

export const fetchRecorderAccessLogs = async (
  branchId: string,
  canSyncToSupabase: boolean,
): Promise<RecorderAccessLog[]> => {
  const local = await getRecorderAccessLogs(branchId);
  if (!canSyncToSupabase) return sortLogs(local);

  const { data, error } = await supabase
    .from('branch_recorder_access_logs')
    .select('*')
    .eq('branch_id', branchId)
    .order('accessed_at', { ascending: false })
    .limit(300);

  if (error || !data) {
    return sortLogs(local);
  }

  const normalized = sortLogs(data as RecorderAccessLog[]);
  await saveRecorderAccessLogs(branchId, normalized.slice(0, 200));
  return normalized;
};
