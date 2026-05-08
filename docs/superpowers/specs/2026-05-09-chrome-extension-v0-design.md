# Chrome Extension v0 — 設計書

**作成日**: 2026-05-09
**前提**: Bookmarklet final polish (Phase 0) は完了済。Bookmarklet popup chrome 強制表示の天井は超えられない → 拡張機能 v0 に投資移転。
**フェーズ**: Phase 1 (Phase 2 = 一括インポート、Phase 3 = PiP 単体強化 を控える)

---

## 1. 目的

ブクマレットの「**popup chrome (タイトル + アドレスバー) が常に出る**」体験的天井を、**Chrome 拡張機能** + **Document Picture-in-Picture API** + **content script 経由の cursor pill** で超える。同時に Booklage 体験そのもの (= "表現ツール" としての気持ちよさ) を保存の瞬間まで持ち込む。

## 2. ユーザー決定事項 (ブレスト確定済)

| 項目 | 決定 |
|------|------|
| 配布戦略 | **B: 限定公開 (unlisted Chrome Web Store)** — sideload で即使用開始、レビュー裏進行、launch で listed に切替 |
| クリック時の体験モード | **M2 (PiP) + M3 (cursor pill) のみ** — M1 (320×320 popup) は不採用 |
| PiP サイズ | **320×320 正方形** (bookmarklet と統一) |
| PiP スタック枚数 | **5 枚** (将来 density 設定で 3/5/7 切替余地) |
| PiP 個別カードクリック | Booklage タブで該当カードに smooth scroll + glow (タブ無しなら新規 open) |
| PiP 保存インジケータ | **カード参入アニメ自体が完了サイン** — 別途 ring/✓ overlay は使わない |
| Optimistic / Pessimistic | **Optimistic** (体感ゼロ遅延、失敗時のみ後退アニメ + cursor pill error) |
| サムネ到着アニメ | **A: Scan Reveal** (上から下へのスキャンライン clip-path 開示) |
| Cursor pill 言語 | **A: 全英語** (`Booklage · Saving / Saved / Failed`) |

## 3. アーキテクチャ全体図

```
┌──────────────────────────────────────────────────────────────────────┐
│                          ユーザーの Chrome                            │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ booklage.pages   │  │ 任意のページ      │  │ 任意のページ      │    │
│  │ /board (PiP親)   │  │ (例: x.com)      │  │ (例: github.com) │    │
│  │                 │  │                 │  │                 │    │
│  │ ┌─────────────┐ │  │ [content script] │  │ [content script] │    │
│  │ │ PiP 320×320 │ │  │  - OGP extract  │  │  - OGP extract  │    │
│  │ │ (Document   │ │  │  - cursor pill  │  │  - cursor pill  │    │
│  │ │  PiP API)   │ │  │    (PiP無時)     │  │    (PiP無時)     │    │
│  │ └─────────────┘ │  └─────────────────┘  └─────────────────┘    │
│  │  ↑ 親が消えると  │           │                  │                │
│  │   PiP も消える   │           ▼                  ▼                │
│  └────────┬────────┘    chrome.runtime.sendMessage                  │
│           │                       │                                  │
│           │              ┌────────▼─────────┐                        │
│           └─────────────▶│ Service Worker   │                        │
│                          │ (background.js)  │                        │
│                          │  - icon click    │                        │
│                          │  - context menu  │                        │
│                          │  - shortcut      │                        │
│                          │  - dispatch      │                        │
│                          └────────┬─────────┘                        │
│                                   │                                  │
│                          ┌────────▼─────────┐                        │
│                          │ Offscreen Doc    │                        │
│                          │  (chrome.        │                        │
│                          │   offscreen API) │                        │
│                          │  - hidden iframe │                        │
│                          │    to /save-     │                        │
│                          │    iframe        │                        │
│                          └────────┬─────────┘                        │
│                                   │ postMessage                      │
│                          ┌────────▼─────────┐                        │
│                          │ booklage.pages   │                        │
│                          │ .dev/save-iframe │                        │
│                          │  (新規 endpoint)  │                        │
│                          │  - IDB write     │                        │
│                          │  - return success │                       │
│                          └──────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

**鍵となる設計判断**:
- 拡張は `chrome-extension://...` origin で動くので **直接 booklage の IDB に書けない**
- Service Worker は DOM を持たないので iframe を直接持てない → **Offscreen Document API** で hidden iframe を提供
- iframe は `booklage.pages.dev/save-iframe` を読み込み、booklage origin context で IDB write を実行
- これで booklage タブが開いていなくても保存可能

## 4. トリガー (保存を起動する 4 つの surface)

| トリガー | 挙動 | shortcut |
|---------|------|---------|
| **拡張アイコン click** | popup を出さず即座に保存 (popup HTML は最小、設定 link のみ) | — |
| **右クリック「Booklage に保存」** | ページ contextual menu 経由で保存 | — |
| **キーボードショートカット** | デフォルト `Ctrl+Shift+B` (Mac: `Cmd+Shift+B`)、`chrome://extensions/shortcuts` でカスタム可 | デフォルト固定 |
| **リンク右クリック「Booklage にリンクを保存」** | リンク URL を引数として保存 (現ページではなくリンク先) | — |

**v0 で省く**: 画像右クリック (= image-only bookmark) は Booklage の card データ構造に乗りにくいので保留、v1 候補。

## 5. PiP (Document Picture-in-Picture)

### 5.1 開く方法

| 経路 | 詳細 | 制約 |
|------|------|------|
| **A: ボード上の "Pop out" ボタン** | ボード TopHeader 右側 (existing actions エリア内) に PiP アイコンボタンを追加。click → PiP 開 | Booklage タブ要 active 状態 |
| **B: 設定での auto-open** (デフォルト OFF) | `chrome.storage.sync.set({ autoOpenPip: true })` 時、Booklage タブの最初の任意 click 直後に auto-launch | user gesture 制約により完全な無自動は不可、最初の 1 click は要 |

**v0 範囲**: A (manual button) は常に有効、B (auto-open) は設定で opt-in。**v0 では「拡張アイコン click → 自動 PiP open」の挙動は実装しない** (ユーザーが意図せず PiP 出る混乱を避ける、Phase 1.5 候補)。

### 5.2 PiP 内部レイアウト (320×320)

#### 5.2.1 Empty 状態 (未保存時)

```
┌─────────────────────────────────────┐  ← 320×320
│                                     │
│                                     │
│                                     │
│           Booklage                  │  ← 中央 28px wordmark
│                                     │     opacity 0.85↔1.0 4s breathing
│                                     │     scale ±2% 同期
│                                     │
│                                     │
│                              [×]    │  ← 右下に 16×16 close button
└─────────────────────────────────────┘
```

- **背景**: `#000` (将来 theme で変動)
- **Wordmark**: Geist 600 28px, color `rgba(255,255,255,0.94)`
- **breathing アニメ**: 4 秒周期 ease-in-out 無限ループ
- **× ボタン**: opacity 0.4 (hover 時 1.0)、PiP を閉じる

#### 5.2.2 Stack 状態 (1〜5 件保存後)

```
┌─────────────────────────────────────┐
│                                     │
│  [c5 — 最奥、薄、上方]               │
│   [c4]                              │
│    [c3]                              │
│         [c2]                        │
│              ┌──────────────────┐   │
│              │                  │   │
│              │  [c1 — 最新、前]  │   │  ← front 280×170
│              │   サムネ画像      │   │
│              └──────────────────┘   │
│                  Booklage    [×]    │  ← 底部 12px wordmark + close
└─────────────────────────────────────┘
```

各カードの transform (front=1, back=5):

| 位置 | scale | translateY | translateZ | rotate | opacity |
|------|-------|-----------|-----------|--------|---------|
| 1 (最新, 最前) | 1.00 | 0 | 0 | 0° | 1.0 |
| 2 | 0.94 | -16px | -20px | -1° | 0.85 |
| 3 | 0.88 | -34px | -42px | -2° | 0.66 |
| 4 | 0.82 | -54px | -66px | -3° | 0.46 |
| 5 (最奥, 上方) | 0.76 | -76px | -90px | -4° | 0.28 |

- 親要素: `perspective: 1000px` + `transform: rotateX(8deg)` (上から覗き込む立体感)
- 各カード: 280×170, `border-radius: 8px`, `box-shadow: 0 4px 16px rgba(0,0,0,0.3)` (奥のカードほど影は短く / 薄く CSS で逓減)
- カード内容: **サムネ画像のみ** (タイトルテキストなし、ミニマル)、サムネ無の場合 = favicon 中央 + 微弱 radial グラデ

### 5.3 保存アニメ (新カード参入)

#### 5.3.1 First save (Empty → Stack 遷移)

```
[t=0]      初回保存 trigger (extension icon / context menu / shortcut)
[0→200ms]  "Booklage" wordmark が 28px center → 12px bottom-center に
            scale + position 補間 (cubic-bezier(0.16, 1, 0.3, 1))
[同期]     新カード = PiP 下端外 (translateY +60px, opacity 0) から
            position 1 (front, bottom) に slide up (320ms)
[完了]     stack 状態に sett、wordmark が 80ms ふっと軽くパルス (= 完了サイン)
```

#### 5.3.2 通常保存 (Stack → Stack 更新)

```
[t=0]      保存 trigger
[0→320ms]  新カードが下端外から position 1 へ slide up
            既存 c1→c2, c2→c3, ... c4→c5 を同期で transition
            c5 (= 元 c4) はそのまま留まる、c6 (= 元 c5) は fade out (300ms 遅延 + 200ms fade)
[完了]     wordmark が 80ms 軽パルス
```

### 5.4 サムネ到着アニメ — Scan Reveal

カード slide-in と **独立** に動作。サムネ image fetch 完了時にいつでも発動。

```
[image load 完了]
[t=0]      カード上端に 1px 高 / 白 80% の発光スキャンライン出現
            image は DOM に載るが clip-path: inset(100% 0 0 0) で完全隠蔽
[0→420ms]  スキャンラインが下端に向かって移動 (translateY 0 → 170px)
            clip-path inset top が 100% → 0% に補間
            ease: cubic-bezier(0.65, 0, 0.35, 1) (中央加速)
[280ms付近] 4px 高 / 白 20% gradient の trail が線の上に追従発光
[420ms]    スキャンライン消滅、placeholder fade out 完了
```

**注**: scan は image load 時に発動するので、card slide-in (320ms) より image load が早ければ slide 中に同時開始、遅ければ slide 完了後に後追い発動。両方滑らかに見える。

### 5.5 Hover 個別カード (peek pull-forward)

各カードの「肩」(前のカードからはみ出してる peek 部分) を hover ターゲットに。

- 例: c4 の peek (~14-18px) を hover
- 200ms transition で c4 が前面に grunt forward:
  - `translateZ: +30px`, `scale: 1.05`, `z-index: 100`, `opacity: 1.0`
  - 他カードはそのまま
- mouse leave: 200ms で元位置に戻る
- → 「ファイル / レコードを 1 枚指で引っ張ってチラ見」体験

### 5.6 個別カード click

- click したカード ID → `chrome.runtime.sendMessage({ action: 'focus-card', cardId })`
- service worker が `chrome.tabs.query({ url: 'https://booklage.pages.dev/board' })` で booklage タブを探す
- タブ存在 → activate 該当タブ + content script に scroll 指示送信
- タブ無 → `chrome.tabs.create({ url: 'https://booklage.pages.dev/board?focus=<cardId>' })`
- booklage 側: card に scroll (1.0s ease) + glow halo 0.6s

### 5.7 PiP × close

- × button click で `documentPictureInPicture.window.close()`
- `chrome.storage.local.set({ pipManuallyClosed: true })` で記録
- → 次回 booklage タブ visit 時の auto-open は抑制 (再度 Pop out button 押すまで PiP は出ない)
- ユーザーの「邪魔だから消した」意思を尊重

## 6. Cursor pill (PiP 無時の保存インジケータ)

### 6.1 Layout

**サイズ**: 200×40 (横長 pill)

```
┌─────────────────────────────────────────────┐
│  [○]    Booklage  ·  Saving             │
└─────────────────────────────────────────────┘
```

- Border-radius: 20px
- Background: `rgba(18, 18, 22, 0.92)` + `backdrop-filter: blur(14px) saturate(140%)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Shadow: `0 8px 24px rgba(0, 0, 0, 0.32)`
- Font: Geist 13px / 600 (Booklage)、12px / 400 (state label)

### 6.2 内容 (左→右)

- 左 16×16 アイコン: `saving` = リング回転 / `saved` = ✓ stroke draw / `error` = ! 円
- "Booklage" wordmark
- ` · ` 区切り (薄灰)
- 状態テキスト: `Saving` / `Saved` / `Failed` (英語固定)

### 6.3 出現位置とアニメ

- **位置**: マウス座標 + (12px 右, -52px 上)、画面端なら viewport 内 clamp
- **Appear** (200ms): `opacity 0→1` + `translateY(+8px → 0)`
- **State transition** (`saving` → `saved`): リング 100ms fade-out → ✓ stroke-draw 240ms 同位置
- **Disappear** (250ms): `opacity 1→0` + `translateY(0 → -8px)`
- **Total visible**: ~1.2-1.5 秒

### 6.4 Edge cases

| 状況 | 挙動 |
|------|------|
| `chrome://` ページ・拡張ストア (content script 不可) | `chrome.notifications` API で OS 通知 fallback |
| カーソルが viewport 端 | ピル位置を viewport 内に clamp |
| マウス未動 + 最後座標も無 | viewport 右下 (20px inset) static 表示 |

### 6.5 テーマ引き継ぎ

- **v0**: 上記の glass テーマ値を**ハードコード**
- **v1+**: Booklage アプリの theme 切替時に `chrome.storage.sync.set({ activeTheme })` → 拡張 content script が読んで対応 CSS class を適用

## 7. 拡張機能の構造 (Manifest v3)

### 7.1 manifest.json (要旨)

```json
{
  "manifest_version": 3,
  "name": "Booklage",
  "version": "0.1.0",
  "description": "Save any URL to Booklage as a beautiful visual collage card.",
  "icons": { "16": "...", "48": "...", "128": "..." },
  "action": {
    "default_icon": { "16": "...", "32": "...", "48": "..." },
    "default_title": "Save to Booklage",
    "default_popup": "popup.html"
  },
  "background": { "service_worker": "background.js" },
  "permissions": [
    "activeTab",
    "contextMenus",
    "scripting",
    "offscreen",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://booklage.pages.dev/*"
  ],
  "commands": {
    "save-current-page": {
      "suggested_key": {
        "default": "Ctrl+Shift+B",
        "mac": "Command+Shift+B"
      },
      "description": "Save current page to Booklage"
    }
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["content.css"]
  }],
  "web_accessible_resources": [{
    "resources": ["pip.html", "pip.js", "pip.css"],
    "matches": ["<all_urls>"]
  }]
}
```

**Permission の justification (Web Store 申請用)**:
- `activeTab`: 現在のタブの URL / title 取得
- `contextMenus`: 右クリックメニュー追加
- `scripting`: OGP extraction を任意ページで実行
- `offscreen`: hidden iframe で IDB bridge を提供
- `storage`: 設定 + 直近保存 cache
- `notifications`: chrome:// 系での fallback 通知
- `<all_urls>`: cursor pill を任意ページに描画 (= 全 URL 必須)
- `https://booklage.pages.dev/*` (host): IDB bridge 用 iframe をロード

### 7.2 ファイル構成

```
booklage-extension/
├── manifest.json
├── background.js          ← service worker (icon click / context menu / shortcut dispatcher)
├── content.js             ← OGP extraction + cursor pill renderer + PiP communication
├── content.css            ← cursor pill スタイル (theme 準拠)
├── offscreen.html         ← hidden iframe ホスト
├── offscreen.js           ← iframe との postMessage 仲介
├── popup.html             ← 拡張アイコン click 時の最小 popup (設定 link のみ)
├── popup.js
├── popup.css
├── pip.html               ← PiP の中身 (Booklage stack 表示)
├── pip.js                 ← PiP のロジック (card stack render, hover, click, save anim)
├── pip.css                ← PiP のスタイル
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── _locales/
    └── en/
        └── messages.json
```

### 7.3 通信フロー (典型的な「ページで shortcut → 保存」)

```
1. user pressses Ctrl+Shift+B (任意ページ)
2. background.js (commands listener) が trigger を受信
3. background.js → chrome.tabs.query({ active: true })
4. background.js → chrome.scripting.executeScript で OGP extractor を inject
5. content.js が OGP データを return
6. background.js が OGP を bookmark dataに整形
7. background.js → chrome.offscreen.createDocument (もし未作成)
8. background.js → offscreen.js に bookmark data を sendMessage
9. offscreen.js が iframe (https://booklage.pages.dev/save-iframe?...) を作成
10. iframe (booklage origin) が IDB write
11. iframe → offscreen.js に success postMessage
12. offscreen.js → background.js に success
13. background.js → PiP available なら PiP に "new save" message
                   → PiP unavailable なら content.js に cursor pill 表示 message
14. PiP / cursor pill が新規カード or success アニメ実行
```

## 8. 新規 Booklage 側エンドポイント — `/save-iframe`

### 8.1 Purpose

拡張 (chrome-extension origin) から booklage.pages.dev origin の IDB に書き込むためのブリッジ。hidden iframe として load される、UI なし。

### 8.2 Path

`https://booklage.pages.dev/save-iframe`

### 8.3 通信プロトコル (postMessage)

**iframe 受信**:
```typescript
{
  type: 'booklage:save',
  payload: {
    url: string,
    title: string,
    description: string,
    image: string,
    favicon: string,
    siteName: string,
    nonce: string,  // request 識別 (response 紐付け用)
  }
}
```

**iframe 送信 (success)**:
```typescript
{
  type: 'booklage:save:result',
  nonce: string,
  ok: true,
  bookmark: { id: string, ... }
}
```

**iframe 送信 (error)**:
```typescript
{
  type: 'booklage:save:result',
  nonce: string,
  ok: false,
  error: string
}
```

### 8.4 Origin 検証

iframe は `event.origin` を `chrome-extension://<我々の ID>` に限定。他オリジンからの message は無視。

### 8.5 PiP 通信もこの endpoint 経由

Booklage タブが開いてる時、PiP は そのタブの BroadcastChannel に subscribe。但し、拡張からの保存は PiP に直接通知不可 (拡張 → booklage.pages.dev の通信は postMessage 限定)。

→ **拡張 → save-iframe (IDB write) → BroadcastChannel.post('bookmark-saved') → PiP が受信 → 新カード参入アニメ** という flow にする。これで booklage origin 内で PiP 同期される。

## 9. 設定 UI (拡張内)

`chrome://extensions/?options=...` で開く小さい設定画面。

### 9.1 設定項目 (v0)

| 項目 | 既定 | 説明 |
|------|------|------|
| `autoOpenPip` | `false` | Booklage タブで最初の click 時に PiP auto-launch |
| `keyboardShortcut` | `Ctrl+Shift+B` | 案内のみ、変更は `chrome://extensions/shortcuts` |
| `theme` | `'glass'` | 将来用 placeholder |
| `cursorPillFallbackPosition` | `'cursor'` | `'cursor'` or `'bottom-right'` |

### 9.2 PiP 内ギア (gear icon)

PiP の右下に gear icon を配置。click → `chrome.runtime.openOptionsPage()` で設定画面を開く。

## 10. テスト戦略

### 10.1 Unit tests (vitest)

- **OGP extractor** (content.js の関数を切り出し): bookmarklet と同じ extractOgpFromDocument の port、既存 bookmarklet の test を流用 + 拡張用 fixture
- **postMessage protocol**: `/save-iframe` の受信ハンドラの validation / origin check
- **Theme application**: cursor pill の theme apply ロジック

### 10.2 Integration tests

- **Save iframe + IDB write**: Playwright で hidden iframe 経由の save flow を end-to-end 確認
- **PiP card stack render**: pip.html を直接 Playwright で開いて 1〜5 枚の stack を render 確認

### 10.3 E2E tests (Playwright)

- **bookmarklet-save.spec.ts** (既存) と並行で **extension-save.spec.ts** を新設
- 拡張をテスト用に load (`pwd/test-fixtures/booklage-ext.zip` を `--load-extension` で sideload)
- 任意ページに移動 → 拡張アイコン相当の trigger → IDB に bookmark 作成された確認
- E2E は MV3 service worker のテストに制約があるので最小限、ユニットでカバー

### 10.4 手動 smoke test

- 5 つのサイト category で動作確認: GitHub README / Twitter post / YouTube video / 一般ニュース記事 / favicon-only サイト (docs.google 等)
- それぞれで PiP 開時 / PiP 閉時の両 flow を確認

## 11. 配布 (B 案 — Unlisted Web Store)

### 11.1 Sideload (即使用開始)

1. `chrome://extensions` → デベロッパーモード ON
2. 「パッケージ化されていない拡張機能を読み込む」→ `booklage-extension/` フォルダ選択
3. 即使用可能、自分の PC でドッグフード開始

### 11.2 Web Store 申請 (並行)

1. Chrome Web Store Developer Console (one-time $5 USD developer fee)
2. zip パッケージ + screenshots + 説明文 + privacy policy
3. **Visibility = Unlisted** (URL 知ってる人のみ install 可能)
4. レビュー期間 1-3 週間
5. 承認後、配布 URL を docs/private に保存
6. **Launch 時に Visibility を Public に切替** (再レビューなし、即時公開)

### 11.3 Privacy policy (草案)

`docs/private/extension-privacy-policy.md` に作成 (機微なので private)。要点:
- 拡張は URL とページタイトルのみ取得、IDB に書く
- データはユーザーのブラウザ内のみ、外部送信なし
- chrome.storage は設定値のみ、bookmark data 保存なし

## 12. パフォーマンス目標

| 指標 | 目標 |
|------|------|
| 拡張アイコン click → save 完了 | < 300ms (体感ゼロラグ) |
| PiP open → first paint | < 100ms |
| PiP card slide-in animation | 320ms |
| Scan reveal | 420ms |
| Cursor pill total visible | 1.2-1.5s |
| 拡張サイズ (zip) | < 200KB (icons 除く < 100KB が目標) |

## 13. アクセシビリティ

- **Cursor pill**: `role="status"` + `aria-live="polite"` で screen reader に通知
- **PiP**: card stack に `role="list"`、各カードに `role="listitem"` + `aria-label="<title>"`
- **× close**: 明示的な `aria-label="Close"`
- **prefers-reduced-motion**: scan / breathing / slide-in を即時遷移に縮退

## 14. 非対応事項 (やらないこと、v0 範囲)

- **画像のみ bookmark** (右クリック画像 → 保存): v1 候補
- **Tag 付け / フォルダ振分け** at 保存時: 既存の Triage に任せる
- **Multiple selection / batch save**: v1+
- **Firefox / Safari 対応**: Document PiP API 未対応のため Phase 1 では Chrome / Edge のみ
- **PiP 内での bookmark 削除 / 編集**: read-only に留める、編集は board で
- **Sync / cloud backup**: Phase 2 (一括インポート) と並行で別 spec

## 15. ロードマップ (このスペック後)

- Phase 1.5: 拡張のテーマ切替対応 (chrome.storage 経由)
- Phase 2: 一括インポート (Pocket JSON / Raindrop / HTML bookmark export)
- Phase 3: PiP 単体強化 (independent open without booklage tab — 技術的にハック必要)

## 16. open question (ユーザー review 時に override 可能)

このスペックは以下の defaults を採用:
1. **Pop out button 場所**: ボード TopHeader 右側 actions エリア (existing chrome 内、新規追加チップ)
2. **Auto-open default**: OFF (ユーザー explicit に opt-in)
3. **Right-click menu items**: page + link (image は除外、v1 候補)
4. **Keyboard shortcut**: `Ctrl+Shift+B` (Mac は `Cmd+Shift+B`)
5. **PiP × close 後の挙動**: 「session 内 / 永続」は **永続** (storage.local に記録、再 open するまで auto-open も抑制)
6. **設定 UI 場所**: `chrome://extensions/?options=...` + PiP 右下 gear icon
7. **Empty state wordmark**: 28px, 4s breathing, white 0.94 opacity
8. **配布パッケージ名**: `Booklage` (シンプル、サービス名そのまま)

review 時に違うものに変えたければ override OK。
