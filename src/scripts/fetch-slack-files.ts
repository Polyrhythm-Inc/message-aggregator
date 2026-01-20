/**
 * Slack添付ファイルを取得するスクリプト
 * チャンネル: #8weeks_アプリ版_開発 (C09U6PCDZV1)
 */

import { WebClient } from '@slack/web-api';
import * as fs from 'fs';
import * as path from 'path';

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C09U6PCDZV1'; // #8weeks_アプリ版_開発
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './slack-files';

if (!SLACK_USER_TOKEN) {
  console.error('Required environment variable: SLACK_USER_TOKEN');
  process.exit(1);
}

interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  url_private: string;
  url_private_download?: string;
  permalink: string;
  size: number;
  timestamp: number;
  user: string;
}

async function downloadFile(url: string, outputPath: string, token: string): Promise<void> {
  // まず url_private_download を試す
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  // Content-Typeを確認してHTMLでないことを確認
  const contentType = response.headers.get('content-type') || '';
  console.log(`  Content-Type: ${contentType}`);

  const buffer = await response.arrayBuffer();
  console.log(`  Downloaded size: ${buffer.byteLength} bytes`);

  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

async function main() {
  const client = new WebClient(SLACK_USER_TOKEN);

  // 出力ディレクトリを作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 過去1週間のタイムスタンプを計算
  const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

  console.log('Fetching files from channel:', CHANNEL_ID);
  console.log('Output directory:', OUTPUT_DIR);
  console.log('---');

  try {
    // チャンネルのメッセージを取得（添付ファイルを含む）
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: String(oneWeekAgo),
      limit: 200,
    });

    if (!result.ok || !result.messages) {
      console.error('Failed to fetch messages:', result);
      return;
    }

    const allFiles: SlackFile[] = [];

    // メッセージから添付ファイルを抽出
    for (const msg of result.messages) {
      if (msg.files && Array.isArray(msg.files)) {
        for (const file of msg.files) {
          if (file.url_private) {
            allFiles.push({
              id: file.id || '',
              name: file.name || 'unnamed',
              title: file.title || file.name || 'unnamed',
              mimetype: file.mimetype || 'application/octet-stream',
              filetype: file.filetype || 'unknown',
              url_private: file.url_private,
              url_private_download: file.url_private_download,
              permalink: file.permalink || '',
              size: file.size || 0,
              timestamp: file.timestamp || 0,
              user: file.user || msg.user || '',
            });
          }
        }
      }

      // スレッド内のメッセージもチェック
      if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
        try {
          const replies = await client.conversations.replies({
            channel: CHANNEL_ID,
            ts: msg.thread_ts,
            limit: 100,
          });

          if (replies.ok && replies.messages) {
            for (const reply of replies.messages) {
              if (reply.files && Array.isArray(reply.files)) {
                for (const file of reply.files) {
                  if (file.url_private) {
                    allFiles.push({
                      id: file.id || '',
                      name: file.name || 'unnamed',
                      title: file.title || file.name || 'unnamed',
                      mimetype: file.mimetype || 'application/octet-stream',
                      filetype: file.filetype || 'unknown',
                      url_private: file.url_private,
                      url_private_download: file.url_private_download,
                      permalink: file.permalink || '',
                      size: file.size || 0,
                      timestamp: file.timestamp || 0,
                      user: file.user || reply.user || '',
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch replies:', err);
        }
      }
    }

    // 重複を削除
    const uniqueFiles = Array.from(new Map(allFiles.map(f => [f.id, f])).values());

    console.log(`Found ${uniqueFiles.length} unique files`);
    console.log('---');

    // ファイル一覧を表示
    for (const file of uniqueFiles) {
      console.log(`File: ${file.name}`);
      console.log(`  Type: ${file.filetype} (${file.mimetype})`);
      console.log(`  Size: ${Math.round(file.size / 1024)} KB`);
      console.log(`  URL: ${file.url_private}`);
      console.log('');
    }

    // ファイルをダウンロード
    console.log('---');
    console.log('Downloading files...');

    for (const file of uniqueFiles) {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const outputPath = path.join(OUTPUT_DIR, `${file.id}_${sanitizedName}`);

      try {
        // url_private_download を優先（ダウンロード用URL）
        const downloadUrl = file.url_private_download || file.url_private;
        console.log(`Downloading: ${file.name}`);
        console.log(`  URL: ${downloadUrl}`);
        await downloadFile(downloadUrl, outputPath, SLACK_USER_TOKEN);
        console.log(`✅ Downloaded: ${file.name} -> ${outputPath}`);
      } catch (err) {
        console.error(`❌ Failed to download ${file.name}:`, err);

        // url_private でリトライ
        if (file.url_private_download && file.url_private !== file.url_private_download) {
          try {
            console.log(`  Retrying with url_private...`);
            await downloadFile(file.url_private, outputPath, SLACK_USER_TOKEN);
            console.log(`✅ Downloaded (retry): ${file.name} -> ${outputPath}`);
          } catch (retryErr) {
            console.error(`❌ Retry also failed:`, retryErr);
          }
        }
      }
    }

    // ファイル一覧をJSONで保存
    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      channelId: CHANNEL_ID,
      fileCount: uniqueFiles.length,
      files: uniqueFiles.map(f => ({
        ...f,
        localPath: `${f.id}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      })),
    }, null, 2));

    console.log('---');
    console.log(`Manifest saved to: ${manifestPath}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
