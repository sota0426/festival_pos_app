import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { Button, Input, Card, Header, Modal } from '../common';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Branch } from '../../types/database';

interface BranchManagementProps {
  onBack: () => void;
}

export const BranchManagement = ({ onBack }: BranchManagementProps) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newSalesTarget, setNewSalesTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const generateBranchCode = (existingBranches: Branch[]): string => {
    const maxNumber = existingBranches.reduce((max, branch) => {
      const num = parseInt(branch.branch_code.replace('S', ''), 10);
      return num > max ? num : max;
    }, 0);
    return `S${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const fetchBranches = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      // Demo data when Supabase is not configured
      setBranches([
        {
          id: '1',
          branch_code: 'S001',
          branch_name: '焼きそば屋',
          sales_target: 50000,
          status: 'active',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          branch_code: 'S002',
          branch_name: 'たこ焼き屋',
          sales_target: 40000,
          status: 'active',
          created_at: new Date().toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('branch_code', { ascending: true });

      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      Alert.alert('エラー', '支店情報の取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) {
      Alert.alert('エラー', '模擬店名を入力してください');
      return;
    }

    setSaving(true);

    try {
      const newBranch: Branch = {
        id: uuidv4(),
        branch_code: generateBranchCode(branches),
        branch_name: newBranchName.trim(),
        sales_target: parseInt(newSalesTarget, 10) || 0,
        status: 'active',
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('branches').insert(newBranch);
        if (error) throw error;
      }

      setBranches([...branches, newBranch]);
      setShowAddModal(false);
      setNewBranchName('');
      setNewSalesTarget('');
      Alert.alert('成功', `支店番号 ${newBranch.branch_code} を発行しました`);
    } catch (error) {
      console.error('Error adding branch:', error);
      Alert.alert('エラー', '支店の追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (branch: Branch) => {
    const newStatus = branch.status === 'active' ? 'inactive' : 'active';

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('branches')
          .update({ status: newStatus })
          .eq('id', branch.id);
        if (error) throw error;
      }

      setBranches(
        branches.map((b) => (b.id === branch.id ? { ...b, status: newStatus } : b))
      );
    } catch (error) {
      console.error('Error updating branch status:', error);
      Alert.alert('エラー', 'ステータスの更新に失敗しました');
    }
  };

  const renderBranchItem = ({ item }: { item: Branch }) => (
    <Card className="mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-lg font-bold text-blue-600">{item.branch_code}</Text>
            <View
              className={`px-2 py-0.5 rounded-full ${
                item.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
              }`}
            >
              <Text
                className={`text-xs ${
                  item.status === 'active' ? 'text-green-700' : 'text-gray-500'
                }`}
              >
                {item.status === 'active' ? '稼働中' : '停止中'}
              </Text>
            </View>
          </View>
          <Text className="text-gray-900 font-medium mt-1">{item.branch_name}</Text>
          <Text className="text-gray-500 text-sm mt-1">
            目標: {item.sales_target.toLocaleString()}円
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleToggleStatus(item)}
          className={`px-3 py-2 rounded-lg ${
            item.status === 'active' ? 'bg-red-100' : 'bg-green-100'
          }`}
        >
          <Text
            className={`text-sm ${item.status === 'active' ? 'text-red-600' : 'text-green-600'}`}
          >
            {item.status === 'active' ? '停止' : '再開'}
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <Header
        title="支店管理"
        subtitle={`登録済み: ${branches.length}店舗`}
        showBack
        onBack={onBack}
        rightElement={
          <Button title="+ 新規登録" onPress={() => setShowAddModal(true)} size="sm" />
        }
      />

      <FlatList
        data={branches}
        renderItem={renderBranchItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            fetchBranches();
          }} />
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">支店が登録されていません</Text>
          </View>
        }
      />

      <Modal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="新規支店登録"
      >
        <Text className="text-gray-500 text-sm mb-4">
          支店番号は自動で発行されます
        </Text>

        <Input
          label="模擬店名"
          value={newBranchName}
          onChangeText={setNewBranchName}
          placeholder="例: 焼きそば屋"
        />

        <Input
          label="売上目標（円）"
          value={newSalesTarget}
          onChangeText={setNewSalesTarget}
          placeholder="例: 50000"
          keyboardType="numeric"
        />

        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Button
              title="キャンセル"
              onPress={() => setShowAddModal(false)}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <Button
              title="登録"
              onPress={handleAddBranch}
              loading={saving}
              disabled={!newBranchName.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
