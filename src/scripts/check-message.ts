import { WebClient } from '@slack/web-api';

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error('SLACK_BOT_TOKEN environment variable is required');
  process.exit(1);
}
const client = new WebClient(token);

async function main() {
  const result = await client.conversations.history({
    channel: 'C045XMMGDHC',
    limit: 20
  });

  if (result.messages) {
    for (const msg of result.messages) {
      if (msg.text && typeof msg.text === 'string' && msg.text.includes('応答矛盾検出')) {
        console.log(JSON.stringify(msg, null, 2));
        break;
      }
    }
  }
}

main().catch(console.error);
