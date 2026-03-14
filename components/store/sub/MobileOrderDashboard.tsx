import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Header } from '../../common';
import type { Branch } from '../../../types/database';

interface MobileOrderDashboardProps {
  branch: Branch;
  onBack: () => void;
}

export const MobileOrderDashboard = ({ branch, onBack }: MobileOrderDashboardProps) => {
  const [copyDone, setCopyDone] = useState(false);

  const mobileOrderUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
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
          <Text className="text-rose-700 font-bold text-base mb-2">客向け注文QRコード</Text>
          <Text className="text-gray-600 text-xs mb-3">
            お客様はQR読み取り後に注文申請を行います。会計確定はレジで行ってください。
          </Text>

          {qrImageUrl ? (
            <View className="items-center mb-3">
              <Image source={{ uri: qrImageUrl }} style={{ width: 220, height: 220 }} />
            </View>
          ) : null}

          {mobileOrderUrl ? (
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
