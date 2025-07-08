# Message Aggregator

SlackとChatworkのメッセージを外部Slackワークスペースに転送するWebhookサービス

## 🚀 Webhook URLs

本番環境（Heroku）で利用可能なWebhook URL:

- **Slack Webhook**: `https://message-aggregator-99772d46d008.herokuapp.com/api/slack/webhook`
- **Chatwork Webhook**: `https://message-aggregator-99772d46d008.herokuapp.com/api/chatwork/webhook`

## ⚙️ 環境変数設定

### 自動設定（推奨）

```bash
# .env.localから環境変数を読み取ってHerokuに設定
node setHerokuConfig.js [app_name]

# 例
node setHerokuConfig.js message-aggregator
```

### 手動設定

```bash
heroku config:set SLACK_BOT_TOKEN=xoxb-your-token --app your-app
heroku config:set EXTERNAL_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx --app your-app
heroku config:set CHATWORK_API_TOKEN=your-token --app your-app
heroku config:set CHATWORK_WEBHOOK_API_KEY=your-api-key --app your-app
```

### 必要な環境変数

| 変数名 | 説明 |
|--------|------|
| `SLACK_BOT_TOKEN` | SlackのBot User OAuth Token |
| `EXTERNAL_SLACK_WEBHOOK_URL` | 転送先SlackのWebhook URL |
| `CHATWORK_API_TOKEN` | ChatworkのAPI Token |
| `CHATWORK_WEBHOOK_API_KEY` | ChatworkのWebhook認証キー |

## 📝 使用方法

### Slack設定
1. Slack Appの Event Subscriptions で上記のSlack Webhook URLを設定
2. 必要なイベント（`message.channels`など）を購読

### Chatwork設定
1. Chatworkの管理画面でWebhook設定
2. 上記のChatwork Webhook URLを設定
3. API Keyを `CHATWORK_WEBHOOK_API_KEY` として設定

## 🛠️ 開発環境

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
cd src && npm run dev
```

`.env.local` に環境変数を設定してください。

## 📁 プロジェクト構造

```
src/
├── app/api/
│   ├── slack/webhook/route.ts      # Slack Webhook API
│   └── chatwork/webhook/route.ts   # Chatwork Webhook API
├── lib/
│   ├── external-slack-webhook-handler.ts
│   ├── chatwork-webhook-handler.ts
│   └── ...
└── types/
    ├── slack.ts
    └── chatwork.ts
```


