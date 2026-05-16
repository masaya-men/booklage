# S9 一括インポート — 設計仕様書

> 作成日: 2026-04-15
> ステータス: 承認済み

---

## 概要

ユーザーが各プラットフォームに散らばったブックマーク・お気に入りを、ファイルアップロードまたはURLペーストで一括インポートできる機能。

**行動指針:** ユーザーが今まで溜めてきた整理しきれないブックマークを、楽に回収してあげる。

---

## 対応プラットフォーム（事実確認済み 2026-04-15）

### 公式データで取得可能

| ソース | 入力形式 | 抽出データ | フォルダ構造 |
|--------|---------|-----------|-------------|
| ブラウザ (Chrome/Firefox/Safari) | Netscape Bookmark Format HTML | URL, タイトル, 追加日時 | DL/DT階層 → フォルダ |
| YouTube | Google Takeout CSV (`Liked videos.csv` 等) | 動画ID → URL構築, タイムスタンプ | プレイリスト名 → フォルダ |
| TikTok | データダウンロード JSON (`user_data.json`) | 動画URL, 日時 | FavoriteVideos → フォルダ |
| Reddit | GDPR CSV (`saved_posts.csv`) | 投稿URL, タイトル | Reddit保存 → フォルダ |

### サードパーティ拡張経由

| ソース | 入力形式 | 備考 |
|--------|---------|------|
| Twitter/X | 無料Chrome拡張のCSV/JSON | 公式ダウンロードにブックマーク含まれない |
| Instagram | 無料Chrome拡張のCSV/JSON | 公式データに保存済み投稿が含まれるか不確実 |

### その他

| ソース | 入力形式 |
|--------|---------|
| URLリスト | 改行区切りテキスト（テキストエリア貼り付け） |

---

## UIフロー

### エントリポイント

ボード画面のツールバーに「インポート」ボタンを配置。クリックでモーダルを開く。

### 3ステップモーダル

#### ステップ1: ソース選択

- 7つのタイル（6プラットフォーム + URLペースト）
- 各タイルにプラットフォーム名 + ファイル形式を明記
- リキッドグラス適用、ホバーアニメーション
- タイルクリックでステップ2へスライド遷移

#### ステップ2: ファイル入力

- ドラッグ&ドロップ対応のドロップゾーン
- 「ファイルを選択」ボタンも用意
- プラットフォーム別の「エクスポート手順ガイド」を表示（折りたたみ式）
  - Chrome: ブックマークマネージャー → ⋮ → ブックマークをエクスポート
  - Firefox: ブックマーク → すべてのブックマーク → インポートとバックアップ → HTMLにエクスポート
  - Safari: ファイル → ブックマークをエクスポート
  - YouTube: Google Takeout → YouTube選択 → ダウンロード
  - TikTok: 設定 → アカウント → データをダウンロード → JSON形式
  - Reddit: reddit.com/settings/data-request → 処理完了後ダウンロード
  - Twitter/X: 「無料の拡張機能でエクスポート」の案内 + 推奨拡張リンク
  - Instagram: 「無料の拡張機能でエクスポート」の案内 + 推奨拡張リンク
- URLペースト選択時はテキストエリアを表示（改行区切り）
- ファイル解析完了でステップ3へ自動遷移

#### ステップ3: プレビュー & 実行

- 検出件数の表示（「247件のブックマークを検出」）
- フォルダツリー表示（インポート元の構造を自動反映）
  - 各フォルダに「→ 新フォルダ「○○」」または「→ 既存「○○」」のラベル
  - クリックでフォルダ割り当て変更（ドロップダウン）
  - 「全部このフォルダに」一括変更オプション
- 個別ブックマークの展開表示（URL + タイトル）
- 重複URL検出表示（「12件の重複URL — スキップされます」）
- 「全選択 / 全解除」チェックボックス
- 「○○件をインポート」ボタン（グラデーション、目立つ配置）

---

## データ処理

### ファイルパーサー

各プラットフォーム用のパーサーを `lib/import/` に配置:

- `parse-browser-bookmarks.ts` — Netscape Bookmark Format HTML パーサー
- `parse-youtube-takeout.ts` — Google Takeout CSV パーサー（6行ヘッダースキップ、動画ID→URL変換）
- `parse-tiktok-data.ts` — TikTok user_data.json パーサー
- `parse-reddit-export.ts` — Reddit saved_posts.csv パーサー
- `parse-twitter-export.ts` — Twitter/X拡張出力 CSV/JSON パーサー（複数拡張の出力形式に対応）
- `parse-instagram-export.ts` — Instagram拡張出力 CSV/JSON パーサー
- `parse-url-list.ts` — 改行区切りURL テキストパーサー

各パーサーは共通の `ImportedBookmark` 型を返す:

```typescript
interface ImportedBookmark {
  url: string
  title: string
  description?: string
  folder?: string       // 元のフォルダ名
  addedAt?: string      // ISO 8601
  source: ImportSource  // 'browser' | 'youtube' | 'tiktok' | 'reddit' | 'twitter' | 'instagram' | 'url-list'
}

type ImportSource = 'browser' | 'youtube' | 'tiktok' | 'reddit' | 'twitter' | 'instagram' | 'url-list'
```

### 重複排除

- IndexedDB内の既存ブックマークとURL一致で照合
- 正規化: トレイリングスラッシュ除去、www有無の統一、プロトコル統一
- 重複はプレビュー画面で明示し、インポート対象から除外

### OGP取得戦略

大量URLへの対応:

1. **即時保存** — URL・タイトル（ファイルから取得済み）だけで先にIndexedDBに保存。カードはサムネイルなしで即座にキャンバスに出現
2. **バックグラウンドOGP取得** — 5件ずつ並列でfetchOgp()を呼び出し
3. **段階的UI更新** — サムネイル取得完了ごとにカードが画像付きに変化（フェードインアニメーション）
4. **自動リトライ** — 1回失敗したら3秒後にもう1回再試行
5. **失敗時** — カードは保存される（URLとタイトルだけのカード）。カードに赤いバッジ（パルスアニメーション）を表示
6. **完了後レポート** — 「247件中 5件の情報を完全に取得できませんでした」とリスト表示
7. **手動リトライ** — 失敗カードに「再取得」ボタン。ユーザーが好きなタイミングで押せる

※ YouTube/Twitterは URL → embed なのでOGP不要、即表示可能

### IndexedDB保存

既存の `addBookmark()` ロジックを再利用:
- BookmarkRecord + CardRecord をアトミックに作成
- ランダム位置・ランダム回転（既存ロジック）
- gridIndex は既存カード数ベースで連番

バッチ処理:
- 50件ずつのトランザクションに分割（大量データでのブラウザ負荷軽減）

---

## ブックマークリストパネル（新機能）

インポート結果の確認だけでなく、普段のキャンバス操作でも有用な機能。

### 機能

- サイドパネル（ドロワー）形式で全ブックマークを一覧表示
- フォルダごとのグループ表示
- 各アイテム: サムネイル（小）+ タイトル + URL + ソースアイコン
- OGP取得失敗カードには赤いドット表示
- リストのアイテムをクリック → キャンバスがそのカードの位置まで**スムーズにパン&ズーム**（GSAP + Lenis）
- 失敗カードの「再取得」ボタン

### エントリポイント

- ボード画面のツールバーにリストアイコン
- インポート完了後に自動的にリストパネルが開く

---

## アニメーション & マイクロインタラクション

### モーダル

- 開閉: GSAP（scale + opacity + backdrop-blur 遷移）
- ステップ遷移: スライド + フェード（GSAP Timeline）
- ソースタイル: ホバーでscale(1.05) + ボーダーグロー + tilt微動
- ドロップゾーン: ドラッグオーバーでボーダーが脈動 + 背景色変化
- ファイル解析中: スケルトンローディング

### インポート中

- プログレスバー: グラデーション + 光の走りアニメーション（CSS shimmer）
- 完了カウント: 数字がフリップ式に更新
- キャンバス上: カードが1枚ずつ上方から降り注ぐ（GSAP stagger）
  - 各カード: 落下 → バウンス → 回転して定位置に着地
  - staggerタイミング: 0.05〜0.1秒間隔（雪が降るような連続感）

### 完了時

- 全カード着地後にキラキラパーティクル一斉発火
- 「○○件のブックマークを追加しました！」トースト通知（5秒で自動消滅）
- モーダルが閉じてリストパネルが開く

### エラーカード

- 赤いバッジ（右上）にパルスアニメーション（attention-seeking）
- ホバーで「情報の取得に失敗しました — クリックで再取得」ツールチップ

---

## UI品質方針

- モーダル全体にリキッドグラス適用（既存UIパネルと統一デザイン）
- モーダル内スクロールバーはカスタムデザイン
- ファイル形式不一致時のフレンドリーなエラーガイダンス
- 全てのインタラクションにGSAPアニメーション（機械的な動きを排除）
- AIっぽくないクリエイティブなデザインを徹底

---

## 技術的な注意事項

### 既存コードの再利用

- `lib/utils/url.ts` — `detectUrlType()`, `extractTweetId()`, `extractYoutubeId()` をインポート判定に活用
- `lib/storage/indexeddb.ts` — `addBookmark()` をバッチ対応に拡張
- `lib/scraper/ogp.ts` — `fetchOgp()` をバックグラウンドOGP取得に使用
- `lib/glass/` — リキッドグラスをモーダルに適用
- `lib/constants.ts` — Z_INDEX にモーダル用定数追加

### 新規ファイル（予定）

```
lib/import/
  types.ts                    — ImportedBookmark型、ImportSource型
  parse-browser-bookmarks.ts  — ブラウザHTML パーサー
  parse-youtube-takeout.ts    — YouTube CSV パーサー
  parse-tiktok-data.ts        — TikTok JSON パーサー
  parse-reddit-export.ts      — Reddit CSV パーサー
  parse-twitter-export.ts     — Twitter拡張出力パーサー
  parse-instagram-export.ts   — Instagram拡張出力パーサー
  parse-url-list.ts           — URLリスト パーサー
  deduplicate.ts              — URL正規化 + 重複検出
  batch-import.ts             — バッチ保存 + OGPキュー管理

components/import/
  ImportModal.tsx             — モーダル全体（3ステップ管理）
  ImportModal.module.css
  SourceSelector.tsx          — ステップ1: ソース選択タイル
  FileUploader.tsx            — ステップ2: ドラッグ&ドロップ + ガイド
  ImportPreview.tsx           — ステップ3: プレビュー + フォルダ割り当て
  ImportProgress.tsx          — インポート中プログレス表示

components/board/
  BookmarkListPanel.tsx       — ブックマークリストパネル
  BookmarkListPanel.module.css
```

### DBスキーマ変更

v4 マイグレーション — BookmarkRecord に `ogpStatus` フィールドを追加:

```typescript
type OgpStatus = 'pending' | 'fetched' | 'failed'
```

- `pending` — OGP未取得（インポート直後）
- `fetched` — OGP取得済み（サムネイルの有無は別）
- `failed` — OGP取得失敗（リトライ対象）

既存ブックマーク（v3以前）は `fetched` として扱う（既にOGP取得済みのため）。
これにより、失敗カードの特定・リストパネルでの赤ドット表示・手動リトライが正確に動作する。

---

## S9に含まないもの（将来スプリント）

- AllMarks専用Chrome拡張（Twitter/Instagram直接読み取り）→ S10以降
- カスタムカーソル機能（リキッドグラス虫眼鏡 + コレクション）→ UX磨きスプリント
- サイト全体のカスタムスクロールバー → UX磨きスプリント（※モーダル内は本スプリントで対応）
- リストパネルの検索・フィルター機能 → 将来拡張

---

## パフォーマンス考慮

- 500件インポート時もUIがフリーズしない（バッチ分割 + requestAnimationFrame）
- OGP取得は並列5件制限（サーバー負荷 + ブラウザ同時接続数）
- カードアニメーションはperfTierシステムと連動（低FPS時はstagger省略）
- ファイルパースはメインスレッドで実行（Web Worker検討は将来）
