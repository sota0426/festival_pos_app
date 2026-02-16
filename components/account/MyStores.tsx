import { View, Text, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../lib/supabase';
import { getLoginCodesForUser, createLoginCode, regenerateLoginCode } from '../../lib/loginCode';
import { alertNotify } from '../../lib/alertUtils';
import { Card } from '../common';
import type { Branch, LoginCode } from '../../types/database';

interface MyStoresProps {
  onBack: () => void;
  onEnterStore: (branch: Branch) => void;
}

export const MyStores = ({ onBack, onEnterStore }: MyStoresProps) => {
  const { authState } = useAuth();
  const { plan, isFreePlan, maxStores } = useSubscription();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loginCodes, setLoginCodes] = useState<Record<string, LoginCode>>({});
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const userId = authState.status === 'authenticated' ? authState.user.id : null;
  const subscriptionId =
    authState.status === 'authenticated' ? authState.subscription.id : null;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // ユーザーの店舗を取得
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', userId)
        .order('branch_code');

      setBranches(branchData ?? []);

      // ログインコードを取得
      const codes = await getLoginCodesForUser(userId);
      const codeMap: Record<string, LoginCode> = {};
      for (const code of codes) {
        codeMap[code.branch_id] = code;
      }
      setLoginCodes(codeMap);
    } catch (e) {
      console.error('Failed to load stores:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyCode = async (code: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      alertNotify('エラー', 'コピーに失敗しました');
    }
  };

  const handleRegenerateCode = async (loginCode: LoginCode) => {
    if (!userId) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') {
        resolve(window.confirm('ログインコードを再生成しますか？\n既存のコードは無効になります。'));
      } else {
        Alert.alert(
          'コード再生成',
          '既存のコードは無効になります。再生成しますか？',
          [
            { text: 'キャンセル', onPress: () => resolve(false) },
            { text: '再生成', onPress: () => resolve(true) },
          ]
        );
      }
    });

    if (!confirmed) return;

    const newCode = await regenerateLoginCode(loginCode.id, userId);
    if (newCode) {
      setLoginCodes((prev) => ({ ...prev, [newCode.branch_id]: newCode }));
    }
  };

  const handleCreateCode = async (branchId: string) => {
    if (!userId || !subscriptionId) return;

    const newCode = await createLoginCode(branchId, subscriptionId, userId);
    if (newCode) {
      setLoginCodes((prev) => ({ ...prev, [branchId]: newCode }));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center p-4 border-b border-gray-200">
        <TouchableOpacity onPress={onBack} className="p-2">
          <Text className="text-blue-600">&larr; 戻る</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 ml-2">店舗管理</Text>
      </View>

      <ScrollView contentContainerClassName="p-4 gap-4">
        {loading ? (
          <Text className="text-gray-500 text-center py-8">読み込み中...</Text>
        ) : branches.length === 0 ? (
          <Card className="bg-white p-6">
            <Text className="text-gray-500 text-center mb-4">
              まだ店舗がありません
            </Text>
            <Text className="text-gray-400 text-center text-sm">
              {isFreePlan
                ? '無料プランでは1店舗をローカルで利用できます。\n有料プランにアップグレードすると、DB連携とログインコードが利用可能に。'
                : '「店舗に入る」から新しい店舗を登録してください。'}
            </Text>
          </Card>
        ) : (
          branches.map((branch) => {
            const code = loginCodes[branch.id];
            return (
              <Card key={branch.id} className="bg-white p-4">
                <View className="flex-row justify-between items-start mb-3">
                  <View>
                    <Text className="text-xs text-gray-400">
                      {branch.branch_code}
                    </Text>
                    <Text className="text-lg font-bold text-gray-900">
                      {branch.branch_name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onEnterStore(branch)}
                    activeOpacity={0.8}
                    className="bg-green-500 rounded-lg px-4 py-2"
                  >
                    <Text className="text-white font-semibold text-sm">
                      店舗に入る
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ログインコード */}
                {!isFreePlan && (
                  <View className="bg-gray-50 rounded-lg p-3">
                    <Text className="text-xs text-gray-500 mb-1">
                      ログインコード
                    </Text>
                    {code ? (
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xl font-bold tracking-[6px] text-gray-800">
                          {code.code}
                        </Text>
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => handleCopyCode(code.code)}
                            className="bg-blue-100 rounded px-3 py-1.5"
                          >
                            <Text className="text-blue-700 text-xs font-semibold">
                              {copiedCode === code.code ? 'コピー済' : 'コピー'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleRegenerateCode(code)}
                            className="bg-gray-200 rounded px-3 py-1.5"
                          >
                            <Text className="text-gray-600 text-xs font-semibold">
                              再生成
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleCreateCode(branch.id)}
                        className="bg-blue-500 rounded-lg py-2 items-center"
                      >
                        <Text className="text-white font-semibold text-sm">
                          コードを生成
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
