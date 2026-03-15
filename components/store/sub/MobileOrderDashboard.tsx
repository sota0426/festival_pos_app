import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header } from '../../common';
import { useAuth } from '../../../contexts/AuthContext';
import { resolveDemoBranchId } from '../../../data/demoData';
import type { Branch } from '../../../types/database';

interface MobileOrderDashboardProps {
  branch: Branch;
  onBack: () => void;
  onOpenDemoClient?: () => void;
}

export const MobileOrderDashboard = ({ branch, onBack, onOpenDemoClient }: MobileOrderDashboardProps) => {
  const { authState } = useAuth();
  const [copyDone, setCopyDone] = useState(false);
  const isDemo = authState.status === 'demo';
  const demoBranchId = useMemo(() => resolveDemoBranchId(branch), [branch]);

  const mobileOrderUrl =
    !isDemo && Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?mobile_order=1&branch=${encodeURIComponent(branch.id)}`
      : null;
  const qrImageUrl = mobileOrderUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(mobileOrderUrl)}`
    : null;

  return (
    <SafeAreaView className="flex-1 bg-rose-50" edges={['top']}>
      <Header
        title="モバイルオーダー"
        subtitle={`${branch.branch_code} - ${branch.branch_name}`}
        showBack
        onBack={onBack}
      />

      <View className="flex-1 px-4 pt-4">
        <Card className="bg-white border border-rose-200 p-4">
          <Text className="text-rose-700 font-bold text-base mb-2">
            {isDemo ? 'モバイルオーダーのデモ表示' : '客向け注文QRコード'}
          </Text>
          <Text className="text-gray-600 text-xs mb-3">
            {isDemo
              ? 'デモではURL発行や注文保存は行わず、見え方だけを確認できます。'
              : 'お客様はQR読み取り後に注文申請を行います。会計確定はレジで行ってください。'}
          </Text>

          {isDemo ? (
            <View className="items-center mb-3">
              <View className="h-[220px] w-[220px] items-center justify-center rounded-3xl border-2 border-dashed border-rose-300 bg-rose-50 px-6">
                <Text className="text-5xl">QR</Text>
                <Text className="mt-3 text-center text-sm font-bold text-rose-800">
                  デモ用QRイメージ
                </Text>
                <Text className="mt-2 text-center text-xs leading-5 text-rose-700">
                  {demoBranchId ? `${branch.branch_name} の注文画面を模擬表示します` : 'デモ店舗を読み込めませんでした'}
                </Text>
              </View>
            </View>
          ) : qrImageUrl ? (
            <View className="items-center mb-3">
              <Image source={{ uri: qrImageUrl }} style={{ width: 220, height: 220 }} />
            </View>
          ) : null}

          {isDemo ? (
            <>
              <View className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
                <Text className="text-xs font-semibold text-rose-800">デモで確認できること</Text>
                <Text className="mt-1 text-xs leading-5 text-rose-700">
                  注文画面の見え方、商品選択、注文完了イメージまでをこの端末で体験できます。
                </Text>
              </View>
              <TouchableOpacity
                onPress={onOpenDemoClient}
                disabled={!onOpenDemoClient || !demoBranchId}
                activeOpacity={0.8}
                className={`mt-3 rounded-lg py-3 ${!onOpenDemoClient || !demoBranchId ? 'bg-gray-300' : 'bg-rose-500'}`}
              >
                <Text className="text-white text-center font-semibold">
                  ダミーの注文画面を開く
                </Text>
              </TouchableOpacity>
            </>
          ) : mobileOrderUrl ? (
            <>
              <Text className="text-[11px] text-gray-500 mb-2" numberOfLines={2}>
                {mobileOrderUrl}
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    await navigator.clipboard.writeText(mobileOrderUrl);
                    setCopyDone(true);
                    setTimeout(() => setCopyDone(false), 1600);
                  }
                }}
                activeOpacity={0.8}
                className="bg-rose-500 rounded-lg py-2.5"
              >
                <Text className="text-white text-center font-semibold">
                  {copyDone ? 'コピーしました' : '注文URLをコピー'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = mobileOrderUrl;
                  }
                }}
                activeOpacity={0.8}
                className="mt-2 bg-indigo-600 rounded-lg py-2.5"
              >
                <Text className="text-white text-center font-semibold">
                  この端末でモバイルオーダーに進む
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text className="text-gray-500 text-xs">Web版でURL表示・コピーが利用できます。</Text>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
};
