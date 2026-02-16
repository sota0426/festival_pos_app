import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from './Card';

interface UpgradePromptProps {
  onUpgrade: () => void;
  message?: string;
}

export const UpgradePrompt = ({
  onUpgrade,
  message = 'DB連携・他端末アクセス・本部機能を使うには有料プランが必要です',
}: UpgradePromptProps) => {
  return (
    <TouchableOpacity onPress={onUpgrade} activeOpacity={0.8}>
      <Card className="bg-blue-50 border-blue-200 p-4">
        <Text className="text-blue-800 font-semibold text-sm mb-1">
          プランをアップグレード
        </Text>
        <Text className="text-blue-600 text-xs">{message}</Text>
        <Text className="text-blue-500 text-xs mt-2 font-semibold">
          月額300円から &rarr;
        </Text>
      </Card>
    </TouchableOpacity>
  );
};
