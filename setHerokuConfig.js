#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// コマンドライン引数からアプリ名を取得
const appName = process.argv[2];

if (!appName) {
  console.error('❌ アプリ名を指定してください: node setHerokuConfig.js [app_name]');
  process.exit(1);
}

console.log(`🚀 Herokuアプリ "${appName}" の環境変数を設定します...`);

// .env.localファイルを読み込む関数
function loadEnvFile(filePath) {
  const envVars = {};
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${filePath} が見つかりません。スキップします。`);
    return envVars;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return envVars;
}

// Herokuに環境変数を設定する関数
function setHerokuConfig(key, value, appName) {
  try {
    if (!value) {
      console.log(`⚠️  ${key} の値が空です。スキップします。`);
      return;
    }

    console.log(`📝 ${key} を設定中...`);
    execSync(`heroku config:set ${key}="${value}" --app ${appName}`, { 
      stdio: 'inherit' 
    });
    console.log(`✅ ${key} を設定しました`);
  } catch (error) {
    console.error(`❌ ${key} の設定に失敗しました:`, error.message);
  }
}

try {
  // srcディレクトリの.env.localファイルを読み込み
  const srcEnvPath = path.join(__dirname, 'src', '.env.local');
  const rootEnvPath = path.join(__dirname, '.env.local');
  
  console.log('📂 環境変数ファイルを読み込み中...');
  
  // srcディレクトリの.env.localを優先して読み込み
  let envVars = loadEnvFile(srcEnvPath);
  
  // ルートディレクトリの.env.localも読み込み（存在する場合）
  const rootEnvVars = loadEnvFile(rootEnvPath);
  envVars = { ...rootEnvVars, ...envVars }; // srcの方を優先

  console.log('🔧 見つかった環境変数:', Object.keys(envVars));

  // 設定する環境変数のリスト
  const configsToSet = [
    'SLACK_BOT_TOKEN',
    'EXTERNAL_SLACK_WEBHOOK_URL',
    'CHATWORK_API_TOKEN',
    'CHATWORK_WEBHOOK_API_KEY'
  ];

  // 各環境変数をHerokuに設定
  configsToSet.forEach(key => {
    if (envVars[key]) {
      setHerokuConfig(key, envVars[key], appName);
    } else {
      console.log(`⚠️  ${key} が .env.local で見つかりませんでした`);
    }
  });

  // NODE_ENVを本番環境に設定
  setHerokuConfig('NODE_ENV', 'production', appName);

  console.log('\n🎉 環境変数の設定が完了しました！');
  console.log('\n📋 設定を確認するには以下のコマンドを実行してください:');
  console.log(`heroku config --app ${appName}`);

} catch (error) {
  console.error('❌ 環境変数の設定中にエラーが発生しました:', error.message);
  process.exit(1);
} 