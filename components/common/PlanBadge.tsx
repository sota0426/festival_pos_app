import { View, Text } from 'react-native';
import type { PlanType } from '../../types/database';

interface PlanBadgeProps {
  plan: PlanType;
}

const planConfig: Record<PlanType, { label: string; bg: string; text: string }> = {
  free: { label: '無料', bg: 'bg-green-100', text: 'text-green-700' },
  store: { label: '店舗', bg: 'bg-blue-100', text: 'text-blue-700' },
  org_light: { label: '団体L', bg: 'bg-violet-100', text: 'text-violet-700' },
  org_standard: { label: '団体S', bg: 'bg-purple-100', text: 'text-purple-700' },
  org_premium: { label: '団体P', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  organization: { label: '団体S', bg: 'bg-purple-100', text: 'text-purple-700' }, // legacy
};

export const PlanBadge = ({ plan }: PlanBadgeProps) => {
  const config = planConfig[plan] ?? planConfig.free;

  return (
    <View className={`px-2 py-0.5 rounded-full ${config.bg}`}>
      <Text className={`text-xs font-semibold ${config.text}`}>
        {config.label}
      </Text>
    </View>
  );
};
