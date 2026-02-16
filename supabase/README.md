# Supabase SQL structure

実行しやすいように、上位3ファイルを用意しています。

- `0_setting_table.sql`
  - テーブル・制約・RLS・トリガーなどをまとめて作成（最初に実行）
- `1_reset_all.sql`
  - データのみ全削除（テーブル定義は残す）
- `2_add_dummy_data.sql`
  - ダミー店舗/カテゴリ/メニュー/予算設定を投入
- `3_seed_test_transactions.sql`
  - テスト取引（transactions / transaction_items）を投入

補足:
- `migrations/` は開発履歴として保持
- 手動実行は `0` → `1`(必要時) → `2` → `3` の順で使用
