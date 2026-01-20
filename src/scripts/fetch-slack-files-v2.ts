/**
 * Slack添付ファイルを取得するスクリプト v2
 * files.sharedPublicURL APIを使用
 */

import { WebClient } from '@slack/web-api';
import * as fs from 'fs';
import * as path from 'path';

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C09U6PCDZV1'; // #8weeks_アプリ版_開発
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './slack-files';

if (!SLACK_USER_TOKEN || !SLACK_BOT_TOKEN) {
  console.error('Required environment variables: SLACK_USER_TOKEN, SLACK_BOT_TOKEN');
  process.exit(1);
}

interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  url_private: string;
  permalink: string;
  permalink_public?: string;
  size: number;
  timestamp: number;
  user: string;
}

async function downloadFile(url: string, outputPath: string, token?: string): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    console.error(`  HTTP ${response.status}: ${response.statusText}`);
    return false;
  }

  const contentType = response.headers.get('content-type') || '';
  console.log(`  Content-Type: ${contentType}`);

  // HTMLが返ってきた場合はスキップ
  if (contentType.includes('text/html') && !url.endsWith('.html')) {
    console.error('  Got HTML response instead of file');
    return false;
  }

  const buffer = await response.arrayBuffer();
  console.log(`  Downloaded size: ${buffer.byteLength} bytes`);

  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return true;
}

async function main() {
  const userClient = new WebClient(SLACK_USER_TOKEN);
  const botClient = new WebClient(SLACK_BOT_TOKEN);

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
    // チャンネルのメッセージを取得
    const result = await userClient.conversations.history({
      channel: CHANNEL_ID,
      oldest: String(oneWeekAgo),
      limit: 200,
    });

    if (!result.ok || !result.messages) {
      console.error('Failed to fetch messages:', result);
      return;
    }

    const allFiles: SlackFile[] = [];

    // メッセージから添付ファイルを抽出（スレッド含む）
    for (const msg of result.messages) {
      const extractFiles = (files: unknown[]) => {
        for (const f of files as Record<string, unknown>[]) {
          if (f.url_private) {
            allFiles.push({
              id: (f.id as string) || '',
              name: (f.name as string) || 'unnamed',
              title: (f.title as string) || (f.name as string) || 'unnamed',
              mimetype: (f.mimetype as string) || 'application/octet-stream',
              filetype: (f.filetype as string) || 'unknown',
              url_private: f.url_private as string,
              permalink: (f.permalink as string) || '',
              permalink_public: f.permalink_public as string | undefined,
              size: (f.size as number) || 0,
              timestamp: (f.timestamp as number) || 0,
              user: (f.user as string) || '',
            });
          }
        }
      };

      if (msg.files && Array.isArray(msg.files)) {
        extractFiles(msg.files);
      }

      // スレッド内のメッセージもチェック
      if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
        try {
          const replies = await userClient.conversations.replies({
            channel: CHANNEL_ID,
            ts: msg.thread_ts,
            limit: 100,
          });

          if (replies.ok && replies.messages) {
            for (const reply of replies.messages) {
              if (reply.files && Array.isArray(reply.files)) {
                extractFiles(reply.files);
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
      console.log(`File: ${file.name} (${file.id})`);
      console.log(`  Type: ${file.filetype} (${file.mimetype})`);
      console.log(`  Size: ${Math.round(file.size / 1024)} KB`);
      console.log(`  Permalink: ${file.permalink}`);
    }

    console.log('---');
    console.log('Attempting to get public URLs and download files...');
    console.log('');

    const downloadedFiles: Array<{ id: string; name: string; localPath: string; method: string }> = [];
    const failedFiles: Array<{ id: string; name: string; error: string }> = [];

    for (const file of uniqueFiles) {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const outputPath = path.join(OUTPUT_DIR, `${file.id}_${sanitizedName}`);

      console.log(`Processing: ${file.name}`);

      // 方法1: files.info API でファイル詳細を取得
      try {
        const fileInfo = await userClient.files.info({ file: file.id });

        if (fileInfo.ok && fileInfo.file) {
          const fileData = fileInfo.file as Record<string, unknown>;
          console.log(`  File info retrieved`);

          // permalink_public があれば使用
          if (fileData.permalink_public) {
            console.log(`  Has public permalink: ${fileData.permalink_public}`);

            // 公開URLからダウンロードを試みる
            const pubSecret = (fileData.permalink_public as string).split('-').pop();
            if (pubSecret && fileData.url_private) {
              const publicDownloadUrl = `${fileData.url_private}?pub_secret=${pubSecret}`;
              console.log(`  Trying public download URL...`);

              if (await downloadFile(publicDownloadUrl, outputPath)) {
                console.log(`✅ Downloaded via public URL: ${file.name}`);
                downloadedFiles.push({
                  id: file.id,
                  name: file.name,
                  localPath: `${file.id}_${sanitizedName}`,
                  method: 'public_url',
                });
                continue;
              }
            }
          }

          // 方法2: files.sharedPublicURL で公開リンクを作成
          try {
            console.log(`  Attempting to create public URL...`);
            const publicResult = await userClient.files.sharedPublicURL({ file: file.id });

            if (publicResult.ok && publicResult.file) {
              const publicFile = publicResult.file as Record<string, unknown>;
              const publicPermalink = publicFile.permalink_public as string;
              console.log(`  Public URL created: ${publicPermalink}`);

              // 公開URLからダウンロード
              const pubSecret = publicPermalink?.split('-').pop();
              if (pubSecret && fileData.url_private) {
                const publicDownloadUrl = `${fileData.url_private}?pub_secret=${pubSecret}`;
                console.log(`  Downloading from public URL...`);

                if (await downloadFile(publicDownloadUrl, outputPath)) {
                  console.log(`✅ Downloaded after creating public URL: ${file.name}`);
                  downloadedFiles.push({
                    id: file.id,
                    name: file.name,
                    localPath: `${file.id}_${sanitizedName}`,
                    method: 'shared_public_url',
                  });
                  continue;
                }
              }
            }
          } catch (shareErr) {
            console.log(`  Could not create public URL: ${shareErr instanceof Error ? shareErr.message : shareErr}`);
          }
        }
      } catch (infoErr) {
        console.log(`  Could not get file info: ${infoErr instanceof Error ? infoErr.message : infoErr}`);
      }

      // 方法3: Bot Token で直接ダウンロード
      console.log(`  Trying with Bot Token...`);
      if (await downloadFile(file.url_private, outputPath, SLACK_BOT_TOKEN)) {
        console.log(`✅ Downloaded with Bot Token: ${file.name}`);
        downloadedFiles.push({
          id: file.id,
          name: file.name,
          localPath: `${file.id}_${sanitizedName}`,
          method: 'bot_token',
        });
        continue;
      }

      // 方法4: User Token で直接ダウンロード
      console.log(`  Trying with User Token...`);
      if (await downloadFile(file.url_private, outputPath, SLACK_USER_TOKEN)) {
        console.log(`✅ Downloaded with User Token: ${file.name}`);
        downloadedFiles.push({
          id: file.id,
          name: file.name,
          localPath: `${file.id}_${sanitizedName}`,
          method: 'user_token',
        });
        continue;
      }

      // すべての方法が失敗
      console.log(`❌ Failed to download: ${file.name}`);
      failedFiles.push({
        id: file.id,
        name: file.name,
        error: 'All download methods failed',
      });
    }

    console.log('');
    console.log('---');
    console.log('Summary:');
    console.log(`  Downloaded: ${downloadedFiles.length}`);
    console.log(`  Failed: ${failedFiles.length}`);

    // マニフェストを保存
    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      channelId: CHANNEL_ID,
      totalFiles: uniqueFiles.length,
      downloadedCount: downloadedFiles.length,
      failedCount: failedFiles.length,
      downloadedFiles,
      failedFiles,
      originalFiles: uniqueFiles.map(f => ({
        id: f.id,
        name: f.name,
        mimetype: f.mimetype,
        size: f.size,
        permalink: f.permalink,
      })),
    }, null, 2));

    console.log(`Manifest saved to: ${manifestPath}`);

    // ファイル情報をマークダウンで保存
    const mdPath = path.join(OUTPUT_DIR, 'README.md');
    let mdContent = `# Slack添付ファイル

取得日時: ${new Date().toISOString()}
チャンネル: #8weeks_アプリ版_開発 (${CHANNEL_ID})

## ダウンロード結果

- **成功**: ${downloadedFiles.length}件
- **失敗**: ${failedFiles.length}件

`;

    if (downloadedFiles.length > 0) {
      mdContent += `## ダウンロード済みファイル\n\n`;
      for (const f of downloadedFiles) {
        mdContent += `- **${f.name}** → \`${f.localPath}\` (${f.method})\n`;
      }
      mdContent += '\n';
    }

    if (failedFiles.length > 0) {
      mdContent += `## ダウンロード失敗ファイル\n\n`;
      mdContent += `これらのファイルは手動でSlackからダウンロードしてください:\n\n`;
      for (const f of failedFiles) {
        const original = uniqueFiles.find(o => o.id === f.id);
        mdContent += `- **${f.name}** - [Slackで開く](${original?.permalink})\n`;
      }
      mdContent += '\n';
    }

    mdContent += `## 全ファイル一覧\n\n`;
    for (const f of uniqueFiles) {
      mdContent += `### ${f.name}\n`;
      mdContent += `- ID: ${f.id}\n`;
      mdContent += `- タイプ: ${f.filetype} (${f.mimetype})\n`;
      mdContent += `- サイズ: ${Math.round(f.size / 1024)} KB\n`;
      mdContent += `- [Slackで開く](${f.permalink})\n\n`;
    }

    fs.writeFileSync(mdPath, mdContent);
    console.log(`README saved to: ${mdPath}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
