import { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../common';
import { saveHQAuth } from '../../lib/storage';
import { alertNotify } from '../../lib/alertUtils';

// Simple hardcoded password for demo purposes
// In production, use Supabase Auth
const HQ_PASSWORD = 'admin123';

interface HQLoginProps {
  onLoginSuccess: () => void;
  onBackToHome: () => void;
}

export const HQLogin = ({ onLoginSuccess, onBackToHome }: HQLoginProps) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleLogin = async () => {
    setSubmitted(true);

    // ❌ パスワード不一致 → ここで終了
    if (password !== HQ_PASSWORD) {
      setError('パスワードが正しくありません');
      return;
    }

    // ✅ 正しい場合のみここに来る
    try {
      setLoading(true);
      setError(null);
      await saveHQAuth(true);
      onLoginSuccess();
    } catch (err) {
      alertNotify('エラー', 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6 items-center">
        <Card className="p-6">
          <Text className="text-2xl font-bold text-center text-gray-900 mb-2">
            本部ログイン
          </Text>
          <Text className="text-gray-500 text-center mb-6">
            管理者パスワードを入力してください
            <Text className="text-center text-gray-400 text-xs mt-6">
              <br />(デモ用パスワード: admin123)
            </Text>     
          </Text>
     

          <Input
            label="パスワード"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (submitted) setError(null); // 入力中はエラーを消す
            }}
            placeholder="パスワードを入力"
            secureTextEntry
            error={submitted ? error ?? undefined : undefined}
          />

          <View className="mt-4 gap-3">
            <Button
              title="ログイン"
              onPress={handleLogin}
              loading={loading}
              disabled={!password || loading}
            />
            <Button
              title="戻る"
              onPress={onBackToHome}
              variant="secondary"
              disabled={loading}
            />
          </View>
        </Card>

      </View>
    </SafeAreaView>
  );
};
