# S5: ブックマークレットUI — 設計書

> 作成: 2026-04-14
> ステータス: 承認済み

## 目的

ユーザーが任意のWebサイトからワンクリックでBooklageにブックマークを保存できる主導線を実装する。サーバー不要（¥0）、全ブラウザ対応。

## 全体フロー

```
[任意のWebサイト]
  ↓ ユーザーがブックマークバーの「📌 Booklage」をクリック
  ↓ bookmarklet.js が実行される
  ↓ ページのOGPメタタグを読み取り（title, image, description, favicon, siteName）
  ↓ フォールバック: document.title, link[rel=icon]
  ↓ Booklageの /save ページを小さなポップアップウィンドウで開く
      （OGPデータはURLSearchParamsで渡す）

[Booklage /save ポップアップ（480×600px）]
  ↓ URLパラメータからOGPデータをパース
  ↓ プレビュー表示（サムネイル + タイトル + サイト名）
  ↓ IndexedDBからフォルダ一覧を読み込み・表示
  ↓ ユーザーがフォルダ選択（or 新規作成）
  ↓ 「保存」ボタン → IndexedDBに保存（既存の addBookmark 関数を使用）
  ↓ 完了アニメーション → 2秒後に window.close()
```

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `public/bookmarklet.js` | ページ上で実行。OGP抽出 → ポップアップ起動 |
| `app/(app)/save/page.tsx` | 保存ポップアップのルート（Server Component） |
| `components/bookmarklet/SavePopup.tsx` | ポップアップUI本体（Client Component） |
| `components/bookmarklet/SavePopup.module.css` | スタイル |
| `lib/utils/bookmarklet.ts` | ブックマークレットJS URI生成（既存を改修） |

## 1. bookmarklet.js（ページ上で実行されるスクリプト）

`public/bookmarklet.js` として配置。ブックマークレットのJS URIは、このファイルをインラインで含む（外部ファイル読み込みではなくURIに直接埋め込む方式）。

### OGP抽出ロジック

```
1. meta[property="og:title"] → フォールバック: document.title
2. meta[property="og:description"] → フォールバック: meta[name="description"]
3. meta[property="og:image"] → フォールバック: なし（空文字）
4. meta[property="og:site_name"] → フォールバック: location.hostname
5. URL → location.href
6. favicon → link[rel="icon"] or link[rel="shortcut icon"] → フォールバック: /favicon.ico
```

### ポップアップ起動

```javascript
window.open(
  `${BOOKLAGE_URL}/save?url=...&title=...&image=...&desc=...&site=...&favicon=...`,
  'booklage-save',
  'width=480,height=600,scrollbars=yes'
)
```

### ブックマークレット URI 方式

`lib/utils/bookmarklet.ts` の `generateBookmarkletCode()` を改修。スクリプトタグ注入方式ではなく、OGP抽出 + window.open を直接JS URI内に埋め込む。

理由: 外部スクリプト読み込みは CSP (Content-Security-Policy) でブロックされるサイトが多い。インライン方式のほうが互換性が高い。

## 2. /save ページ（ポップアップウィンドウ内）

### URL パラメータ

| パラメータ | 内容 | 必須 |
|-----------|------|------|
| `url` | 保存するURL | はい |
| `title` | ページタイトル | いいえ（URLをフォールバック） |
| `image` | OGPサムネイルURL | いいえ |
| `desc` | 説明文 | いいえ |
| `site` | サイト名 | いいえ |
| `favicon` | ファビコンURL | いいえ |

### UI構成

```
┌─────────────────────────────┐
│  📌 Booklage に保存          │  ← ヘッダー
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  [サムネイル画像]       │  │  ← プレビューカード
│  │  タイトルテキスト       │  │
│  │  🌐 example.com        │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  フォルダを選択:             │
│  ● My Collage              │  ← ラジオボタン式
│  ○ ファッション              │
│  ○ テック                   │
│  [+ 新しいフォルダ]          │  ← インライン入力
├─────────────────────────────┤
│       [✨ 保存する]          │  ← メインCTA
└─────────────────────────────┘
```

### 状態遷移

1. **読み込み中** — IndexedDB初期化 + フォルダ一覧取得
2. **フォルダ選択** — デフォルトは最初のフォルダを選択済み
3. **保存中** — ボタンにスピナー表示
4. **完了** — チェックマークアニメーション → 2秒後に `window.close()`
5. **エラー** — エラーメッセージ表示（再試行ボタン付き）

### デザイン

- リキッドグラスなし（ポップアップは小さいため効果が薄い、パフォーマンス優先）
- ダーク/ライト: OS設定に追従（`prefers-color-scheme`）
- 既存のCSS変数（`--color-*`, `--radius-*`, `--shadow-*`）を使用
- フォルダカラーを表示（既存の FOLDER_COLORS）

## 3. boardページ内のブックマークレット取得UI

設定パネル内、または画面上部に小さなバナーとして表示。

### 内容

- 「📌 ブックマークレットを入手」テキスト
- ドラッグ可能なリンク（`<a href="javascript:...">` — ブックマークバーにドラッグ）
- 簡単な説明: 「↑ これをブックマークバーにドラッグしてください」
- 凝ったチュートリアルはS7（LP）で実装

## 制約・前提

- **サーバー不要**（¥0）— 全てクライアントサイドで完結
- **API Routes不要** — OGPはブックマークレットがページ上で直接取得
- **既存関数を使用**: `initDB`, `addBookmark`, `getAllFolders`, `addFolder` from `lib/storage/indexeddb.ts`
- **URL種別判定**: 既存の `detectUrlType` from `lib/utils/url.ts`
- **URLパラメータサイズ上限**: ブラウザのURL長制限（約2000文字）に注意。descriptionは200文字で切る

## スコープ外（今回やらないこと）

- インタラクティブチュートリアル（S7で実装）
- Web Share Target / PWA共有（S6で実装）
- Twitter/YouTubeの一括インポート（将来機能）
- PiPドロップゾーン（v1.2）
