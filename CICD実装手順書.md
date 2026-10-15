# Code Apps CI/CD 実装手順書

## 1. 目的

本書は、このリポジトリの React / Power Apps Code Apps アプリに、GitHub Actions を利用した CI/CD を段階的に導入するための実装手順です。

このリポジトリでは、GitHub Copilot を利用した AI 駆動開発を前提とします。コード、テスト、設定ファイル、ワークフローは原則として Copilot に作成・変更・検証を依頼し、人は受け入れ条件、権限、Secret、レビュー、承認、公開後確認を担当します。本書のコード例は手入力用ではなく、Copilot の実装をレビューする基準です。

### 1-1. 本書で使用するCopilotとGitHub画面

本書で単に「Copilot」または「Copilot Chat」と記載した場合は、**このリポジトリを開いているVS CodeのGitHub Copilot Chat**を指します。GitHub Web上のCopilot Chatではありません。

| 使用場所 | 用途 |
| --- | --- |
| VS CodeのGitHub Copilot Chat | ローカルファイルの作成・変更、未コミット差分の確認、lint・テスト・ビルド、Git操作、結果報告 |
| GitHub Web | Issue、Pull Request、Checks、Actions、レビュー、Ruleset、Environment、マージの確認と操作 |
| GitHub WebのCopilot | 本書の手順では使用しない。ローカルの未コミット変更やローカルコマンドの確認には使用しない |

VS CodeのGitHub Copilot Chatへ依頼する箇所は、本書に記載した `text` コードブロックをVS Codeのチャットへ貼り付けます。GitHub Webで行う操作は各手順で「GitHubで」または「GitHubの設定画面で」と明記します。

### 1-2. 前提ソフトウェアとアカウント

本書を開始する前に、次のソフトウェアとアカウントを準備します。

| 前提 | 使用する段階 | 用途 |
| --- | --- | --- |
| WindowsとPowerShell | 全段階 | ローカルコマンドの実行 |
| Visual Studio Code | 全段階 | リポジトリの編集とCopilot Chatの利用 |
| GitHub Copilot | 全段階 | コード、テスト、設定、ワークフローの作成と検証 |
| Git for Windows | 全段階 | ブランチ、コミット、pushの操作 |
| Node.js `22.22.0`とnpm | 全段階 | 依存関係の復元、lint、テスト、ビルド |
| GitHub CLI `gh` | 段階1以降 | VS CodeのCopilotからPull Requestを作成・確認する |
| GitHubアカウント | 全段階 | 対象リポジトリ、Actions、Settingsへのアクセス |
| Power Platform Toolsと`pac` | 段階2以降 | Power Platform環境と認証状態の確認 |
| Power Apps CLI `pa` | 段階2以降 | Code Appの認証、共有、公開 |
| Webブラウザー | 全段階 | GitHub、Entra ID、Power Platform、公開アプリの確認 |

GitHubアカウントには、対象リポジトリのブランチへpushし、Pull Requestを作成できる権限が必要です。リポジトリのRuleset、Environment、Secretを設定する担当者には管理権限も必要です。

GitHub CopilotはVS CodeでGitHubアカウントにサインインし、Copilot Chatを利用できる状態にします。GitHub CLIが未導入の場合は、PowerShellで次を実行します。

```powershell
winget install --id GitHub.cli --exact --accept-source-agreements --accept-package-agreements
```

インストール後にVS Codeのターミナルを開き直し、GitHub CLIを認証します。

```powershell
gh auth login --web --git-protocol https
gh auth status
```

ブラウザーに表示されたGitHubの認証画面で、対象リポジトリへアクセスできるアカウントを選択します。Personal Access Tokenや認証コードをソースコード、Issue、Pull Request、チャットへ貼り付けません。

Power Platform ToolsとPower Apps CLIの導入方法は、リポジトリの `README.md` にある「手順2: VS CodeとPower Platform Toolsを準備する」に従います。Power Apps CLIが未導入の場合は次を実行します。

```powershell
npm install --global @microsoft/power-apps-cli
npm install --global @microsoft/power-apps
```

作業を開始するターミナルで、必要なツールを確認します。

```powershell
git --version
node --version
npm --version
gh --version
gh auth status
Get-Command pac
pac help
Get-Command pa
pa --help
```

`node --version` が `v22.22.0` ではない場合は、後続作業へ進む前にNode.jsのバージョンを合わせます。段階1だけを実施する場合でも、Git、Node.js、npm、GitHub CLI、VS CodeのGitHub Copilot Chatは確認します。`pac` と `pa` は段階2へ進む前までに確認します。

各段階では、次の順番を守ります。

```text
人が目的・受け入れ条件・対象外を決める
  -> Copilot に実装と検証を依頼する
  -> Copilot が変更・lint・テスト・ビルドを実行して報告する
  -> 人が受け入れ条件、変更範囲、残存リスクを確認する
  -> 人の明示的な許可後にコミット、push、マージ、デプロイへ進む
```

Copilot の報告だけで完了とは判定しません。本書に記載したローカル検証、GitHub Actions、公開後の実接続確認がそれぞれ成功したことを確認します。

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
- `npm run lint`、`npm run test:ci`、`npm run build` が定義されている
- Vitest と React Testing Library による最初の UI テストが実装されている
- GitHub Actions ワークフローは未実装
- 公開先設定テンプレートは未実装
- ローカル公開先の `my-app/power.config.json` は Git 管理から除外されている

## 3. 役割分担

導入前に、担当者を決めます。

| 役割 | 主な作業 |
| --- | --- |
| GitHub Copilot | Issue の受け入れ条件に基づくコード、テスト、設定、ワークフローの変更と、ローカル検証結果・残存リスクの報告 |
| アプリ開発者 | Copilot への依頼、変更範囲と受け入れ条件のレビュー、コミット・push・デプロイの許可 |
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

各コマンドでは、次の操作を行っています。

| コマンド | 行っていること |
| --- | --- |
| `git status` | 現在のブランチ、未コミットの変更、未追跡ファイルの有無を確認します。意図しない変更がある場合は、ここで作業を止めて内容を確認します。 |
| `git switch main` | CI 導入作業の起点にするローカルの `main` ブランチへ切り替えます。すでに `main` にいる場合は、ブランチの変更は行われません。 |
| `git pull --ff-only` | GitHub の `origin/main` にある最新コミットを取得し、ローカルの `main` を更新します。`--ff-only` により、自動的なマージコミットは作成せず、安全に早送りできない場合は処理を停止します。 |
| `git switch -c feature/code-apps-ci` | 現在の最新 `main` を起点に、`feature/code-apps-ci` という新しい作業ブランチを作成し、そのブランチへ切り替えます。`-c` は新しいブランチを作成する指定です。 |

未コミットの変更がある場合は、内容を確認してから作業を開始します。

### 4-2. テストパッケージを追加する

アプリのフォルダーで、Vitest と React Testing Library を追加します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

最初の `cd` で、npm の設定ファイルである `package.json` が置かれている `my-app` フォルダーへ移動します。続く `npm install` で、React アプリを自動テストするためのパッケージを追加します。

`--save-dev` は、これらをアプリの実行に必要なパッケージではなく、開発や CI でだけ使用する `devDependencies` として登録する指定です。このコマンドを実行すると、`package.json` と `package-lock.json` が更新され、パッケージ本体は `node_modules` にインストールされます。

| パッケージ | 役割 |
| --- | --- |
| `vitest` | テストファイルを検出して実行し、成功・失敗を判定するテストランナーです。 |
| `jsdom` | Node.js 上に簡易的なブラウザーの DOM 環境を用意し、React コンポーネントを画面に近い状態でテストできるようにします。 |
| `@testing-library/react` | React コンポーネントをテスト用に描画し、ボタンや文字などの画面要素を利用者に近い方法で取得します。 |
| `@testing-library/user-event` | クリックや文字入力など、利用者の操作に近いイベントをテストから実行します。 |
| `@testing-library/jest-dom` | 「画面に表示されている」など、DOM を読みやすく検証するための判定方法を追加します。Vitest からも利用できます。 |

この操作では、`package.json` と `package-lock.json` の両方を更新します。

### 4-3. npm スクリプトを追加する

`my-app/package.json` の `scripts` に、次のスクリプトを追加します。

`scripts` は通常、パッケージ名やバージョンなどの基本情報の後、`dependencies` と `devDependencies` の前に配置します。JSON の項目順は動作に影響しませんが、開発者が実行可能なコマンドを見つけやすくするため、この位置に置くのが一般的です。

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

`scripts` に登録した名前は、`npm run <スクリプト名>` の形式で実行できます。JSON はコメントを記述できないため、各スクリプトの役割を次の表に示します。

| スクリプト | 実行コマンド | 役割 |
| --- | --- | --- |
| `dev` | `npm run dev` | Vite のローカル開発サーバーを起動します。ソースを変更すると画面へ反映されます。 |
| `build` | `npm run build` | TypeScript の型チェック後、Vite でデプロイ用ファイルを `dist` に生成します。`&&` により、型チェックが失敗した場合はビルドを実行しません。 |
| `lint` | `npm run lint` | ESLint でソースを検査し、コード規約違反や問題になりやすい記述を検出します。`.` は現在のアプリフォルダー全体を検査する指定です。 |
| `test` | `npm run test` | Vitest を開発用の監視モードで起動します。ファイルを変更すると、関連するテストを再実行します。 |
| `test:ci` | `npm run test:ci` | Vitest ですべてのテストを1回だけ実行し、結果を終了コードで返します。処理が終了するため、GitHub Actions などの CI で使用します。 |
| `preview` | `npm run preview` | `npm run build` で生成した配布用ファイルを、ローカルで確認するためのサーバーを起動します。 |

今回追加するのは `test` と `test:ci` です。`test` は開発中に繰り返し確認する用途、`test:ci` は自動処理で合否を1回判定する用途として使い分けます。

`test:ci` には `--passWithNoTests` を追加しません。テストがない状態を成功扱いにしないためです。

### 4-4. Vitest を設定する

`my-app/vitest.config.ts` を作成し、テスト環境を `jsdom` に設定します。

Vitest は初期状態でもテストを実行できますが、React コンポーネントをブラウザーに近い環境でテストするには、テスト環境と事前処理を設定する必要があります。

#### 4-4-1. Vitest の設定ファイルを作成する

`my-app/vitest.config.ts` を作成し、次の内容を記述します。

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

各設定の役割は次のとおりです。

| 設定 | 役割 |
| --- | --- |
| `defineConfig` | Vitest の設定であることをTypeScriptに認識させ、入力補完と型チェックを利用できるようにします。 |
| `plugins: [react()]` | React の JSX / TSX をテスト時にも変換できるようにします。 |
| `environment: 'jsdom'` | Node.js 上に `window`、`document` などを持つ簡易的なブラウザー環境を用意します。React コンポーネントを描画するテストで必要です。 |
| `globals: true` | `describe`、`it`、`test`、`expect`、`beforeEach` などを、各テストファイルで毎回 import せずに使用できるようにします。 |
| `setupFiles` | 各テストファイルの実行前に、指定したセットアップファイルを自動的に読み込みます。 |

`vitest.config.ts` を分けるのは、通常起動・本番ビルド用の設定と、自動テスト用の設定では必要な処理が異なるためです。

通常の `vite.config.ts` には、Code Appsとしての起動やビルドに必要なPower Apps用プラグインが含まれています。一方、現在の単体・UIテストで必要なのは、ReactのTSX変換、`jsdom`、テストの事前処理です。テストで不要なPower Apps用プラグインを読み込まないことで、テストを高速かつ単純にし、認証や実環境の状態に左右されないようにします。Power Apps用プラグインを使用しないこと自体が、Power Appsに関係するコードを一切テストできないという意味ではありません。

Power Appsの機能を使用する場合は、確認内容を次のように分けます。

| テストの種類 | 確認する内容 | Power Apps実環境 |
| --- | --- | --- |
| 単体テスト | Power Apps SDKへ渡す値、取得結果に応じた状態更新、エラー処理 | SDKをモック化するため不要 |
| UIテスト | SDKの結果を受け取った後の表示、ボタン操作、エラーメッセージ | SDKをモック化するため不要 |
| 結合・公開後テスト | 実際のSDK呼び出し、接続、権限、同意、Dataverseとの通信 | 必要 |

例えば、Power Appsからデータを取得する画面では、単体・UIテスト用に「データ取得成功」「空の結果」「アクセス拒否」などの応答をモックし、それぞれの画面表示を検証します。実際に対象環境へ接続できるか、利用者に権限があるかまではモックでは保証できないため、デプロイ後の検証環境で別に確認します。

現在の `App.tsx` はPower Apps SDKを直接使用していないため、まずはPower Apps用プラグインを含めない `vitest.config.ts` で画面操作をテストできます。将来、テスト対象の変換処理にPower Apps用プラグインが必要になった場合は、プラグインをテスト設定にも追加するか、Vite設定を選択的に共有します。ただし、PRのテストが認証や実環境接続を要求しないことを確認してから採用します。

#### 4-4-2. テストセットアップファイルを作成する

すべてのテストで共通して使う準備処理を、`setup.ts` にまとめます。今回は、DOM向けの判定機能をVitestへ追加する処理を記述します。

`my-app/src/test/setup.ts` を新しく作成します。ファイルの内容は、次の `import` 文1行だけです。

```typescript
import '@testing-library/jest-dom/vitest'
```

この1行は、インストール済みの `@testing-library/jest-dom` からVitest用の機能を読み込む処理です。現時点では、ほかのコードを `setup.ts` に記述する必要はありません。

`jest-dom` は、HTML画面の状態を読みやすい表現で確認するためのテスト支援ライブラリです。DOMはDocument Object Modelの略で、JavaScriptからHTMLのボタン、入力欄、見出しなどをプログラムで扱うための構造を指します。`jest-dom` を読み込むと、Vitest標準の `expect` にDOM専用の判定方法が追加されます。

このパッケージの名前に含まれるJestはVitestとは別のテスト実行ツールですが、`jest-dom` はVitestにも対応しています。末尾に `/vitest` を付けて読み込むと、DOM向けの判定機能がVitestの `expect` に追加されます。

作成した `setup.ts` は、「4-4-1. Vitest の設定ファイルを作成する」で作成した `vitest.config.ts` に記述した次の設定によって読み込まれます。

```typescript
setupFiles: './src/test/setup.ts',
```

テスト実行時の流れは次のとおりです。

```text
Vitestを起動
  -> setupFilesで指定したsetup.tsを読み込む
  -> jest-domのDOM向け判定機能をexpectへ追加する
  -> 各テストファイルを実行する
```

`setup.ts` は各テストファイルより先に実行されます。その中で `@testing-library/jest-dom/vitest` を読み込むと、`toBeInTheDocument` などのDOM向け判定がVitestの `expect` にまとめて登録されます。登録後に各テストが実行されるため、個々のテストファイルで `jest-dom` を毎回 import しなくても、次の判定を使用できます。

```typescript
expect(element).toBeInTheDocument()
expect(button).toBeEnabled()
expect(input).toHaveValue('入力値')
```

#### 4-4-3. TypeScript に Vitest のグローバル API を認識させる

`globals: true` はテスト実行時の動作を有効にする設定です。TypeScriptにも `describe` や `expect` の型を認識させるため、`my-app/tsconfig.app.json` の `types` に `vitest/globals` を追加します。

変更前：

```json
"types": ["vite/client"]
```

変更後：

```json
"types": ["vite/client", "vitest/globals"]
```

この設定を追加しない場合、テスト自体はVitestから実行できても、エディターや `npm run build` で「`describe` が見つからない」などのTypeScriptエラーになる可能性があります。

#### 4-4-4. 設定後のファイル構成

設定後は、テスト関連ファイルが次の構成になります。

```text
my-app/
  src/
    test/
      setup.ts
  package.json
  tsconfig.app.json
  vite.config.ts
  vitest.config.ts
```

この時点では設定だけで、実際のテストファイルはまだありません。次の手順で `App.test.tsx` を作成した後に `npm run test:ci` を実行します。

### 4-5. 最初の UI テストを作成する

現在の `my-app/src/App.tsx` にあるカウンターボタンを対象に、画面表示とクリック操作を自動テストします。

#### 4-5-1. AIにテストファイルの作成を依頼する

人がテストコードを手入力するのではなく、GitHub Copilotに対象、確認内容、実行方法を伝えて、テストの作成と検証を依頼します。例えば、VS Codeのチャットで次のように依頼します。

```text
my-app/src/App.tsx のカウンターボタンに対するUIテストを作成してください。

要件:
- テストファイルは my-app/src/App.test.tsx とする
- React Testing Library と user-event を使用する
- 初期表示で「count is 0」ボタンをアクセシブルな名前で取得できること
- ボタンをクリックすると「count is 1」に変わること
- 実装後に npm run test:ci を実行する
- 失敗した場合は原因を修正して再実行する
```

Copilotには、コードの作成だけでなく `npm run test:ci` の実行と結果の報告まで依頼します。人は、生成されたテストが受け入れ条件を正しく検証していること、不要に実装の内部構造へ依存していないこと、テストが実際に成功していることを確認します。

作成される `my-app/src/App.test.tsx` は、次のような内容になります。このコード例は人が転記するためではなく、Copilotが作成した内容をレビューする際の基準です。

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

test('カウンターボタンをクリックすると値が1増える', async () => {
  const user = userEvent.setup()
  render(<App />)

  const button = screen.getByRole('button', { name: 'count is 0' })
  expect(button).toBeInTheDocument()

  await user.click(button)

  expect(
    screen.getByRole('button', { name: 'count is 1' }),
  ).toBeInTheDocument()
})
```

このテストでは、次の3点を検証します。

1. 初期表示に `count is 0` ボタンが存在する
2. ボタンをクリックすると `count is 1` になる
3. ボタンをアクセシブルな名前で取得できる

#### 4-5-2. テストコードの意味

| コード | 行っていること |
| --- | --- |
| `render(<App />)` | `App` コンポーネントを `jsdom` のテスト画面へ表示します。 |
| `screen.getByRole('button', { name: 'count is 0' })` | ボタンという役割と、利用者が認識する名前の両方を使って対象を取得します。対象が存在しない場合は、この時点でテストが失敗します。 |
| `expect(button).toBeInTheDocument()` | 取得したボタンがテスト画面内に存在することを確認します。 |
| `userEvent.setup()` | クリックや文字入力などの利用者操作を再現するための準備をします。 |
| `await user.click(button)` | 利用者がボタンをクリックする操作を再現します。画面更新の完了を待つため `await` を付けます。 |
| `name: 'count is 1'` | クリック後にボタンの表示が `count is 1` へ変わったことを確認します。 |

`getByRole` は、単にHTMLのタグ名やCSSクラスで探すのではなく、利用者や支援技術が認識する役割と名前で画面要素を探します。そのため、画面が操作可能であることを意識したテストになります。

#### 4-5-3. テストを実行して結果を確認する

##### 4-5-3-1. テストを実行する

作成したテストをローカルで確認します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm run test:ci
```

##### 4-5-3-2. 成功した場合

成功した場合の出力例は次のとおりです。実行時間はPCの性能や実行状況によって変わります。

```text
> vite@0.0.0 test:ci
> vitest run

 RUN  v5.0.4 C:/github/code-apps-with-vscode/my-app

 ✓ src/App.test.tsx (1 test) 261ms
   ✓ カウンターボタンをクリックすると値が1増える 258ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  14:12:50
   Duration  2.24s (environment 61%, setup 15%, tests 13%, import 8%, transform 3%, worker 1%)
```

主な表示の意味は次のとおりです。

| 表示 | 意味 |
| --- | --- |
| `vitest run` | `test:ci` スクリプトから、Vitestを1回実行するコマンドが呼び出されたことを示します。 |
| `RUN v5.0.4` | 実行したVitestのバージョンと、テストの基準となるフォルダーを示します。 |
| `✓ src/App.test.tsx (1 test)` | `App.test.tsx` にある1件のテストが成功したことを示します。 |
| `✓ カウンターボタンをクリックすると値が1増える` | 成功した個別のテスト名と、そのテストにかかった時間を示します。 |
| `Test Files 1 passed (1)` | 検出したテストファイル1個のうち、1個が成功したことを示します。 |
| `Tests 1 passed (1)` | 検出したテスト1件のうち、1件が成功したことを示します。 |
| `Start at` | テストを開始した時刻です。 |
| `Duration` | テスト全体の所要時間と、環境準備、セットアップ、テスト、読み込み、変換などに使った時間の割合です。 |

`Test Files` と `Tests` の両方が `passed` であり、失敗を示す `failed` がなければ、テストは成功です。

これで、最初のUIテストの作成とローカル確認は完了です。

##### 4-5-3-3. 失敗した場合

`failed` が表示された場合は、その出力をCopilotに提示して原因の調査と修正を依頼します。このとき、テストを削除したり期待値を実装に合わせて変更したりせず、最初に定めた受け入れ条件を満たすように修正し、再度 `npm run test:ci` を実行します。

##### 4-5-3-4. 監視モードで繰り返し確認する

開発中にファイルを変更するたびに結果を確認したい場合は、次の監視モードを使用します。

```powershell
npm run test
```

監視モードを終了する場合は、ターミナルで `q` を押すか、`Ctrl+C` を使用します。

##### 4-5-3-5. 最初のUIテストを完了する

`npm run test:ci` が成功し、カウンターボタンの受け入れ条件をテストできていることを確認したら、最初のUIテスト作成は完了です。

この時点ではGitHub Actionsをまだ作成していないため、コミット、push、Pull Request作成は行いません。続けて4-6の公開先設定テンプレートと4-7のCIワークフローを作成し、4-8のローカル検証後に4-9でPull Requestを作成します。

#### 4-5-4. 今後の仕様変更時に適用するテスト方針

> この節は今後の仕様変更に適用する運用方針です。初回のCI/CD導入作業ではファイル作成や追加テストを行わず、内容を確認したら4-6へ進みます。

今後アプリの仕様を変更する場合は、Issue の受け入れ条件ごとに「PRで自動確認する項目」と「公開後に実環境で確認する項目」を分けます。Power Apps SDK、Dataverse、コネクタ、認証、実データに依存する処理を PR から直接呼び出してはいけません。

Issue は次の形式で作成します。

```markdown
## 目的

利用者が一覧を読み込めるようにする。

## 受け入れ条件

- データ取得成功時に項目名が表示される
- データが0件の場合に空状態が表示される
- データ取得失敗時にエラーが表示される
- 公開先で認証済み利用者が実データを取得できる

## PRで自動確認する項目

- SDK境界をモック化し、成功・0件・失敗の画面を確認する
- lint、test:ci、buildが成功する

## 公開後に実環境で確認する項目

- 検証環境でサインインできる
- 実データが表示される
- ブラウザーコンソールに実行時エラーがない

## 対象外

- 本番環境への展開
- 実データの作成、更新、削除
```

Issue 作成後、VS Code の Copilot チャットで次のように依頼します。

```text
Issue #<番号> の目的、変更範囲、対象外、受け入れ条件に従って my-app を変更してください。

実装要件:
- 受け入れ条件とテストの対応表を最初に示す
- Power Apps SDK、Dataverse、コネクタ、認証、ネットワークの呼び出しをUIコンポーネントから分離する
- PRのテストでは分離した境界をvi.mockで置き換え、実環境へ接続しない
- 成功、0件、失敗のうち受け入れ条件に必要なケースをテストする
- 利用者が認識するrole、label、表示内容、操作結果をReact Testing Libraryで確認する
- 実装後にnpm run lint、npm run test:ci、npm run buildを実行する
- 変更ファイル、受け入れ条件ごとのテスト、検証結果、公開後に残る実接続確認を報告する
- コミットとpushは実行しない
```

Copilot が作成するコードは、次の境界を持つ構成にします。ファイル名は機能に合わせて変更して構いません。

```text
src/
  services/
    items.ts          # Power Apps SDKを呼ぶ境界
  components/
    ItemList.tsx      # services/items.tsを利用して画面を更新
    ItemList.test.tsx # services/items.tsをモック化したPRテスト
```

テストでは SDK パッケージの内部実装を広範囲に再現せず、アプリ側で定義した小さな境界をモック化します。次はレビュー時の形の例です。

```tsx
import { loadItems } from '../services/items'

vi.mock('../services/items', () => ({
  loadItems: vi.fn(),
}))

test('取得した項目を表示する', async () => {
  vi.mocked(loadItems).mockResolvedValue([
    { id: '1', name: 'テスト項目' },
  ])

  render(<ItemList />)

  expect(await screen.findByText('テスト項目')).toBeInTheDocument()
})

test('取得に失敗した場合はエラーを表示する', async () => {
  vi.mocked(loadItems).mockRejectedValue(new Error('取得失敗'))

  render(<ItemList />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'データを取得できませんでした',
  )
})
```

この例で重要なのは、テストデータと失敗をテスト側で制御し、資格情報や実環境を使わないことです。実際の関数名、戻り値、メッセージは Issue とアプリの設計に合わせます。

人は Copilot の報告を次の対応表で確認します。

| 確認対象 | PRの自動テスト | 公開後の実接続確認 |
| --- | --- | --- |
| 表示、入力、状態変更、エラー表示 | React Testing Library で確認 | 必要に応じて再確認 |
| SDKの戻り値ごとの画面動作 | モックで成功・0件・失敗を再現 | 実データで主要経路を確認 |
| サインイン、同意、共有、権限 | 実行しない | 認証済み利用者が確認 |
| 実際のDataverse・コネクタ接続 | 実行しない | 検証環境で確認 |

PRの自動テストが成功しても、実接続の受け入れ条件は完了扱いにしません。5-6または6-7の公開後確認が成功し、結果を7-3の記録へ残した時点で完了です。

### 4-6. 公開先設定テンプレートを作成する

Copilot に、実環境の値を含まない `my-app/power.config.template.json` の作成と除外設定の確認を依頼します。

```text
CIのビルドに使用するmy-app/power.config.template.jsonを作成してください。

要件:
- appIdとenvironmentIdは空文字にする
- Secret、利用者名、実環境固有値を含めない
- my-app/power.config.jsonがGit管理から除外されていることをgit check-ignoreで確認する
- 既存の実ファイルがあっても内容を表示、上書き、ステージしない
- 作成後に変更内容と確認結果を報告する
- コミットとpushは実行しない
```

作成されるテンプレートは次の内容です。

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

このファイルは、GitHub Actionsでビルドするときに使用する、実環境情報を含まない設定のひな型です。各項目の意味は次のとおりです。

| 項目 | 内容 |
| --- | --- |
| `version` | 設定ファイルの形式バージョンです。 |
| `appId` | 更新対象の既存Code Appを識別するIDです。テンプレートでは実環境のアプリを固定しないため空文字にします。 |
| `appDisplayName` | アプリの表示名です。Secretではないためテンプレートに記載できます。 |
| `region` | Power Appsの対象リージョンです。`prod` は通常の商用クラウドを表します。 |
| `appType` | アプリの種類です。Code Appsなので `CodeApp` を指定します。 |
| `environmentId` | 公開先となるPower Platform環境のIDです。テンプレートでは実環境を固定しないため空文字にします。 |
| `description` | アプリの説明です。 |
| `buildPath` | `npm run build` が生成するデプロイ用ファイルのフォルダーです。 |
| `buildEntryPoint` | ビルド成果物の開始ファイルです。Viteアプリでは `index.html` を指定します。 |
| `localAppUrl` | ローカル開発サーバーのURLです。 |
| `logoPath` | アプリのロゴ設定です。`Default` は既定のロゴを使用する指定です。 |
| `connectionReferences` | コネクタなどの接続参照です。現時点では使用しないため空オブジェクトにします。 |
| `databaseReferences` | Dataverseなどのデータベース参照です。現時点では使用しないため空オブジェクトにします。 |

`appId` と `environmentId` は環境ごとに異なります。値をテンプレートへ固定すると、意図しない環境やアプリへ公開する原因になるため、Git管理するファイルでは空にします。Pull RequestのCIでは空のままビルドに使用して実環境へ接続しません。段階3の自動デプロイでは、GitHub Environmentに登録した値を使用して一時的な `power.config.json` を生成します。

2つの設定ファイルは次のように使い分けます。

| ファイル | Git管理 | 用途 |
| --- | --- | --- |
| `my-app/power.config.template.json` | する | CIビルドとデプロイ設定生成のひな型 |
| `my-app/power.config.json` | しない | ローカル実行やデプロイで使用する実環境設定 |

テンプレートの `appId` と `environmentId` は空のままコミットします。実際の値を含む `my-app/power.config.json` はコミットしません。除外状態は、リポジトリのルートで次の結果に `.gitignore` と対象パスが表示されることで確認します。

```powershell
git check-ignore -v -- my-app/power.config.json
```

何も表示されない場合は後続作業を止め、ルートの `.gitignore` に `/my-app/power.config.json` を追加してから再確認します。

### 4-7. CI ワークフローを作成する

VS CodeのGitHub Copilot Chatに `.github/workflows/code-apps.yml` の作成とYAMLのレビューを依頼します。作成する `.github/workflows/code-apps.yml` にはデプロイ処理を含めず、`validate` ジョブだけを定義します。

```text
.github/workflows/code-apps.ymlにPull Request用のValidateジョブを作成してください。

要件:
- main向けpull_requestとmainへのpushで起動する
- 権限はcontents: readだけにする
- my-appでnpm ci、設定テンプレートのコピー、npm run lint、npm run test:ci、npm run buildを順番に実行する
- package-lock.jsonをnpmキャッシュのキーに使用する
- 使用するGitHub Actionごとに、作成時点の公式READMEとReleasesをWebで確認する
- 記憶や既存サンプルだけでActionのバージョンを決めない
- actions/checkoutとactions/setup-nodeは、公式READMEが案内する現在の安定メジャーバージョンを使用する
- 選択したAction名、バージョン、確認日、公式URL、必要なActions Runnerの条件を報告する
- 公式情報を確認できない場合は推測で作成せず、作業を停止して確認できなかった項目を報告する
- Secret、実環境ID、デプロイ処理を含めない
- テストが0件またはコマンドが失敗した場合はジョブを失敗させる
- ワークフローの変更内容とセキュリティ上の確認結果を報告する
- コミットとpushは実行しない
```

GitHub Actionsワークフローを作成するときは、Copilotが上記の要件に従って公式READMEとReleasesを確認します。公式の安定メジャーバージョンが次の例と異なる場合は、確認時点の公式情報を優先します。

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
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
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

4-7で行うのは、ワークフローファイルをローカルに作成するところまでです。この時点ではコミットとpushを行っていないため、GitHubのActions画面にワークフローや実行結果はまだ表示されません。

続けて4-8のローカル検証を行い、成功後に4-9-1でワークフローを含む変更をコミット・pushします。すでに同じ作業ブランチからPull Requestを作成している場合は、pushによって既存のPull Requestが自動更新され、`pull_request` の更新イベントで `Validate` が起動します。

#### 4-7-1. Validateジョブが行うこと

`Validate` は、変更をデプロイしてよい品質かを判定するための検証ジョブです。アプリをPower Appsへ公開するジョブではありません。

このワークフローは、`main` 向けPull Requestの作成・更新時と、`main` へのマージ後に起動します。

```text
Pull Requestまたはmainへのpush
  -> GitHubが一時的なUbuntu環境を用意
  -> リポジトリを取得
  -> Node.jsと依存パッケージを準備
  -> lint
  -> UIテスト
  -> TypeScriptチェックとViteビルド
  -> すべて成功した場合だけValidate成功
```

各ステップの役割は次のとおりです。

| ステップ | 処理 | 確認していること |
| --- | --- | --- |
| `actions/checkout` | Pull Requestまたは`main`のソースを一時環境へ取得する | GitHubへ送信されたファイルだけで検証できること |
| `actions/setup-node` | Node.js `22.22.0` とnpmキャッシュを準備する | 開発・ビルドに使用するNode.jsのバージョンを統一できること |
| `npm ci` | `package-lock.json`どおりに依存パッケージを新規インストールする | ロックファイルから同じ依存関係を再現できること |
| 設定テンプレートのコピー | 空のIDを持つテンプレートからCI用の`power.config.json`を作る | 実環境情報やSecretがなくても検証できること |
| `npm run lint` | ESLintでソースを検査する | コード規約違反や問題になりやすい記述がないこと |
| `npm run test:ci` | Vitestを1回実行する | 受け入れ条件に対応するテストが存在し、成功すること |
| `npm run build` | TypeScriptの型チェック後、Viteで`dist`を生成する | 型エラーがなく、デプロイ可能な成果物を生成できること |

`cache-dependency-path: my-app/package-lock.json` は、`package-lock.json` の内容に対応するnpmダウンロードキャッシュを再利用する指定です。`node_modules`そのものを保存する指定ではありません。ロックファイルが変わると別のキャッシュが使用され、`npm ci` は毎回実行されます。

次のいずれかが起きると `Validate` は失敗します。

- 依存パッケージを復元できない
- lintエラーがある
- テストが0件、またはテストが失敗する
- TypeScriptの型チェックに失敗する
- Viteビルドに失敗する

`Validate` が行わないことは次のとおりです。

- Power Appsへのログイン
- 実環境や実データへの接続
- `pa app push`によるデプロイ
- Secretの読み取り
- 公開後の画面確認

つまり、この依頼文で作成するのは、変更したアプリがクリーンな環境で再現可能か、テストに合格するか、ビルドできるかを自動判定するワークフローです。デプロイは段階2以降で、`Validate` の成功を確認してから別の手順として行います。

#### 4-7-2. GitHub Actionsのバージョン指定を理解する

ワークフローの `uses` は、GitHub Actionsで利用する外部処理とそのバージョンを指定します。

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
```

`v7` は、各Actionの提供元であるGitHubの `actions` Organizationが公式リリースに付けているメジャーバージョンタグです。任意に決めた番号ではありません。この手順を更新した時点では、[`actions/checkout` の公式README](https://github.com/actions/checkout) と [`actions/setup-node` の公式README](https://github.com/actions/setup-node) がどちらも `@v7` を使用しています。

同じ `v7` の範囲で提供元が修正版へ更新できるため、設定が読みやすく、最初のCI導入では扱いやすい指定です。一方、ワークフローを変更していなくても、タグが指す処理内容が将来変わる可能性があります。

より厳密に実行内容を固定する場合は、レビュー済みリリースが指す40文字のコミットSHAを指定します。

```yaml
- uses: actions/checkout@<確認済みの40文字コミットSHA> # v4
- uses: actions/setup-node@<確認済みの40文字コミットSHA> # v4
```

コミットSHAを指定すると、提供元がタグを更新しても実行内容は変わりません。特にSecretを扱う自動デプロイでは、意図しないActionの更新を避けるために有効です。

この手順では、段階1の初回CI確認までは分かりやすい `@v7` を使用します。段階3で自動CDとSecretを有効にする前に、公式の `actions/checkout` と `actions/setup-node` のリリースページで `v7` の最新リリースとコミットSHAを確認し、別のPull RequestでSHA指定へ変更します。

Actionを更新するときは、既存ワークフローの中で直接書き換えて即時マージせず、次の順番で管理します。

1. Action更新専用の作業ブランチとPull Requestを作成する
2. 変更前後のAction名、リリース、コミットSHAを記録する
3. `Validate` のlint・テスト・ビルドが成功することを確認する
4. リリースノートと権限変更の有無をレビューする
5. 問題がなければPull Requestをマージする

つまり、「完全なコミットSHAに固定する」とは、`@v7` の代わりに確認済みの特定コミットを指定して、CI/CDで実行される外部コードを意図的に更新するまで変化させないことです。

### 4-8. ローカルで検証する

VS CodeのGitHub Copilot Chatに、CI と同じ順番での検証と変更範囲の確認を依頼します。

```text
CI導入のコミット前確認をしてください。

- 現在のブランチと変更ファイルを確認する
- my-app/power.config.jsonの内容を表示、変更、ステージしない
- my-appでnpm ci、npm run lint、npm run test:ci、npm run buildを実行する
- power.config.jsonが存在しない場合だけtemplateから一時作成し、検証後に一時ファイルを削除する
- 受け入れ条件に対応するテストが実行されているか確認する
- CI導入と関係のない変更がないか確認する
- 変更ファイル、検証結果、残っているリスクを報告する
- コミットとpushは実行しない
```

手動で検証する場合は、既存の実接続用 `power.config.json` を上書きしないように、次の順番で実行します。

```powershell
cd C:\github\code-apps-with-vscode\my-app
npm ci
$createdTemporaryConfig = $false
if (-not (Test-Path power.config.json)) {
    Copy-Item power.config.template.json power.config.json
    $createdTemporaryConfig = $true
}

try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "lint failed" }
    npm run test:ci
    if ($LASTEXITCODE -ne 0) { throw "test:ci failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
}
finally {
    if ($createdTemporaryConfig) {
        Remove-Item power.config.json
    }
}
```

いずれかが失敗した場合は、後続の作業へ進まず、出力と受け入れ条件をCopilotへ渡して修正と再実行を依頼します。既存の実接続用 `power.config.json` は空のテンプレートで上書きしません。

### 4-9. Pull Request で CI を確認する

4-7でCIワークフローを作成し、4-8でローカル検証が成功した後に、この節を実施します。

#### 4-9-1. コミットして作業ブランチをpushする

4-8の報告に問題がなければ、VS CodeのGitHub Copilot Chatにコミットとpushを明示的に許可します。

```text
確認結果に問題ありません。
今回のCI導入に関係する変更だけをステージし、ステージ内容を確認してからコミットしてください。
コミットメッセージは変更内容に合うConventional Commit形式にしてください。
コミット成功後、現在の作業ブランチをoriginへpushしてください。
mainへの直接push、マージ、デプロイは実行しないでください。
```

Copilotの報告で、コミットに含まれたファイル、コミットSHA、push先が現在の作業ブランチであることを確認します。手動で初回pushを行う場合は次のコマンドを使用します。

```powershell
git push -u origin feature/code-apps-ci
```

`-u` を付けると、ローカルとGitHub上の同名ブランチが関連付けられます。2回目以降は `git push` だけで同じブランチへ送信できます。

#### 4-9-2. Pull Requestを作成する

push後、VS CodeのGitHub Copilot Chatに、GitHub CLIを使用したPull Requestの作成準備を依頼します。

```text
現在の作業ブランチからmain向けのPull Requestを作成する準備をしてください。

- gh auth statusでGitHub CLIの認証状態を確認する
- baseはmain、headは現在の作業ブランチにする
- 同じbaseとheadのOpen状態のPull Requestがないか確認する
- タイトルは「Add Code Apps CI validation」とする
- 本文はこの手順書の4-9-2にあるPull Request本文例を使用する
- base、head、タイトル、本文を表示して報告する
- この時点ではPull Requestを作成、更新、マージしない
```

人がbase、head、タイトル、本文に問題がないことを確認した後、VS CodeのGitHub Copilot Chatへ作成を許可します。

```text
Pull Requestの内容に問題ありません。
提示したbase、head、タイトル、本文を使用して、GitHub CLIでPull Requestを作成してください。

- 作成後にPull Requestの番号とURLを報告する
- マージ、デプロイ、ブランチ削除は実行しない
```

すでに同じbaseとheadのOpen状態のPull Requestが存在する場合は、新しく作成せず、そのURLを報告させます。GitHub CLIを利用できない場合だけ、次の表と本文例を使用してGitHub Webから手動で作成します。

| 項目 | 設定内容 |
| --- | --- |
| base | `main` |
| head | `feature/code-apps-ci` |
| タイトル | `Add Code Apps CI validation` など、変更内容が分かる名称 |
| 本文 | 変更内容、受け入れ条件、追加したテスト、検証結果、未対応事項、残存リスク |

Pull Request本文の例は次のとおりです。

```markdown
## 変更内容

- VitestとReact Testing Libraryを追加
- カウンターボタンのUIテストを追加
- 実環境情報を含まない公開先設定テンプレートを追加
- GitHub ActionsのValidateジョブを追加
- リポジトリ共通のGitHub Copilot指示を追加
- CI/CD実装手順書と構成例を更新
- `actions/checkout`と`actions/setup-node`を公式READMEの`v7`へ更新

## 受け入れ条件とテスト

- カウンターボタンをクリックすると値が1増える
  - `my-app/src/App.test.tsx`で確認

## ローカル検証

- `npm ci`: 成功
- `npm run lint`: 成功
- `npm run test:ci`: 1ファイル、1テスト成功
- `npm run build`: 成功
- `git diff --check`: 成功

## セキュリティ確認

- ワークフロー権限は`contents: read`のみ
- checkoutの`persist-credentials`を無効化
- Secret、実環境ID、アプリIDを含まない
- `pull_request_target`を使用しない
- デプロイ処理と実環境接続を含まない
- `power.config.json`はGit管理対象外

## 未対応・残存リスク

- GitHub Actions上でのValidate結果は、このPR作成後に確認する
- 自動デプロイは段階3で追加する
- Power Apps実環境への接続はこのPRでは行わない
- 開発依存関係の`source-map-js`にHigh severityの脆弱性が1件ある
  - `npm audit --omit=dev`では脆弱性0件
- 自動CDでSecretを扱う前に、使用するActionを確認済みのコミットSHAへ固定する
```

#### 4-9-3. Validateジョブを確認する

Pull Requestの作成または更新をきっかけに、GitHub Actionsで次の処理が実行されます。

```text
作業ブランチをGitHubへpush
  -> main向けのPull Requestを作成または更新
  -> GitHub Actionsが新しい実行環境を用意
  -> リポジトリのソースを取得
  -> npm ciでpackage-lock.jsonどおりに依存関係を復元
  -> npm run lintを実行
  -> npm run test:ciを実行
  -> npm run buildを実行
  -> Pull Requestに成功または失敗を表示
```

Pull Request では次を確認します。

- GitHub Actions の `Validate` が起動する
- Secret を設定しなくても成功する
- `npm ci` がロックファイルどおりに依存関係を復元する
- テストが実際に実行される
- `dist` の生成に成功する
- Pull Request ではデプロイ処理と実環境への接続が行われない

ローカルとGitHub Actionsでは同じ検証コマンドを使いますが、GitHub Actionsはローカルの `node_modules`、一時ファイル、未コミット変更を利用できません。ローカルで成功しても、コミット漏れや `package-lock.json` の不整合があれば失敗します。

GitHubの `Checks` または `Actions` から `Validate` ジョブを開き、すべてのステップが成功していることを確認します。この段階ではまだ `Validate` をrequired status checkに設定していないため、成功を確認してもPull Requestをマージせず、5-1でmainの保護を設定します。

失敗した場合はマージせず、失敗したステップのログとIssueの受け入れ条件をCopilotへ渡して修正を依頼します。修正後は4-8から繰り返します。

#### 4-9-4. Pull Request作成後に追加変更が発生した場合

Pull Request作成後にファイルを変更した場合、変更前のコミットに対する `Validate` が成功していても、最新状態の検証結果にはなりません。マージへ進む前に、作業ツリーとPull Requestの最新コミットを一致させます。

VS CodeのGitHub Copilot Chatに次のように依頼します。

```text
Pull Request作成後の追加変更を確認してください。

- 現在のブランチとgit statusを確認する
- 未コミット変更のファイルと内容を確認する
- Pull Requestの目的と関係のない変更がないか確認する
- アプリ、依存関係、ワークフローを変更した場合は4-8と同じlint、test:ci、buildを実行する
- ドキュメントだけの変更の場合はgit diff --checkとMarkdown構造を確認する
- 変更ファイル、必要な検証、結果、Pull Request本文の更新要否を報告する
- この時点ではコミットとpushを実行しない
```

報告に問題がなければ、変更内容に合うConventional Commit形式のメッセージで追加コミットし、同じ作業ブランチへpushするようCopilotへ依頼します。新しいPull Requestは作成しません。同じブランチへのpushによって、既存のPull Requestが自動更新されます。

push後は次を確認します。

1. Pull Requestのheadが追加コミットのSHAになっている
2. 追加変更で説明、検証結果、残存リスクが変わった場合はPull Request本文を更新する
3. 新しい `Validate` が起動する
4. 最新コミットに対する `Validate` が成功する
5. ローカルの `git status` に未コミット変更がない

古いコミットに対する成功結果は、最新コミットの完了判定に使用しません。追加変更と最新の `Validate` が成功するまで、4-10および5-1へ進みません。

### 4-10. 段階1の完了条件

- [ ] `test:ci` が定義されている
- [ ] 受け入れ条件に対応するテストが存在する
- [ ] `power.config.template.json` に実環境の ID が含まれていない
- [ ] ローカルで lint・テスト・ビルドが成功する
- [ ] ローカルの `git status` に未コミット変更がない
- [ ] Pull Requestの最新コミットに対する `Validate` が認証情報なしで成功する

## 5. 段階2: main の保護と手動デプロイ

### 5-1. main を保護する

GitHub のリポジトリ設定で、Branch protection rule または Ruleset を作成します。

この操作はリポジトリ管理者がGitHubの設定画面で実施します。Copilotに設定案や確認を依頼しても、管理者が内容を確認し、GitHub上で保存するまでは完了扱いにしません。

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

Copilotに次のように依頼します。

```text
mainの手動デプロイ前検証をしてください。

- 未コミット変更がないことと現在のコミットSHAを確認する
- my-appでnpm ci、npm run lint、npm run test:ci、npm run buildを順番に実行する
- いずれかが失敗したら停止する
- power.config.jsonの内容や資格情報を出力しない
- 検証結果とデプロイ対象のコミットSHAを報告する
- pa app pushはまだ実行しない
```

手動で実行する場合のコマンドは次のとおりです。

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

5-3と5-4に問題がなければ、人が対象環境と既存アプリIDを確認したうえで、Copilotへ明示的にデプロイを許可します。

```text
検証結果、認証アカウント、対象環境、既存アプリIDを確認しました。
現在のmainの検証済みコミットをpa app pushで既存アプリへ公開してください。
新しいアプリは作成しないでください。
終了コードと公開結果を報告し、続けて公開後確認項目を示してください。
```

手動で実行する場合のコマンドは次のとおりです。

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

管理者は次の順番で設定します。組織の申請・承認手続きがある場合は、その手続きを優先します。

1. Microsoft Entra 管理センターでCI/CD専用のApp registrationを作成する
2. Application (client) ID、Directory (tenant) ID、Enterprise applicationのObject IDを記録する
3. 有効期限と更新担当者を決めてclient secretを1件作成する
4. Power Platform管理センターで対象の検証環境を開く
5. `Settings > Users + permissions > Application users` から、このApp registrationに対応するapplication userを追加する
6. 対象アプリの更新に必要な最小限のセキュリティロールを付与する
7. アプリ作成者へEnterprise applicationのObject IDを安全な管理経路で渡す

client secretの値は作成直後にだけ表示されます。GitHub Environment secretへ登録する担当者へ安全な経路で渡し、Issue、Pull Request、チャット、メール本文、台帳の平文欄へ記載しません。

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

6-2へ進む前に、次を管理者間で確認します。

- Application (client) IDとEnterprise application Object IDを区別できている
- application userが対象の検証環境に存在する
- セキュリティロールが対象アプリの更新に必要な最小権限である
- client secretの所有者、有効期限、更新日、失効手順が記録されている
- client secretの値そのものは記録へ残していない

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
- 利用できる場合は Prevent self-review を有効にする
- 承認前にはデプロイ処理を開始できないことを確認する

GitHub Environment を作成しただけでは、必ずしも承認制にはなりません。GitHub FreeではEnvironmentを設定できるのはpublicリポジトリです。privateリポジトリではGitHub Pro、Team、Enterpriseなど、必要な機能を利用できるプランか確認します。必要な承認機能を利用できない場合は自動CDへ進まず、段階2の手動デプロイを継続します。

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

Copilotに、同じワークフローへのartifact保存と `deploy` ジョブの追加を依頼します。

```text
.github/workflows/code-apps.ymlに検証環境向けCDを追加してください。

要件:
- mainへのpushでValidateが成功した場合だけ実行する
- Validateで生成したdistをartifactとして保存し、Deployでは再ビルドしない
- GitHub Environment codeapps-devを使用する
- 同一環境への同時デプロイと古いmainコミットのデプロイを拒否する
- Environment variablesから環境ID、アプリID、client ID、tenant IDを取得する
- client secretはEnvironment secretからpa app pushのステップだけへ渡す
- power.config.template.jsonから一時的なpower.config.jsonを生成し、GUIDを検証する
- pa app push --non-interactiveで既存アプリを更新する
- pull_request_targetを使用しない
- ワークフロー変更、権限、Secretの参照箇所、安全条件を報告する
- コミット、push、デプロイは実行しない
```

Copilotの実装を、次の完成形と比較してレビューします。

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
    - uses: actions/checkout@v7
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
    - uses: actions/setup-node@v7
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

Issueに小さな表示変更、対応する自動テスト、公開後確認を記載します。Copilotに次のように依頼し、変更とテストをPull Requestにします。

```text
自動CDの試験用Issue #<番号> に従って、小さな表示変更と対応するUIテストを実装してください。

- 受け入れ条件とテストの対応表を示す
- npm run lint、npm run test:ci、npm run buildを実行する
- CDワークフローやSecretの値は変更しない
- 変更ファイル、検証結果、公開後に人が確認する項目を報告する
- コミット、push、マージ、デプロイは実行しない
```

次の順番で動作を確認します。

1. Pull Request で `Validate` が成功する
2. Pull Request では `Deploy Dev` が実行されない
3. レビュー後に `main` へマージする
4. `main` の `Validate` が成功する
5. GitHub Environment の承認待ちになる
6. 承認後に `Deploy Dev` が成功する
7. Environment に登録した既存アプリ ID が更新される
8. 公開 URL で変更内容と受け入れ条件を確認する
9. 7-3の項目をPull Requestまたはデプロイ記録へ残す

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

次のテンプレートを使用します。

```markdown
## 目的

## 変更範囲

## 対象外

## 受け入れ条件

- [ ] 条件1

## PRで自動確認する項目

- [ ] 条件1に対応するテスト
- [ ] lint、test:ci、build

## 公開後に実環境で確認する項目

- [ ] サインイン、権限、接続、実データを使用する条件

## データ、接続、権限への影響

## ロールバック時の注意点
```

受け入れ条件ごとに、自動テストまたは公開後確認のどちらで証明するかを必ず記載します。どちらにも対応しない条件があるIssueは実装を開始しません。

### 7-2. Pull Request を作成する

Pull Request には次を記載します。

- 対応した Issue
- 変更内容
- 追加または更新したテスト
- ローカルで実行した検証コマンド
- データ、接続、権限への影響
- 公開後に確認する項目

CopilotにPull Request作成を依頼する場合は、先にローカル検証とコミット内容を確認し、次のように依頼します。

```text
現在の作業ブランチからmain向けのPull Requestを作成してください。

- 対応Issueをリンクする
- 受け入れ条件ごとの実装内容とテストを記載する
- lint、test:ci、buildの結果を記載する
- データ、接続、権限への影響を記載する
- 公開後に人が実環境で確認する項目を記載する
- 未解決事項と残存リスクを記載する
- baseとhead、タイトル、本文を提示し、作成前に確認を求める
- マージとデプロイは実行しない
```

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

段階1から段階3までを順番に一度実施し、次のチェックがすべて完了した時点で、このリポジトリの検証環境向けCI/CD導入を完了とします。チェックできない項目がある場合は、その段階へ戻り、Copilotへ失敗ログと期待する完了条件を渡して修正します。

- [ ] アプリ本体とロックファイルを Git 管理している
- [ ] `.github/copilot-instructions.md` にAI駆動開発、検証、停止条件を記載している
- [ ] 実環境設定と資格情報を Git 管理から除外している
- [ ] 公開先設定テンプレートに実環境の ID が含まれていない
- [ ] 各Issueの受け入れ条件をPRの自動テストまたは公開後の実接続確認へ対応付けている
- [ ] SDKや実環境に依存する境界をPRではモック化している
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

最後に、テスト用Issueを1件選び、次の一連の流れを中断なく完了できることを確認します。

```text
Issue作成
  -> Copilotが実装とテストを作成
  -> ローカルのlint・test:ci・build
  -> 人が変更範囲と受け入れ条件を確認
  -> コミット・push
  -> Pull RequestのValidate
  -> レビュー後にmainへマージ
  -> Environment承認
  -> 検証済みartifactを既存アプリへデプロイ
  -> 認証済み利用者が公開後確認
  -> デプロイ記録
```

GitHubプランなどの制約でEnvironment承認を構成できず段階2の手動デプロイを継続する場合は、「CIと手動CDの導入完了」と記録し、自動CDを完了扱いにしません。

## 11. 参考資料

- [GitHub Actions の Environment とデプロイ保護](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
- [サービスプリンシパルによる Code Apps の公開](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/use-service-principal)
- [Power Apps CLI の環境変数](https://learn.microsoft.com/power-apps/developer/code-apps/reference/environment-variables)
- [Power Apps CLI リファレンス](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
- [Code Apps の ALM](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/alm)
- [Power Platform Pipelines](https://learn.microsoft.com/power-platform/alm/pipelines)
