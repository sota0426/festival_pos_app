# App Store Metadata Draft

## Screenshots

Current screenshot files found in `/Users/iimorisouta/Desktop/festival_pos_app/screenshot`:

- `1.png`
- `2_1.png`
- `2_2.png`
- `3.png`
- `4.png`
- `5_1.png`
- `5_2.png`
- `5_3.png`
- `6_1.png`
- `6_2.png`

Suggested order for App Store Connect:

1. `1.png` - ルート / 導入画面
2. `2_1.png` - 模擬店ホーム
3. `2_2.png` - レジ / 注文操作
4. `3.png` - メニュー管理
5. `4.png` - 売上履歴 or 注文管理
6. `5_1.png` - 本部ダッシュボード
7. `5_2.png` - 各店舗情報 / 比較
8. `5_3.png` - 支出管理
9. `6_1.png` - 料金プラン
10. `6_2.png` - ログイン / 共有機能

Note:

- Current files are smaller than standard App Store device screenshot sizes.
- App Store Connect may require screenshots to match specific device resolutions.
- If upload fails, these images should be re-exported at App Store-compatible sizes.

## App Name

Festival POS

## Subtitle

文化祭・模擬店向けレジ運営アプリ

## Promotional Text

文化祭や学園祭の模擬店運営を、レジ操作から売上集計、本部管理まで一つのアプリでまとめて行えます。

## Keywords

文化祭,学園祭,模擬店,レジ,POS,売上管理,注文管理,店舗管理,会計,イベント

## Description

Festival POS は、文化祭や学園祭の模擬店運営をスムーズにするための POS アプリです。

模擬店では、レジ操作、メニュー登録、販売履歴確認、支出管理、在庫管理などをまとめて行えます。未ログインでも端末内保存でそのまま使い始められ、まずは無料で試すこともできます。

ログインすると、店舗データの同期や複数端末での運用が可能になります。スマートフォンだけでなく Web でも操作しやすく、複数人で同じ店舗を運営したい場面に向いています。

団体プランでは、本部ダッシュボードから複数店舗の売上や支払い方法別の集計、時間帯別売上、店舗ごとの結果比較を確認できます。イベント当日の状況把握や調整も行いやすくなります。

主な機能:

- レジ操作と会計記録
- メニュー登録、表示切替、在庫管理
- 売上履歴の確認と CSV 出力
- 支出管理、利益確認
- 未ログインでのローカル利用
- ログイン後のクラウド同期
- 複数端末での共同運用
- 本部ダッシュボードでの全体集計

おすすめの使い方:

- まず試したい場合: ログインせずに利用
- 1店舗を複数端末で使いたい場合: 店舗プラン
- 複数店舗をまとめて管理したい場合: 団体プラン

## Support URL

Use the same public page as your support landing page until a dedicated support page is prepared:

- `https://festival-pos-app.vercel.app`

## Privacy Policy URL

Prepare and publish a dedicated public page if possible. Until then, the existing public site can host the same text shown in-app:

- `https://festival-pos-app.vercel.app`

## App Privacy Draft

Tracking:

- Does this app track users across apps or websites? `No`

Data linked to the user:

1. Contact Info
- Email Address
Reason:
- Account creation and sign-in

2. User Content
- Other User Content
Examples in this app:
- store settings
- menu data
- sales records
- expense records
- order-related data
Reason:
- App functionality

3. Identifiers
- User ID
Reason:
- Account management
- App functionality

Potentially linked when using Google / Apple sign-in:

4. Contact Info
- Name
Reason:
- Account profile display

5. User Content
- Profile Photo
Reason:
- Account profile display

Data not used for tracking:

- All collected data should be marked as `Not Used for Tracking`

Data not currently intended to be declared as collected from the codebase:

- Precise location
- Contacts
- Health
- Financial info
- Browsing history
- Search history
- Diagnostics / analytics SDK data
- Photos or videos from the device library

## Notes For App Store Connect

- The app supports Google / Apple / email login, plus guest mode.
- Guest mode stores data locally on device.
- Logged-in mode syncs data through Supabase.
- The app uses sharing, clipboard, and document import/export features, but these do not automatically mean tracking.
- The iOS privacy manifest currently declares accessed API categories in `/Users/iimorisouta/Desktop/festival_pos_app/ios/festivalpos/PrivacyInfo.xcprivacy`.
