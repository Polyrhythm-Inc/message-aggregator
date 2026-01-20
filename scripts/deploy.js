#!/usr/bin/env node

const https = require('https');
const http = require('http');

/**
 * デプロイメント管理APIにデプロイメント情報を送信する
 * @param {Object} options - デプロイメント情報
 * @param {string} options.apiUrl - APIのURL
 * @param {string} options.apiKey - APIキー
 * @param {string} options.applicationName - アプリケーション名
 * @param {string} options.environment - 環境名
 * @param {string} options.version - バージョン
 * @param {string} options.commitHash - コミットハッシュ
 * @param {string} options.status - ステータス
 * @param {Object} options.metadata - 追加メタデータ
 */
function recordDeployment(options) {
  const {
    apiUrl,
    apiKey,
    applicationName,
    environment,
    version,
    commitHash,
    status = 'SUCCESS',
    metadata = {}
  } = options;

  const data = JSON.stringify({
    applicationName,
    environment,
    version,
    commitHash,
    status,
    deployedBy: 'github-actions',
    notes: `Heroku deployment via GitHub Actions - ${status}`,
    metadata: {
      platform: 'heroku',
      ...metadata
    }
  });

  const url = new URL(apiUrl);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ デプロイメント記録が成功しました: ${res.statusCode}`);
          resolve(responseData);
        } else {
          console.error(`❌ デプロイメント記録が失敗しました: ${res.statusCode}`);
          console.error('Response:', responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ リクエストエラー:', error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// コマンドライン引数から環境変数を取得
const args = process.argv.slice(2);
const apiUrl = process.env.DEPLOYMENT_API_URL || args[0];
const apiKey = process.env.DEPLOYMENT_API_KEY || args[1];
const applicationName = process.env.APPLICATION_NAME || args[2] || 'message-aggregator';
const environment = process.env.ENVIRONMENT || args[3] || 'production';
const version = process.env.VERSION || args[4] || 'latest';
const commitHash = process.env.COMMIT_HASH || args[5] || '';
const status = process.env.STATUS || args[6] || 'SUCCESS';

if (!apiUrl || !apiKey) {
  console.error('❌ 必要な環境変数が設定されていません');
  console.error('使用方法: node deploy.js <api_url> <api_key> [app_name] [environment] [version] [commit_hash] [status]');
  console.error('または環境変数を設定してください:');
  console.error('  DEPLOYMENT_API_URL');
  console.error('  DEPLOYMENT_API_KEY');
  process.exit(1);
}

// デプロイメント記録を実行
recordDeployment({
  apiUrl,
  apiKey,
  applicationName,
  environment,
  version,
  commitHash,
  status,
  metadata: {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform
  }
})
.then(() => {
  console.log('🎉 デプロイメント記録が完了しました');
})
.catch((error) => {
  console.error('❌ デプロイメント記録に失敗しました:', error.message);
  process.exit(1);
}); 