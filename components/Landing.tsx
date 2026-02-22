import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    <SafeAreaView className="flex-1 bg-slate-100">
      <ScrollView contentContainerClassName="flex-grow px-5 py-6">
        <View className="relative">
          <View className="absolute -top-16 -right-12 w-40 h-40 rounded-full bg-emerald-200/60" />
          <View className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-sky-200/60" />

          <View className="bg-white/95 rounded-3xl border border-white px-6 py-7 shadow-sm">
            <View className="self-start px-3 py-1 rounded-full bg-slate-900">
              <Text className="text-[11px] font-bold text-white">Festival POS</Text>
            </View>
            <Text className="text-3xl font-extrabold text-slate-900 mt-3">
              文化祭レジアプリ
            </Text>
            <Text className="text-slate-600 mt-2 leading-6">
              模擬店のレジ操作・売上管理・本部ダッシュボードを、
              ひとつの画面でまとめて運用できます。
            </Text>
          </View>
        </View>

        <View className="mt-6 gap-3">
          <TouchableOpacity onPress={onNavigateToDemo} activeOpacity={0.8}>
            <View className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-10 h-10 rounded-xl bg-emerald-500 items-center justify-center">
                    <Text className="text-white font-bold">体験</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-emerald-900 text-lg font-bold">デモを試す</Text>
                    <Text className="text-emerald-700 text-xs mt-0.5">登録不要でダミーデータを操作</Text>
                  </View>
                </View>
                <Text className="text-emerald-700 font-bold text-base">{'>'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToAuth} activeOpacity={0.8}>
            <View className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-10 h-10 rounded-xl bg-blue-600 items-center justify-center">
                    <Text className="text-white font-bold">管理</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-blue-900 text-lg font-bold">ログイン / 新規登録</Text>
                    <Text className="text-blue-700 text-xs mt-0.5">Google / メールアドレス登録で無料利用</Text>
                  </View>
                </View>
                <Text className="text-blue-700 font-bold text-base">{'>'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToLoginCode} activeOpacity={0.8}>
            <View className="rounded-2xl border border-slate-300 bg-slate-200/70 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-10 h-10 rounded-xl bg-slate-600 items-center justify-center">
                    <Text className="text-white font-bold">招待</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 text-lg font-bold">ログインコードで入る</Text>
                    <Text className="text-slate-600 text-xs mt-0.5">共有コードで店舗POSへアクセス</Text>
                  </View>
                </View>
                <Text className="text-slate-700 font-bold text-base">{'>'}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View className="mt-6 px-1">
          <Text className="text-center text-slate-400 text-xs">
            v2.0.0 - Festival POS System (2026)
          </Text>
          <Text className="text-center text-slate-400 text-[10px] mt-1">
            体験・管理者・招待から、用途に合わせて開始してください
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
