import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// 公式 Google "G" ロゴ SVG
const GoogleIcon = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    <Path fill="none" d="M0 0h48v48H0z"/>
  </Svg>
);

interface AuthSignInProps {
  onBack: () => void;
}

export const AuthSignIn = ({ onBack }: AuthSignInProps) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [loading, setLoading] = useState<'google' | 'email_signin' | 'email_signup' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showSignupSentModal, setShowSignupSentModal] = useState(false);
  const [signupCompletedEmail, setSignupCompletedEmail] = useState('');
  const [signupNeedsConfirmation, setSignupNeedsConfirmation] = useState(true);
  const [showDuplicateAccountModal, setShowDuplicateAccountModal] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleGoogleSignIn = async () => {
    try {
      setLoading('google');
      setError(null);
      setInfo(null);
      await signInWithGoogle();
    } catch (e: any) {
      const msg = e?.message ? ` (${e.message})` : '';
      console.error('[AuthSignIn] Google sign-in error:', e);
      setError(`Googleログインに失敗しました${msg}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDuplicateRegisteredEmail = async (normalizedEmail: string, candidatePassword: string) => {
    try {
      await signInWithEmail(normalizedEmail, candidatePassword);
      setInfo('既存アカウントにログインしました。');
      return true;
    } catch {
      setDuplicateEmail(normalizedEmail);
      setShowDuplicateAccountModal(true);
      setAuthMode('signin');
      setError('このメールアドレスは既に登録されています。メールログインまたはGoogleでサインインしてください。');
      return false;
    }
  };

  const handleEmailAuth = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError('メールアドレスの形式を確認してください');
      return;
    }
    if (authMode === 'signup') {
      const normalizedDisplayName = displayName.trim();
      if (!normalizedDisplayName) {
        setError('ユーザー名を入力してください');
        return;
      }
      if (!confirmPassword) {
        setError('確認用パスワードを入力してください');
        return;
      }
      if (password !== confirmPassword) {
        setError('パスワードと確認用パスワードが一致しません');
        return;
      }
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    try {
      setLoading(authMode === 'signin' ? 'email_signin' : 'email_signup');
      setError(null);
      setInfo(null);
      if (authMode === 'signin') {
        await signInWithEmail(normalizedEmail, password);
        return;
      }
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail.toLowerCase())
        .maybeSingle();
      if (existingProfile?.id) {
        await handleDuplicateRegisteredEmail(normalizedEmail, password);
        return;
      }
      const result = await signUpWithEmail(normalizedEmail, password, displayName.trim());
      if (result.alreadyRegistered) {
        await handleDuplicateRegisteredEmail(normalizedEmail, password);
        return;
      }
      setSignupCompletedEmail(normalizedEmail);
      setSignupNeedsConfirmation(result.needsEmailConfirmation);
      setShowSignupSentModal(true);
      setInfo(
        result.needsEmailConfirmation
          ? '確認メールを送信しました。メール内リンクを開いてログインを完了してください。'
          : 'アカウントを作成してログインしました。'
      );
    } catch (e: any) {
      const msg = e?.message ? ` (${e.message})` : '';
      console.error('[AuthSignIn] Email auth error:', e);
      const rawMessage = String(e?.message ?? '').toLowerCase();
      if (authMode === 'signup' && (rawMessage.includes('already registered') || rawMessage.includes('already exists'))) {
        await handleDuplicateRegisteredEmail(normalizedEmail, password);
        return;
      }
      setError(
        authMode === 'signin'
          ? `メールログインに失敗しました${msg}`
          : `メール登録に失敗しました${msg}`
      );
    } finally {
      setLoading(null);
    }
  };

  const switchMode = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setError(null);
    setInfo(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-4 pb-8">
            {/* 戻るボタン */}
            <TouchableOpacity onPress={onBack} className="self-start p-2 -ml-2 mb-8">
              <Text className="text-blue-600 text-base font-medium">&larr; 戻る</Text>
            </TouchableOpacity>

            {/* タイトル */}
            <Text className="text-3xl font-bold text-gray-900 mb-2">ログイン / 登録</Text>
            <Text className="text-gray-500 mb-10">
              アカウントにサインインして、データの同期や複数端末でのアクセスが可能になります
            </Text>

            {/* エラー・情報メッセージ */}
            {error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 flex-row items-start">
                <Text className="text-red-500 mr-2 text-base font-bold">!</Text>
                <Text className="text-red-700 text-sm flex-1">{error}</Text>
              </View>
            )}
            {info && (
              <View className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6">
                <Text className="text-blue-700 text-sm text-center">{info}</Text>
              </View>
            )}

            {/* ── メインアクション: Google（推奨） ── */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={loading !== null}
              activeOpacity={0.85}
              className="bg-white border-2 border-gray-200 rounded-2xl py-4 px-6 flex-row items-center justify-center mb-3"
              style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              {loading === 'google' ? (
                <ActivityIndicator color="#4285F4" style={{ marginRight: 12 }} />
              ) : (
                <View style={{ marginRight: 12 }}>
                  <GoogleIcon size={24} />
                </View>
              )}
              <Text className="text-gray-800 font-bold text-base">Googleでサインイン</Text>
            </TouchableOpacity>

            {/* 区切り線 */}
            <View className="flex-row items-center m-6">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="text-gray-400 text-sm mx-4">メールアドレスで続ける</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>

            {/* メールフォームの開閉トグル */}
            {!showEmailForm ? (
              <TouchableOpacity
                onPress={() => { setShowEmailForm(true); setError(null); setInfo(null); }}
                disabled={loading !== null}
                activeOpacity={0.8}
                className="border border-gray-300 rounded-xl py-3.5 px-6 flex-row items-center justify-center mb-10"
              >
                <Text className="text-gray-600 font-medium text-base">メールアドレスで続ける</Text>
              </TouchableOpacity>
            ) : (
              <View className="mb-6">
                {/* ログイン / 新規登録 タブ */}
                <View className="flex-row bg-gray-200 rounded-xl p-1 mb-5">
                  <TouchableOpacity
                    onPress={() => switchMode('signin')}
                    disabled={loading !== null}
                    className={`flex-1 rounded-lg py-2.5 items-center ${authMode === 'signin' ? 'bg-white' : ''}`}
                  >
                    <Text className={`font-semibold text-sm ${authMode === 'signin' ? 'text-blue-600' : 'text-gray-500'}`}>
                      ログイン
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => switchMode('signup')}
                    disabled={loading !== null}
                    className={`flex-1 rounded-lg py-2.5 items-center ${authMode === 'signup' ? 'bg-white' : ''}`}
                  >
                    <Text className={`font-semibold text-sm ${authMode === 'signup' ? 'text-blue-600' : 'text-gray-500'}`}>
                      新規登録
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* フォームフィールド */}
                <View className="gap-4 mb-4">
                  {authMode === 'signup' && (
                    <View>
                      <Text className="text-sm font-medium text-gray-700 mb-1">ユーザー名</Text>
                      <TextInput
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="例: 山田 太郎"
                        placeholderTextColor="#9CA3AF"
                        editable={loading === null}
                        className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-white"
                      />
                    </View>
                  )}
                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">メールアドレス</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="example@email.com"
                      placeholderTextColor="#9CA3AF"
                      editable={loading === null}
                      className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-white"
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">パスワード</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      placeholder="6文字以上で入力"
                      placeholderTextColor="#9CA3AF"
                      editable={loading === null}
                      className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-white"
                    />
                  </View>
                  {authMode === 'signup' && (
                    <View>
                      <Text className="text-sm font-medium text-gray-700 mb-1">パスワード（確認）</Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        placeholder="もう一度入力してください"
                        placeholderTextColor="#9CA3AF"
                        editable={loading === null}
                        className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-white"
                      />
                    </View>
                  )}
                </View>

                {/* 送信ボタン */}
                <TouchableOpacity
                  onPress={handleEmailAuth}
                  disabled={loading !== null}
                  activeOpacity={0.85}
                  className={`rounded-xl py-4 items-center justify-center flex-row ${
                    loading !== null ? 'bg-blue-400' : 'bg-blue-600'
                  }`}
                >
                  {(loading === 'email_signin' || loading === 'email_signup') && (
                    <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                  )}
                  <Text className="text-white font-bold text-base">
                    {authMode === 'signin' ? 'ログイン' : 'アカウントを作成'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text className="text-gray-400 text-center text-xs mt-2">
              ログインすることで、利用規約とプライバシーポリシーに同意したものとみなします
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 登録完了モーダル */}
      <Modal
        visible={showSignupSentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignupSentModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="w-full max-w-md bg-white rounded-2xl p-6 border border-gray-200">
            <View className="items-center mb-4">
              <View className="w-14 h-14 bg-green-100 rounded-full items-center justify-center mb-3">
                <Text className="text-2xl">
                  {signupNeedsConfirmation ? '📧' : '✓'}
                </Text>
              </View>
              <Text className="text-xl font-bold text-gray-900">
                {signupNeedsConfirmation ? '確認メールを送信しました' : '登録完了'}
              </Text>
            </View>
            <Text className="text-sm text-blue-600 text-center font-medium mb-2">
              {signupCompletedEmail}
            </Text>
            <Text className="text-sm text-gray-600 text-center mb-6">
              {signupNeedsConfirmation
                ? 'メール内のリンクをクリックするとログインが完了します。'
                : 'アカウント作成が完了しました。続けてご利用いただけます。'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowSignupSentModal(false);
              }}
              className="bg-blue-600 rounded-xl py-3.5"
              activeOpacity={0.8}
            >
              <Text className="text-center text-white font-semibold text-base">OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 重複アカウントモーダル */}
      <Modal
        visible={showDuplicateAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDuplicateAccountModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="w-full max-w-md bg-white rounded-2xl p-6 border border-gray-200">
            <View className="items-center mb-4">
              <View className="w-14 h-14 bg-amber-100 rounded-full items-center justify-center mb-3">
                <Text className="text-2xl">!</Text>
              </View>
              <Text className="text-xl font-bold text-gray-900">既に登録済みです</Text>
            </View>
            <Text className="text-sm text-blue-600 text-center font-medium mb-2">{duplicateEmail}</Text>
            <Text className="text-sm text-gray-600 text-center mb-6">
              このメールアドレスは既に登録されています。{'\n'}以下の方法でログインしてください。
            </Text>

            <TouchableOpacity
              onPress={() => {
                setShowDuplicateAccountModal(false);
                setAuthMode('signin');
              }}
              className="bg-blue-600 rounded-xl py-3.5 mb-3"
              activeOpacity={0.8}
            >
              <Text className="text-center text-white font-semibold">メールでログイン</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                setShowDuplicateAccountModal(false);
                await handleGoogleSignIn();
              }}
              className="bg-white border border-gray-300 rounded-xl py-3.5 mb-3"
              activeOpacity={0.8}
            >
              <Text className="text-center text-gray-800 font-semibold">Googleでサインイン</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowDuplicateAccountModal(false)}
              className="py-2"
              activeOpacity={0.8}
            >
              <Text className="text-center text-gray-500">閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
