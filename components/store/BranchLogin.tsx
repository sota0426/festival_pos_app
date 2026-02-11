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
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // already logged in?
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
    setSubmitted(true);

    if (!branchCode.trim()) {
      setError('支店番号を入力してください');
      return;
    }

    let formattedCode = branchCode.toUpperCase().trim().padStart(3, '0');

    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured()) {
        if (formattedCode === 'S001' || formattedCode === 'S002') {
          const demoBranch: Branch = {
            id: formattedCode,
            branch_code: formattedCode,
            branch_name: formattedCode === 'S001' ? '焼きそば屋' : 'たこ焼き屋',
            password: '1234',
            sales_target: 0,
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
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('branches')
        .select('*')
        .eq('branch_code', formattedCode)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (!data) {
        setError('この支店番号は登録されていません');
        return;
      }

      setFoundBranch(data);
      setIsNewBranch(false);
    } catch (err) {
      console.error(err);
      setError('支店番号の確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!foundBranch) return;

    setSubmitted(true);

    if (password !== foundBranch.password) {
      setError('パスワードが正しくありません');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await saveBranch(foundBranch);
      onLoginSuccess(foundBranch);
    } catch {
      Alert.alert('エラー', 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterNewBranch = async () => {
    setSubmitted(true);

    if (!branchName.trim()) {
      setError('模擬店名を入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);

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
    } catch {
      Alert.alert('エラー', '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center">
        <Text>読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <Card className="p-6">
          <Text className="text-2xl font-bold text-center mb-2">模擬店ログイン</Text>

          {!foundBranch && !isNewBranch && (
            <>
              <Input
                label="支店番号"
                value={branchCode}
                onChangeText={(text) => {
                  setBranchCode(text);
                  if (submitted) setError(null);
                }}
                placeholder="例: S001"
                error={submitted ? error ?? undefined : undefined}
              />

              <View className="mt-4 gap-3">
                <Button title="確認" onPress={handleCheckBranchCode} loading={loading} />
                <Button title="戻る" onPress={onBackToHome} variant="secondary" />
              </View>
            </>
          )}

          {foundBranch && (
            <>
              <Text className="text-center font-bold mb-2">
                {foundBranch.branch_name}
              </Text>

              <Input
                label="パスワード"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (submitted) setError(null);
                }}
                secureTextEntry
                error={submitted ? error ?? undefined : undefined}
              />

              <View className="mt-4 gap-3">
                <Button title="ログイン" onPress={handleLogin} />
                <Button
                  title="別の番号を入力"
                  variant="secondary"
                  onPress={() => {
                    setFoundBranch(null);
                    setBranchCode('');
                    setPassword('');
                    setSubmitted(false);
                    setError(null);
                  }}
                />
              </View>
            </>
          )}

          {isNewBranch && (
            <>
              <Input
                label="模擬店名"
                value={branchName}
                onChangeText={(text) => {
                  setBranchName(text);
                  if (submitted) setError(null);
                }}
                error={submitted ? error ?? undefined : undefined}
              />

              <View className="mt-4 gap-3">
                <Button title="登録してログイン" onPress={handleRegisterNewBranch} />
                <Button title="戻る" variant="secondary" onPress={onBackToHome} />
              </View>
            </>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
};
