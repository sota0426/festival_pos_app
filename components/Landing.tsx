import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from './common';

interface LandingProps {
  onNavigateToDemo: () => void;
  onNavigateToAuth: () => void;
  onNavigateToLoginCode: () => void;
}

export const Landing = ({
  onNavigateToDemo,
  onNavigateToAuth,
  onNavigateToLoginCode,
}: LandingProps) => {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="flex-grow justify-center p-6">
        <View className="items-center mb-8">
          <Text className="text-4xl font-bold text-gray-900 mb-2">
            文化祭レジアプリ
          </Text>
          <Text className="text-gray-500 text-center text-base">
            模擬店のレジ操作・売上管理・本部ダッシュボードをこれひとつで
          </Text>
        </View>

        <View className="gap-4 mb-10">
          <TouchableOpacity onPress={onNavigateToDemo} activeOpacity={0.8}>
            <Card className="bg-green-500 p-6">
              <Text className="text-white text-xl font-bold text-center">
                デモを試す
              </Text>
              <Text className="text-green-100 text-center mt-1 text-sm">
                ダミーデータで操作を体験（登録不要）
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToAuth} activeOpacity={0.8}>
            <Card className="bg-blue-600 p-6">
              <Text className="text-white text-xl font-bold text-center">
                ログイン / 新規登録
              </Text>
              <Text className="text-blue-100 text-center mt-1 text-sm">
                Google または Apple でアカウント作成
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToLoginCode} activeOpacity={0.8}>
            <Card className="bg-gray-500 p-6">
              <Text className="text-white text-xl font-bold text-center">
                ログインコードで入る
              </Text>
              <Text className="text-gray-200 text-center mt-1 text-sm">
                共有コードで店舗POSにアクセス
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* 料金プラン概要 */}
        <View className="mb-8">
          <Text className="text-lg font-bold text-gray-800 text-center mb-4">
            料金プラン
          </Text>
          <View className="gap-3">
            <Card className="bg-white p-4">
              <View className="flex-row justify-between items-center">
                <View>
                  <Text className="font-bold text-gray-800">無料プラン</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    1店舗・ローカル保存のみ
                  </Text>
                </View>
                <Text className="text-xl font-bold text-green-600">0円</Text>
              </View>
            </Card>

            <Card className="bg-white p-4">
              <View className="flex-row justify-between items-center">
                <View>
                  <Text className="font-bold text-gray-800">店舗プラン</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    1店舗・DB連携・他端末からもアクセス
                  </Text>
                </View>
                <Text className="text-xl font-bold text-blue-600">
                  300円<Text className="text-sm text-gray-400">/月</Text>
                </Text>
              </View>
            </Card>

            <Card className="bg-white p-4 border-2 border-purple-200">
              <View className="flex-row justify-between items-center">
                <View>
                  <Text className="font-bold text-gray-800">団体プラン</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    複数店舗・DB連携・本部ダッシュボード
                  </Text>
                </View>
                <Text className="text-xl font-bold text-purple-600">
                  600円<Text className="text-sm text-gray-400">/月</Text>
                </Text>
              </View>
            </Card>
          </View>
        </View>

        {/* 機能ハイライト */}
        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-800 text-center mb-4">
            主な機能
          </Text>
          <View className="gap-2">
            {[
              { title: 'レジ操作', desc: 'PayPay・金券・現金に対応' },
              { title: 'メニュー管理', desc: '在庫管理・CSV一括登録' },
              { title: '売上ダッシュボード', desc: 'リアルタイム売上集計' },
              { title: '来客カウンター', desc: 'グループ別に集計' },
              { title: '予算管理', desc: '損益分岐点分析・経費記録' },
              { title: '注文ボード', desc: 'キッチン表示・提供状況管理' },
            ].map((feature) => (
              <View
                key={feature.title}
                className="flex-row items-center bg-white rounded-lg px-4 py-3"
              >
                <Text className="text-green-600 font-bold mr-3">+</Text>
                <View>
                  <Text className="font-semibold text-gray-800 text-sm">
                    {feature.title}
                  </Text>
                  <Text className="text-gray-500 text-xs">{feature.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Text className="text-center text-gray-400 text-xs">
          v2.0.0 - Festival POS System (2026)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
