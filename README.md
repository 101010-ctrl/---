# PATHCODE 3D

Blocklyで命令を組み、3Dのキャラクターを動かすパズルゲームです。
Three.js、Blockly、JavaScript、HTML、CSSを使っています。

## ゲームを開く

`outputs/pathcode-3d.html` をPCのブラウザで開きます。
単体HTMLで遊ぶ場合、Node.jsや開発サーバーは不要です。

## 開発する

Node.js 24系のセキュリティ更新済みバージョンとpnpmを使います。

```sh
pnpm install --frozen-lockfile
git config --local core.hooksPath .githooks
pnpm run dev
```

ターミナルに表示されたURLをブラウザで開きます。
主な編集対象は `src/main.js`、`src/style.css`、`index.html` です。

編集後は次のコマンドで、配布用の単体HTMLを更新します。

```sh
pnpm run build:portable
```

## GitHubへの保存

Gitは変更履歴をこのPCに記録する仕組みです。
commitはPC内への記録、pushはGitHubへの送信です。
このプロジェクトは指定されたGitHubリポジトリで管理します。
公開範囲はGitHub側の設定で確認し、Codexが無断で変更しない運用にします。

Codexには次のように依頼できます。

> ゲームを編集して、配布用HTMLも更新してください。
> 機密情報と差分を確認し、同じリポジトリへのpushは私が確認してから実行してください。

通常の保存手順は以下です。最初に `git status` と差分を確認します。

```sh
git status
git diff
git add .
node scripts/check-secrets.mjs --staged
git diff --cached --stat
git commit -m "Describe the game update"
```

ここまではPC内の操作です。送信内容を確認してから、初回は
`git push -u origin main`、以後は `git push` で送信します。
既存の履歴がある場合は、先にその履歴と統合します。force pushは使いません。

GitHubの認証にはGitHub CLIやブラウザの認証を使い、パスワードや
アクセストークンをソースコード、チャット、リポジトリURLに書かないでください。

## GitHub Pagesでゲームを公開する

リポジトリ直下の `index.html` は開発用です。これをそのまま公開すると、
ブラウザが `three` などの依存ライブラリを解決できず、画面の枠だけが表示されます。

`.github/workflows/pages.yml` は、更新済みの `outputs/pathcode-3d.html` だけを
公開用の `index.html` として配置します。ソース、バックアップ、認証ファイルを
公開用の成果物に含めません。機密情報チェックを通過した場合のみ公開します。

導入時は、pushと公開設定変更の承認を得た後、リポジトリの
Settings → Pages → Build and deployment → Source を GitHub Actions にします。
設定後は、承認済みの変更を `main` にpushするとサイトが更新されます。
ゲーム変更時は、push前に必ず `pnpm run build:portable` で単体HTMLを更新します。

Pagesの公開設定と、リポジトリのPublic/Private設定は別です。
リポジトリ自体をPrivateにしていても、Pagesのアクセス制限がない場合、
公開したゲームにはURLを知っている人がアクセスできます。

参考: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 保存対象と機密情報

ソース、設定、依存関係の固定ファイル、同梱Blockly、配布用HTMLを保存します。
`node_modules`、`dist`、キャッシュ、既存の `backups`、`work` は
このPCに残し、GitHubへの保存対象から除外します。
依存ライブラリや `dist` は上記のインストール・ビルドで再生成できます。

`.env`、秘密鍵、認証設定などは `.gitignore` で除外します。
commit直前にも `.githooks/pre-commit` が既知のトークン形式、秘密鍵、
パスワードなどの代入をチェックします。配布用HTMLに埋め込まれたJavaScriptも確認します。
検出時はcommitを止め、機密値そのものは表示しません。
この検査で全種類の機密情報を検出できるわけではないため、送信前に差分も確認します。

別のPCにcloneした場合も、`git config --local core.hooksPath .githooks` を実行してください。
