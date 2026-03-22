import { supabase } from './supabase';

export type OrderNumberScope = 'transaction' | 'mobile_order';

const TOKYO_TIME_ZONE = 'Asia/Tokyo';

const formatTokyoDateParts = (value: Date) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TOKYO_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
};

export const formatOrderNumber = (orderNumber: number): string => {
  const normalized = ((Math.max(orderNumber, 1) - 1) % 99) + 1;
  return String(normalized).padStart(2, '0');
};

export const buildTransactionCode = (
  branchCode: string,
  orderNumber: number,
  createdAt: Date = new Date(),
): string => {
  const { month, day, hour, minute } = formatTokyoDateParts(createdAt);
  return `${branchCode}-${month}${day}${hour}${minute}-${formatOrderNumber(orderNumber)}`;
};

export const allocateRemoteOrderNumber = async (
  branchId: string,
  scope: OrderNumberScope,
): Promise<number> => {
  const { data, error } = await supabase.rpc('allocate_branch_order_number', {
    p_branch_id: branchId,
    p_scope: scope,
  });

  if (error) throw error;

  const parsed = Number(data);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Failed to allocate order number');
  }

  return parsed;
};
