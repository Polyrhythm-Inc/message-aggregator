# デプロイメントガイド

このドキュメントでは、GitHub Actionsを使用してHerokuにデプロイし、デプロイメント管理APIに情報を送信する方法を説明します。

## 前提条件

1. Herokuアカウントとアプリケーションが作成済み
2. GitHubリポジトリが設定済み
3. デプロイメント管理APIのAPIキーが取得済み

## 1. GitHub Secretsの設定

GitHubリポジトリの **Settings > Secrets and variables > Actions** で以下のシークレットを設定してください：

### 必須シークレット

- `HEROKU_API_KEY`: HerokuのAPIキー
- `HEROKU_APP_NAME`: Herokuアプリケーション名
- `HEROKU_EMAIL`: Herokuアカウントのメールアドレス
- `DEPLOYMENT_API_URL`: デプロイメント管理APIのURL
- `DEPLOYMENT_API_KEY`: デプロイメント管理APIのAPIキー

### 設定方法

1. GitHubリポジトリのページに移動
2. **Settings** タブをクリック
3. 左サイドバーから **Secrets and variables > Actions** を選択
4. **New repository secret** をクリック
5. 上記の各シークレットを追加

## 2. Herokuの設定

### 2.1 Heroku CLIでアプリケーションを作成

```bash
# Heroku CLIにログイン
heroku login

# 新しいアプリケーションを作成
heroku create your-app-name

# アプリケーション名を確認
heroku apps
```

### 2.2 環境変数の設定

既存の `setHerokuConfig.js` スクリプトを使用して環境変数を設定：

```bash
# アプリケーション名を指定して環境変数を設定
node setHerokuConfig.js your-app-name
```

## 3. デプロイメントの実行

### 3.1 タグベースのデプロイメント

新しいバージョンをリリースする場合：

```bash
# 新しいタグを作成してプッシュ
git tag v1.0.0
git push origin v1.0.0
```

### 3.2 手動デプロイメント

GitHubのActionsタブから手動でデプロイメントを実行できます：

1. GitHubリポジトリの **Actions** タブをクリック
2. **Deploy to Heroku** ワークフローを選択
3. **Run workflow** をクリック
4. 環境を選択（production または staging）
5. **Run workflow** をクリック

## 4. デプロイメントの確認

### 4.1 Herokuでの確認

```bash
# アプリケーションの状態を確認
heroku ps --app your-app-name

# ログを確認
heroku logs --tail --app your-app-name
```

### 4.2 デプロイメント管理APIでの確認

デプロイメント管理画面で以下を確認できます：

- 最新デプロイメント状況
- デプロイメント履歴
- 各環境のステータス

## 5. トラブルシューティング

### 5.1 よくある問題

**デプロイメントが失敗する場合：**

1. HerokuのAPIキーが正しく設定されているか確認
2. アプリケーション名が正しいか確認
3. Herokuアプリケーションが存在するか確認

**デプロイメント記録が失敗する場合：**

1. デプロイメント管理APIのURLが正しいか確認
2. APIキーが有効か確認
3. APIキーに `write` 権限があるか確認

### 5.2 ログの確認

```bash
# GitHub Actionsのログを確認
# GitHubのActionsタブから該当のワークフローをクリック

# Herokuのログを確認
heroku logs --app your-app-name
```

## 6. セキュリティ

- APIキーは絶対にコードにコミットしないでください
- 定期的にAPIキーをローテーションしてください
- 必要最小限の権限のみを付与してください

## 7. カスタマイズ

### 7.1 環境別の設定

異なる環境（staging、production）で異なる設定を使用する場合：

1. 環境変数に環境名を含める
2. ワークフローファイルで環境に応じた処理を追加

### 7.2 追加のデプロイメントステップ

必要に応じて、以下のようなステップを追加できます：

- データベースマイグレーション
- 静的ファイルのアップロード
- 通知の送信

## 8. 参考リンク

- [Heroku Deploy Action](https://github.com/marketplace/actions/heroku-deploy)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Heroku Platform API](https://devcenter.heroku.com/articles/platform-api-reference) 