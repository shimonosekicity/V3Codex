# 下関市 移住・定住支援補助金 要件確認アプリ

下関市の相談窓口で、来庁者と職員が補助金の要件を1項目ずつ確認するための静的Webアプリです。判定結果は参考情報であり、最終的な対象可否は各担当課が判断します。

## 公開URL

GitHub Pagesの公開後、次の形式になります。

`https://＜GitHubユーザーまたは組織名＞.github.io/shimonoseki-subsidy-checker/`

GitHubのリポジトリ設定で `Settings` → `Pages` → `Deploy from a branch` を選び、`main` ブランチの `/ (root)` を公開してください。

## ローカル確認

JSONを`fetch`するため、`index.html`を直接開かずWebサーバーを使用します。

```powershell
cd C:\Users\user\shimonoseki-subsidy-checker
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

Node.jsを利用する場合は、次でも起動できます。

```powershell
node scripts/serve.mjs
```

## データ更新手順

1. Googleスプレッドシートの「補助金マスタ」「要件」を編集します。
2. 拡張機能のApps Scriptに `admin/sheet-to-json.gs` を登録します。
3. スプレッドシートを再読み込みし、メニューの「補助金データ」→「JSONを書き出す」を実行します。
4. Googleドライブに作成された `subsidies.json` の内容を確認します。
5. リポジトリの `data/subsidies.json` と置き換え、GitHubへ反映します。
6. 公開画面で対象補助金の全設問と担当課情報を確認します。

シート作成時は `admin/template_master.csv` と `admin/template_requirements.csv` をインポートできます。`ja`項目、ID、要件種別などに不備がある場合、書き出し時にエラーになります。

### GitHubへ直接送信する場合

Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」に次を登録します。

| キー | 内容 |
|---|---|
| `GITHUB_TOKEN` | Contentsの書き込み権限を持つFine-grained PAT |
| `GITHUB_OWNER` | GitHubのユーザー名または組織名 |
| `GITHUB_REPO` | リポジトリ名 |
| `GITHUB_BRANCH` | 通常は `main` |

トークンはシートやソースコードに記載しないでください。メニューの「GitHubへ送信する」は `data/subsidies.json` を直接更新します。送信前に内容を確認する運用を推奨します。

## 月次の変更通知

毎月1日にGitHub Actionsが、`sourceUrl`を登録した公式ページの本文ハッシュを確認します。

変更候補または取得エラーがあると、GitHub Issue「補助金公式HPの変更候補を確認してください」が作成されます。

1. Issueに記載された公式ページを開きます。
2. 最新の要綱・募集期間・金額・要件・連絡先を担当課と確認します。
3. 変更があればスプレッドシートを修正し、JSONを再生成します。
4. アプリの表示と判定を確認してからIssueを閉じます。

この仕組みは変更の可能性を通知するだけです。公式ページの内容を自動解釈したり、アプリの補助金データを自動更新したりしません。

## 多言語運用

- UIラベルは `data/i18n.json` で管理します。
- 補助金名と概要は `data/subsidies.json` の `ja`、`en`、`zh`、`ko`、`vi` で管理します。
- 要件本文は日本語を確定値とします。
- 要件の翻訳が未登録の場合、アプリは日本語本文と「日本語のみ」の注意を選択言語で表示します。
- 要件の翻訳は、担当課または専門の翻訳者が原文との一致を確認した場合に限り登録してください。

## データ登録上の注意

- `yesno`型で`required: true`の要件は「いいえ」で対象外候補になります。
- `choice`型では、対象外の選択肢に`"disqualify": true`を付けます。
- 受付終了制度は`"status": "closed"`とします。
- 出典ページと要綱PDFは確認できたURLのみ登録します。
- 電話番号、受付期間、制度年度は更新のたびに確認してください。

## 免責

本アプリの情報は令和8年度（2026年度）時点の調査に基づく参考情報です。アプリの結果は申請資格や交付を保証しません。最終的な対象可否は各担当課の判断によります。案内時は必ず最新の要綱、募集状況、担当課の回答を確認してください。

## 困ったとき

システム担当者の氏名、内線、メールアドレスを運用開始前にここへ記載してください。
