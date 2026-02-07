import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button, Input, Modal } from '../common';
import { getStoreSettings, saveStoreSettings, saveBranch } from '../../lib/storage';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { alertNotify } from '../../lib/alertUtils';
import type { Branch, PaymentMode } from '../../types/database';

interface StoreSettingsProps {
  branch: Branch;
  onBack: () => void;
  onBranchUpdate?: (branch: Branch) => void;
}

export const StoreSettings = ({ branch, onBack, onBranchUpdate }: StoreSettingsProps) => {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cashless');
  const [saving, setSaving] = useState(false);
  const [servingEnabled, setServingEnabled] = useState(false);

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      setPaymentMode(settings.payment_mode);
      setServingEnabled(settings.serving_management_enabled ?? false);
    };
    loadSettings();
  }, []);

  const handleSave = async (mode: PaymentMode) => {
    setSaving(true);
    setPaymentMode(mode);
    await saveStoreSettings({ payment_mode: mode, serving_management_enabled: servingEnabled });
    setSaving(false);
  };

  const handleServingToggle = async (value: boolean) => {
    setServingEnabled(value);
    await saveStoreSettings({ payment_mode: paymentMode, serving_management_enabled: value });
  };

  const handlePasswordChange = async () => {
    // Validate current password
    if (currentPassword !== branch.password) {
      alertNotify('エラー', '現在のパスワードが正しくありません');
      return;
    }

    // Validate new password
    if (newPassword.length < 4) {
      alertNotify('エラー', '新しいパスワードは4文字以上で入力してください');
      return;
    }

    if (newPassword !== confirmPassword) {
      alertNotify('エラー', '新しいパスワードが一致しません');
      return;
    }

    setPasswordSaving(true);
    try {
      // Update in Supabase if configured
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('branches')
          .update({ password: newPassword })
          .eq('id', branch.id);

        if (error) throw error;
      }

      // Update local branch data
      const updatedBranch: Branch = { ...branch, password: newPassword };
      await saveBranch(updatedBranch);

      // Notify parent
      if (onBranchUpdate) {
        onBranchUpdate(updatedBranch);
      }

      // Close modal and reset fields
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      alertNotify('完了', 'パスワードを変更しました');
    } catch (error) {
      console.error('Error changing password:', error);
      alertNotify('エラー', 'パスワードの変更に失敗しました');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="設定"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      <View className="flex-1 p-4">
        {/* Payment Mode */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-4">支払い方法の設定</Text>

          <TouchableOpacity
            onPress={() => handleSave('cashless')}
            className={`p-4 rounded-xl mb-3 border-2 ${
              paymentMode === 'cashless'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center">
              <View
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  paymentMode === 'cashless' ? 'border-blue-500' : 'border-gray-300'
                }`}
              >
                {paymentMode === 'cashless' && (
                  <View className="w-3 h-3 rounded-full bg-blue-500" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">キャッシュレス対応</Text>
                <Text className="text-gray-500 text-sm mt-1">
                  PayPay・金券のみ対応（現金不可）
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSave('cash')}
            className={`p-4 rounded-xl border-2 ${
              paymentMode === 'cash'
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white'
            }`}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center">
              <View
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  paymentMode === 'cash' ? 'border-green-500' : 'border-gray-300'
                }`}
              >
                {paymentMode === 'cash' && (
                  <View className="w-3 h-3 rounded-full bg-green-500" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">現金対応</Text>
                <Text className="text-gray-500 text-sm mt-1">
                  現金・PayPay・金券に対応（テンキー入力可能）
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Serving Management Toggle */}
        <Card className="mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-lg font-bold text-gray-900">提供管理</Text>
              <Text className="text-gray-500 text-sm mt-1">
                注文と提供が分かれている場合に、提供状況を管理できます
              </Text>
            </View>
            <Switch
              value={servingEnabled}
              onValueChange={handleServingToggle}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor={servingEnabled ? '#FFFFFF' : '#F9FAFB'}
            />
          </View>
        </Card>

        {/* Password Change */}
        <Card className="mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-2">パスワード変更</Text>
          <Text className="text-gray-500 text-sm mb-4">
            模擬店のログインパスワードを変更します
          </Text>
          <Button
            title="パスワードを変更する"
            onPress={() => setShowPasswordModal(true)}
            variant="secondary"
          />
        </Card>

        <Card className="bg-blue-50">
          <Text className="text-blue-700 text-sm">
            {paymentMode === 'cashless'
              ? '現在「キャッシュレス対応」が選択されています。レジ画面でPayPayと金券のボタンが表示されます。'
              : '現在「現金対応」が選択されています。レジ画面で現金ボタンが追加され、テンキーで金額入力ができます。'}
          </Text>
        </Card>
      </View>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }}
        title="パスワード変更"
      >
        <Input
          label="現在のパスワード"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="現在のパスワードを入力"
          secureTextEntry
        />
        <Input
          label="新しいパスワード"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="新しいパスワードを入力（4文字以上）"
          secureTextEntry
        />
        <Input
          label="新しいパスワード（確認）"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="新しいパスワードを再入力"
          secureTextEntry
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowPasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="変更する"
              onPress={handlePasswordChange}
              loading={passwordSaving}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
