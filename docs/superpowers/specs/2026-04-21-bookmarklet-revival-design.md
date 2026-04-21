# Bookmarklet Revival — 設計書

> 作成: 2026-04-21
> ステータス: 承認済み
> 旧 spec: `docs/superpowers/specs/2026-04-14-s5-bookmarklet.md`（B0 リビルド前、superseded）

## 目的

ユーザーが任意の Web サイトからワンクリックで Booklage にブックマークを保存できる主導線（bookmarklet）を復活させる。B0 リビルド時に削除された `public/bookmarklet.js` と board 上の install UI を再実装し、B-embeds 4 種カード（Tweet / VideoThumb / Image / Text）の pickCard router に実 URL が正しく流れることを検証する。

## 前提（ 2026-04-21 時点の既存資産）

- `/save` ルート (`app/(app)/save/page.tsx`) と `components/bookmarklet/SavePopup.tsx` は**完全に動作中**
  - URL param (`url`, `title`, `image`, `desc`, `site`, `favicon`) を読んでプレビュー
  - `initDB` + `getAllFolders` + `addBookmark` で IDB 書き込み
  - 保存後 `BroadcastChannel('booklage')` で `{ type: 'bookmark-saved' }` を post → 1.5s で `window.close()`
  - `SavePopup.module.css` は既存 design tokens で構築済
- B-embeds pickCard router + 4 種カード（TweetCard / VideoThumbCard / ImageCard / TextCard）は本番投入済
- `lib/utils/url.ts` の `detectUrlType` で URL 種別判定済
- `addBookmark` は自動で対応 `CardRecord` も作成（IDB transaction）

## 全体フロー

```
[任意の Web サイト]
  ↓ ユーザーがブックマークバーの「📌 Booklage」をクリック
  ↓ bookmarklet JS (inline URI) が実行される
  ↓ ページの OGP メタタグを読み取り
  ↓ window.open('/save?url=...&title=...&image=...&desc=...&site=...&favicon=...', 'booklage-save', 'width=480,height=600,scrollbars=yes')

[Booklage /save ポップアップ（既存 SavePopup、無変更）]
  ↓ URL param パース → プレビュー表示
  ↓ IDB からフォルダ一覧取得 → 選択 UI
  ↓ [保存] → addBookmark() で IDB に書き込み
  ↓ BroadcastChannel('booklage').postMessage({ type: 'bookmark-saved' })
  ↓ 1.5s 後に window.close()

[Board 側]
  ↓ BroadcastChannel 受信 → items 再取得
  ↓ pickCard が新規 URL を 4 種カードに振り分けて render
```

## スコープ

**In scope**:
- `lib/utils/bookmarklet.ts` 新規作成: bookmarklet JS URI 生成（純粋関数）
- `components/bookmarklet/BookmarkletInstall.tsx` 新規作成: サイドバー行
- `components/bookmarklet/BookmarkletInstallModal.tsx` 新規作成: 導入モーダル
- `components/bookmarklet/EmptyStateWelcome.tsx` 新規作成: 空状態ウェルカム
- 対応する `.module.css` 3 ファイル
- `components/board/Sidebar.tsx` 変更: BookmarkletInstall 行を mount
- `components/board/BoardRoot.tsx` 変更: items 0 枚時に EmptyStateWelcome を render、モーダル state 管理
- `messages/ja.json` 変更: `board.sidebar.bookmarklet` + `board.empty.*` + `board.bookmarkletModal.*` 翻訳キー追加
- `lib/utils/bookmarklet.test.ts` 新規: URI 生成ユニットテスト
- `e2e/bookmarklet.spec.ts` 新規: `/save` fixture param での保存フロー E2E

**Out of scope**（今回やらない）:
- UI polish（liquid glass / Lottie / アニメーション磨き）は別フェーズ
- 重複 URL 検知
- URL ペーストによる保存フロー（bookmarklet 以外の経路）
- PWA Share Target / Web Share API
- モバイル対応（bookmarklet はデスクトップ前提）
- 多言語（`ja.json` のみ、他 14 言語は後日スプリント）
- `/save` SavePopup 側の修正（既存動作を無変更で活用）
- `public/bookmarklet.js` としての外部ファイル化（Pure inline 方式を採用）

## アーキテクチャ

### 採用方式: Pure inline bookmarklet

- bookmarklet の JS コードは `javascript:(function(){...})();` 形式の IIFE で URI 内に完全にインライン化
- 外部 script を読み込まない（Twitter / GitHub 等の CSP で外部 script 注入が block されるケースを回避）
- URI 生成は build 時 or runtime の純粋関数で行う → `lib/utils/bookmarklet.ts`

### 却下した代替案

- **Loader 方式**: `<script src=...>` 動的注入。多くのサイトが CSP で block するため却下
- **Hybrid 方式**: 最小 inline + 将来の外部 script fallback。inline で十分完結するため冗長、却下

### ファイル構成

| ファイル | 状態 | 役割 |
|---------|------|------|
| `lib/utils/bookmarklet.ts` | **新規** | `generateBookmarkletUri(appUrl: string): string` + `extractOgpFromDocument(doc: Document): OgpData`（test 対応のため分離） |
| `lib/utils/bookmarklet.test.ts` | **新規** | URI 生成 + OGP 抽出ロジックのユニットテスト |
| `components/bookmarklet/BookmarkletInstall.tsx` | **新規** | サイドバー「📌 ブックマークレット」行（click → モーダル開く） |
| `components/bookmarklet/BookmarkletInstall.module.css` | **新規** | サイドバー行スタイル |
| `components/bookmarklet/BookmarkletInstallModal.tsx` | **新規** | 導入モーダル本体（ドラッグ可能リンク + 使い方説明） |
| `components/bookmarklet/BookmarkletInstallModal.module.css` | **新規** | モーダルスタイル |
| `components/bookmarklet/EmptyStateWelcome.tsx` | **新規** | Board 空状態の中央ウェルカムカード |
| `components/bookmarklet/EmptyStateWelcome.module.css` | **新規** | ウェルカムスタイル |
| `components/board/Sidebar.tsx` | 変更 | LIBRARY と Folders の間に BookmarkletInstall を mount |
| `components/board/BoardRoot.tsx` | 変更 | モーダル state (`bookmarkletModalOpen`) + EmptyStateWelcome render |
| `messages/ja.json` | 変更 | `board.sidebar.bookmarklet` + `board.empty.*` + `board.bookmarkletModal.*` キー追加 |
| `e2e/bookmarklet.spec.ts` | **新規** | `/save?url=...` fixture での保存フロー E2E |

## 1. bookmarklet JS URI

### 構造

```javascript
javascript:(function(){
  var d = document;
  var m = function(s) { var e = d.querySelector(s); return e ? e.getAttribute('content') || '' : ''; };
  var lnk = function(s) { var e = d.querySelector(s); return e ? e.getAttribute('href') || '' : ''; };
  var url = location.href;
  var title = m('meta[property="og:title"]') || d.title || url;
  var image = m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || '';
  var desc = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200);
  var site = m('meta[property="og:site_name"]') || location.hostname;
  var favicon = lnk('link[rel="icon"]') || lnk('link[rel="shortcut icon"]') || '/favicon.ico';
  if (favicon && favicon.indexOf('http') !== 0) {
    try { favicon = new URL(favicon, location.href).href; } catch(e) {}
  }
  var params = new URLSearchParams({ url: url, title: title, image: image, desc: desc, site: site, favicon: favicon });
  window.open(APP_URL + '/save?' + params.toString(), 'booklage-save', 'width=480,height=600,scrollbars=yes');
})();
```

`APP_URL` は `generateBookmarkletUri(appUrl)` が渡す実 URL で置換される。

### URI 全長の目安

- 上記 minified 後、約 800〜1000 文字
- `APP_URL` = `https://booklage.pages.dev` で合計 1100 文字前後
- ブラウザ URL 長制限 2000 文字の半分以下 → 安全

### パラメータエスケープ

- `URLSearchParams` が自動で encodeURIComponent 相当のエスケープを行う → 手動エスケープ不要
- description は 200 文字で切る（URI 膨張防止）
- image / favicon URL は切らない（短縮すると壊れる）

### 環境別 APP_URL

- production: `process.env.NEXT_PUBLIC_APP_URL` = `https://booklage.pages.dev`
- development: `http://localhost:3000`
- `generateBookmarkletUri()` が `NEXT_PUBLIC_APP_URL` を参照

## 2. install UI

### 2-1. サイドバー行 (BookmarkletInstall.tsx)

**配置**: サイドバー内、LIBRARY セクション（すべて / 未読 / 既読）と Folders セクションの**間**に追加

**見た目**:
- 既存サイドバー行と同じスタイル（左 padding、ホバーハイライト、14px 本文サイズ）
- 左にアイコン（📌）+ 「ブックマークレット」ラベル
- 右端に `→` or 類似の視覚示唆

**挙動**:
- クリック → BoardRoot の `setBookmarkletModalOpen(true)` を呼ぶ（props 経由）
- `role="button"` + `tabIndex={0}` + Enter/Space キー対応

### 2-2. 導入モーダル (BookmarkletInstallModal.tsx)

**条件付き render**: `isOpen && <Modal>...</Modal>`

**構成**（上から）:
1. ヘッダー: 「📌 ブックマークレットを設置する」 + 閉じる × ボタン
2. 大きめのドラッグ可能リンク（`<a href={bookmarkletUri} draggable>📌 Booklage</a>`）
   - styled to look like a chip/button with depth
   - `onClick={(e) => e.preventDefault()}` でクリック誤操作を防ぐ（ドラッグのみ有効）
3. 説明文: 「↑ これをブラウザのブックマークバーにドラッグしてください」
4. 水平 divider
5. 図（ブックマークバー見本）: 最小実装では ASCII / テキストベースのプレースホルダ、後日画像差し替え
6. ショートカット案内: 「ブックマークバーが見えない場合: Windows `Ctrl+Shift+B` / Mac `⌘+Shift+B`」
7. 水平 divider
8. 使い方 3 ステップ:
   1. 保存したいサイトを開く
   2. ブックマークバーの 📌 をクリック
   3. フォルダ選択 → 保存

**挙動**:
- ESC キー・× ボタン・背景（overlay）クリックで閉じる
- 開いた瞬間 focus を × ボタンに移す（a11y）
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` で適切に label
- `bookmarkletUri` は `generateBookmarkletUri(process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin)` で生成

**デザイン**:
- 既存 design tokens（`--color-*`, `--radius-*`, `--shadow-*`）を使用
- 中央 modal、max-width ~480px
- backdrop は `rgba(0,0,0,0.4)` overlay
- 「ダサくない」本番品質 polish は別フェーズ（scope 外）

### 2-3. 空状態ウェルカム (EmptyStateWelcome.tsx)

**表示条件**: `!loading && items.length === 0` （`useBoardData` の `loading: false` かつ Board に 1 枚もカードがない）

初回 IDB hydration 中は render しない（= loading flash 防止）。`useBoardData` は既に `loading: boolean` を expose しているのでそれを使う。

**配置**: Board canvas の中央に固定表示。カードと同じ視覚階層（on-top ではなく same layer）

**構成**:
```
┌────────────────────────────────────┐
│           📌                       │
│   ブックマークをはじめよう           │
│   Booklage は、どのサイトからでも    │
│   1 クリックで保存できる            │
│   ブックマークレットを使います       │
│                                    │
│   [ 📌 Booklage を設置 ]  ← ボタン │
│                                    │
│   既に設置済？                      │
│   別サイトで 📌 をクリック           │
└────────────────────────────────────┘
```

- ボタンクリック → `onOpenModal()` prop 経由で BookmarkletInstallModal を開く
- items が 1 枚以上になると自動で unmount（BoardRoot 側で `items.length === 0` 判定）

## 3. BoardRoot / Sidebar 統合

### BoardRoot.tsx 変更点

1. `const [bookmarkletModalOpen, setBookmarkletModalOpen] = useState(false)` state 追加
2. Sidebar に `onOpenBookmarkletModal={() => setBookmarkletModalOpen(true)}` prop 追加
3. `items.length === 0` のとき `<EmptyStateWelcome onOpenModal={() => setBookmarkletModalOpen(true)} />` を render
4. `<BookmarkletInstallModal isOpen={bookmarkletModalOpen} onClose={() => setBookmarkletModalOpen(false)} />` を常時 mount（内部で条件 render）

### Sidebar.tsx 変更点

1. Props に `onOpenBookmarkletModal: () => void` 追加
2. LIBRARY セクション直後、Folders セクション直前に `<BookmarkletInstall onClick={onOpenBookmarkletModal} />` を mount

## 4. i18n

`messages/ja.json` に以下のキーを追加:

```json
{
  "board": {
    "sidebar": {
      "bookmarklet": "ブックマークレット"
    },
    "empty": {
      "title": "ブックマークをはじめよう",
      "description": "Booklage は、どのサイトからでも 1 クリックで保存できるブックマークレットを使います",
      "installButton": "📌 Booklage を設置",
      "alreadyInstalled": "既に設置済？ 別サイトで 📌 をクリック"
    },
    "bookmarkletModal": {
      "title": "ブックマークレットを設置する",
      "dragInstruction": "↑ これをブラウザのブックマークバーにドラッグしてください",
      "barHint": "ブックマークバーが見えない場合:",
      "barShortcutWindows": "Windows: Ctrl + Shift + B",
      "barShortcutMac": "Mac: ⌘ + Shift + B",
      "usageTitle": "設置後の使い方",
      "usageStep1": "1. 保存したいサイトを開く",
      "usageStep2": "2. ブックマークバーの 📌 をクリック",
      "usageStep3": "3. フォルダ選択 → 保存",
      "closeLabel": "閉じる"
    }
  }
}
```

他 14 言語は後日スプリント（本 spec では ja のみ）。

## 5. テスト

### 5-1. ユニットテスト (`lib/utils/bookmarklet.test.ts`)

**`generateBookmarkletUri(appUrl)`**:
- 返り値が `javascript:` で始まる
- 返り値に渡した `appUrl` が含まれる
- 返り値の全長が 2000 文字以内
- `appUrl` を切り替えると URI 内の URL も変わる

**`extractOgpFromDocument(doc)`** (jsdom を使用):
- `<meta property="og:title">` から title を抽出
- `og:title` 欠落時は `document.title` にフォールバック
- `og:image` 欠落時は `twitter:image` にフォールバック
- `og:description` は 200 文字で切られる
- 相対パス favicon が絶対 URL に解決される
- 全項目欠落時も throw せず空文字含むオブジェクトを返す

### 5-2. E2E テスト (`e2e/bookmarklet.spec.ts`)

Playwright で `/save?url=...&title=...&image=...&desc=...&site=...&favicon=...` を直接開き、以下を検証:

- プレビューカードに title / image / site が表示される
- フォルダ選択可能（デフォルト「My Collage」作成される）
- [保存] クリック → 成功状態に遷移
- IDB の `bookmarks` ストアに新レコードが存在する
- IDB の `cards` ストアにも連動レコードが存在する
- BroadcastChannel で `bookmark-saved` イベント発火（listener で確認）

### 5-3. 手動検証マトリクス（ユーザー実機テスト）

| # | テスト URL 例 | 期待カード種別 | 検証ポイント |
|---|---|---|---|
| 1 | `https://x.com/Twitter/status/1457156983875919876` | TweetCard | react-tweet で本文 + 画像 + footer |
| 2 | `https://www.youtube.com/watch?v=jNQXAC9IVRw` | VideoThumbCard (16:9) | maxres サムネ + タイトル + ▶ overlay |
| 3 | 任意の YouTube Shorts URL（`youtube.com/shorts/<id>` 形式） | VideoThumbCard (9:16) | 縦長サムネ |
| 4 | 任意の TikTok 動画 URL（`tiktok.com/@user/video/<id>` 形式） | VideoThumbCard (9:16) | oEmbed タイトル + ▶ overlay |
| 5 | `https://github.com/anthropics/claude-code` | TextCard | favicon + タイポグラフィ |
| 6 | `https://r3f.maximeheckel.com/lens2` | TextCard | TODO.md 記載の参考サイト、白カードにならないことを確認 |
| 7 | 任意の画像直リンク URL | ImageCard | 画像が aspect 調整で描画 |

**追加検証項目**:
- [ ] ポップアップが 480×600px で開く
- [ ] OGP 貧弱サイトでもプレビュー成立（title + URL は最低限表示）
- [ ] 保存後 1.5s で自動クローズ
- [ ] Board に戻ると新カード描画（手動リロード不要 = BroadcastChannel 動作）
- [ ] 同一 URL 2 回保存でカード 2 枚（重複検知なし）
- [ ] Chrome / Safari / Edge でブックマークバーへのドラッグ設置が成功

## 6. 制約・前提

- **サーバー不要**（¥0）— 全てクライアントサイドで完結
- **API Routes 不要** — OGP は bookmarklet がページ上で直接取得
- **既存関数を使用**: `initDB`, `addBookmark`, `getAllFolders`, `addFolder`, `detectUrlType`
- **URL 長制限**: 説明文は 200 文字で切る、他は切らない
- **CSP 厳格サイト**: Pure inline 方式で大半は回避。`javascript:` URI 自体を禁止する極端なサイトでは動かない（documented limitation）
- **ポップアップブロック**: ユーザー操作起点の `window.open` は大半のブラウザで許可される。ブロックされたらブラウザ標準挙動に従う（回避不可）

## 7. デプロイ

1. tsc + vitest + Playwright E2E 全 pass 確認
2. `public/sw.js` の `CACHE_VERSION` を `v9-2026-04-21-bookmarklet` などに bump
3. `rtk pnpm build`
4. `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true`
5. `booklage.pages.dev` にハードリロードで反映確認
6. ユーザーに手動検証マトリクス実行を依頼

## 8. 想定される後続作業

- UI polish round（liquid glass / Lottie / コピー磨き）
- 動的 install guide 画像（SVG / Lottie アニメ化）
- 多言語 14 言語分の翻訳追加
- 手動検証で bug が出た場合の fix round
- URL ペーストによる保存フロー（bookmarklet 以外の second entry point）
- モバイル対応（Web Share API / PWA Share Target）
