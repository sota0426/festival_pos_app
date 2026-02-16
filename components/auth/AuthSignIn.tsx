import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../common';

interface AuthSignInProps {
  onBack: () => void;
}

export const AuthSignIn = ({ onBack }: AuthSignInProps) => {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading('google');
      setError(null);
      await signInWithGoogle();
    } catch (e) {
      setError('Googleログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading('apple');
      setError(null);
      await signInWithApple();
    } catch (e) {
      setError('Appleサインインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <TouchableOpacity onPress={onBack} className="absolute top-4 left-4 z-10 p-2">
          <Text className="text-blue-600 text-base">&larr; 戻る</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-center text-gray-900 mb-2">
          ログイン / 新規登録
        </Text>
        <Text className="text-gray-500 text-center mb-10">
          アカウントを作成して、データの同期や複数端末でのアクセスが可能に
        </Text>

        {error && (
          <Card className="bg-red-50 border-red-200 mb-6">
            <Text className="text-red-700 text-center text-sm">{error}</Text>
          </Card>
        )}

        <View className="gap-4">
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading !== null}
            activeOpacity={0.8}
            className="bg-white border border-gray-300 rounded-xl py-4 px-6 flex-row items-center justify-center"
          >
            {loading === 'google' ? (
              <ActivityIndicator color="#4285F4" className="mr-3" />
            ) : (
              <Text className="text-lg mr-3">G</Text>
            )}
            <Text className="text-gray-800 font-semibold text-base">
              Googleでログイン
            </Text>
          </TouchableOpacity>

          {(Platform.OS === 'ios' || Platform.OS === 'web') && (
            <TouchableOpacity
              onPress={handleAppleSignIn}
              disabled={loading !== null}
              activeOpacity={0.8}
              className="bg-black rounded-xl py-4 px-6 flex-row items-center justify-center"
            >
              {loading === 'apple' ? (
                <ActivityIndicator color="#FFFFFF" className="mr-3" />
              ) : (
                <Text className="text-white text-lg mr-3">{'\uF8FF'}</Text>
              )}
              <Text className="text-white font-semibold text-base">
                Appleでサインイン
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text className="text-gray-400 text-center text-xs mt-8">
          ログインすることで、利用規約とプライバシーポリシーに同意したものとみなします
        </Text>
      </View>
    </SafeAreaView>
  );
};
