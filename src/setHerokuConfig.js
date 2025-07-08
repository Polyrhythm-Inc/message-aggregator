const { exec } = require('child_process');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// .envファイルを読み込む
const envPath = path.resolve(__dirname, '.env.heroku');
if (!fs.existsSync(envPath)) {
  console.error('.env file not found');
  process.exit(1);
}

dotenv.config({ path: envPath });

// 環境変数をHerokuに設定するコマンドを生成
const envVars = dotenv.parse(fs.readFileSync(envPath));

const setConfigCommand = Object.keys(envVars)
  .map((key) => `heroku config:set ${key}='${envVars[key]}'`)
  .join(' && ');

console.log(setConfigCommand);

// コマンドを実行して環境変数をHerokuに設定
exec(setConfigCommand, (err, stdout, stderr) => {
  if (err) {
    console.error(`Error setting Heroku config vars: ${err}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(`stdout: ${stdout}`);
});
