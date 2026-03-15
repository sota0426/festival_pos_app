import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

interface DemoBannerProps {
  onExitDemo?: () => void;
}

export const DemoBanner = ({ onExitDemo }: DemoBannerProps) => {
  const { authState } = useAuth();
  const { isFreePlan } = useSubscription();
  const insets = useSafeAreaInsets();

  if (authState.status !== 'demo') return null;

  const showExitButton = isFreePlan && !!onExitDemo;

  return (
    <View
      className="border-b border-amber-300 bg-amber-400"
      style={{ paddingTop: Math.max(insets.top, 8), paddingBottom: 8 }}
    >
      <View className="flex-row items-center justify-center gap-3 px-4">
        <View className="flex-1">
          <Text className="text-center text-sm font-extrabold tracking-wide text-amber-950">
            デモモード
          </Text>
          <Text className="mt-0.5 text-center text-xs font-semibold text-amber-900">
            この画面の操作結果は保存されません
          </Text>
        </View>
        {showExitButton && (
          <TouchableOpacity
            onPress={onExitDemo}
            activeOpacity={0.85}
            className="rounded-lg border border-amber-900/15 bg-amber-950 px-3 py-2"
          >
            <Text className="text-center text-xs font-bold text-amber-50">
              終了する
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
