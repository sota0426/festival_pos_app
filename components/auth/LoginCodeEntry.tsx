import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { validateLoginCode } from '../../lib/loginCode';
import { saveDefaultExpenseRecorder, getOrCreateDeviceId } from '../../lib/storage';
import {
  createBranchRecorder,
  fetchBranchRecorderConfig,
  fetchBranchRecorders,
  registerRecorderAccess,
} from '../../lib/recorderRegistry';
import { hasSupabaseEnvConfigured } from '../../lib/supabase';
import type { Branch, BranchRecorder, RecorderRegistrationMode } from '../../types/database';
import { Card, Modal } from '../common';

interface LoginCodeEntryProps {
  onBack: () => void;
}

export const LoginCodeEntry = ({ onBack }: LoginCodeEntryProps) => {
  const { enterWithLoginCode } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatedBranch, setValidatedBranch] = useState<Branch | null>(null);
  const [recorderOptions, setRecorderOptions] = useState<BranchRecorder[]>([]);
  const [selectedRecorderId, setSelectedRecorderId] = useState<string>('');
  const [deviceName, setDeviceName] = useState('');
  const [showRecorderModal, setShowRecorderModal] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<RecorderRegistrationMode>('restricted');
  const [useExistingRecorder, setUseExistingRecorder] = useState(false);
  const [newRecorderName, setNewRecorderName] = useState('');

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
        setValidatedBranch(result.branch);
        const canSyncToSupabase = hasSupabaseEnvConfigured();
        console.log('[LoginCodeEntry] supabase availability for login-code flow', {
          canSyncToSupabase,
        });
        const config = await fetchBranchRecorderConfig(result.branch.id, canSyncToSupabase);
        const recorders = await fetchBranchRecorders(result.branch.id, canSyncToSupabase);
        console.log('[LoginCodeEntry] fetched recorder data', {
          branchId: result.branch.id,
          branchCode: result.branch.branch_code,
          registrationMode: config.registration_mode,
          recorderCount: recorders.length,
          recorderNames: recorders.map((r) => r.recorder_name),
        });
        const normalizedMode =
          config.registration_mode === 'restricted' && recorders.length === 0
            ? 'open'
            : config.registration_mode;
        if (normalizedMode !== config.registration_mode) {
          console.warn('[LoginCodeEntry] registration mode overridden because no recorders found', {
            originalMode: config.registration_mode,
            overriddenMode: normalizedMode,
            branchId: result.branch.id,
          });
        }
        setRegistrationMode(normalizedMode);
        setRecorderOptions(recorders);
        if (recorders.length > 0) {
          setSelectedRecorderId(recorders[0].id);
        } else {
          setSelectedRecorderId('');
        }
        setUseExistingRecorder(normalizedMode === 'open' ? false : true);
        setNewRecorderName('');
        if (config.registration_mode === 'restricted' && recorders.length === 0) {
          setError('登録制限ですが登録者が未登録のため、この端末では自由登録モードで表示しています。');
        }
      } else if (result.reason === 'unauthorized') {
        setError('ログインコード認証の設定エラーです（Functionが401）。管理者に連絡してください。');
      } else if (result.reason === 'server_error') {
        setError('ログインコード認証サーバーでエラーが発生しました。時間をおいて再試行してください。');
      } else {
        setError('無効なコードです。コードを確認してもう一度お試しください。');
      }
    } catch (e) {
      console.error('[LoginCodeEntry] failed to fetch recorder data after code validation', e);
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

  const handleEnterStore = async () => {
    if (!validatedBranch) return;
    const normalizedDeviceName = deviceName.trim();
    if (!normalizedDeviceName) {
      setError('端末名を入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const canSyncToSupabase = hasSupabaseEnvConfigured();
      const deviceId = await getOrCreateDeviceId();
      let selectedRecorder = recorderOptions.find((item) => item.id === selectedRecorderId) ?? null;

      if ((registrationMode !== 'open' || useExistingRecorder) && !selectedRecorder && recorderOptions.length > 0) {
        selectedRecorder = recorderOptions[0];
        setSelectedRecorderId(recorderOptions[0].id);
      }

      if (registrationMode === 'open' && !useExistingRecorder) {
        const newName = newRecorderName.trim();
        if (!newName) {
          setError('自分の名前を入力してください');
          return;
        }
        const created = await createBranchRecorder(validatedBranch.id, newName, '', 1, canSyncToSupabase);
        if (!created.ok) {
          setError(created.reason === 'duplicate' ? '同名の登録者が既に存在します' : '登録者の作成に失敗しました');
          setRecorderOptions(created.recorders);
          return;
        }
        setRecorderOptions(created.recorders);
        selectedRecorder = created.recorders.find((item) => item.recorder_name === newName) ?? null;
        if (selectedRecorder) {
          setSelectedRecorderId(selectedRecorder.id);
        }
      } else {
        if (!selectedRecorder) {
          setError('登録者を選択してください');
          return;
        }
      }

      if (!selectedRecorder) {
        setError('登録者の解決に失敗しました。もう一度お試しください。');
        return;
      }

      await saveDefaultExpenseRecorder(validatedBranch.id, selectedRecorder.recorder_name);
      await registerRecorderAccess(
        {
          branchId: validatedBranch.id,
          recorderId: selectedRecorder.id,
          recorderName: selectedRecorder.recorder_name,
          deviceId,
          deviceName: normalizedDeviceName,
        },
        canSyncToSupabase,
      );

      console.log('[LoginCodeEntry] recorder data resolved, proceeding to store', {
        branchId: validatedBranch.id,
        branchCode: validatedBranch.branch_code,
        registrationMode,
        selectedRecorderId: selectedRecorder.id,
        selectedRecorderName: selectedRecorder.recorder_name,
        deviceName: normalizedDeviceName,
      });

      enterWithLoginCode(validatedBranch, code.toUpperCase().trim());
    } catch (e) {
      console.error('[LoginCodeEntry] failed before entering store', e);
      setError('登録者情報の保存に失敗しました。通信状況を確認してください。');
    } finally {
      setLoading(false);
    }
  };

  const selectedRecorderName =
    recorderOptions.find((item) => item.id === selectedRecorderId)?.recorder_name ?? '';
  const selectedRecorder = recorderOptions.find((item) => item.id === selectedRecorderId) ?? null;
  const hasMultipleGroups = new Set(recorderOptions.map((item) => item.group_id)).size > 1;
  const canSubmit =
    !loading &&
    !!deviceName.trim() &&
    (
      registrationMode === 'restricted' ||
      useExistingRecorder ||
      !!newRecorderName.trim()
    ) &&
    (
      (registrationMode === 'open' && !useExistingRecorder) ||
      !!selectedRecorderId
    );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 justify-center p-6">
        <TouchableOpacity onPress={onBack} className="absolute top-4 left-4 z-10 p-2">
          <Text className="text-blue-600 text-base">&larr; 戻る</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-center text-gray-900 mb-2">
          {validatedBranch ? '登録者と端末設定' : 'ログインコード'}
        </Text>
        <Text className="text-gray-500 text-center mb-8">
          {validatedBranch
            ? `${validatedBranch.branch_code} - ${validatedBranch.branch_name}`
            : '店舗のログインコード（6文字）を入力してください'}
        </Text>

        {error && (
          <Card className="bg-red-50 border-red-200 mb-4">
            <Text className="text-red-700 text-center text-sm">{error}</Text>
          </Card>
        )}

        {!validatedBranch ? (
          <>
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
                <Text className="text-white font-bold text-lg">次へ</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {registrationMode === 'open' && (
              <Card className="mb-3">
                <Text className="text-gray-700 text-sm mb-2">登録方法</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setUseExistingRecorder(false);
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 ${
                      !useExistingRecorder ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-300'
                    }`}
                    activeOpacity={0.8}
                  >
                    <Text className={`text-center text-sm font-semibold ${!useExistingRecorder ? 'text-white' : 'text-gray-700'}`}>
                      自分で名前入力
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setUseExistingRecorder(true);
                      if (!selectedRecorderId && recorderOptions.length > 0) {
                        setSelectedRecorderId(recorderOptions[0].id);
                      }
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 ${
                      useExistingRecorder ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-300'
                    }`}
                    activeOpacity={0.8}
                  >
                    <Text className={`text-center text-sm font-semibold ${useExistingRecorder ? 'text-white' : 'text-gray-700'}`}>
                      既存登録者を使う
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}

            {registrationMode === 'open' && !useExistingRecorder ? (
              <>
                <Text className="text-gray-600 text-sm mb-1">自分の名前</Text>
                <TextInput
                  value={newRecorderName}
                  onChangeText={(text) => {
                    setNewRecorderName(text);
                    setError(null);
                  }}
                  placeholder="例：山田 太郎"
                  className="bg-white border-2 border-gray-300 rounded-xl px-4 py-4 text-base text-gray-900 mb-4"
                />
              </>
            ) : (
              <>
                <Text className="text-gray-600 text-sm mb-1">
                  {registrationMode === 'open' ? 'すでに登録している人（選択）' : '登録者'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowRecorderModal(true)}
                  activeOpacity={0.8}
                  className="bg-white border-2 border-gray-300 rounded-xl px-4 py-4 mb-4"
                >
                  <Text className={`${selectedRecorderName ? 'text-gray-900' : 'text-gray-400'} text-base`}>
                    {selectedRecorder
                      ? `${hasMultipleGroups ? `G${selectedRecorder.group_id} ` : ''}${selectedRecorder.recorder_name}`
                      : '登録者を選択してください'}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">タップして選択</Text>
                </TouchableOpacity>
                {recorderOptions.length === 0 ? (
                  <Text className="text-amber-600 text-xs mb-3">
                    既存の登録者がまだありません。自分で名前入力を利用してください。
                  </Text>
                ) : null}
              </>
            )}

            <Text className="text-gray-600 text-sm mb-1">端末名</Text>
            <TextInput
              value={deviceName}
              onChangeText={(text) => {
                setDeviceName(text);
                setError(null);
              }}
              placeholder="例：iPhone-レジ前"
              className="bg-white border-2 border-gray-300 rounded-xl px-4 py-4 text-base text-gray-900 mb-4"
            />

            <TouchableOpacity
              onPress={handleEnterStore}
              disabled={!canSubmit}
              activeOpacity={0.8}
              className={`rounded-xl py-4 items-center ${
                canSubmit
                  ? 'bg-blue-600'
                  : 'bg-gray-300'
              }`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-lg">店舗画面へ進む</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setValidatedBranch(null);
                setSelectedRecorderId('');
                setRecorderOptions([]);
                setDeviceName('');
                setNewRecorderName('');
                setUseExistingRecorder(false);
                setError(null);
              }}
              className="mt-3 items-center"
            >
              <Text className="text-gray-500 text-sm">コード入力に戻る</Text>
            </TouchableOpacity>
          </>
        )}

        <Text className="text-gray-400 text-center text-xs mt-6">
          {validatedBranch
            ? '登録者と端末名はアクセス履歴として店舗設定に保存されます'
            : 'ログインコードは店舗の管理者から共有されます'}
        </Text>
      </View>

      <Modal visible={showRecorderModal} onClose={() => setShowRecorderModal(false)} title="登録者を選択">
        {recorderOptions.length === 0 ? (
          <Text className="text-gray-500 text-sm">
            登録者がまだ設定されていません。店舗の「設定 ＞ 登録者設定」で登録してください。
          </Text>
        ) : (
          <View className="gap-2">
            {recorderOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  setSelectedRecorderId(item.id);
                  setShowRecorderModal(false);
                  setError(null);
                }}
                activeOpacity={0.8}
                className={`rounded-lg border px-3 py-3 ${
                  selectedRecorderId === item.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                }`}
              >
                <Text className={`font-semibold ${selectedRecorderId === item.id ? 'text-blue-700' : 'text-gray-800'}`}>
                  {hasMultipleGroups ? `G${item.group_id} ` : ''}{item.recorder_name}
                </Text>
                {item.note ? <Text className="text-gray-500 text-xs mt-0.5">{item.note}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};
