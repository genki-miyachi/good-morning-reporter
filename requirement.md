あなたはプロのフルスタックエンジニアAIです。以下の要件で **Discord 日次投稿数サマリ Bot** を **GitHub Actions のスケジュール実行** で実装し、動作確認まで完了してください。

---

## ゴール
- JST 23:59 に、指定チャンネルの「当日0:00(JST)以降」の投稿数をカウントし、同チャンネルに「本日の投稿数: N件」を自動投稿する。
- 無料枠で常時運用可能（Actions の無料枠で1日1回のみ実行）。

---

## 成果物（納品物）
1. `.github/workflows/daily-count.yml`
   - Node.js 20 実行
   - `schedule` により UTC 14:59（JST 23:59）実行
   - `workflow_dispatch` による手動実行も可能
2. `scripts/daily-count.js`（Node.js ESM または CommonJS）
   - Discord API で当日投稿件数を取得し、同チャンネルに投稿
3. `README.md`
   - Bot 作成手順、Secrets 設定方法、ローカル試験手順

---

## 仕様
### 入力（設定）
- `DISCORD_BOT_TOKEN`（Repo Secret）: Discord Bot のトークン
- `CHANNEL_ID`（Repo Secret）: 集計と投稿対象のチャンネルID
- `TIMEZONE`（環境変数）: 既定 `Asia/Tokyo`
- オプション（フィルタ）
  - `EXCLUDE_BOTS`（"true"/"false"）: Bot 投稿を除外（既定 false）
  - `EXCLUDE_USER_IDS`（カンマ区切り）: 除外ユーザーIDリスト

### 出力（Discord投稿フォーマット）
- `本日の投稿数（YYYY/MM/DD / Asia/Tokyo）: **N件**`

### スケジュール
- `59 14 * * *`（UTC → JST 23:59）

### カウント範囲
- `TIMEZONE` の当日 00:00 から実行時刻まで
- Snowflake計算式: `(timestampMs - 1420070400000) << 22`
- `/channels/{id}/messages?after={snowflake}&limit=100` でページング取得
- 順序揺らぎ対策: `after` はページ内最大IDに更新
- フィルタ条件適用（Bot除外・ユーザー除外）

### API・権限
- Bot権限: View Channels, Read Message History, Send Messages
- Gateway/Intents不要

### 失敗時挙動
- 429: `Retry-After` 秒待機後再試行（上限60秒程度）
- その他エラー: レスポンス本文をログ出力し、終了

### ロギング
- `console.log` で主要処理（対象日、件数、ページ数、投稿完了）を出力（Secretsは非表示）

---

## ディレクトリ構成
repo/
├─ .github/
│ └─ workflows/
│ └─ daily-count.yml
├─ scripts/
│ └─ daily-count.js
└─ README.md

---

## GitHub Actions ワークフロー例
```yaml
name: Daily Discord Count
on:
  schedule:
    - cron: "59 14 * * *"
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: node scripts/daily-count.js
        env:
          DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
          CHANNEL_ID: ${{ secrets.CHANNEL_ID }}
          TIMEZONE: "Asia/Tokyo"
          EXCLUDE_BOTS: "false"
          EXCLUDE_USER_IDS: ""
```

## 実装詳細（`scripts/daily-count.js`）
- Node.js 20
- `fetch`（組み込みまたは`node-fetch`）で Discord API 呼び出し
- 関数構成：
  1. `getStartOfDayUTC(now, tz)` — tz の当日0時をUTCに変換
  2. `timestampToSnowflake(tsMs)` — Snowflakeに変換
  3. `fetchMessages(afterSnowflake)` — ページングで全件取得、レート制限対応
  4. `countMessages(batch, filters)` — Bot除外/ユーザー除外
  5. `postResult(content)` — チャンネルへ投稿
  6. メイン処理 — 当日件数集計→投稿

---

## 受け入れ基準
- [ ] JST 23:59 に自動実行
- [ ] 当日0時以降の投稿数が正確
- [ ] 429対応済み
- [ ] 除外オプションが動作
- [ ] 無料枠で1日1回実行

---

## テスト計画
1. Secrets 設定済みで `workflow_dispatch` 実行
2. 投稿数が正しく Discord に表示されることを確認
3. 除外オプション設定で件数変化を確認
