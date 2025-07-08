# Message Aggregator

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

- **Slack Event Processing**: Receive and process Slack events through webhook endpoints
- **External Slack Integration**: Forward messages to external Slack workspaces
- **Modern UI**: Built with Next.js and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm or yarn

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:
   Create a `.env.local` file in the root directory and add:

```env
# Slack API設定
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
EXTERNAL_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Node.js環境設定
NODE_ENV=development
```

3. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Endpoints

### Slack Webhook

**POST** `/api/slack/webhook`

Slackイベントを受信し、外部のSlackワークスペースに転送します。

- **URL検証**: `url_verification`イベントの場合、チャレンジを返します
- **イベント処理**: `event_callback`イベントの場合、メッセージを処理して外部Slackに転送します

**GET** `/api/slack/webhook`

APIの動作確認用エンドポイント。

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── slack/
│   │       └── webhook/
│   │           └── route.ts          # Slack webhook endpoint
│   ├── components/
│   └── ...
├── lib/
│   ├── external-slack-webhook-handler.ts  # External Slack integration
│   ├── slack-helper.ts                     # Slack utility functions
│   └── logger.ts                           # Logging utility
├── types/
│   └── slack.ts                            # Slack type definitions
└── ...
```

## Development

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
