# Gmail → Slack Forwarder

Gmail受信トレイの新着メールをSlackチャンネルに自動転送するローカル常駐アプリケーション。

## 特徴

- **複数Gmailアカウント対応**: 複数のGmailアカウントから1つのSlackチャンネルに集約
- **SMTP不使用**: Gmail API + Slack APIのみ使用（IPブラックリスト問題を回避）
- **冪等性保証**: Gmailラベル + SQLiteの二段構えで重複投稿を防止
- **添付ファイル対応**: メールの添付ファイルをSlackスレッドにアップロード
- **macOS常駐**: launchdによる自動起動・自動復旧

## クイックスタート

### 1. 依存関係のインストール

```bash
cd gmail-slack-forwarder
npm install
```

### 2. Google Cloud Console設定

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. Gmail APIを有効化
3. OAuthクライアントID（デスクトップアプリ）を作成
4. `credentials.json`をダウンロード

### 3. ディレクトリ準備

```bash
mkdir -p ~/.gmail-slack-forwarder/tokens
cp credentials.json ~/.gmail-slack-forwarder/
cp config/config.yaml.example ~/.gmail-slack-forwarder/config.yaml
```

### 4. 設定ファイル編集

`~/.gmail-slack-forwarder/config.yaml`を編集:

```yaml
slack:
  post_channel_id: "YOUR_CHANNEL_ID"  # Slackチャンネル ID

accounts:
  - name: "personal"
    display_name: "yourname@gmail.com"
    token_path: "~/.gmail-slack-forwarder/tokens/personal.token.json"
```

### 5. OAuth認証

各アカウントに対して認証を実行:

```bash
npm run setup -- --account personal
```

ブラウザが開くので、Googleアカウントでログインし、アプリを許可します。

### 6. 接続テスト

```bash
npm run test:connection
```

### 7. 起動

```bash
# 開発モード
npm run dev

# 本番モード
npm run build
npm start
```

## launchd常駐化（macOS）

### インストール

```bash
# ビルド
npm run build
cp -r dist ~/.gmail-slack-forwarder/app/

# plistファイル配置
cp launchd/com.user.gmail-slack-forwarder.plist ~/Library/LaunchAgents/

# SLACK_BOT_TOKENを設定（plistを編集するか、.envrcを使用）
# plistのEnvironmentVariables > SLACK_BOT_TOKENを設定

# サービス登録・起動
launchctl load ~/Library/LaunchAgents/com.user.gmail-slack-forwarder.plist
```

### 管理コマンド

```bash
# 状態確認
launchctl list | grep gmail-slack-forwarder

# 停止
launchctl unload ~/Library/LaunchAgents/com.user.gmail-slack-forwarder.plist

# 再起動
launchctl unload ~/Library/LaunchAgents/com.user.gmail-slack-forwarder.plist
launchctl load ~/Library/LaunchAgents/com.user.gmail-slack-forwarder.plist

# ログ確認
tail -f ~/Library/Logs/gmail-slack-forwarder.log
```

## 設定オプション

| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `poll_interval_seconds` | 30 | ポーリング間隔（秒） |
| `max_messages_per_poll` | 20 | 1回のポーリングで処理する最大メッセージ数 |
| `gmail_query` | `in:inbox -label:slack_done` | Gmail検索クエリ |
| `format.body_max_chars` | 4000 | 本文最大文字数 |
| `format.split_long_body_into_thread` | true | 長い本文をスレッドに分割 |
| `attachments.enabled` | true | 添付ファイル転送 |

詳細は `config/config.yaml.example` を参照してください。

## 開発

### テスト実行

```bash
npm test
```

### ビルド

```bash
npm run build
```

### 型チェック

```bash
npm run typecheck
```

## トラブルシューティング

### トークンの再取得

```bash
rm ~/.gmail-slack-forwarder/tokens/ACCOUNT_NAME.token.json
npm run setup -- --account ACCOUNT_NAME
```

### ラベルが見つからない

アプリは自動的に`slack_done`ラベルを作成します。手動で作成する必要はありません。

### Slack投稿が失敗する

1. `SLACK_BOT_TOKEN`環境変数が設定されているか確認
2. Botがチャンネルに招待されているか確認
3. Botに`chat:write`と`files:write`権限があるか確認

## アーキテクチャ

```
gmail-slack-forwarder/
├── src/
│   ├── index.ts           # エントリーポイント
│   ├── config/            # 設定読み込み
│   ├── gmail/             # Gmail API クライアント
│   ├── slack/             # Slack API クライアント
│   ├── storage/           # SQLite 冪等性管理
│   ├── poller/            # メインポーリングループ
│   └── utils/             # ユーティリティ
├── scripts/               # セットアップスクリプト
├── config/                # 設定テンプレート
├── launchd/               # macOS サービス設定
└── tests/                 # テスト
```

## ライセンス

MIT
