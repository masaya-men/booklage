# 2026-04-21 destefanis pivot — Design Spec

> **Status**: draft — brainstorm 完了、ユーザーレビュー待ち
> **Brainstorm 出典**: 2026-04-21 会話ログ
> **参考 URL**: https://github.com/destefanis/twitter-bookmarks-grid

## 1. 背景と目的

### 現状課題
- **ブクマ保存バグ**: bookmarklet で /save 経由で保存しても board に反映されず、リロードが必要。`SavePopup.tsx` が BroadcastChannel で送信しているが **listener がどこにもない** 半実装状態
- **分類モデルの再設計余地**: 現状はフォルダ単一選択モデル。タグ主体（複数付与可）の方が moodboard 用途には向く
- **視覚 identity の強化余地**: 既存 B1 は液体ガラスサイドバー + Toolbar まで進んだが、board 本体は標準的な masonry のまま。参考 UI (destefanis/twitter-bookmarks-grid) 準拠で視覚 identity を強化する

### 目的
1. **最優先バグ解消**: 保存→board 反映ラグをゼロに（listener 配線 + entrance animation）
2. **分類モデル刷新**: フォルダ単一 → タグ複数（mood buckets）へ migration、mymind 方式
3. **視覚の再設計**: destefanis/twitter-bookmarks-grid を wholesale copy して moodboard identity を確立
4. **Triage 儀式の実装**: 未分類の Inbox から moods に一括仕分けする ceremony mode（destefanis DNA で minimal に）

### ターゲットローンチ
2026-05-05（2 週間）。スコープ大のため launch を 2026-05-12 〜 2026-05-19 に調整余地あり（ユーザー判断）。

---

## 2. 戦略方針（brainstorm で lock）

### L1. 参考 URL を wholesale copy してから個性化
destefanis の UI/UX/トンマナを忠実に複製。Booklage 独自の flourish（brand accent color、signature motion 等）は入れない。個性化は launch 後にユーザー反応を見てから着手。

### L2. **Booklage にブランドカラーは未決定**
`#7c5cfc` 等の紫は既存コード内の placeholder。brand color として扱わない。アクセント必要時は white / neutral gray。

### L3. 分類モデル: タグ主体 + mood buckets
mymind 方式。ストレージは tag 配列、ユーザーから見える「フォルダ」は tag フィルターの保存ビュー（mood）。

### L4. AI tagger は抽象化のみ MVP 実装
`BookmarkTagger` interface で MVP は `HeuristicTagger`（URL + OGP の keyword 抽出）、V2 で `EmbeddingTagger`（MiniLM 23MB）、V3 で `GemmaTagger`（270M on-device）を差し替え可能に設計。

### L5. Save UX はゼロ摩擦
保存時にタグ選択しない（Inbox 直行）。分類は Triage で儀式化。

---

## 3. 確定した 14 項目（brainstorm lock）

| # | 項目 | 決定 |
|---|---|---|
| 1 | 分類モデル | タグ主体（mood buckets）、フォルダ廃止 |
| 2 | Tagger 実装 | `BookmarkTagger` abstraction、MVP = HeuristicTagger |
| 3 | Save flow | Zero-friction Inbox（タグ選択しない） |
| 4 | 視覚スコープ | 案 X ハイブリッド（destefanis board + Booklage sidebar identity 維持） |
| 5 | コピー戦略 | wholesale copy してから個性化（launch 後） |
| 6 | サイドバー哲学 | テーマ駆動統一（destefanis theme では dark minimal） |
| 7 | TextCard typography | 現状維持（大 serif + favicon + domain） |
| 8 | 本文+画像カード | M（image-first minimal）デフォルト + PEM ユーザー切替 |
| 9 | Lightbox layout | F2 floating 横並び（desktop）/ F1 縦積み（mobile fallback）、card chrome なし |
| 10 | Lightbox animation | destefanis Motion One spring を複製（click → center 拡大） |
| 11 | Board entrance | A 静かな fade-in 400ms、FLIP reflow |
| 12 | Triage layout | T1 Linear（tag chip 下に並べ、1-9 数字キー速選） |
| 13 | Triage animation | fade-out 120ms / fade-in 180ms の最小限 |
| 14 | ブランドカラー | **未決定**。brand color として何も扱わない |

---

## 4. データモデル

### 4.1 IDB migration v8 → v9

```ts
// lib/storage/indexeddb.ts

// 新規: moods store
interface MoodRecord {
  id: string          // uuid
  name: string        // "design" "photography"
  color: string       // '#7c5cfc' 等（識別用、brand color ではない）
  order: number       // sidebar 表示順
  createdAt: number
}

// 変更: BookmarkRecord
interface BookmarkRecord {
  // 既存フィールド維持
  id: string
  url: string
  title: string
  description: string
  thumbnail: string
  favicon: string
  siteName: string
  type: UrlType
  createdAt: number

  // 新規フィールド
  tags: string[]          // mood id の配列。空なら Inbox 扱い
  displayMode?: 'visual' | 'editorial' | 'native' | null  // null = グローバル設定に従う

  // 既存
  isRead: boolean
  isDeleted: boolean
  deletedAt?: number

  // 削除（migration で tags[0] に移す、または Inbox 化）
  // folderId: string  ← 廃止
}

// 削除: folders store
// 既存 folder はすべて MoodRecord に 1:1 変換、bookmark.folderId → bookmark.tags = [moodId]
```

### 4.2 `board-config` 拡張

```ts
interface BoardConfig {
  themeId: string
  // 新規
  displayMode: 'visual' | 'editorial' | 'native'   // デフォルト 'visual' = M mode
  activeFilter: 'all' | 'inbox' | 'archive' | `mood:${moodId}`
}
```

### 4.3 Tagger abstraction

```ts
// lib/tagger/types.ts
interface TagSuggestion {
  moodId: string
  confidence: number  // 0-1
  reason: 'domain' | 'keyword' | 'embedding' | 'llm'
}

interface BookmarkTagger {
  suggest(input: {
    url: string
    title: string
    description: string
    siteName: string
  }): Promise<TagSuggestion[]>
}

// lib/tagger/heuristic.ts (MVP)
class HeuristicTagger implements BookmarkTagger {
  // hostname + OGP キーワード抽出 + 既存 mood との単純マッチング
  // 例: "github.com" → code mood サジェスト、"photo" in title → photography サジェスト
}
```

### 4.4 Migration 手順（v8 → v9）

```ts
// indexeddb v9 migration
upgrade(db, oldVersion, newVersion, tx) {
  if (oldVersion < 9) {
    // 1. moods store を create
    db.createObjectStore('moods', { keyPath: 'id' })

    // 2. 既存 folders を読み込み、MoodRecord として moods に書き写し
    const folders = await tx.objectStore('folders').getAll()
    const moods = folders.map(f => ({
      id: f.id, name: f.name, color: f.color, order: f.order,
      createdAt: f.createdAt ?? Date.now()
    }))
    for (const m of moods) await tx.objectStore('moods').put(m)

    // 3. 既存 bookmarks の folderId を tags[] に変換
    const cursor = await tx.objectStore('bookmarks').openCursor()
    while (cursor) {
      const rec = cursor.value
      rec.tags = rec.folderId ? [rec.folderId] : []
      rec.displayMode = null
      delete rec.folderId
      await cursor.update(rec)
      await cursor.continue()
    }

    // 4. folders store を削除
    db.deleteObjectStore('folders')
  }
}
```

---

## 5. ユーザーフロー

### 5.1 保存フロー（トースト化 save）

```
1. ユーザーが bookmarklet クリック
2. /save が小 popup window として開く (320×120px、画面 top-center)
   - window.open(url, 'booklage-save', 'width=320,height=120,
                  left=(screen.width-320)/2,top=40,
                  toolbar=0,menubar=0,location=0,status=0,resizable=0')
   - ブラウザ chrome は残るが minimize (Chrome 80+ セキュリティ制約)
3. /save page が load と同時に自動で IDB 書き込み (tags: []、Inbox 扱い)
   - ユーザー確認ボタンなし。Inbox 直行なので選択肢ゼロ = 摩擦ゼロ
4. UI: spinner 表示 → checkmark 描画アニメ → "Inbox に保存しました" (i18n)
5. BroadcastChannel('booklage') で { type: 'bookmark-saved', bookmarkId } 送信
6. popup が auto-close (checkmark 完了 + 800ms、通算 ~1.3s でウィンドウが閉じる)
7. ユーザーの focus は source page に戻る (ブラウザ既定)
8. board タブが別タブで開いている場合、BroadcastChannel listener で検知 →
   IDB 再読み込み → 新カードが top-left に静かに fade-in (§5.3, §7.1)
```

**popup blocker 対応**: window.open が blocker で失敗した場合は location.href fallback で通常タブ遷移（従来挙動）。

### 5.2 Triage フロー

```
1. サイドバーの [Inbox (N)] クリック（N>0 のとき強調表示）or [仕分けを始める] ボタン押下
2. /triage route に遷移、フルスクリーン
3. 未分類カード（tags === []）を 1 枚ずつ中央に表示
4. ユーザーが tag chip クリック or 数字キー 1-9
   → bookmark.tags に追加 → fade-out 120ms → 次カード fade-in 180ms
5. 新しい mood を作りたいとき → [+ 新しい mood] chip クリック → inline 入力 + 色 rotate 自動付与 → 即 tag として使える
6. [Skip] (S キー) → スキップした card は末尾に回される
7. [Undo] (Z キー) → 直前の tag 付与を取り消し
8. 全 card 分類完了 → /board に戻る（activeFilter = 'all' or 付与した mood へ誘導）
9. Esc でいつでも中断、状態は queue 位置とともに IDB に保存、次回再開可能
```

### 5.3 閲覧フロー

```
- /board 開く
- サイドバーで Library / Moods フィルター切替
  - Library: All / Inbox (N) / Archive
  - Moods: 各 mood をクリックすると tag フィルター適用
- 右上 pill 2 個:
  - 現在のフィルター名「すべて ▾」（プルダウンでも切替可能）
  - 「表示: Visual ▾」（PEM モード切替: Visual / Editorial / Native）
- masonry grid に表示
- card クリック → lightbox（F2 desktop / F1 mobile）
```

---

## 6. 視覚デザイン

### 6.1 カラーシステム

- **背景**: `#0a0a0a`（board / triage / lightbox backdrop 共通）
- **白 TextCard**: `#ffffff` + Noto Serif JP
- **黒 TextCard（alt）**: `#101010` + 薄 border `rgba(255,255,255,0.05)`
- **サイドバー**: `rgba(15,15,15,0.6)` + `backdrop-filter: blur(16px)`
- **テキスト階層**: `#f2f2f2`（primary）/ `#bbb`（body）/ `#777`（meta）/ `#555`（muted）/ `#444`（signature）
- **mood dot 色**: 識別用の任意色。brand color ではない。デフォルト rotation は `['#7c5cfc', '#e066d7', '#4ecdc4', '#f5a623', '#ff6b6b']` 等を使う（placeholder）
- **links / アクセント**: white / off-white に統一。紫 accent 使わない

### 6.2 Board レイアウト

```
┌─ sidebar (220px) ─┬─ main area (残り) ─────────┐
│ Booklage (brand) │               [Filter ▾] [表示 ▾] │ ← top-right pill
│ 🔍 検索           │                                 │
│ Library          │  ┌ masonry (columns: 5 160px) ┐ │
│  すべて 142       │  │ img  text  ▶    img  text │ │
│  Inbox 8         │  │ img        img    ▶        │ │
│  Archive 14      │  │ ...                        │ │
│ Moods            │  │ (gap: 10px)                │ │
│  ・design 34      │  │                            │ │
│  ・photo 28       │  └────────────────────────────┘ │
│  ・code 22        │                                 │
│  + 新しい mood    │                                 │
│ BOARD · 2026     │                                 │
└──────────────────┴─────────────────────────────────┘
```

- **masonry**: CSS `columns: 5 160px; column-gap: 10px;` で素朴に実装
- **card radius**: 10px
- **card shadow**: なし（destefanis は flat）
- **gap**: 10px
- **sidebar signature**: 縦書き `BOARD · 2026`、左下

### 6.3 カード種別

| 種別 | 見た目 | 補足 |
|---|---|---|
| **画像カード** | `<img>` 直貼り、radius 10px | 一番多い |
| **動画カード** | 画像 + 中央 ▶ badge (`rgba(0,0,0,0.55)` + blur) + 右下 duration chip | YouTube / TikTok |
| **白 TextCard** | `#fff` bg + Noto Serif JP 20px title + favicon + domain | Google 検索結果系 |
| **黒 TextCard** | `#101010` bg + 薄 border + serif | GitHub / medium 系 |
| **ツイートカード (M デフォルト)** | 画像大 + 下に 1 行本文 + avatar + handle | Twitter/X |

PEM 切替で同じカードの表示が変わる（内部 enum → 表示名 → brainstorm ラベル）:
- `'visual'` → **Visual** → brainstorm の M（Minimal / 画像支配、1-2 行 caption）**デフォルト**
- `'editorial'` → **Editorial** → brainstorm の E（画像 hero + serif pullquote + 枠線 + 全文）
- `'native'` → **Native** → brainstorm の P（画像 + sans-serif 本文全文、react-tweet 風）

### 6.4 Lightbox (F2 / F1)

- **Backdrop**: `#0a0a0a` opacity 0.95 + 全画面
- **Layout (desktop >= 900px)**: grid 1.3fr | 1fr、gap 40px、max-width 820px
- **Layout (mobile < 900px)**: 縦積み（F1）、gap 28px
- **Media**: radius 6px、`box-shadow: 0 30px 80px rgba(0,0,0,0.5)`、aspect ratio 自然
- **Text**: serif body 17px line-height 1.65、color `#e8e8e8`、avatar + @handle + date、domain + 元ページリンク
- **Close**: 右上 × button、`rgba(255,255,255,0.06)` 丸 36px
- **Animation**: 
  - Open: destefanis の Motion One spring をそのまま複製。click 位置の card を clone → scale + position spring で中央に grow、高解像度画像を上に load
  - Close: 逆再生

### 6.5 Save Toast (/save page content)

popup window の中身 = トースト状の 1 枚カード。

```
┌─ popup (320×120、ブラウザ chrome 除く内寸は 320×80 程度) ─┐
│   ( browser chrome 残存 )                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   [◐ spinner]  Booklage                                  │
│                保存中…  → ✓ Inbox に保存しました         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- **サイズ**: 320×120px（ユーザー要望に応じて min にチューン）
- **位置**: 画面 top-center（`left=(screen.width-320)/2, top=40`）
- **背景**: 白 `#ffffff` (light theme) — destefanis 準拠 dark でも popup 内は読みやすさ優先で light
- **内容**:
  - 左: 24×24 の status インジケーター
    - 初期: `<div class="spinner">` (border-rotate 700ms)
    - 保存完了後 1.2s: spinner → ✓ checkmark 黒丸 (scale 0→1 bounce + SVG stroke-dashoffset draw)
  - 右: Booklage logo (Playfair italic 15px) + label
    - `label-saving`: "保存中…" (薄グレー)
    - `label-saved`: "Inbox に保存しました" (濃いグレー太字、fade in)
- **Animation timeline**:
  - 0ms: window opens, spinner 回転開始、`label-saving` 表示
  - ~800ms: IDB 書き込み完了、BroadcastChannel 送信
  - 1200ms: spinner fade-out、checkmark scale 0→1.12→1 (420ms spring)
  - 1500ms: checkmark draw 完了、`label-saved` fade-in
  - 2300ms: window.close() 呼び出し
- **i18n キー**: `bookmarklet.toast.saving` / `bookmarklet.toast.saved` / `bookmarklet.toast.error`
- **Error state**: IDB 書き込み失敗時は ✗ 赤丸 + "保存に失敗しました" + auto-close を 3s に延長

### 6.6 Triage 画面 (T1 Linear)

```
┌─ /triage ─────────────────────────────────────┐
│                 3 / 8                [Esc]    │
│                                               │
│              ┌──────────────┐                 │
│              │  [ image ]   │                 │
│              │              │                 │
│              │  Noto Serif  │                 │
│              │  x.com ...   │                 │
│              └──────────────┘                 │
│                                               │
│   [1 •design] [2 •photo] [3 •code] [4 •music] │
│   [+ 新しい mood]                              │
│                                               │
│         1-9 付与  S スキップ  Z 取り消し        │
└───────────────────────────────────────────────┘
```

- Card: center 配置、280×aspect 4/5、radius 10px、大 shadow
- Tag chips: 下に横並び、radius 100px pill、番号 + 色 dot + name
- 数字キー pill は小さく左に表示
- 新しい mood chip は dashed border、色 muted
- 分類時の animation: card fade-out 120ms → next fade-in 180ms、card が飛んでいく / 吸い込まれる演出は入れない（destefanis DNA 遵守）

---

## 7. アニメーション

### 7.1 Board entrance (A 静か)
```css
@keyframes fadeInA {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
/* 既存カードは FLIP で下へずれる (GSAP Timeline) */
```

### 7.2 Lightbox open (destefanis 複製)
- Motion One spring（or GSAP）で click 位置の card rect を capture
- 同要素を clone → `position: fixed` で overlay 上に配置
- spring で center + target size へアニメ
- 完了後、高解像度画像を上に fade-in

### 7.3 Triage card 切替
```css
.triage-card { transition: opacity 120ms ease-out; }
.triage-card.exiting { opacity: 0; }
.triage-card.entering { animation: fadeIn 180ms ease-out; }
```

### 7.4 サイドバー collapse
既存実装継承（`transform: translateX()` 340ms ease-out）。

---

## 8. コンポーネント構成

### 新規
- `components/triage/TriagePage.tsx` — `/triage` route の root
- `components/triage/TriageCard.tsx` — center の大 card
- `components/triage/TagPicker.tsx` — 下の tag chip row + 数字キー handler
- `components/triage/NewMoodInput.tsx` — inline mood creation
- `components/board/Lightbox.tsx` — F2 layout、Motion One spring 駆動
- `components/board/EntranceAnimator.tsx` — BroadcastChannel listener + FLIP reflow hook
- `components/board/FilterPill.tsx` — 右上 pill 2 個
- `components/board/DisplayModeSwitch.tsx` — PEM 切替
- `lib/tagger/types.ts` + `lib/tagger/heuristic.ts`
- `lib/storage/moods.ts` — MoodRecord CRUD

### 改修
- `lib/storage/indexeddb.ts` — v9 migration、folders 削除、moods 追加、tags 追加
- `lib/storage/use-board-data.ts` — moods / tags 扱い、filter 対応
- `components/board/BoardRoot.tsx` — BroadcastChannel listener 配線、FilterPill mount、Lightbox 呼び出し
- `components/board/CardsLayer.tsx` — displayMode (PEM) 分岐、card variants
- `components/board/Sidebar.tsx` — Moods セクションを MoodRecord 駆動に
- `components/bookmarklet/SavePopup.tsx` → **`SaveToast.tsx` に改名 + 全面書き換え**。フォルダ選択 UI / Save ボタン削除、load 時 auto-save、spinner → checkmark animation、i18n 対応、auto-close (window.close()) を実装。BroadcastChannel 送信は既存ロジック維持
- `lib/utils/bookmarklet.ts` → `generateBookmarkletUri` を更新、`window.open` の size/position 引数を追加（320×120、top-center）
- `components/board/Toolbar.tsx` — FilterPill + DisplayModeSwitch に置換。**Align ボタンは削除**（destefanis 準拠 = masonry は常に auto-computed、"整列" 概念が存在しない）

### 廃止 (Plan A で dead になっていたもの含む)
- `components/board/FramePresetPopover.tsx` — 既に dead
- 旧 folder UI（FolderNav 等、既に B0 で削除済なので影響なし）

---

## 9. 削除される既存機能

- **フォルダ機能** — MoodRecord への migration 後、folders store は削除
- **保存時のフォルダ選択 UI** — /save からフォルダ選択セクション削除。保存ボタン自体も削除し、**load 時 auto-save のトースト型 popup (320×120 top-center) に置換** (§5.1 / §6.5)
- ~~Toolbar の Align ボタン扱い~~ → §8 で削除確定（destefanis 準拠）

---

## 10. 実装スコープとフェーズ

### MVP（launch 2026-05-05 or 05-12 目標）
1. IDB v9 migration（foundation）
2. destefanis pivot の board 視覚（CardsLayer / Sidebar / masonry 調整）
3. Lightbox F2 + destefanis animation 複製
4. BroadcastChannel listener 配線 + entrance A fade-in（**元バグ解消**）
5. Triage /route + T1 Linear 実装
6. /save のトースト化（320×120 top-center popup、auto-save on load、spinner→checkmark、i18n）
7. HeuristicTagger の超簡素版（domain → 既存 mood 類似度マッチング、Triage で候補表示だけ）

### Post-launch（polish / V2+）
- EmbeddingTagger (MiniLM 23MB) — Triage で候補精度向上
- GemmaTagger 対応 progressive enhancement
- WASD Directional Triage（alt mode）
- HTML-in-canvas ピーリングアニメーション
- Multi-playback vision（動画カード click in-place 再生）
- Lightbox で動画 iframe embed + text scroll
- i18n 15 言語

---

## 11. 非対応項目（明示的にやらない）

- **既存データの folder 名を "Inbox" にリネーム**: migration は 1:1 変換のみ、既存 folder は mood として残す
- **Tag の階層構造**: flat のみ、nested tags (`design/typography`) は non-goal
- **AI auto-tagging を save 時に実行**: save はゼロ摩擦、タグ推定は Triage 内のみ
- **Brand color の確定**: 本 spec では placeholder 維持。color decision は別途ユーザー判断

---

## 12. テスト計画

### unit (vitest)
- v9 migration: 既存 folders → moods、bookmarks.folderId → tags 変換の正当性
- HeuristicTagger: `github.com` → "code" mood サジェスト等
- BroadcastChannel listener: 保存時に receiving side が handleNewBookmark を呼ぶ
- Tag CRUD: 追加 / 削除 / order 変更

### integration (vitest + jsdom)
- /triage 画面: 数字キー 1-9 で tag 付与 → card 切替
- Lightbox open/close: click → animation end → close button → fade out
- FilterPill: Inbox クリック → activeFilter 更新 → CardsLayer が filter 適用

### E2E (Playwright)
- Bookmarklet クリック → /save が 320×120 popup で top-center に開く → spinner → ✓ → auto-close → BroadcastChannel → board に entrance animation で反映（現 bug 解消確認）
- /triage で 3 枚仕分け → /board に戻る → mood フィルターで 3 枚表示
- 画像カード click → lightbox → × で閉じる
- displayMode 切替: pill で Visual / Editorial / Native → カード見た目変化

### パフォーマンス
- 1000 カード masonry が 60fps 維持
- Lightbox 開閉が 16ms フレーム budget 内

---

## 13. Open Questions（実装時に決める / 本 spec では未決）

- **Tag color picker**: Mood 作成時、色はユーザー選択式 or 自動 rotation？ → 一旦 rotation デフォルト、編集画面で変更可、で進める
- **Inbox 件数バッジの表示条件**: 0 件の時はグレー、1 件以上の時はアクティブ強調する？
- **Archive の使い方**: isDeleted = true のカードを見る場所？ soft delete の undo 期限は？
- **/save トーストの文言**: "保存しました" vs "Inbox に保存しました"。後者の方が Triage への誘導になる → **後者採用で確定**（i18n key: `bookmarklet.toast.saved` = "Inbox に保存しました"）
- **Light mode 対応**: destefanis 準拠なら dark only でいいが、将来テーマ切替で white bg theme も必要？
- **Mood の並び順**: order で永続化、sidebar で drag 並び替え UI は MVP では不要（V2）

---

## 14. Deferred ideas (IDEAS.md に保管)

以下は本 spec に含めず、`docs/private/IDEAS.md` に記録済み。post-launch 検討:

- WASD Directional Triage (alt mode) — Tinder 的 4 方向 swipe
- HTML-in-canvas ピーリングアニメ — 紙めくり Triage 演出
- Multi-playback vision — 複数動画 in-board 同時再生
- Gemma 270M on-device — V3 以降の progressive enhancement

---

## 15. 前提条件 / 依存

- 現 `master` ブランチが base（2026-04-21 bookmarklet href fix 後の状態、commit `6651f20`）
- IndexedDB 現行 v8 から v9 migration
- 既存 liquid glass サイドバー (Task 1-5) は継続利用、色調のみ destefanis 準拠に調整
- Cloudflare Pages direct upload デプロイ継続
- 新規 npm dependency: `motion` (= Motion One、lightbox animation 用)
