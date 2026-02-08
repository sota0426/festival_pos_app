import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button } from '../common';
import { getStoreSettings, saveStoreSettings } from '../../lib/storage';
import type { Branch, PaymentMode } from '../../types/database';

interface StoreSettingsProps {
  branch: Branch;
  onBack: () => void;
}
export const StoreSettings = ({ branch, onBack }: StoreSettingsProps) => {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cashless');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      setPaymentMode(settings.payment_mode);
    };
    loadSettings();
  }, []);

  const handleSave = async (mode: PaymentMode) => {
    setSaving(true);
    setPaymentMode(mode);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, payment_mode: mode });
    setSaving(false);
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

        <Card className="bg-blue-50">
          <Text className="text-blue-700 text-sm">
            {paymentMode === 'cashless'
              ? '現在「キャッシュレス対応」が選択されています。レジ画面でPayPayと金券のボタンが表示されます。'
              : '現在「現金対応」が選択されています。レジ画面で現金ボタンが追加され、テンキーで金額入力ができます。'}
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
};
