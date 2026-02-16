# Festival POS SaaS セットアップガイド

アプリをSaaSとして稼働させるために必要な外部サービスの設定手順です。

---

## 目次

1. [Supabase セットアップ](#1-supabase-セットアップ)
2. [Stripe セットアップ](#2-stripe-セットアップ)
3. [Edge Functions デプロイ](#3-edge-functions-デプロイ)
4. [アプリ環境変数](#4-アプリ環境変数)
5. [動作確認チェックリスト](#5-動作確認チェックリスト)

---

## 1. Supabase セットアップ

### 1-1. SaaSテーブルのマイグレーション実行

既存マイグレーション（`1.schema.sql` 〜 `4.add_menu_categories.sql` + `migrations/` 内）は実行済みの前提です。

1. Supabase ダッシュボード（https://supabase.com/dashboard）を開く
2. プロジェクトを選択
3. 左メニュー **SQL Editor** をクリック
4. `supabase/migrations/5.saas_tables.sql` の内容をコピーして貼り付け
5. **Run** を実行

作成されるテーブル:

| テーブル | 用途 |
|----------|------|
| `profiles` | ユーザープロフィール（Supabase Authと紐付き） |
| `organizations` | 団体アカウント |
| `organization_members` | ユーザーと団体の紐付け |
| `subscriptions` | サブスクリプション状態 |
| `login_codes` | 店舗ログインコード |

`branches` テーブルに `organization_id` と `owner_id` カラムが追加されます。
また、Auth Trigger により新規ユーザー登録時に `profiles` と `subscriptions`（無料プラン）が自動作成されます。

---

### 1-2. Google OAuth の有効化

#### GCPでの設定

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクトを選択（または新規作成）
3. **APIとサービス > 認証情報** に移動
4. **認証情報を作成 > OAuth クライアント ID** をクリック
5. アプリケーションの種類: **ウェブ アプリケーション**
6. 承認済みのリダイレクト URI に以下を追加:
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
   `<PROJECT_REF>` はSupabaseプロジェクトのReference ID（ダッシュボードの Settings > General で確認可能）
7. **作成** をクリック
8. 表示される **クライアント ID** と **クライアント シークレット** を控える

#### Supabaseでの設定

1. Supabase ダッシュボード > **Authentication > Providers**
2. **Google** を展開し、トグルを **有効** にする
3. 以下を入力:
   - **Client ID**: GCPで取得したクライアントID
   - **Client Secret**: GCPで取得したクライアントシークレット
4. **Save** をクリック

---

### 1-3. Apple Sign-In の有効化

#### Apple Developerでの設定

1. [Apple Developer](https://developer.apple.com/account/) にログイン
2. **Certificates, Identifiers & Profiles** に移動

**App IDの登録:**

3. **Identifiers > App IDs** で対象のApp IDを選択（または新規作成）
4. **Sign In with Apple** にチェックを入れて保存

**Service IDの作成:**

5. **Identifiers** > 右上の **+** > **Services IDs** を選択して Continue
6. 以下を入力:
   - **Description**: Festival POS Login
   - **Identifier**: `com.festivalpos.app.login`（任意）
7. **Register** をクリック
8. 作成したService IDを開き、**Sign In with Apple** にチェック
9. **Configure** をクリックし、以下を設定:
   - **Domains**: `<PROJECT_REF>.supabase.co`
   - **Return URLs**: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
10. **Save** → **Continue** → **Register**

**秘密鍵の作成:**

11. **Keys** > 右上の **+**
12. **Key Name**: Festival POS Auth Key
13. **Sign In with Apple** にチェック → **Configure** でApp IDを選択
14. **Register** → **Download** で `.p8` ファイルを保存
15. 表示される **Key ID** を控える

#### Supabaseでの設定

1. Supabase ダッシュボード > **Authentication > Providers**
2. **Apple** を展開し、トグルを **有効** にする
3. 以下を入力:
   - **Client ID (for Web)**: 作成したService ID（例: `com.festivalpos.app.login`）
   - **Secret Key**: ダウンロードした `.p8` ファイルの中身（`-----BEGIN PRIVATE KEY-----` で始まるテキスト全体）
   - **Key ID**: Appleで取得したKey ID
   - **Team ID**: Apple Developerの右上に表示されるTeam ID
4. **Save** をクリック

---

## 2. Stripe セットアップ

### 2-1. Stripeアカウント作成

1. [Stripe](https://stripe.com/jp) にアクセスし、アカウントを作成
2. ダッシュボードにログイン
3. 開発中は **テストモード** を使用する（右上のトグルで切り替え）

### 2-2. 商品と料金の作成

**店舗プラン（300円/月）:**

1. Stripeダッシュボード > **商品カタログ > 商品を作成**
2. 以下を入力:
   - **商品名**: 店舗プラン
   - **説明**: 1店舗のDB連携・ログインコードでの他端末アクセス
3. **料金を追加**:
   - **料金モデル**: 定額
   - **金額**: 300
   - **通貨**: JPY
   - **請求期間**: 月次
4. **商品を保存**
5. 作成された料金の **Price ID** を控える（`price_` で始まる文字列）

**団体プラン（600円/月）:**

6. 同様に **商品を作成**:
   - **商品名**: 団体プラン
   - **説明**: 複数店舗管理・本部ダッシュボード・DB連携
7. **料金を追加**:
   - **金額**: 600
   - **通貨**: JPY
   - **請求期間**: 月次
8. **商品を保存**
9. **Price ID** を控える

### 2-3. APIキーの取得

1. Stripeダッシュボード > **開発者 > APIキー**
2. **シークレットキー** を控える（`STRIPE_TEST_KEY_PREFIX` または `STRIPE_LIVE_KEY_PREFIX` で始まる文字列）

> シークレットキーは絶対にフロントエンドのコードや `.env` に含めない。Edge Functions の環境変数としてのみ設定する。

### 2-4. Webhook の設定

1. Stripeダッシュボード > **開発者 > Webhook**
2. **エンドポイントを追加**
3. 以下を入力:
   - **エンドポイントURL**:
     ```
     https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
     ```
4. **リッスンするイベントを選択** で以下4つにチェック:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. **エンドポイントを追加** をクリック
6. 作成されたWebhookの詳細ページで **署名シークレット** を控える（`whsec_` で始まる文字列）

---

## 3. Edge Functions デプロイ

### 3-1. Supabase CLI のインストール

```bash
npm install -g supabase
```

### 3-2. ログインとプロジェクトリンク

```bash
# Supabaseにログイン（ブラウザが開く）
supabase login

# プロジェクトにリンク
supabase link --project-ref <PROJECT_REF>
```

`<PROJECT_REF>` は Supabase ダッシュボード > Settings > General の **Reference ID** です。

### 3-3. 環境変数の設定

```bash
supabase secrets set STRIPE_SECRET_KEY=REMOVED_STRIPE_TEST_KEY
supabase secrets set STRIPE_STORE_PRICE_ID=price_xxxxxxxxxxxxx
supabase secrets set STRIPE_ORG_PRICE_ID=price_xxxxxxxxxxxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
supabase secrets set APP_URL=https://your-app-domain.com
```

| 変数名 | 値 | 取得元 |
|--------|-----|--------|
| `STRIPE_SECRET_KEY` | Stripeシークレットキー | Stripe > 開発者 > APIキー |
| `STRIPE_STORE_PRICE_ID` | 店舗プランのPrice ID | Stripe > 商品カタログ > 店舗プラン |
| `STRIPE_ORG_PRICE_ID` | 団体プランのPrice ID | Stripe > 商品カタログ > 団体プラン |
| `STRIPE_WEBHOOK_SECRET` | Webhook署名シークレット | Stripe > 開発者 > Webhook |
| `APP_URL` | アプリの本番URL | Vercel等のデプロイ先URL |

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` はEdge Functionsに自動で注入されるため設定不要です。

### 3-4. Edge Functions のデプロイ

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook
supabase functions deploy validate-login-code
```

または一括デプロイ:

```bash
supabase functions deploy create-checkout-session && \
supabase functions deploy create-portal-session && \
supabase functions deploy stripe-webhook && \
supabase functions deploy validate-login-code
```


---

## 4. アプリ環境変数

プロジェクトルートの `.env` ファイルに以下を設定します（既に設定済みの場合は変更不要）:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

| 変数名 | 値 | 取得元 |
|--------|-----|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL | Supabase > Settings > API > Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー | Supabase > Settings > API > anon public |

> Stripeのキーはフロントエンドには不要です。Edge Functions経由でのみ使用されます。

---

## 5. 動作確認チェックリスト

### デモモード
- [ ] アプリ起動 → ランディング画面が表示される
- [ ] 「デモを試す」をタップ → デモバナーが表示される
- [ ] 模擬店/本部を選択 → ダミーデータで操作できる
- [ ] 画面上部に「デモモード - 実際のデータは保存されません」と表示される

### OAuth認証
- [ ] 「ログイン / 新規登録」をタップ → 認証画面が表示される
- [ ] 「Googleでログイン」→ Googleの認証画面に遷移する
- [ ] 認証完了後 → アカウントダッシュボードが表示される
- [ ] `profiles` テーブルにレコードが作成されている
- [ ] `subscriptions` テーブルに `plan_type: 'free'` のレコードが作成されている
- [ ] Apple Sign-In（iOS/Web）も同様に動作する

### Stripe サブスクリプション
- [ ] アカウントダッシュボード > 「プラン変更」→ 料金画面が表示される
- [ ] 「店舗プラン」の「このプランに変更」→ Stripe Checkoutに遷移する
- [ ] テストカード（`4242 4242 4242 4242`）で支払い完了
- [ ] `subscriptions` テーブルの `plan_type` が `store` に更新されている
- [ ] `stripe_subscription_id` が設定されている
- [ ] アプリに戻るとプラン表示が更新されている

### Stripe Webhook
- [ ] Stripeダッシュボード > Webhook > 最近のイベントにログが表示されている
- [ ] `checkout.session.completed` が成功（200）で処理されている
- [ ] サブスクリプションをキャンセル → `subscriptions.status` が `canceled` に更新される

### ログインコード
- [ ] 有料プランのユーザーで「店舗管理」を開く
- [ ] 「コードを生成」→ 6文字のコードが表示される
- [ ] 「コピー」→ クリップボードにコピーされる
- [ ] 別端末（またはシークレットウィンドウ）でアプリを開く
- [ ] 「ログインコードで入る」→ コード入力画面
- [ ] コードを入力 → 該当の店舗POS画面にアクセスできる

### プランゲート
- [ ] 無料プラン: DB同期が無効（ローカルのみ）
- [ ] 無料プラン: 本部ダッシュボードがグレーアウト
- [ ] 店舗プラン: DB同期が有効
- [ ] 団体プラン: 本部ダッシュボードにアクセスできる

---

## 環境変数まとめ

### アプリ側（`.env`）
| 変数 | 必須 | 説明 |
|------|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | YES | SupabaseプロジェクトURL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | YES | Supabase匿名キー |

### Edge Functions側（`supabase secrets set`）
| 変数 | 必須 | 使用するFunction |
|------|------|-----------------|
| `STRIPE_SECRET_KEY` | YES | create-checkout-session, create-portal-session, stripe-webhook |
| `STRIPE_STORE_PRICE_ID` | YES | create-checkout-session |
| `STRIPE_ORG_PRICE_ID` | YES | create-checkout-session |
| `STRIPE_WEBHOOK_SECRET` | YES | stripe-webhook |
| `APP_URL` | YES | create-checkout-session, create-portal-session |
| `SUPABASE_URL` | 自動 | 全Function（自動注入） |
| `SUPABASE_ANON_KEY` | 自動 | 全Function（自動注入） |
| `SUPABASE_SERVICE_ROLE_KEY` | 自動 | stripe-webhook, validate-login-code（自動注入） |

---

## 本番公開前の追加対応

- [ ] Stripeを **ライブモード** に切り替え（テストモードのキーを本番キーに置換）
- [ ] Supabase RLS ポリシーを本番用に強化（`5.saas_tables.sql` のRLSセクション参照）
- [ ] `APP_URL` を本番ドメインに更新
- [ ] Apple App Store / Google Play Store への申請準備（アプリ内課金がある場合の審査対応）
- [ ] プライバシーポリシー・利用規約ページの作成
- [ ] Stripe の税金設定（Stripe Tax）の確認
