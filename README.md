# Discord 日次投稿数サマリ Bot

Discord チャンネルの日次投稿数を自動集計・投稿する GitHub Actions Bot です。

## 機能

- 毎日 JST 23:59 に自動実行
- 指定チャンネルの当日（JST 0:00以降）投稿数をカウント
- 兄貴分のような親しみやすい挨拶と共に結果を投稿
- Bot投稿や特定ユーザーの除外が可能
- Discord API レート制限に対応

## セットアップ

### 1. Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリックして新しいアプリケーションを作成
3. 左メニューの「Bot」を選択
4. 「Add Bot」をクリック
5. Bot Token をコピー（後でGitHub Secretsに登録）

### 2. Bot の権限設定

Bot に以下の権限を付与してください：

- `View Channels` - チャンネルの閲覧
- `Read Message History` - メッセージ履歴の読み取り  
- `Send Messages` - メッセージの送信

### 3. Bot をサーバーに招待

1. Discord Developer Portal の「OAuth2」→「URL Generator」を選択
2. Scopes で「bot」を選択
3. Bot Permissions で上記権限を選択
4. 生成されたURLでBotをサーバーに招待

### 4. チャンネルIDの取得

1. Discordで開発者モードを有効化（設定 > 高度な設定 > 開発者モード）
2. 対象チャンネルを右クリック → 「IDをコピー」

### 5. GitHub Secrets の設定

リポジトリの Settings > Secrets and variables > Actions で以下を追加：

| Secret名 | 値 | 説明 |
|----------|-------|------|
| `DISCORD_BOT_TOKEN` | Bot Token | Discord Bot のトークン |
| `CHANNEL_ID` | チャンネルID | 集計・投稿対象のチャンネルID |

## 設定オプション

環境変数で以下のオプションを設定可能：

| 変数名 | デフォルト値 | 説明 |
|---------|-------------|------|
| `TIMEZONE` | `Asia/Tokyo` | タイムゾーン |
| `EXCLUDE_BOTS` | `false` | Bot投稿を除外するか |
| `EXCLUDE_USER_IDS` | (空) | 除外するユーザーID（カンマ区切り） |

## ローカルでの動作確認

### 1. 環境変数の設定

`.env` ファイルを作成：

```env
DISCORD_BOT_TOKEN=your_bot_token_here
CHANNEL_ID=your_channel_id_here
TIMEZONE=Asia/Tokyo
EXCLUDE_BOTS=false
EXCLUDE_USER_IDS=
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. テストの実行

```bash
npm test
```

### 4. スクリプトの実行

```bash
npm start
```

## 動作確認のコツ

- 初回実行前に対象チャンネルで数件の投稿を行う
- 手動実行（workflow_dispatch）で動作確認を行う
- GitHub Actions のログで詳細な実行状況を確認可能

## ファイル構成

```
.
├── .github/
│   └── workflows/
│       ├── daily-count.yml    # メインの実行ワークフロー
│       └── test.yml          # テスト実行ワークフロー
├── scripts/
│   └── daily-count.js        # Bot のメインスクリプト
├── tests/
│   └── daily-count.test.js   # 単体テスト
├── package.json              # パッケージ設定
└── README.md                 # このファイル
```

## トラブルシューティング

### Bot Token エラー
- Bot Token が正しく設定されているか確認
- Token が有効期限切れでないか確認

### 権限エラー  
- Bot に必要な権限が付与されているか確認
- Bot がチャンネルにアクセス可能か確認

### 投稿数が0件
- 対象の時刻範囲にメッセージが存在するか確認
- TIMEZONE設定が正しいか確認

### レート制限エラー
- 通常は自動的にリトライされるため、しばらく待機

## GitHub Actions 無料枠について

- 1日1回の実行で月間の無料枠内で動作
- Public リポジトリでは無制限
- Private リポジトリでは月2000分の無料枠あり（通常十分）

## ライセンス

MIT License