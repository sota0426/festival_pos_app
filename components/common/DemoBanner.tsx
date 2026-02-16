import { View, Text } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export const DemoBanner = () => {
  const { authState } = useAuth();

  if (authState.status !== 'demo') return null;

  return (
    <View className="bg-amber-400 py-1.5 px-4">
      <Text className="text-amber-900 text-center text-xs font-bold">
        デモモード - 実際のデータは保存されません
      </Text>
    </View>
  );
};
