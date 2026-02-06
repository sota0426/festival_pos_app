import { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { saveBranch, getBranch } from '../../lib/storage';
import type { Branch } from '../../types/database';

interface BranchLoginProps {
  onLoginSuccess: (branch: Branch) => void;
  onBackToHome: () => void;
}

export const BranchLogin = ({ onLoginSuccess, onBackToHome }: BranchLoginProps) => {
  const [branchCode, setBranchCode] = useState('');
  const [password, setPassword] = useState('');
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [foundBranch, setFoundBranch] = useState<Branch | null>(null);
  const [error, setError] = useState('');

  // Check if already logged in
  useEffect(() => {
    const checkExistingBranch = async () => {
      const savedBranch = await getBranch();
      if (savedBranch) {
        onLoginSuccess(savedBranch);
      }
      setChecking(false);
    };
    checkExistingBranch();
  }, [onLoginSuccess]);

  const handleCheckBranchCode = async () => {
    if (!branchCode.trim()) {
      setError('支店番号を入力してください');
      return;
    }

    // Format branch code
    let formattedCode = branchCode.toUpperCase().trim();
    if (!formattedCode.startsWith('S')) {
      formattedCode = `S${formattedCode.padStart(3, '0')}`;
    }

    setLoading(true);
    setError('');

    try {
      if (!isSupabaseConfigured()) {
        // Demo mode: accept S001, S002, or any code
        if (formattedCode === 'S001') {
          const demoBranch: Branch = {
            id: '1',
            branch_code: 'S001',
            branch_name: '焼きそば屋',
            password: '1234',
            sales_target: 50000,
            status: 'active',
            created_at: new Date().toISOString(),
          };
          setFoundBranch(demoBranch);
          setIsNewBranch(false);
        } else if (formattedCode === 'S002') {
          const demoBranch: Branch = {
            id: '2',
            branch_code: 'S002',
            branch_name: 'たこ焼き屋',
            password: '1234',
            sales_target: 40000,
            status: 'active',
            created_at: new Date().toISOString(),
          };
          setFoundBranch(demoBranch);
          setIsNewBranch(false);
        } else {
          setIsNewBranch(true);
          setFoundBranch(null);
          setBranchCode(formattedCode);
        }
        setLoading(false);
        return;
      }

      // Check if branch exists in Supabase
      const { data, error: fetchError } = await supabase
        .from('branches')
        .select('*')
        .eq('branch_code', formattedCode)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        setFoundBranch(data);
        setIsNewBranch(false);
      } else {
        setError('この支店番号は登録されていません。本部で発行された番号を入力してください。');
        setIsNewBranch(false);
        setFoundBranch(null);
      }
    } catch (err) {
      console.error('Error checking branch code:', err);
      setError('支店番号の確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!foundBranch) return;

    if (password !== foundBranch.password) {
      setError('パスワードが正しくありません');
      return;
    }

    try {
      await saveBranch(foundBranch);
      onLoginSuccess(foundBranch);
    } catch (err) {
      Alert.alert('エラー', 'ログインに失敗しました');
    }
  };

  const handleRegisterNewBranch = async () => {
    if (!branchName.trim()) {
      setError('模擬店名を入力してください');
      return;
    }

    setLoading(true);

    try {
      // This is for demo mode only
      // In production, branches should only be created by HQ
      const newBranch: Branch = {
        id: Date.now().toString(),
        branch_code: branchCode.toUpperCase(),
        branch_name: branchName.trim(),
        password: '',
        sales_target: 0,
        status: 'active',
        created_at: new Date().toISOString(),
      };

      await saveBranch(newBranch);
      onLoginSuccess(newBranch);
    } catch (err) {
      Alert.alert('エラー', '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-500">読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <Card className="p-6">
          <Text className="text-2xl font-bold text-center text-gray-900 mb-2">模擬店ログイン</Text>
          <Text className="text-gray-500 text-center mb-6">
            本部から発行された支店番号を入力してください
          </Text>

          {!foundBranch && !isNewBranch && (
            <>
              <Input
                label="支店番号"
                value={branchCode}
                onChangeText={(text) => {
                  setBranchCode(text);
                  setError('');
                }}
                placeholder="例: S001 または 001"
                error={error}
              />

              <View className="mt-4 gap-3">
                <Button
                  title="確認"
                  onPress={handleCheckBranchCode}
                  loading={loading}
                  disabled={!branchCode.trim()}
                />
                <Button title="戻る" onPress={onBackToHome} variant="secondary" />
              </View>
            </>
          )}

          {foundBranch && (
            <>
              <View className="bg-blue-50 p-4 rounded-lg mb-4">
                <Text className="text-blue-600 font-semibold text-center">
                  {foundBranch.branch_code}
                </Text>
                <Text className="text-xl font-bold text-center text-gray-900 mt-1">
                  {foundBranch.branch_name}
                </Text>
              </View>

              <Input
                label="パスワード"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="パスワードを入力"
                secureTextEntry={true}
                error={error}
              />

              <View className="mt-4 gap-3">
                <Button title="この模擬店でログイン" onPress={handleLogin} disabled={!password.trim()} />
                <Button
                  title="別の番号を入力"
                  onPress={() => {
                    setFoundBranch(null);
                    setBranchCode('');
                    setPassword('');
                    setError('');
                  }}
                  variant="secondary"
                />
              </View>
            </>
          )}

          {isNewBranch && (
            <>
              <View className="bg-yellow-50 p-4 rounded-lg mb-4">
                <Text className="text-yellow-700 text-center">
                  支店番号: {branchCode}
                </Text>
                <Text className="text-gray-600 text-center text-sm mt-1">
                  新規登録（デモモード）
                </Text>
              </View>

              <Input
                label="模擬店名"
                value={branchName}
                onChangeText={(text) => {
                  setBranchName(text);
                  setError('');
                }}
                placeholder="例: 焼きそば屋"
                error={error}
              />

              <View className="mt-4 gap-3">
                <Button
                  title="登録してログイン"
                  onPress={handleRegisterNewBranch}
                  loading={loading}
                  disabled={!branchName.trim()}
                />
                <Button
                  title="別の番号を入力"
                  onPress={() => {
                    setIsNewBranch(false);
                    setBranchCode('');
                    setBranchName('');
                  }}
                  variant="secondary"
                />
              </View>
            </>
          )}
        </Card>

        <Text className="text-center text-gray-400 text-xs mt-6">
          デモ用支店番号: S001（焼きそば屋）、S002（たこ焼き屋）{'\n'}
          デモ用パスワード: 1234
        </Text>
      </View>
    </SafeAreaView>
  );
};
