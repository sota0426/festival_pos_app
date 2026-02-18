import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header, Button, Input, Modal } from '../common';
import { getStoreSettings, saveStoreSettings, saveAdminPassword, verifyAdminPassword, clearAllPendingTransactions, saveBranch, getRestrictions, saveRestrictions } from '../../lib/storage';
import { alertConfirm, alertNotify } from '../../lib/alertUtils';
import type { Branch, PaymentMethodSettings, RestrictionSettings } from '../../types/database';
import { isSupabaseConfigured, supabase } from 'lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { LoginCodeEntry } from 'components/auth/LoginCodeEntry';

type TabKey = 'main' | 'sub' | 'budget' | 'settings';

interface StoreHomeProps {
  branch: Branch;
  onNavigateToRegister: () => void;
  onNavigateToMenus: () => void;
  onNavigateToHistory: () => void;
  onNavigateToCounter: () => void;
  onNavigateToOrderBoard: () => void;
  onNavigateToPrep: () => void;
  onNavigateToBudget: () => void;
  onNavigateToBudgetExpense: () => void;
  onNavigateToBudgetBreakeven: () => void;
  onBranchUpdated?: (branch: Branch) => void;
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
  onNavigateToOrderBoard,
  onNavigateToPrep,
  onNavigateToBudget,
  onNavigateToBudgetExpense,
  onNavigateToBudgetBreakeven,
  onBranchUpdated,
  onLogout,
}: StoreHomeProps) => {
  const { authState } = useAuth();
  const { isOrgPlan } = useSubscription();
  const [activeTab, setActiveTab] = useState<TabKey>('main');
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

  // Restriction management state
  const [restrictions, setRestrictions] = useState<RestrictionSettings>({
    menu_add: false, menu_edit: false, menu_delete: true,
    sales_cancel: false, sales_history: false, sales_reset: true,
    payment_change: false, settings_access: false,
  });
  const [showRestrictionsModal, setShowRestrictionsModal] = useState(false);

  // Admin guard modal state (generic password prompt for restricted operations)
  const [showAdminGuardModal, setShowAdminGuardModal] = useState(false);
  const [adminGuardInput, setAdminGuardInput] = useState('');
  const [adminGuardError, setAdminGuardError] = useState('');
  const [adminGuardCallback, setAdminGuardCallback] = useState<(() => void) | null>(null);
  const [switchableBranches, setSwitchableBranches] = useState<Branch[]>([]);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getStoreSettings();
      if (settings.sub_screen_mode) {
        setActiveTab('sub');
      }
      if (settings.payment_methods) {
        setPaymentMethods(settings.payment_methods);
      }
      const r = await getRestrictions();
      setRestrictions(r);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const refreshBranchName = async () => {
      if (!isSupabaseConfigured()) return;
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branch.id)
        .maybeSingle();
      if (error || !data) return;
      if (
        data.branch_name !== branch.branch_name ||
        data.password !== branch.password ||
        data.status !== branch.status
      ) {
        await saveBranch(data);
        onBranchUpdated?.(data);
      }
    };
    refreshBranchName();
  }, [branch.id, branch.branch_name, branch.password, branch.status, onBranchUpdated]);

  useEffect(() => {
    const loadSwitchableBranches = async () => {
      if (!isSupabaseConfigured() || !isOrgPlan || authState.status !== 'authenticated') {
        setSwitchableBranches([]);
        return;
      }

      const ownerId = authState.user.id;
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', ownerId)
        .order('branch_code', { ascending: true });

      if (error) {
        console.error('Failed to load switchable branches:', error);
        setSwitchableBranches([]);
        return;
      }
      setSwitchableBranches(data ?? []);
    };

    loadSwitchableBranches();
  }, [authState, isOrgPlan]);

  // --- Admin guard helpers ---
  const openAdminGuard = (onSuccess: () => void) => {
    setAdminGuardInput('');
    setAdminGuardError('');
    setAdminGuardCallback(() => onSuccess);
    setShowAdminGuardModal(true);
  };

  const closeAdminGuard = () => {
    setShowAdminGuardModal(false);
    setAdminGuardInput('');
    setAdminGuardError('');
    setAdminGuardCallback(null);
  };

  const handleAdminGuardSubmit = async () => {
    if (!adminGuardInput.trim()) {
      setAdminGuardError('管理者パスワードを入力してください');
      return;
    }
    const isValid = await verifyAdminPassword(adminGuardInput);
    if (!isValid) {
      setAdminGuardError('パスワードが正しくありません');
      return;
    }
    const cb = adminGuardCallback;
    closeAdminGuard();
    cb?.();
  };

  /** Check restriction and either run action immediately or show password modal */
  const withRestrictionCheck = (key: keyof RestrictionSettings, action: () => void) => {
    if (restrictions[key]) {
      openAdminGuard(action);
    } else {
      action();
    }
  };

  // --- Restriction setting toggle ---
  const toggleRestriction = async (key: keyof RestrictionSettings) => {
    const updated = { ...restrictions, [key]: !restrictions[key] };
    setRestrictions(updated);
    await saveRestrictions(updated);
  };

  const handleTabChange = async (tab: TabKey) => {
    if (tab === 'settings' && restrictions.settings_access && activeTab !== 'settings') {
      openAdminGuard(async () => {
        setActiveTab('settings');
        const currentSettings = await getStoreSettings();
        await saveStoreSettings({ ...currentSettings, sub_screen_mode: false });
      });
      return;
    }
    setActiveTab(tab);
    const currentSettings = await getStoreSettings();
    await saveStoreSettings({ ...currentSettings, sub_screen_mode: tab === 'sub' });
  };

  const togglePaymentMethod = async (key: keyof PaymentMethodSettings) => {
    const doToggle = async () => {
      const updated = { ...paymentMethods, [key]: !paymentMethods[key] };
      // Ensure at least one payment method is enabled
      if (!updated.cash && !updated.cashless && !updated.voucher) return;
      setPaymentMethods(updated);
      const currentSettings = await getStoreSettings();
      await saveStoreSettings({ ...currentSettings, payment_methods: updated });
    };
    if (restrictions.payment_change) {
      openAdminGuard(doToggle);
    } else {
      await doToggle();
    }
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
      const nextPassword = newPassword.trim();

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('branches')
          .update({ password: nextPassword })
          .eq('id', branch.id)
          .select('*')
          .single();
        if (error) throw error;
        if (!data) throw new Error('店舗データの更新に失敗しました');

        await saveBranch(data);
        onBranchUpdated?.(data);
      } else {
        const updatedBranch: Branch = { ...branch, password: nextPassword };
        await saveBranch(updatedBranch);
        onBranchUpdated?.(updatedBranch);
      }

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

  const handleBackToTop = () => {
      onLogout();
  };

  const currentBranchIndex = switchableBranches.findIndex((b) => b.id === branch.id);
  const canSwitchBranch = isOrgPlan && authState.status === 'authenticated' && switchableBranches.length > 1 && currentBranchIndex >= 0;

  const moveBranch = async (direction: -1 | 1) => {
    if (!canSwitchBranch) return;
    const nextIndex = (currentBranchIndex + direction + switchableBranches.length) % switchableBranches.length;
    const nextBranch = switchableBranches[nextIndex];
    if (!nextBranch) return;
    await saveBranch(nextBranch);
    onBranchUpdated?.(nextBranch);
  };

  const branchSwitcher = canSwitchBranch ? (
    <View className="flex-row items-center rounded-full border border-blue-200 bg-blue-50 px-1 py-0.5">
      <TouchableOpacity onPress={() => moveBranch(-1)} className="w-7 h-7 items-center justify-center rounded-full bg-white" activeOpacity={0.8}>
        <Text className="text-blue-700 font-bold">{'<'}</Text>
      </TouchableOpacity>
      <Text className="text-[11px] text-blue-700 font-semibold px-1.5">
        {currentBranchIndex + 1}/{switchableBranches.length}
      </Text>
      <TouchableOpacity onPress={() => moveBranch(1)} className="w-7 h-7 items-center justify-center rounded-full bg-white" activeOpacity={0.8}>
        <Text className="text-blue-700 font-bold">{'>'}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top']}>
      <Header
        title={branch.branch_name}
        titleLeftElement={branchSwitcher}
        subtitle={`支店番号: ${branch.branch_code}`}
        rightElement={
          <Button title="トップ画面" onPress={handleBackToTop} variant="secondary" size="sm" />
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

              <TouchableOpacity onPress={() => withRestrictionCheck('sales_history', onNavigateToHistory)} activeOpacity={0.8}>
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

            <TouchableOpacity onPress={onNavigateToCounter} activeOpacity={0.8}>
              <Card className="bg-purple-500 px-12 py-8">
                <Text className="text-white text-2xl  font-bold text-center">来客カウンター</Text>
                <Text className="text-purple-100 text-center mt-2">ボタンをタップして来場者数を記録</Text>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToPrep} activeOpacity={0.8}>
              <Card className="bg-rose-500 px-12 py-8">
                <Text className="text-white text-2xl font-bold text-center">調理の下準備</Text>
                <Text className="text-rose-100 text-center mt-2">材料登録・在庫共有を行う</Text>
              </Card>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'budget' && (
          <View className="flex-1 gap-4">

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

            <TouchableOpacity onPress={onNavigateToBudget} activeOpacity={0.8}>
              <Card className="bg-indigo-500 p-8">
                <Text className="text-white text-2xl  font-bold text-center">会計処理</Text>
                <Text className="text-indigo-100 text-center mt-2">予算設定・収支確認・報告書の作成</Text>
              </Card>
            </TouchableOpacity>


          </View>
        )}

        {activeTab === 'settings' && (
          <View className="gap-4">
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

            {/* Restriction Management */}
            <Card>
              <Text className="text-gray-900 text-lg font-bold mb-3">制限管理</Text>
              <Text className="text-gray-500 text-sm mb-3">
                チェックした操作は管理者パスワードが必要になります
              </Text>
              <Button
                title="制限を設定"
                onPress={() => setShowRestrictionsModal(true)}
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

      {/* Restrictions Management Modal */}
      <Modal
        visible={showRestrictionsModal}
        onClose={() => setShowRestrictionsModal(false)}
        title="制限管理"
      >
        <ScrollView style={{ maxHeight: 480 }}>
          <Text className="text-gray-500 text-sm mb-4">
            チェックした操作には管理者パスワードが必要になります
          </Text>

          {/* Menu Section */}
          <Text className="font-bold text-gray-700 mb-2">メニュー</Text>
          {([
            { key: 'menu_add' as const, label: 'メニューの追加', desc: '新しいメニュー項目の登録' },
            { key: 'menu_edit' as const, label: 'メニューの編集', desc: '既存メニューの価格・名前変更' },
            { key: 'menu_delete' as const, label: 'メニューの削除', desc: 'メニュー項目の削除' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Sales Section */}
          <Text className="font-bold text-gray-700 mb-2 mt-3">売上</Text>
          {([
            { key: 'sales_cancel' as const, label: '売上の取消（レジ返品）', desc: '販売済み注文のキャンセル' },
            { key: 'sales_history' as const, label: '売上履歴の閲覧', desc: '販売履歴画面へのアクセス' },
            { key: 'sales_reset' as const, label: '売上データの全削除', desc: '全売上データの削除' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Settings Section */}
          <Text className="font-bold text-gray-700 mb-2 mt-3">設定</Text>
          {([
            { key: 'payment_change' as const, label: '支払い方法の変更', desc: '現金/キャッシュレス/金券のON/OFF' },
            { key: 'settings_access' as const, label: '設定タブへのアクセス', desc: '設定タブ自体へのアクセス' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleRestriction(item.key)}
              activeOpacity={0.7}
              className={`flex-row items-center p-3 rounded-xl border-2 mb-2 ${
                restrictions[item.key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View
                className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
                  restrictions[item.key] ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}
              >
                {restrictions[item.key] && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-semibold">{item.label}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{item.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="mt-4">
          <Button
            title="閉じる"
            onPress={() => setShowRestrictionsModal(false)}
            variant="secondary"
          />
        </View>
      </Modal>

      {/* Admin Guard Modal (generic password prompt for restricted operations) */}
      <Modal
        visible={showAdminGuardModal}
        onClose={closeAdminGuard}
        title="管理者パスワード"
      >
        <Text className="text-gray-600 text-sm mb-3">
          この操作には管理者パスワードが必要です
        </Text>
        <Input
          label="パスワード"
          value={adminGuardInput}
          onChangeText={(text) => {
            setAdminGuardInput(text);
            setAdminGuardError('');
          }}
          secureTextEntry
          placeholder="管理者パスワードを入力"
          error={adminGuardError}
        />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button title="キャンセル" onPress={closeAdminGuard} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button
              title="確認"
              onPress={handleAdminGuardSubmit}
              disabled={!adminGuardInput.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
