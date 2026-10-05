# code-apps-with-vscode

VS Code と **Power Platform Tools** 拡張機能を使い、コードで開発した Web アプリを **Power Apps Code Apps** にデプロイして動かすためのチュートリアルです。

公式の Vite テンプレートを出発点に、開発環境の準備、Power Platform への接続、ローカルでの開発、ビルド、発行、ブラウザーでの稼働確認までを体験します。キャンバスアプリの画面設計や、Power Apps component framework (PCF) のコンポーネント開発とは別の手順です。

> このリポジトリは手順書です。完成済みアプリは同梱していません。以下の手順で、リポジトリ内に `my-app` フォルダーを作成します。

## このチュートリアルのゴール

- VS Code で Web アプリのコードを編集できるようにします。
- Power Platform の対象環境に接続し、Code Apps として初期化します。
- ローカルで動作を確認したアプリを Power Apps に発行します。
- 発行された URL で起動し、必要なユーザーに共有します。

Code Apps は、コードで作成した Web アプリに Power Platform の認証、ホスティング、コネクター、ガバナンスを組み合わせる仕組みです。このチュートリアルでは、外部データ接続なしの最小構成で、まず発行までの流れを確認します。

## ツールの役割

| ツール | このチュートリアルでの役割 |
| --- | --- |
| Visual Studio Code | コード編集と統合ターミナルでの操作 |
| Power Platform Tools | VS Code 内での Power Platform 開発支援と Power Platform CLI (`pac`) の提供 |
| Power Platform CLI (`pac`) | 認証プロファイルの作成と接続確認 |
| Power Apps CLI (`pa`) | Code Apps の初期化、ローカル実行、発行 |
| Node.js / npm | 依存パッケージのインストールとアプリのビルド |

> **CLI の違いに注意**: 現行の公式クイックスタートは npm ベースの Power Apps CLI (`pa app ...`) を使用します。従来の `pac code ...` は将来の非推奨化が予告されています。本書では Power Platform Tools を導入した VS Code を作業環境とし、Code Apps の操作には別途インストールする `pa` を使います。拡張機能のインストールだけで `pa` が利用可能になるわけではありません。

## 前提条件

本書のコマンド例は **Windows / VS Code の PowerShell ターミナル**を想定しています。

| 項目 | 必要なもの |
| --- | --- |
| エディター | [Visual Studio Code](https://code.visualstudio.com/) |
| 拡張機能 | Microsoft 提供の [Power Platform Tools](https://marketplace.visualstudio.com/items?itemName=microsoft-IsvExpTools.powerplatform-vscode) |
| 実行・ビルド環境 | [Node.js の LTS 版](https://nodejs.org/) と npm |
| ソース管理 | [Git](https://git-scm.com/) |
| アカウント | 対象 Power Platform 環境にアクセスできる職場または学校アカウント |
| 環境と権限 | Code Apps が有効な開発・検証用環境と、アプリを作成・発行できる権限。権限が不明な場合は管理者に確認します |
| 利用ライセンス | アプリを実行するユーザーに適用される Power Apps の利用権 |

公式ドキュメントでは、実行ユーザーに Power Apps Premium、従量課金、App Pass、または利用可能な Premium ライセンスを割り当てる Auto-claim のいずれかが必要とされています。開発・検証環境と本番運用の利用条件は、テナント管理者に確認してください。

## 手順 1: 対象環境で Code Apps を有効にする

この操作は Power Platform 管理者または環境管理者が行います。既に有効な場合は次へ進みます。

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開きます。
2. **Manage > Environments** から、開発・検証用の環境を選択します。
3. **Settings > Product > Features** を開きます。
4. **Power Apps code apps > Enable code apps** をオンにして保存します。
5. 対象環境の詳細画面で **環境 ID (Environment ID)** を確認し、控えます。

環境 ID はテナント ID とは異なります。誤って本番環境へ発行しないよう、環境名と ID の両方を確認してください。画面の表示名はポータルの言語や更新によって異なる場合があります。

## 手順 2: VS Code と Power Platform Tools を準備する

### 2-1. 拡張機能を導入してツールを確認する

1. このリポジトリを clone またはダウンロードし、VS Code でリポジトリのフォルダーを開きます。
2. VS Code の **拡張機能**で `Power Platform Tools` を検索し、発行元が Microsoft であることを確認してインストールします。
3. 必要に応じて VS Code を再読み込みし、**ターミナル > 新しいターミナル**から PowerShell を開きます。
4. 次のコマンドで開発ツールを確認します。

```powershell
node --version
npm --version
git --version
Get-Command pac
pac help
```

拡張機能経由で導入した `pac` は、既定では VS Code 内のターミナルから利用します。`pac help` でヘルプが表示された場合は **2-3** に進みます。`Get-Command pac` や `pac` が「認識されません」となる場合は、次の **2-2** を実施してください。

### 2-2. `pac` が認識されない場合は PATH を設定する (Windows)

拡張機能が CLI をダウンロード済みでも、既存のターミナルに PATH が反映されていない場合があります。

1. Power Platform Tools がこのワークスペースで有効であることを確認します。
2. VS Code のアクティビティバーから Power Platform を開き、CLI の初期化・ダウンロードが完了するまで待ちます。失敗した場合は **表示 > 出力** の Power Platform 関連ログを確認します。
3. 既存のターミナルをゴミ箱ボタンで終了し、新しい PowerShell ターミナルを作成して `Get-Command pac` を再実行します。改善しなければ、コマンドパレットから **Developer: Reload Window** を実行し、再度ターミナルを作成します。

それでも見つからない場合は、標準の Windows 版 VS Code における配置先を確認し、存在する場合に限って現在のターミナルの PATH に追加します。

```powershell
$pacDirectory = Join-Path $env:APPDATA 'Code\User\globalStorage\microsoft-isvexptools.powerplatform-vscode\pac\tools'
if (Test-Path (Join-Path $pacDirectory 'pac.exe')) {
	$env:PATH = "$pacDirectory;$env:PATH"
	Get-Command pac
	pac help
} else {
	Write-Warning 'PAC CLI が標準の配置先にありません。拡張機能の状態と出力ログを確認してください。'
}
```

この設定は現在のターミナルだけに適用され、Windows 全体の PATH は変更しません。そのまま同じターミナルで後続の手順を進められます。配置先は VS Code の種類や拡張機能のバージョンによって異なる場合があります。ファイルが存在しないときは、空のフォルダーを PATH に追加せず、拡張機能の初期化エラーを確認してください。

成功すると、`Get-Command pac` に `pac.exe` が表示され、`pac help` に次のようなヘルプが表示されます。バージョン番号はインストール状況によって異なります。

```text
Microsoft PowerPlatform CLI
Version: 2.12.1+g0914bd1 (.NET Framework 4.8.9345.0)
```

この方法で `pac` の起動を確認できたら、**同じターミナルのまま 2-3 と手順 3 に進みます**。ターミナルを新しく開き直して再び認識されなくなった場合は、上記の PATH 設定を再実行してください。

### 2-3. Power Apps CLI を導入する

続いて、公式クイックスタートに従って Power Apps CLI と SDK を導入します。

```powershell
npm install --global @microsoft/power-apps-cli
npm install --global @microsoft/power-apps
pa --help
```

## 手順 3: Power Platform への接続を確認する

次の `<environment-id>` を手順 1 で確認した環境 ID に置き換えて実行します。山括弧は含めません。

```powershell
pac auth create --environment "<environment-id>"
pac auth list
```

サインイン画面では対象環境にアクセスできるアカウントを使用します。一覧のアクティブなプロファイルで、ユーザーと環境が意図したものになっていることを確認してください。

### Power Apps CLI 側のアカウントも設定する

`pac` と `pa` の認証は独立しています。`pac auth list` で正しいアカウントが選択されていても、`pa` が別のアカウントでサインインしている場合があります。アプリの初期化前に、必ず次を確認します。

```powershell
pa auth status
```

未ログイン、または対象環境と異なるアカウントの場合は、次の `<user-principal-name>` を、先ほど `pac` で接続に成功したアカウントのメールアドレス (UPN) に置き換えて実行します。

```powershell
pa auth login --account "<user-principal-name>"
```

ブラウザーで対象環境のアカウントを選んでサインインします。`--account` はサインイン画面へのヒントであり、アカウントを強制する指定ではありません。別のアカウントが表示されたら「別のアカウントを使用する」などの選択肢から切り替えてください。

ログインが成功したら、キャッシュされたアカウントを明示的に選択して確認します。既に正しいアカウントでログイン済みの場合も、こちらで切り替えられます。

```powershell
pa auth switch --account "<user-principal-name>"
pa auth status
```

対象環境のアカウントが表示されたことを確認してから、手順 4 に進みます。全アカウントのキャッシュを削除する `pa auth logout` は、この切り替えには不要です。

> **`ServiceToServiceEnvironmentNotFound` (404) が出た場合**: エラー中の「環境がテナント内に見つからない」という記述と `pa auth status` を確認します。`pac` では同じ環境 ID に接続できているのに `pa` だけ失敗する場合は、まずアカウント・テナントの不一致を疑います。上記の操作で認証先を直し、作成済みの `my-app` フォルダーで `pa app init` だけを再実行してください。テンプレートの再取得や `npm install` のやり直しは不要です。認証先が正しい場合は、環境 ID と対象環境へのアクセス権を確認してください。

## 手順 4: アプリを作成して初期化する

VS Code のターミナルで、リポジトリのルートから実行します。既に `my-app` がある場合は上書きせず、別のフォルダー名に変更してください。

```powershell
npx degit github:microsoft/PowerAppsCodeApps/templates/vite my-app
cd my-app
npm install
pa app init --display-name "Code Apps with VS Code" --environment-id "<environment-id>"
```

`<environment-id>` は実際の環境 ID に置き換えます。初期化時にサインインを求められた場合は、画面の案内に従って認証します。

初期化後は、生成された設定の環境 ID と表示名が正しいことを確認します。**以降のアプリ関連コマンドは、すべて `my-app` フォルダーで実行します。**

このテンプレートを利用することで、通常の Web アプリをそのままアップロードするのではなく、Code Apps 用の SDK と構成を含むプロジェクトから始められます。

## 手順 5: ローカルで実行してコードを変更する

```powershell
pa app run
```

1. ターミナルに表示される **Local Play** の URL を開きます。
2. Power Platform にサインインしているものと同じブラウザープロファイルを使用します。
3. アプリが表示されたら、VS Code でテンプレートの画面コンポーネントを開き、見出しなどの表示テキストを変更します。
4. ローカルの画面に変更が反映されることを確認します。

単なる localhost の URL ではなく、CLI が案内する **Local Play** を使用してください。Edge / Chrome がローカルネットワークへのアクセス許可を求めた場合は、組織のポリシーに従って許可します。管理設定でブロックされる場合は管理者に相談してください。

確認が終わったら、ターミナルで `Ctrl+C` を押してローカル実行を停止します。

## 手順 6: ビルドして Code Apps にデプロイする

まず、本番配信用のファイルをビルドします。

```powershell
npm run build
```

ビルドが成功したことを確認してから、Power Apps に発行します。

```powershell
pa app push
```

途中で追加の選択を求められた場合は、対象環境の運用ルールに従って選択してください。成功すると、発行されたアプリの **Power Apps URL** が表示されます。

> この操作は対象環境にアプリを作成・更新します。実行前に、初期化した環境が開発・検証用の環境であることを再確認してください。

## 手順 7: 公開先での稼働を確認する

1. `pa app push` が返した URL をブラウザーで開きます。
2. 必要に応じてサインインし、アプリが表示されることを確認します。
3. 手順 5 で変更したテキストや、アプリ内の操作が公開先にも反映されていることを確認します。
4. ローカルの `pa app run` が停止していても、公開 URL でアプリが動くことを確認します。

[Power Apps 作成者ポータル](https://make.powerapps.com/) から確認する場合は、同じ環境を選択して **アプリ** 一覧から対象アプリを開きます。別のユーザーに利用してもらう場合は、ここからアプリを共有してください。

**デプロイと共有は別の操作です。** URL を渡すだけでは利用権限が付与されません。共有先ユーザーのライセンスとアクセス権を確認し、そのユーザーでも起動をテストしてください。後からデータ接続を追加する場合は、接続・データソース側の権限と同意も別途必要です。

## 手順 8: 変更を再デプロイする

コードを修正し、ローカルで確認した後、手順 6 と同じ順序で実行します。

```powershell
npm run build
```

ビルド成功後に発行します。

```powershell
pa app push
```

同じアプリを更新するときは、初期化で生成されたアプリ ID を含む設定を保持し、毎回初期化し直さないでください。公開 URL を再読み込みして変更を確認します。

## 完了チェック

- [ ] Power Platform Tools が有効で、VS Code のターミナルから `pac` を実行できる
- [ ] `pa` を導入し、意図した環境でアプリを初期化できた
- [ ] Local Play でアプリを開き、コード変更を確認できた
- [ ] `npm run build` と `pa app push` が成功した
- [ ] ローカルサーバーを停止した状態で、公開 URL のアプリが動いた
- [ ] 共有する場合は、共有先ユーザーの権限・ライセンス・起動を確認した

## よくある問題

| 症状 | 確認すること |
| --- | --- |
| `pac` が見つからない | Power Platform Tools を有効化し、VS Code 内で新しいターミナルを開きます |
| `pa` が見つからない | npm のグローバルインストールが成功したか、グローバル実行ファイルの場所が PATH に含まれるかを確認します |
| PowerShell が npm スクリプトの実行を拒否する | 組織の実行ポリシーを確認します。Node.js 付属の `npm.cmd` / `npx.cmd` を使う方法もあります。ポリシーを無断で緩和しないでください |
| 対象環境に初期化・発行できない | 環境 ID、サインイン先テナント、作成・発行権限、Code Apps の有効化を確認します |
| Local Play が開けない | `pa app run` の稼働、ブラウザープロファイル、ローカルネットワークアクセス許可を確認します |
| ビルドが失敗する | `my-app` で `npm install` を実行したか確認し、表示されたビルドエラーを修正します。失敗した状態では push しません |
| アプリが一覧にない | 作成者ポータルで、初期化時に指定した環境を選択しているか確認します |
| 自分は開けるが他の人は開けない | アプリの共有、利用ライセンス、組織のアクセス制御を確認します |
| 更新が反映されない | ビルド成功後に push したか、同じアプリ・環境を見ているかを確認して再読み込みします |

## 運用上の注意と次のステップ

- ブラウザーへ配信するコードに、シークレット、パスワード、API キーを含めないでください。フロントエンドに埋め込んだ環境変数も秘密情報の保管場所にはなりません。
- ソースコードは Git で管理し、依存パッケージのフォルダー、ビルド成果物、認証情報を誤ってコミットしないようにします。
- このチュートリアルはフロントエンドの発行を対象にしています。独自のサーバー処理が必要な場合は、バックエンドの実装・配置・認証を別途設計します。
- データ連携へ進む場合は、[データソースの追加](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data)を参照し、コネクターの接続と組織のデータ損失防止 (DLP) ポリシーを確認します。
- 本番導入では、開発・テスト・本番環境の分離、ソリューションを使った [ALM](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/alm)、共有範囲、監視、ライセンスを検討します。
- 検証用アプリが不要になったら、対象環境とアプリ名を確認したうえで、作成者ポータルから削除します。共有環境全体や他のアプリは削除しないでください。

## 参考資料

手順は 2026-10-05 に参照した公式ドキュメントを基にしています。CLI や画面は更新されるため、差異がある場合は公式資料と `pa --help` を確認してください。

- [Power Apps Code Apps の概要・前提条件](https://learn.microsoft.com/power-apps/developer/code-apps/overview)
- [Power Apps CLI を使ったクイックスタート](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/npm-quickstart)
- [Power Apps CLI リファレンス](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
- [Power Platform CLI の概要とインストール](https://learn.microsoft.com/power-platform/developer/cli/introduction)
- [Power Platform Tools のインストール](https://learn.microsoft.com/power-platform/developer/howto/install-vs-code-extension)
- [従来の pac code コマンドと移行案内](https://learn.microsoft.com/power-platform/developer/cli/reference/code)
- [公式テンプレート・サンプル](https://github.com/microsoft/PowerAppsCodeApps)
