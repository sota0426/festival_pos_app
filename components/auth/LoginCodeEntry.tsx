import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { validateLoginCode } from '../../lib/loginCode';
import { Card } from '../common';

interface LoginCodeEntryProps {
  onBack: () => void;
}

export const LoginCodeEntry = ({ onBack }: LoginCodeEntryProps) => {
  const { enterWithLoginCode } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (code.trim().length !== 6) {
      setError('6文字のコードを入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await validateLoginCode(code);

      if (result.valid && result.branch) {
        enterWithLoginCode(result.branch, code.toUpperCase().trim());
      } else if (result.reason === 'unauthorized') {
        setError('ログインコード認証の設定エラーです（Functionが401）。管理者に連絡してください。');
      } else if (result.reason === 'server_error') {
        setError('ログインコード認証サーバーでエラーが発生しました。時間をおいて再試行してください。');
      } else {
        setError('無効なコードです。コードを確認してもう一度お試しください。');
      }
    } catch {
      setError('接続エラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (text: string) => {
    // 英数字のみ、6文字まで、大文字に変換
    const filtered = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    setCode(filtered);
    setError(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <TouchableOpacity onPress={onBack} className="absolute top-4 left-4 z-10 p-2">
          <Text className="text-blue-600 text-base">&larr; 戻る</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-center text-gray-900 mb-2">
          ログインコード
        </Text>
        <Text className="text-gray-500 text-center mb-8">
          店舗のログインコード（6文字）を入力してください
        </Text>

        {error && (
          <Card className="bg-red-50 border-red-200 mb-4">
            <Text className="text-red-700 text-center text-sm">{error}</Text>
          </Card>
        )}

        <TextInput
          value={code}
          onChangeText={handleCodeChange}
          placeholder="ABCDEF"
          autoCapitalize="characters"
          maxLength={6}
          className="bg-white border-2 border-gray-300 rounded-xl py-5 px-6 text-center text-3xl font-bold tracking-[12px] text-gray-900 mb-6"
          autoFocus
        />

        <TouchableOpacity
          onPress={handleValidate}
          disabled={loading || code.length !== 6}
          activeOpacity={0.8}
          className={`rounded-xl py-4 items-center ${
            code.length === 6 && !loading
              ? 'bg-blue-600'
              : 'bg-gray-300'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">ログイン</Text>
          )}
        </TouchableOpacity>

        <Text className="text-gray-400 text-center text-xs mt-6">
          ログインコードは店舗の管理者から共有されます
        </Text>
      </View>
    </SafeAreaView>
  );
};
