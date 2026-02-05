import { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../common';
import { saveHQAuth } from '../../lib/storage';

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
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      if (password === HQ_PASSWORD) {
        await saveHQAuth(true);
        onLoginSuccess();
      } else {
        setError('パスワードが正しくありません');
      }
    } catch (err) {
      Alert.alert('エラー', 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <Card className="p-6">
          <Text className="text-2xl font-bold text-center text-gray-900 mb-2">本部ログイン</Text>
          <Text className="text-gray-500 text-center mb-6">管理者パスワードを入力してください</Text>

          <Input
            label="パスワード"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            placeholder="パスワードを入力"
            secureTextEntry
            error={error}
          />

          <View className="mt-4 gap-3">
            <Button title="ログイン" onPress={handleLogin} loading={loading} disabled={!password} />
            <Button title="戻る" onPress={onBackToHome} variant="secondary" />
          </View>
        </Card>

        <Text className="text-center text-gray-400 text-xs mt-6">
          デモ用パスワード: admin123
        </Text>
      </View>
    </SafeAreaView>
  );
};
