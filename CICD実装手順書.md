# Code Apps CI/CD 実装手順書

## 1. 目的

本書は、このリポジトリの React / Power Apps Code Apps アプリに、GitHub Actions を利用した CI/CD を段階的に導入するための実装手順です。

最終的に、次の運用を実現します。

```text
Issue に仕様と受け入れ条件を記載
  -> 実装とテストを作成
  -> Pull Request を作成
  -> GitHub Actions で lint・テスト・ビルド
  -> レビュー後に main へマージ
  -> 承認後に検証環境の既存 Code App を更新
  -> 公開 URL で稼働確認
```

本書では、最初から自動デプロイを有効にせず、次の順番で導入します。

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| 1 | テストと認証不要の CI | PR で lint・テスト・ビルドが成功する |
| 2 | main の保護と手動デプロイ | レビュー済みの main をローカルから安全に再公開できる |
| 3 | 検証環境への自動 CD | 承認後に既存の検証用アプリが自動更新される |
| 4 | 運用定着 | 公開後確認とロールバックを含めて記録できる |

本書の自動 CD は、単一の検証環境に存在する既存 Code App の更新を対象とします。本番アプリの新規作成や Dev / Test / Prod 間の環境間展開は対象外です。

## 2. 現在の状態

対象アプリは `my-app` にあります。

現時点の状態は次のとおりです。

- React、TypeScript、Vite を使用している
- `package-lock.json` を Git 管理している
- `npm run lint` と `npm run build` が定義されている
- 単体テストと UI テストは未実装
- `test:ci` スクリプトは未定義
- GitHub Actions ワークフローは未実装
- ローカル公開先の `my-app/power.config.json` は Git 管理から除外されている

## 3. 役割分担

導入前に、担当者を決めます。

| 役割 | 主な作業 |
| --- | --- |
| アプリ開発者 | テスト、ワークフロー、アプリ変更の実装 |
| リポジトリ管理者 | Branch protection、Ruleset、GitHub Environment の設定 |
| Power Platform 管理者 | 検証環境へのアクセス権、アプリケーションユーザー、セキュリティロールの設定 |
| Entra ID 管理者 | デプロイ用サービスプリンシパルとクライアントシークレットの管理 |
| 検証担当者 | 公開後のログイン、画面表示、受け入れ条件の確認 |

同一人物が複数の役割を担当しても構いません。ただし、デプロイ資格情報は必要最小限の担当者だけが管理します。

## 4. 段階1: テストと認証不要の CI

### 4-1. 作業ブランチを作成する

作業ブランチとは、`main` の安定した状態を保ったまま、機能追加や設定変更を行うための一時的なブランチです。変更は作業ブランチで実施し、テストとレビューが完了した後に Pull Request を通して `main` へ取り込みます。この手順では、CI 導入作業であることが分かるように `feature/code-apps-ci` という名前を使用します。

最新の `main` から作業ブランチを作成します。

```powershell
cd C:\github\code-apps-with-vscode
git status
git switch main
git pull --ff-only
git switch -c feature/code-apps-ci
```

未コミットの変更がある場合は、内容を確認してから作業を開始します。

### 4-2. テストパッケージを追加する

アプリのフォルダーで、Vitest と React Testing Library を追加します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

この操作では、`package.json` と `package-lock.json` の両方を更新します。

### 4-3. npm スクリプトを追加する

`my-app/package.json` の `scripts` に、次のスクリプトを追加します。

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest",
    "test:ci": "vitest run",
    "preview": "vite preview"
  }
}
```

`test:ci` には `--passWithNoTests` を追加しません。テストがない状態を成功扱いにしないためです。

### 4-4. Vitest を設定する

`my-app/vitest.config.ts` を作成し、テスト環境を `jsdom` に設定します。

設定する主な内容は次のとおりです。

- React プラグインを使用する
- テスト環境に `jsdom` を使用する
- テストセットアップファイルを読み込む
- テスト実行時にグローバル API を利用できるようにする

`my-app/src/test/setup.ts` を作成し、`@testing-library/jest-dom/vitest` を読み込みます。

### 4-5. 最初の UI テストを作成する

現在の `my-app/src/App.tsx` に対して、少なくとも次を検証します。

1. 初期表示に `count is 0` ボタンが存在する
2. ボタンをクリックすると `count is 1` になる
3. ボタンをアクセシブルな名前で取得できる

テストファイルの例は `my-app/src/App.test.tsx` です。

今後アプリの仕様を変更する場合は、Issue の受け入れ条件に対応するテストを追加します。Power Apps SDK や実環境に依存する機能は PR のテストではモック化し、実接続を使う検証と分離します。

### 4-6. 公開先設定テンプレートを作成する

`my-app/power.config.template.json` を作成します。

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

テンプレートの `appId` と `environmentId` は空のままコミットします。実際の値を含む `my-app/power.config.json` はコミットしません。

### 4-7. CI ワークフローを作成する

`.github/workflows/code-apps.yml` を作成します。最初の Pull Request では、デプロイを含めず `validate` ジョブだけを実装します。

```yaml
name: Code Apps CI

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
```

本番運用では、確認済みの GitHub Actions を完全なコミット SHA に固定し、更新を別 Pull Request で管理することを推奨します。

### 4-8. ローカルで検証する

アプリのフォルダーで、CI と同じ順番で検証します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm ci
Copy-Item power.config.template.json power.config.json -Force
npm run lint
npm run test:ci
npm run build
```

いずれかが失敗した場合は、後続の作業へ進まず原因を修正します。

### 4-9. Pull Request で CI を確認する

変更をコミットして Pull Request を作成します。

Pull Request では次を確認します。

- GitHub Actions の `Validate` が起動する
- Secret を設定しなくても成功する
- `npm ci` がロックファイルどおりに依存関係を復元する
- テストが実際に実行される
- `dist` の生成に成功する

### 4-10. 段階1の完了条件

- [ ] `test:ci` が定義されている
- [ ] 受け入れ条件に対応するテストが存在する
- [ ] `power.config.template.json` に実環境の ID が含まれていない
- [ ] ローカルで lint・テスト・ビルドが成功する
- [ ] Pull Request の `Validate` が認証情報なしで成功する

## 5. 段階2: main の保護と手動デプロイ

### 5-1. main を保護する

GitHub のリポジトリ設定で、Branch protection rule または Ruleset を作成します。

推奨設定は次のとおりです。

- `main` への直接 push を制限する
- Pull Request を必須にする
- 1 名以上のレビューを必須にする
- `Validate` を required status check にする
- 未解決のレビューコメントがある場合はマージを禁止する
- ワークフロー変更時に管理者または指定チームのレビューを必須にする
- 強制 push と branch deletion を禁止する

設定後、テスト用 Pull Request で、`Validate` が失敗している間はマージできないことを確認します。

### 5-2. main をローカルへ反映する

Pull Request のマージ後、未コミット変更がないことを確認して `main` を更新します。

```powershell
cd C:\github\code-apps-with-vscode
git status
git switch main
git pull --ff-only
```

### 5-3. デプロイ前検証を実行する

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm ci
npm run lint
npm run test:ci
npm run build
```

どれかが失敗した場合はデプロイしません。

### 5-4. 認証状態と公開先を確認する

`pac` と `pa` の認証は別に管理されます。`pac auth` が成功していても、`pa` が正しいアカウントを利用しているとは限りません。

```powershell
pa auth status
```

次を確認します。

- 正しい作成者アカウントを使用している
- `power.config.json` の環境 ID が検証環境を指している
- `power.config.json` のアプリ ID が更新対象の既存アプリを指している

必要な場合は、正しいアカウントへ切り替えます。

```powershell
pa auth login --account "<maker-email>"
pa auth switch --account "<maker-email>"
pa auth status
```

### 5-5. 既存アプリを更新する

```powershell
pa app push
```

新規アプリではなく、意図した既存アプリが更新されたことを確認します。

### 5-6. 公開後確認を実施する

ローカル開発サーバーを停止した状態で、公開 URL を開きます。

次を確認します。

- 利用者アカウントでサインインできる
- 必要な同意画面を完了できる
- アプリの初期画面が表示される
- Issue の受け入れ条件どおりに操作できる
- 共有先ユーザーでも起動できる
- ブラウザーのコンソールに実行時エラーがない

HTTP 200 が返るだけでは正常と判定しません。サインイン画面が応答しているだけの場合があるため、ログイン後の表示と操作を確認します。

### 5-7. 段階2の完了条件

- [ ] `main` への直接更新が制限されている
- [ ] `Validate` が required status check になっている
- [ ] レビュー済みの `main` から手動デプロイできる
- [ ] 同じ既存アプリ ID が更新される
- [ ] 公開後のログインと受け入れ条件を確認できる

## 6. 段階3: 検証環境への自動 CD

段階2の手動デプロイが成功してから着手します。

### 6-1. デプロイ用サービスプリンシパルを用意する

Entra ID 管理者と Power Platform 管理者へ、デプロイ専用サービスプリンシパルの準備を依頼します。

必要な情報は次のとおりです。

- アプリケーションのクライアント ID
- ディレクトリのテナント ID
- 有効なクライアントシークレット
- クライアントシークレットの所有者と有効期限
- シークレット更新手順

必要な権限は次のとおりです。

- 対象 Power Platform 検証環境へのアクセス
- 対象の既存 Code App に対する編集権限
- 必要最小限の Dataverse セキュリティロール

環境へのアクセス権と Code App の編集権限は別に確認します。

### 6-2. サービスプリンシパルにアプリ編集権限を付与する

アプリ作成者が、サービスプリンシパル認証を有効にしていないローカルターミナルで一度だけ実行します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
pa auth login --account "<maker-email>"
pa auth switch --account "<maker-email>"
pa auth status
pa app share --principal "<enterprise-application-object-id>" --access edit
```

`--principal` に渡す値は、Entra ID の Enterprise applications に表示されるサービスプリンシパルの Object ID です。

次の値とは異なるため、混同しないようにします。

- アプリケーションのクライアント ID
- App registrations 側の Object ID

この共有処理は毎回の CI/CD には含めません。サービスプリンシパル自身に編集権限を自己付与させる構成にもしません。

### 6-3. GitHub Environment を作成する

リポジトリの `Settings > Environments` で、次の Environment を作成します。

```text
codeapps-dev
```

Environment variables を登録します。

| 名前 | 内容 |
| --- | --- |
| `POWER_PLATFORM_ENVIRONMENT_ID` | 公開先となる検証環境の ID |
| `POWER_APPS_APP_ID` | 更新対象の既存 Code App の ID |
| `POWER_APPS_CLIENT_ID` | デプロイ用サービスプリンシパルのクライアント ID |
| `POWER_APPS_TENANT_ID` | 対象テナントの ID |

Environment secret を登録します。

| 名前 | 内容 |
| --- | --- |
| `POWER_APPS_CLIENT_SECRET` | デプロイ用クライアントシークレット |

Environment の保護ルールとして、次を設定します。

- デプロイ可能なブランチを `main` に制限する
- 利用できる場合は Required reviewers を設定する
- 承認前にはデプロイ処理を開始できないことを確認する

GitHub Environment を作成しただけでは、必ずしも承認制にはなりません。リポジトリの公開範囲と GitHub プランで利用可能な保護ルールを確認します。必要な承認機能を利用できない場合は、段階2の手動デプロイを継続します。

クライアントシークレットは、GitHub の設定画面から直接登録します。ソースコード、Issue、Pull Request、チャット、Wiki、ターミナル履歴へ記載しません。

### 6-4. 検証済み成果物を保存する

`.github/workflows/code-apps.yml` の `validate` ジョブに、`main` の push の場合だけ `dist` を artifact として保存するステップを追加します。

```yaml
- name: Upload deployment artifact
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  uses: actions/upload-artifact@v4
  with:
    name: code-app-${{ github.sha }}
    path: my-app/dist/
    if-no-files-found: error
    retention-days: 7
```

デプロイジョブでは再ビルドせず、この検証済み artifact を使用します。

### 6-5. deploy ジョブを追加する

同じワークフローに `deploy` ジョブを追加します。

```yaml
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

### 6-6. 自動 CD の安全条件を確認する

ワークフローが次の条件を満たすことをレビューします。

- Pull Request ではデプロイジョブが実行されない
- Pull Request ではデプロイ Secret を使用しない
- `pull_request_target` で Pull Request のコードを実行しない
- `validate` が成功した場合だけデプロイできる
- 検証済み artifact をデプロイし、デプロイ時に再ビルドしない
- `environmentId` と `appId` の空値および不正な GUID を拒否する
- デプロイ用 Secret は `pa app push` のステップだけに渡す
- Secret を `VITE_` で始まる変数へ設定しない
- `concurrency` で同一環境への同時公開を防止する
- 古い Actions run が新しい main を上書きしない

### 6-7. 検証環境への自動デプロイを試験する

小さな表示変更と対応するテストを Pull Request にします。

次の順番で動作を確認します。

1. Pull Request で `Validate` が成功する
2. Pull Request では `Deploy Dev` が実行されない
3. レビュー後に `main` へマージする
4. `main` の `Validate` が成功する
5. GitHub Environment の承認待ちになる
6. 承認後に `Deploy Dev` が成功する
7. Environment に登録した既存アプリ ID が更新される
8. 公開 URL で変更内容と受け入れ条件を確認する

### 6-8. 段階3の完了条件

- [ ] デプロイ用サービスプリンシパルの所有者と更新手順が決まっている
- [ ] サービスプリンシパルに環境アクセスとアプリ編集権限がある
- [ ] `codeapps-dev` の変数と Secret が登録されている
- [ ] デプロイ可能なブランチが `main` に制限されている
- [ ] Pull Request から Secret へアクセスできない
- [ ] 承認後に同じ既存アプリ ID が自動更新される
- [ ] 公開後確認が成功する

## 7. 段階4: 運用手順

### 7-1. Issue に仕様を書く

Issue には最低限、次を記載します。

- 目的
- 変更範囲
- 対象外
- 受け入れ条件
- テスト方法
- データ、接続、権限への影響
- ロールバック時の注意点

受け入れ条件は、実装者と検証担当者が同じ結果を判断できる具体的な記述にします。

### 7-2. Pull Request を作成する

Pull Request には次を記載します。

- 対応した Issue
- 変更内容
- 追加または更新したテスト
- ローカルで実行した検証コマンド
- データ、接続、権限への影響
- 公開後に確認する項目

### 7-3. デプロイ記録を残す

デプロイ後、Pull Request、リリース記録、または組織で定めた台帳に次を記録します。

- デプロイしたコミット SHA
- GitHub Actions の実行 URL
- 対象環境
- 対象アプリ ID
- 公開 URL
- Environment の承認者
- 公開後の確認者
- 受け入れ条件の確認結果
- ブラウザー実行時エラーの有無

ログや画面キャプチャに個人情報が含まれる場合はマスクします。

### 7-4. 問題発生時の対応

| 状況 | 対応 |
| --- | --- |
| PR のテストが失敗する | 失敗ログと受け入れ条件を確認し、修正後に同じテストを再実行する |
| CI がサインインを要求する | PR 検証に実環境依存が混入していないか確認し、資格情報の追加では回避しない |
| CD の認証に失敗する | テナント ID、クライアント ID、シークレットの期限、Environment の設定を確認する |
| CD がアクセス拒否になる | 環境アクセスと対象アプリの `edit` 共有を個別に確認する |
| `ServiceToServiceEnvironmentNotFound` が発生する | 環境 ID と認証先テナントの組み合わせを確認する |
| push 後に画面が壊れる | リリース失敗として記録し、修正またはロールバックを行う |

## 8. ロールバック

問題を含む変更を打ち消す revert Pull Request を作成します。

```powershell
git switch main
git pull --ff-only
git switch -c revert/<対象変更>
git revert <対象コミットSHA>
```

revert Pull Request も通常と同じ手順で処理します。

```text
Validate
  -> レビュー
  -> main へマージ
  -> Environment の承認
  -> 同じ既存アプリへ再デプロイ
  -> 公開後確認
```

`main` を強制的に巻き戻したり、別アプリを新規作成して公開 URL を変更したりしません。

フロントエンドのロールバックでは、次の変更は自動的に元へ戻りません。

- Dataverse のデータ変更
- スキーマ変更
- 接続参照
- 環境変数
- 共有設定
- セキュリティロール

これらを変更する場合は、Issue の作成時点で個別の復旧手順を定義します。

## 9. 本番環境へ進む場合

Dev / Test / Prod を分離する場合は、本書の単一環境向け CD をそのまま複製するのではなく、Dataverse ソリューションと Power Platform Pipelines などを使用した ALM を設計します。

検討項目は次のとおりです。

- Code App を含むソリューション
- managed / unmanaged の運用方針
- 接続参照
- ソリューション環境変数
- 依存関係
- 環境ごとのセキュリティロール
- 環境ごとの共有設定
- 展開承認
- データ移行
- 障害時の復旧方法

`pa app push --solution-id "<solution-id>"` はソリューションへの追加または更新であり、別環境への展開そのものではありません。

## 10. 導入完了チェックリスト

- [ ] アプリ本体とロックファイルを Git 管理している
- [ ] 実環境設定と資格情報を Git 管理から除外している
- [ ] 公開先設定テンプレートに実環境の ID が含まれていない
- [ ] 受け入れ条件に対応するテストがある
- [ ] `test:ci` がテスト未実装を成功扱いにしない
- [ ] 認証情報なしで PR の lint・テスト・ビルドが成功する
- [ ] `main` への直接更新を制限している
- [ ] レビューと `Validate` を必須にしている
- [ ] ワークフロー変更のレビュー担当者が決まっている
- [ ] 手動デプロイと公開後確認を一度成功させている
- [ ] デプロイ用サービスプリンシパルを最小権限で構成している
- [ ] サービスプリンシパルに対象アプリの編集権限がある
- [ ] クライアントシークレットの所有者、有効期限、更新手順が決まっている
- [ ] GitHub Environment の公開先、Secret、ブランチ制限、承認ルールを確認している
- [ ] `main` の検証成功後だけデプロイされる
- [ ] 検証済み artifact が同じ既存アプリ ID へデプロイされる
- [ ] 公開後のログインと受け入れ条件を確認している
- [ ] デプロイ記録を残している
- [ ] revert Pull Request による復旧手順を検証している

## 11. 参考資料

- [GitHub Actions の Environment とデプロイ保護](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
- [サービスプリンシパルによる Code Apps の公開](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)
- [Power Apps CLI の環境変数](https://learn.microsoft.com/power-apps/developer/code-apps/reference/environment-variables)
- [Power Apps CLI リファレンス](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
- [Code Apps の ALM](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/alm)
- [Power Platform Pipelines](https://learn.microsoft.com/power-platform/alm/pipelines)
