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

##### 4-5-3-5. Pull Requestで再検証する

ローカルでテストが成功したら、変更を作業ブランチへコミットしてGitHubへpushし、`main` へ取り込むためのPull Requestを作成します。

最初に、現在のブランチと変更ファイルを確認します。

```powershell
cd C:\github\code-apps-with-vscode
git status
```

現在のブランチが `feature/code-apps-ci` であることと、今回変更したファイルだけが表示されることを確認します。

確認後、今回の変更ファイルをステージします。

```powershell
git add -- my-app
```

このコマンドは、アプリとテストに関係する `my-app` フォルダー内の変更だけをステージします。`CICD実装手順書.md` はアプリの実行には不要なため、このコミットには含めません。手順書の変更をGitHubへ反映する場合は、アプリの変更とは別のドキュメント用コミットまたはPull Requestとして管理します。

ステージした内容を確認します。

```powershell
git status
git diff --cached
```

問題がなければコミットします。

```powershell
git commit -m "test: add initial UI test setup"
```

作業ブランチをGitHubへpushします。

```powershell
git push -u origin feature/code-apps-ci
```

`-u` を付けると、ローカルの `feature/code-apps-ci` とGitHub上の同名ブランチが関連付けられます。2回目以降は `git push` だけで同じブランチへ送信できます。

push後、GitHubでこのリポジトリを開くと、通常は `Compare & pull request` ボタンが表示されます。ボタンを選択し、次の内容を確認してPull Requestを作成します。

| 項目 | 設定内容 |
| --- | --- |
| base | `main` |
| compare | `feature/code-apps-ci` |
| タイトル | `Add Code Apps CI test setup` など、変更内容が分かる名称 |
| 本文 | 変更内容、実行したテスト、テスト結果、未対応事項を記載 |

Pull Request本文の例：

```markdown
## 変更内容

- VitestとReact Testing Libraryを追加
- Vitestの設定と共通セットアップを追加
- カウンターボタンのUIテストを追加
- CI/CD実装手順書を更新

## 検証

- `npm run test:ci`
  - Test Files: 1 passed
  - Tests: 1 passed

## 未対応

- GitHub Actionsワークフローは後続手順で追加
```

この時点では、GitHub Actionsのワークフローはまだ作成していません。「4-7. CI ワークフローを作成する」を完了すると、Pull Requestの作成または更新をきっかけに、GitHub側で次の処理が自動的に実行されます。

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

ローカルテストとGitHub Actionsのテストでは、同じ `npm run test:ci` を使用しますが、実行環境が異なります。

| 実行場所 | 目的 |
| --- | --- |
| ローカルPC | Pull Requestを作成する前に問題を早く発見し、修正する |
| GitHub Actions | 新しく用意した環境で依存関係を復元し、ほかの開発者の環境でも再現できる状態か確認する |

GitHub Actionsでは、ローカルに残っている `node_modules`、一時ファイル、未コミットの変更を利用できません。そのため、ローカルでは成功しても、必要なファイルのコミット漏れや `package-lock.json` の不整合があると失敗します。

Pull Requestでは、GitHubの `Checks` または `Actions` から `Validate` ジョブを開き、`npm run test:ci` を含む全ステップが成功していることを確認します。後続の「5-1. mainを保護する」で `Validate` を必須チェックに設定すると、このジョブが失敗している間はPull Requestを `main` へマージできなくなります。

#### 4-5-4. 今後のテスト追加方針

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
