import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button, Input, Modal } from '../common';
import { clearBranch, getPendingTransactions, getStoreSettings, saveStoreSettings, getAdminPassword, saveAdminPassword, verifyAdminPassword, clearAllPendingTransactions } from '../../lib/storage';
import { alertConfirm, alertNotify } from '../../lib/alertUtils';
import type { Branch, PaymentMethodSettings } from '../../types/database';
import { isSupabaseConfigured, supabase } from 'lib/supabase';

type TabKey = 'main' | 'sub' | 'budget' | 'settings';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToAutoCounter:()=>void;
  onNavigateToOrderBoard: () => void;
  onNavigateToBudget: () => void;
  onNavigateToBudgetExpense: () => void;
  onNavigateToBudgetBreakeven: () => void;
  onLogout: () => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'main', label: 'メイン画面' },
  { key: 'sub', label: 'サブ画面' },
  { key: 'budget', label: '予算管理' },
  { key: 'settings', label: '設定' },
];

export const StoreHome = ({
  branch,
  onNavigateToRegister,
  onNavigateToMenus,
  onNavigateToHistory,
  onNavigateToCounter,
  onNavigateToAutoCounter,
  onNavigateToOrderBoard,
  onNavigateToBudget,
  onNavigateToBudgetExpense,
  onNavigateToBudgetBreakeven,
  onLogout,
}: StoreHomeProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('main');
  const [currentSales, setCurrentSales] = useState(0);
  const [loadingSales, setLoadingSales] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSettings>({
    cash: false,
    cashless: true,
    voucher: true,
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      if (settings.sub_screen_mode) {
        setActiveTab('sub');
      }
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const pending = await getPendingTransactions();
        const localSales = pending
          .filter((t) => t.branch_id === branch.id)
          .reduce((sum, t) => sum + t.total_amount, 0);

        if (!isSupabaseConfigured()) {
          setCurrentSales(localSales);
          return;
        }

        const { data, error } = await supabase
          .from('transactions')
          .select('total_amount')
          .eq('branch_id', branch.id)
          .eq('status', 'completed');

        if (error) throw error;

        const remoteSales =
          data?.reduce((sum, t) => sum + t.total_amount, 0) ?? 0;

        setCurrentSales(remoteSales + localSales);
      } catch (e) {
        console.error('売上取得失敗', e);
      } finally {
        setLoadingSales(false);
      }
    };

    fetchSales();
  }, [branch.id]);

  const achievementRate =
    branch.sales_target > 0
      ?  Math.floor((currentSales / branch.sales_target) * 100)
      : 0 ;

  const handleTabChange = async (tab: TabKey) => {
    setActiveTab(tab);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, sub_screen_mode: tab === 'sub' });
  };

  const togglePaymentMethod = async (key: keyof PaymentMethodSettings) => {
    const updated = { ...paymentMethods, [key]: !paymentMethods[key] };
    // Ensure at least one payment method is enabled
    if (!updated.cash && !updated.cashless && !updated.voucher) return;
    setPaymentMethods(updated);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, payment_methods: updated });
  };

  const resetPasswordForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      setPasswordError('新しいパスワードを入力してください');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('パスワードは4文字以上で設定してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('新しいパスワードが一致しません');
      return;
    }

    setSavingPassword(true);
    try {
      await saveAdminPassword(newPassword);
      setShowPasswordModal(false);
      resetPasswordForm();
      alertNotify('完了', '管理者パスワードを変更しました');
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('パスワードの変更に失敗しました');
    } finally {
      setSavingPassword(false);
    }
  };

  const executeResetSales = async () => {
    setResetting(true);
    try {
      // Delete from Supabase if configured
      if (isSupabaseConfigured()) {
        const { error: itemsError } = await supabase
          .from('transaction_items')
          .delete()
          .in(
            'transaction_id',
            (await supabase.from('transactions').select('id').eq('branch_id', branch.id)).data?.map((t) => t.id) ?? []
          );
        if (itemsError) console.error('Error deleting transaction items:', itemsError);

        const { error: transError } = await supabase
          .from('transactions')
          .delete()
          .eq('branch_id', branch.id);
        if (transError) console.error('Error deleting transactions:', transError);
      }

      // Delete local pending transactions
      await clearAllPendingTransactions(branch.id);

      // Reset current sales display
      setCurrentSales(0);

      setShowResetModal(false);
      setAdminPasswordInput('');
      setResetError('');
      alertNotify('完了', '売上データを全件削除しました');
    } catch (error) {
      console.error('Error resetting sales:', error);
      setResetError('売上データの削除に失敗しました');
    } finally {
      setResetting(false);
    }
  };

  const handleResetSales = async () => {
    if (!adminPasswordInput.trim()) {
      setResetError('管理者パスワードを入力してください');
      return;
    }

    const isValid = await verifyAdminPassword(adminPasswordInput);
    if (!isValid) {
      setResetError('パスワードが正しくありません');
      return;
    }

    // Final confirmation
    alertConfirm(
      '最終確認',
      'この操作は取り消せません。本当に売上データを全件削除しますか？',
      executeResetSales,
      '削除する',
    );
  };

  const handleLogout = () => {
    alertConfirm('ログアウト', 'ログアウトしますか？', async () => {
      await clearBranch();
      onLogout();
    }, 'ログアウト');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title={branch.branch_name}
        subtitle={`支店番号: ${branch.branch_code}`}
        rightElement={
          <Button title="ログアウト" onPress={handleLogout} variant="secondary" size="sm" />
        }
      />

      {/* Tab Bar */}
      <View className="flex-row bg-white border-b border-gray-200">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => handleTabChange(tab.key)}
            activeOpacity={0.7}
            className={`flex-1 py-3 items-center border-b-2 ${
              activeTab === tab.key ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                activeTab === tab.key ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1 }}>
        {activeTab === 'main' && (
          <View className="flex-1 gap-4">

            <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.8}>
              <Card className="bg-sky-400 p-8">
                <Text className="text-white text-2xl  font-bold text-center">レジ</Text>
                <Text className="text-blue-100 text-center mt-2">注文・会計を行う</Text>
              </Card>
            </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToMenus} activeOpacity={0.8}>
                <Card className="bg-green-400 p-6">
                  <Text className="text-white text-2xl  font-bold text-center">メニュー登録</Text>
                  <Text className="text-green-100 text-center mt-2">商品・在庫管理</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToHistory} activeOpacity={0.8}>
                <Card className="bg-orange-400 p-6">
                  <Text className="text-white text-2xl  font-bold text-center">販売履歴</Text>
                  <Text className="text-orange-100 text-center mt-2">売上確認・取消</Text>
                </Card>
              </TouchableOpacity>

          </View>
        )}

        {activeTab === 'sub' && (
          <View className="flex-1 gap-4">

            <TouchableOpacity onPress={onNavigateToOrderBoard} activeOpacity={0.8}>
              <Card className="bg-orange-400 p-8">
                <Text className="text-white text-2xl  font-bold text-center">注文受付</Text>
                <Text className="text-amber-100 text-center mt-2">別端末で注文を表示・管理</Text>
              </Card>
            </TouchableOpacity>

            <View className='flex-row justify-between'>
              <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
                <Card className="bg-purple-500 px-12 py-8">
                  <Text className="text-white text-2xl  font-bold text-center">来客カウンター</Text>
                  <Text className="text-purple-100 text-center mt-2">ボタンをタップして来場者数を記録</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity onPress={onNavigateToAutoCounter} activeOpacity={0.8}>
                <Card className="bg-slate-500 p-8">
                  <Text className="text-white text-2xl  font-bold text-center">自動集計カウンター</Text>
                  <Text className="text-purple-100 text-center mt-2">カメラを起動して自動で来場者数を集計</Text>
                </Card>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'budget' && (
          <View className="flex-1 gap-4">
            <TouchableOpacity onPress={onNavigateToBudget} activeOpacity={0.8}>
              <Card className="bg-indigo-500 p-8">
                <Text className="text-white text-2xl  font-bold text-center">予算管理</Text>
                <Text className="text-indigo-100 text-center mt-2">予算設定・ダッシュボード・報告書</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToBudgetExpense} activeOpacity={0.8}>
              <Card className="bg-emerald-500 p-8">
                <Text className="text-white text-2xl  font-bold text-center">支出記録</Text>
                <Text className="text-emerald-100 text-center mt-2">予算管理とは別担当が支出を入力</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToBudgetBreakeven} activeOpacity={0.8}>
              <Card className="bg-violet-500 p-8">
                <Text className="text-white text-2xl  font-bold text-center">損益分岐点の計算</Text>
                <Text className="text-violet-100 text-center mt-2">価格・原価から必要販売数を試算</Text>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'settings' && (
          <View className="gap-4">
            {/* Sales Status */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">売上状況</Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-gray-500 text-sm">売上目標</Text>
                  <Text className="text-lg font-bold text-gray-900">
                    {branch.sales_target > 0 ? `${branch.sales_target.toLocaleString()}円` : '未設定'}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    現在売上：{currentSales.toLocaleString()}円
                  </Text>
                  {branch.sales_target > 0 && (
                    <Text className="text-sm text-blue-600 font-medium">
                      達成率：{achievementRate}%
                    </Text>
                  )}
                </View>
                <View
                  className={`px-3 py-1 rounded-full ${
                    branch.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`font-medium ${
                      branch.status === 'active' ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {branch.status === 'active' ? '稼働中' : '停止中'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Payment Method Settings */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">支払い設定</Text>
              <Text className="text-gray-500 text-sm mb-3">
                レジ画面に表示する支払い方法を選択してください
              </Text>
              <View className="gap-3">
                {/* Cash */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cash')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.cash ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.cash ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.cash && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">現金</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">テンキーで金額入力・お釣り計算</Text>
                  </View>
                </TouchableOpacity>

                {/* Cashless */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('cashless')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.cashless ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.cashless ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.cashless && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">キャッシュレス</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">PayPay等の電子決済</Text>
                  </View>
                </TouchableOpacity>

                {/* Voucher */}
                <TouchableOpacity
                  onPress={() => togglePaymentMethod('voucher')}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-4 rounded-xl border-2 ${
                    paymentMethods.voucher ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View
                    className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                      paymentMethods.voucher ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                    }`}
                  >
                    {paymentMethods.voucher && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold">金券</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">金券・チケットでの支払い</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Card>

            {/* Admin Password Settings */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">管理者パスワード</Text>
              <Text className="text-gray-500 text-sm mb-3">
                売上データ全削除などの操作に必要なパスワードです
              </Text>
              <Button
                title="パスワードを変更"
                onPress={() => {
                  resetPasswordForm();
                  setShowPasswordModal(true);
                }}
                variant="secondary"
              />
            </Card>

            {/* Reset Sales Data */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">売上データ全削除</Text>
              <Text className="text-gray-500 text-sm mb-3">
                この店舗の売上データを全件削除します。この操作は取り消せません。
              </Text>
              <Button
                title="売上データを全削除"
                onPress={() => {
                  setAdminPasswordInput('');
                  setResetError('');
                  setShowResetModal(true);
                }}
                variant="danger"
              />
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          resetPasswordForm();
        }}
        title="管理者パスワード変更"
      >
        <Input
          label="新しいパスワード"
          value={newPassword}
          onChangeText={(text) => {
            setNewPassword(text);
            setPasswordError('');
          }}
          placeholder="4文字以上"
        />
        <Input
          label="新しいパスワード（確認）"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            setPasswordError('');
          }}
          placeholder="もう一度入力"
          error={passwordError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowPasswordModal(false);
                resetPasswordForm();
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="変更"
              onPress={handleChangePassword}
              loading={savingPassword}
              disabled={!newPassword.trim() || !confirmPassword.trim()}
            />
          </View>
        </View>
      </Modal>

      {/* Reset Sales Modal */}
      <Modal
        visible={showResetModal}
        onClose={() => {
          setShowResetModal(false);
          setAdminPasswordInput('');
          setResetError('');
        }}
        title="売上データ全削除"
      >
        <View className="bg-red-50 p-3 rounded-lg mb-4">
          <Text className="text-red-700 text-sm font-medium text-center">
            この操作は取り消せません
          </Text>
          <Text className="text-red-600 text-xs text-center mt-1">
            全ての売上データが完全に削除されます
          </Text>
        </View>
        <Input
          label="管理者パスワード"
          value={adminPasswordInput}
          onChangeText={(text) => {
            setAdminPasswordInput(text);
            setResetError('');
          }}
          placeholder="パスワードを入力（デフォルト: 0000）"
          secureTextEntry
          error={resetError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => {
                setShowResetModal(false);
                setAdminPasswordInput('');
                setResetError('');
              }}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="全削除"
              onPress={handleResetSales}
              variant="danger"
              loading={resetting}
              disabled={!adminPasswordInput.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
