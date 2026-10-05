# GitHub Copilot で Code Apps の仕様変更・テスト・再デプロイを行う

この文書は、本リポジトリに GitHub Copilot (GHCP) と GitHub Actions を組み合わせた開発・運用フローを導入するための実現手段をまとめたものです。

基本のアプリ作成・公開手順は [README.md](README.md) を参照してください。

> 本書は設計と導入手順のサンプルです。記載したワークフロー、テスト、認証設定はまだリポジトリに実装していません。YAML 例は、後述の準備を完了したうえで検証環境から導入してください。本書の作成による権限付与やデプロイは行っていません。

## 1. 目指す運用

```text
Issue に仕様・受け入れ条件を記載
  -> Copilot が変更とテストを実装
  -> PR を作成・更新
  -> GitHub Actions で lint・テスト・ビルド
  -> 人がレビューして main にマージ
  -> 承認を経て検証環境の Code Apps を更新
  -> 公開 URL で稼働確認
  -> 必要に応じて本番へ展開
```

**Copilot は実装を支援し、Actions は決められた検証・デプロイを実行します。** Copilot に本番資格情報を渡し、PR 内の任意のコードから本番を直接更新させる構成にはしません。

仕様は Issue を起点にすると整理しやすくなります。既存 PR の本文に仕様を書くことも可能ですが、PR を書くだけでは Copilot の実装は始まりません。VS Code で明示的に作業を依頼するか、利用可能な GitHub の Copilot cloud agent (coding agent) に Issue を割り当てるなどして起動します。

### 段階的に導入する

| 段階 | 変更・テスト | 再デプロイ | 用途 |
| --- | --- | --- | --- |
| A: ローカル中心 | VS Code の Copilot と PR の CI | 人の承認後にローカルで `pa app push` | 最初の導入、認証設定を増やしたくない場合 |
| B: CI/CD | Copilot が PR を作成し、Actions が検証 | main の検証成功後、Actions が既存の検証用アプリを更新 | 繰り返しの仕様変更 |
| C: 環境間 ALM | B に加え、ソリューション単位で検証 | Power Platform Pipelines 等で Dev / Test / Prod に展開 | 本番運用 |

本書の Actions 例は **B の「既存の検証用アプリを更新する」フロー**です。本番アプリの新規作成や複数環境への直接 push まで自動化するものではありません。

## 2. このリポジトリの現状と準備

2026-10-05 時点で、`my-app` のソースとロックファイルを Git 管理に追加しました。ローカルの公開先設定、環境変数ファイル、エディター設定は除外しています。`lint` と `build` は成功していますが、テストスクリプトと CI/CD は未実装です。ユーザーのローカル操作では `pa app push` が成功していますが、公開画面の正常動作や CI 認証まで検証済みという意味ではありません。

導入前に、次を準備します。

1. アプリのソース、依存関係の定義、ロックファイルの Git 管理は対応済みです。
2. ローカルの公開先設定の除外は対応済みです。CI 用に環境固有値を含まない設定テンプレートを追加します。
3. 単体・UI テストと `test:ci` スクリプトを追加します。
4. GitHub Actions の PR 検証を追加し、required status check に設定します。
5. 自動 CD を使う場合だけ、デプロイ専用サービスプリンシパルと GitHub Environment を構成します。

### 管理するファイルの構成例

以下は導入後の構成案です。テストとワークフローは今後作成します。

```text
.github/
  workflows/
    code-apps.yml
my-app/
  src/
  public/
  tests/
  package.json
  package-lock.json
  power.config.template.json
  vite.config.ts
  vitest.config.ts
README.md
CICD__sample.md
.gitignore
```

ルートの Git 除外設定には、次のルールを設定済みです。

```gitignore
/secure_doc/
/.vscode/
/my-app/power.config.json
**/.env
**/.env.*
!**/.env.example
**/coverage/
**/playwright-report/
**/test-results/
```

`node_modules` と `dist` はアプリ側の既存ルールで除外されています。除外設定後に `git status` とステージ済み差分を確認し、対象を選んでコミットします。既に追跡済みのファイルには `.gitignore` の追加だけでは効きません。

環境 ID とアプリ ID はパスワードではありませんが、公開チュートリアルに実環境の値を固定すると、別の利用者が誤った公開先を参照する原因になります。ローカルの設定は残し、テンプレートとは分離します。認証キャッシュやブラウザーの認証状態もコミットしません。

### 公開先設定のテンプレート

次の JSON を、構成例に示した設定テンプレートとして追加します。アプリ ID と環境 ID は空のままにし、CI のビルドではこれを作業用設定へコピーします。CD では GitHub Environment の値を設定します。

```json
{
  "version": "1.0",
  "appId": "",
  "appDisplayName": "Code Apps with VS Code",
  "region": "prod",
  "appType": "CodeApp",
  "environmentId": "",
  "description": "Code Apps tutorial",
  "buildPath": "./dist",
  "buildEntryPoint": "index.html",
  "localAppUrl": "http://localhost:3000",
  "logoPath": "Default",
  "connectionReferences": {},
  "databaseReferences": {}
}
```

これは現在の、外部データ接続がないアプリ用です。接続を追加した場合は接続参照とソリューションの ALM を設計し直してください。`region: "prod"` は CLI の構成値であり、組織の本番環境を指定する意味ではありません。公開先は環境 ID とアプリ ID で確認します。

CI では認証不要でビルド・テストできることを最初に確認します。SDK やプラグインの変更で環境アクセスが必要になった場合は、UI テスト用に SDK をモック化するなどして切り離します。PR のビルドを通すために本番の資格情報を渡してはいけません。

## 3. 仕様変更を依頼する

### Issue の例

```markdown
## 目的
Code Apps のトップ画面にタスク一覧を追加する。

## 変更範囲
- タスク名の入力と追加ボタンを設ける。
- タスクの完了・未完了を切り替えられる。
- この変更では外部データ接続を追加しない。
- タスクは画面内の状態だけで管理し、再読み込み時に初期化する。

## 受け入れ条件
- 入力の前後の空白を取り除き、空のタスクは追加できない。
- 追加後は入力欄が空になる。
- 完了状態を切り替えられる。
- キーボードで入力、追加、状態変更ができる。
- 375px 幅とデスクトップ幅で操作要素が重ならない。
- 既存の起動処理を壊さない。

## 検証
- lint、単体・UI テスト、ビルドが成功する。
- 検証環境の公開 URL で上記の操作を確認する。

## 対象外
- 本番への直接デプロイ
- 認証、接続先、権限の変更
```

### VS Code の Copilot に依頼する例

```text
Issue #<番号> の仕様と受け入れ条件に従い、my-app を変更してください。
Issue 本文を取得できない場合は、取得できたふりをせず本文の提示を求めてください。

変更前に既存コードとテスト設定を確認してください。
仕様変更と対応するテストを実装し、lint、test:ci、build を実行してください。
認証情報、公開先設定、secure_doc、GitHub Actions の権限は変更しないでください。
デプロイは行わず、変更内容、テスト結果、未確認事項を PR 本文にまとめてください。
ブランチ名は feature/issue-<番号> とし、main に直接 push しないでください。
GitHub 操作用の権限がなければ、ローカルの変更と PR 本文案まで作成してください。
```

GitHub 上のエージェントを使う場合は、契約・組織ポリシー・リポジトリ設定で利用可能かを確認し、Issue を割り当てるなどの方法で作業を開始します。エージェントが作った PR の Actions 実行には承認が必要になる場合があります。ワークフロー差分を確認してから承認してください。

### PR に残す情報

- 関連 Issue と変更の目的
- 受け入れ条件ごとの対応内容
- 実行したテストと結果。未実行のテストは未実行と明記
- UI 変更前後の画面、既知の制約、影響範囲
- 公開先の種別、再デプロイ後の確認項目、戻し方

エージェントの「完了」報告だけでマージせず、コード差分と CI の結果を人が確認します。

## 4. テストを用意する

| 層 | 推奨ツール・方法 | 確認内容 |
| --- | --- | --- |
| 静的チェック | ESLint / TypeScript | コード規約と型エラー。現在の build は TypeScript のチェックを含みます |
| 単体テスト | Vitest | 空文字の拒否、状態更新などのロジック |
| UI テスト | React Testing Library + user-event | 入力・追加・状態変更・アクセシブルな名前 |
| ローカル E2E | Playwright | 画面遷移、画面幅、実ブラウザー操作 |
| 公開先確認 | 認証済みユーザーによる確認 | Power Apps での起動、同意、共有、データ接続、操作 |

単体・UI テストの導入例は、アプリのフォルダーで次を実行する形です。

```powershell
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Vitest に `jsdom` とテスト用セットアップを設定し、npm スクリプトに `"test:ci": "vitest run"` を追加します。少なくとも受け入れ条件に対応するテストを実装してから、後述の CI を有効化します。`--passWithNoTests` や `--if-present` でテスト未実装を成功扱いにしないでください。

Power Apps SDK に依存する機能は、PR のテストではモック化し、実接続を使うテストと分離します。CI/CD の例に Playwright は含めていません。追加するときはブラウザーのインストール、テストサーバーの起動、レポートの保存まで構成します。

公開 URL が HTTP 200 を返すだけでは、サインイン画面が応答している可能性があります。公開先の正常性はログイン後のアプリ表示と操作で判定してください。サービスプリンシパルによる発行成功は、利用者のブラウザー認証成功を保証しません。

## 5. 段階 A: ローカルから再デプロイする

CI の認証設定を用意する前でも、この方法で仕様変更から再公開まで進められます。

1. Copilot が作成した変更とテストを PR でレビューします。
2. CI 成功後に main にマージします。
3. 作業ツリーに未コミット変更がないことを確認し、ローカルの main を fast-forward で更新します。
4. アプリのフォルダーで、順番に `npm ci`、`npm run lint`、`npm run test:ci`、`npm run build` を実行します。どれかが失敗したら停止します。
5. `pa auth status` とローカルの公開先設定を確認します。必要なら正しい作成者アカウントへ切り替えます。
6. 承認済みの対象環境に対して `pa app push` を実行します。
7. ローカルサーバーを停止し、公開 URL で受け入れ条件を確認します。

`pac` と `pa` の認証は独立しています。過去の `pac auth` 成功を根拠に、`pa` のアカウントも正しいと判断しないでください。

## 6. 段階 B: 自動 CD の認証と権限を準備する

### 6-1. デプロイ用サービスプリンシパル

管理者と次の条件を満たすサービスプリンシパルを用意します。

- 対象の Power Platform 検証環境にアクセスできること
- 既に公開された対象 Code App に対する編集権限があること
- デプロイ用のアプリケーション (クライアント) ID、ディレクトリ (テナント) ID、有効なクライアントシークレットがあること
- シークレットの所有者、有効期限、更新手順が決まっていること

環境へのアクセス権とアプリの編集権限は別です。Dataverse のアプリケーションユーザーやセキュリティロールなど、対象環境で必要な設定は管理者が確認し、最小権限で構成します。

### 6-2. アプリ作成者が一度だけ編集権限を付与する

サービスプリンシパル認証を有効にしていないローカルターミナルで、アプリのフォルダーから実行します。

```powershell
pa auth login --account "<maker-email>"
pa auth switch --account "<maker-email>"
pa auth status
```

正しい作成者アカウントと公開先を確認した後に、次を実行します。

```powershell
pa app share --principal "<enterprise-application-object-id>" --access edit
```

ここで渡すのは **Enterprise applications に表示されるサービスプリンシパルの Object ID** です。アプリ登録の Object ID やクライアント ID と混同しないでください。この権限付与は一度だけ行い、毎回の CI/CD に含めません。サービスプリンシパル自身に自己付与させることもできません。

### 6-3. GitHub Environment を作る

リポジトリの **Settings > Environments** で `codeapps-dev` を作り、デプロイ可能なブランチを `main` に制限します。利用プラン・公開範囲で利用できる場合は Required reviewers を設定し、承認前にはデプロイを実行できないようにします。

| 種別 | 名前 | 値 |
| --- | --- | --- |
| Environment variable | `POWER_PLATFORM_ENVIRONMENT_ID` | 公開済みアプリの環境 ID |
| Environment variable | `POWER_APPS_APP_ID` | 更新する公開済みアプリの ID |
| Environment variable | `POWER_APPS_CLIENT_ID` | デプロイ用アプリケーションのクライアント ID |
| Environment variable | `POWER_APPS_TENANT_ID` | 対象テナント ID |
| Environment secret | `POWER_APPS_CLIENT_SECRET` | デプロイ用クライアントシークレット |

シークレットは GitHub の設定画面などから直接登録し、Issue、PR、チャット、ソースコード、ターミナル履歴には記載しません。GitHub Environment を作るだけでは承認制にならないため、保護ルールも確認してください。必要な承認機能が利用できない場合は、段階 A の手動公開を承認ゲートとして継続します。

現在の公式 `pa` 手順で確認できる非対話認証は、`PA_CLI_USE_SP_AUTH=true` とクライアント ID・シークレット・テナント ID を使う方式です。OIDC や `azure/login` のトークンを `pa` がそのまま利用できるとは仮定しません。シークレット方式を許可しない組織では、認証方式が検証できるまで自動 CD を有効化しないでください。

## 7. GitHub Actions の CI/CD 例

導入時に、構成例のワークフローファイルとして次の YAML を追加します。**設定テンプレート、テスト、`test:ci`、Environment の準備が前提**です。依存パッケージとロックファイルもコミットしてください。

PR と main の更新時に検証し、main の検証成功後だけデプロイします。ビルド済み成果物を受け渡すので、デプロイ時に別のソースから再ビルドしません。PR ではデプロイ用シークレットを使いません。

```yaml
name: Code Apps CI/CD

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: my-app
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.0'
          cache: npm
          cache-dependency-path: my-app/package-lock.json
      - run: npm ci
      - name: Prepare build configuration
        run: cp power.config.template.json power.config.json
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
      - name: Upload deployment artifact
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: actions/upload-artifact@v4
        with:
          name: code-app-${{ github.sha }}
          path: my-app/dist/
          if-no-files-found: error
          retention-days: 7

  deploy:
    name: Deploy Dev
    needs: validate
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: codeapps-dev
    concurrency:
      group: codeapps-dev
      cancel-in-progress: false
    defaults:
      run:
        working-directory: my-app
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - name: Reject stale deployment
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          current_sha=$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha)
          if [ "$current_sha" != "$GITHUB_SHA" ]; then
            echo "main has advanced; deploy the newer run instead."
            exit 1
          fi
      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.0'
          cache: npm
          cache-dependency-path: my-app/package-lock.json
      - run: npm ci
      - name: Restore validated artifact
        uses: actions/download-artifact@v4
        with:
          name: code-app-${{ github.sha }}
          path: my-app/dist
      - name: Configure deployment target
        env:
          TARGET_ENVIRONMENT_ID: ${{ vars.POWER_PLATFORM_ENVIRONMENT_ID }}
          TARGET_APP_ID: ${{ vars.POWER_APPS_APP_ID }}
        run: |
          node --input-type=module <<'NODE'
          import { readFileSync, writeFileSync } from 'node:fs';
          const config = JSON.parse(readFileSync('power.config.template.json', 'utf8'));
          const environmentId = process.env.TARGET_ENVIRONMENT_ID;
          const appId = process.env.TARGET_APP_ID;
          const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!guid.test(environmentId ?? '') || !guid.test(appId ?? '')) {
            throw new Error('A valid environment ID and existing app ID are required.');
          }
          config.environmentId = environmentId;
          config.appId = appId;
          writeFileSync('power.config.json', JSON.stringify(config, null, 2));
          NODE
      - name: Publish existing code app
        env:
          PA_CLI_USE_SP_AUTH: 'true'
          PA_CLI_SP_CLIENT_ID: ${{ vars.POWER_APPS_CLIENT_ID }}
          PA_CLI_SP_TENANT_ID: ${{ vars.POWER_APPS_TENANT_ID }}
          PA_CLI_SP_CLIENT_SECRET: ${{ secrets.POWER_APPS_CLIENT_SECRET }}
        run: ./node_modules/.bin/pa app push --non-interactive
```

### この例の注意点

- `test:ci` が未定義、またはテストが未実装なら失敗させます。現在のアプリをそのまま登録するだけでは、この CI は完了しません。
- CLI はグローバルの最新版ではなく、アプリのロックファイルに固定されたローカル依存を使います。採用版で SP 認証と push の動作を検証し、更新は別 PR で行います。
- `concurrency` は同時公開を防ぎますが、実行順を保証しません。古い main の実行を再試行して新しい版を上書きしないよう、公開ジョブで SHA を確認しています。ロールバックは後述の revert PR で行います。
- シークレットは発行ステップだけに渡します。フロントエンドのビルド環境に渡したり、`VITE_` 付きの変数に格納したりしません。
- Actions の参照は読みやすさのためバージョンタグです。本番運用では承認した完全なコミット SHA に固定し、更新を管理します。
- `pull_request_target` で PR のコードをチェックアウトして秘密情報付きで実行する構成にはしません。
- デプロイ用 ID は空の値を拒否しますが、その ID が意図したアプリかどうかは管理者が登録時に照合する必要があります。
- この YAML は公開後の認証付き E2E まで自動化していません。発行が成功しても、次の稼働確認が完了するまでリリース完了にはしません。

## 8. 稼働確認と運用記録

デプロイ完了後に、検証担当者が次を確認して PR またはリリース記録に残します。

- デプロイしたコミット SHA、Actions の実行 URL、対象環境、アプリの公開 URL
- ローカルサーバーを停止した状態での起動
- 利用者アカウントでのサインインと必要な同意
- Issue の受け入れ条件に沿った操作
- 共有先ユーザーでの起動、必要なライセンスとデータアクセス
- ブラウザーの実行時エラーの有無。ログや画面に個人情報がある場合はマスク

認証付き E2E を自動化する場合は、テスト用アカウント、条件付きアクセス、MFA、セッションの保管・期限切れを別途設計します。MFA を一律に無効化したり、利用者の Cookie をリポジトリへ格納したりしてはいけません。自動化できるまでは、人による公開後確認を必須にします。

### 問題が起きた場合

| 状況 | 対応 |
| --- | --- |
| PR のテストが失敗 | Copilot に失敗したログと受け入れ条件を渡し、修正後に同じテストを再実行します |
| CI でサインインを要求される | PR 検証に実環境依存が混入していないか確認します。資格情報の追加で回避しません |
| CD の認証に失敗 | SP のテナント、シークレット有効期限、Environment の変数・Secret を確認します |
| CD でアクセス拒否 | 環境へのアクセスとアプリの `edit` 共有を個別に確認します |
| `ServiceToServiceEnvironmentNotFound` | 環境 ID と認証先テナントの組み合わせを確認します |
| push 成功後に画面が壊れる | 公開後確認を失敗として記録し、修正またはロールバックを行います |

### ロールバック

問題を含む変更を打ち消す **revert PR** を作成し、CI・レビュー・承認を通して同じ既存アプリへ再デプロイします。main を強制的に巻き戻したり、別アプリを新規作成して URL を変更したりしません。

フロントエンドを元に戻しても、データ変更や接続・権限の変更は戻りません。データ移行が伴う場合は、その復旧計画を仕様変更時点で別に定義します。

## 9. 段階 C: 本番への環境間展開

Dev / Test / Prod を分ける場合は、Code Apps を Dataverse ソリューションに含め、Power Platform Pipelines などの ALM を利用する方法があります。公式資料では、ソリューションのエクスポート・インポートによる Code Apps の移動が案内されています。

明示的なソリューションへの発行例は次のとおりです。

```powershell
pa app push --solution-id "<solution-id>"
```

これはソリューションへの追加・更新であり、他環境への展開そのものではありません。接続参照、ソリューション環境変数、依存関係、展開権限、各環境での共有と承認を整えてから環境間展開を構成します。本書の単一環境 CD と、ソリューションを使った昇格を混同しないでください。

また、Code Apps は現時点の公式 ALM 資料では Power Platform のソースコード Git 統合をサポートしていません。通常の Web アプリのソースを GitHub で管理し、Actions からビルドすることとは別の制約です。

## 10. 導入完了チェック

- [ ] アプリ本体とロックファイルを Git 管理し、実環境設定・資格情報を除外した
- [ ] 受け入れ条件に対応するテストと `test:ci` を実装した
- [ ] 認証情報なしで PR の lint・テスト・ビルドが通った
- [ ] main への直接更新を制限し、レビューと Validate チェックを必須にした
- [ ] ワークフローの変更を管理者がレビューするルールを設けた
- [ ] デプロイ用 SP に環境アクセスと対象アプリの編集権限を付与した
- [ ] GitHub Environment の公開先、Secret、main 制限、承認ルールを確認した
- [ ] 検証環境で、main の変更が同じアプリ ID に再デプロイされた
- [ ] 公開後の動作確認と記録が完了した
- [ ] revert PR による復旧手順を検証した

## 参考資料

公式情報の参照日: 2026-10-05。実際の導入時は CLI の採用版、GitHub の契約・組織設定、最新ドキュメントを確認してください。

- [GitHub Copilot セッションの開始](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/assign-tasks-to-copilot)
- [GitHub Actions の Environment とデプロイ保護](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
- [サービスプリンシパルによる Code Apps の公開](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)
- [Power Apps CLI の環境変数](https://learn.microsoft.com/power-apps/developer/code-apps/reference/environment-variables)
- [Power Apps CLI リファレンス](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
- [Code Apps の ALM](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/alm)
- [Power Platform Pipelines](https://learn.microsoft.com/power-platform/alm/pipelines)