import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LandingProps {
  onNavigateToDemo: () => void;
  onNavigateToGuest: () => void;
  onNavigateToLoginCode: () => void;
}

export const Landing = ({
  onNavigateToDemo,
  onNavigateToGuest,
  onNavigateToLoginCode,
}: LandingProps) => {
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

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
            <View className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-10 h-10 rounded-xl bg-emerald-500 items-center justify-center">
                    <Text className="text-white font-bold">体験</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-bold tracking-[0.3px] text-emerald-700">
                      まず画面を見てみたい場合はこれ
                    </Text>
                    <Text className="text-emerald-950 text-lg font-bold mt-0.5">①デモを試す</Text>
                    <Text className="text-emerald-700 text-xs mt-0.5">ダミーデータで流れをすぐ確認できます</Text>
                  </View>
                </View>
                <Text className="text-emerald-700 font-bold text-base">{'>'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onNavigateToGuest} activeOpacity={0.8}>
            <View className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-10 h-10 rounded-xl bg-amber-500 items-center justify-center">
                    <Text className="text-white font-bold">開始</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-bold tracking-[0.3px] text-amber-700">
                      使い始めたい場合はこれ
                    </Text>
                    <Text className="text-amber-950 text-lg font-bold">②利用画面に進む</Text>
                    <Text className="text-amber-800 text-xs mt-0.5">まずは無料プランで端末内にローカル保存</Text>
                  </View>
                </View>
                <Text className="text-amber-700 font-bold text-base">{'>'}</Text>
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
                    <Text className="text-[11px] font-bold tracking-[0.3px] text-slate-600">
                      共有コードを受け取っている場合はこれ
                    </Text>
                    <Text className="text-slate-900 text-lg font-bold">③ログインコードで入る</Text>
                    <Text className="text-slate-600 text-xs mt-0.5">管理者からもらったコード６文字を入力</Text>
                  </View>
                </View>
                <Text className="text-slate-700 font-bold text-base">{'>'}</Text>
              </View>
            </View>
          </TouchableOpacity>

        </View>

        <View className="mt-6 px-1">
          <Text className="text-center text-slate-400 text-xs">
            v1.0 - Festival POS System (2026)
          </Text>
          <View className="mt-3 flex-row items-center justify-center gap-5">
            <TouchableOpacity onPress={() => setLegalModal('terms')} activeOpacity={0.8}>
              <Text className="text-xs font-medium text-slate-500">利用規約</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLegalModal('privacy')} activeOpacity={0.8}>
              <Text className="text-xs font-medium text-slate-500">プライバシーポリシー</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={legalModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalModal(null)}
      >
        <View className="flex-1 justify-end px-5 py-10">
          <Pressable className="absolute inset-0 bg-slate-900/45" onPress={() => setLegalModal(null)} />
          <View className="rounded-3xl bg-white px-5 py-5" style={{ maxHeight: '80%' }}>
            <Text className="text-xl font-bold text-slate-900">
              {legalModal === 'terms' ? '利用規約' : 'プライバシーポリシー'}
            </Text>

            <ScrollView className="mt-4" contentContainerStyle={{ paddingBottom: 8 }}>
              {legalModal === 'terms' ? (
                <View className="gap-4">
                  <View>
                    <Text className="text-sm font-bold text-slate-900">1. サービス内容</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      Festival POS は、文化祭やイベントでのレジ運用、売上管理、店舗管理を支援するアプリです。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">2. 利用上の注意</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      利用者は、法令や所属団体のルールに従い、ログイン情報や店舗データを自身の責任で管理するものとします。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">3. データ保存</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      未ログイン利用ではデータは端末内に保存されます。ログイン利用では、認証情報と同期対象データが外部サービス上に保存される場合があります。
                    </Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      クラウド上の同期データは、最終更新から2年を目安に順次削除される場合があります。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">4. 免責</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      開発者は、通信障害、端末故障、データ消失その他の事情により生じた損害について、故意または重過失がある場合を除き責任を負いません。
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="gap-4">
                  <View>
                    <Text className="text-sm font-bold text-slate-900">1. 取得する情報</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      ログイン時にはメールアドレス、Google アカウント情報、プロフィール情報を取得する場合があります。利用データとして、店舗設定、商品、売上、支出、注文情報などを保存します。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">2. 利用目的</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      認証、データ同期、店舗運用機能の提供、障害対応、サービス改善のために利用します。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">3. 保存先と共有先</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      未ログイン時の一部データは端末内に保存されます。ログイン時の認証情報および同期対象データは Supabase、Google などの外部サービスを通じて処理される場合があります。
                    </Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-900">4. 保持と削除</Text>
                    <Text className="mt-1 text-sm leading-6 text-slate-600">
                      端末内データはアプリ削除や端末操作により消えることがあります。クラウド上のデータは、利用停止や削除依頼に応じて対応するほか、最終更新から2年を目安に順次削除される場合があります。
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setLegalModal(null)}
              activeOpacity={0.85}
              className="mt-5 rounded-2xl bg-slate-900 px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-white">閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
