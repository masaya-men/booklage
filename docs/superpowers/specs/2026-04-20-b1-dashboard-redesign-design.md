# B1 Dashboard Redesign — Design Spec

- **Status**: Draft, awaiting user review
- **Author**: Masaya + Claude (brainstorming session 2026-04-20)
- **Supersedes**: Task 19 Toolbar + Task 20 FramePresetPopover (will be reworked)
- **Preserves**: Task 14 (morph), Task 15 (CardNode 2-div), Task 16 (free-drag), Task 17 (RotationHandle), Task 18 (ResizeHandle 8 handles)

---

## 1. なぜやるか

現状の `/board` は「Grid / Free」という 2 つのレイアウトモードを top-level で切り替える設計。実機確認で **根本的な UX ねじれ** が判明:

- カードは Grid モードでも動かせてしまい、「Grid モードが何を意味するか」が崩壊
- SNS シェア用の枠プリセットが「Free モード時だけ出るサブ機能」に埋もれ、メイン導線から外れている
- ブクマ件数・検索・フォルダ (将来) への入口がなく、「ブクマ整理ツール」としての全体像が見えない
- フローティング pill 1 個だけの chrome が、カード密度に対して物足りない

ユーザーの本来のメンタルモデル:

1. ボードは**常に自由配置のキャンバス** ("フリー" はモードではなくデフォルト状態)
2. 散らかったら **「整列」アクション** でグリッド状にパッと揃う (モードではなく動詞)
3. 仕上がったら **「シェア」アクション** で SNS 用の枠選択画面が開き、プリセット + 微調整 + 書き出し/投稿まで 1 画面で完結
4. 常時ダッシュボードで検索・件数・フォルダ (B2) にアクセス

この仕様書は上記を実装に落とし込むための合意記録。

---

## 2. 確定した設計判断

### 2.1 モードの概念を廃止

- `layoutMode: 'grid' | 'free'` state は削除
- ボードは常に自由配置 (Task 16 の free-drag state machine がデフォルト挙動)
- 「グリッドっぽさ」は**整列アクションの結果**として事後的に得られるだけ
- IndexedDB の `BoardConfig.layoutMode` は migration で削除、`frameRatio` は保持 (シェア画面で利用)

### 2.2 チーム構成（UI 階層）

```
┌──────────────────────────────────────────────────┐
│  [Sidebar 240px]  canvas                          │
│  ロゴ              ┌──┐ ┌──┐ ┌──┐                 │
│  検索 ⌘K          │  │ │  │ │  │                 │
│  すべて 234        └──┘ └──┘ └──┘                 │
│  未読 47           ┌──────┐ ┌──┐                  │
│  既読 187          │ Tool │ │  │  ← Toolbar pill  │
│  --- B2 folders    │ 整列 │ │  │     (top center) │
│  テーマ            │ シェア│ └──┘                 │
│  F to hide         └──────┘                       │
└──────────────────────────────────────────────────┘
```

- **左サイドバー** (edge-anchored, 240px / 折り畳み時 52px rail)
- **浮いた Toolbar pill** (top-center of canvas, `整列` + `シェア` の 2 ボタンのみ)
- **canvas** (Sidebar 幅を offset した中央)
- **シェアモーダル** (`📤 シェア` クリックで全画面オーバーレイ)

### 2.3 左サイドバー

- **edge-anchored**: 左端に完全密着 (float しない)
- **展開/折り畳み**: F キー or 折り畳みボタンで切り替え。`transform: translateX(-240px + 52px)` で引っ込める (消えず icon rail として残る)
- **アニメーション**: `ease-out 300-400ms`, ヒッチなし
- **素材**: 屈折ガラス (kube.io recipe、詳細は §4.1)
- **外形**: 非対称 — 左上/左下に大きめの角丸 (24px)、右側 (canvas 側) は小さい角丸 (6px)。canvas に「かけてある重い紙」感
- **含む要素** (上から):
  1. ロゴ (`AllMarks`) + 折り畳みボタン
  2. 検索 (常時表示、⌘K ショートカット、B1 では UI shell のみ、実動作は B2)
  3. Library セクション: `すべて` / `未読` / `既読` + 件数
  4. Folders セクション: B2 用の dashed border placeholder (「B2 で実装」と表示)
  5. 下部: `テーマ` / `設定` (現在 debug theme cycle は `テーマ` にまとめる)
  6. `F to hide` hint

### 2.4 Toolbar pill

- **位置**: canvas の top-center (Sidebar 幅を offset した中央)
- **ボタン構成**: `⚡ 整列` + `|` sep + `📤 シェア` の 2 ボタンだけに絞る
- **テーマボタン削除**: Sidebar に移管 (§2.3)
- **書き出しボタン削除**: シェアモーダルに統合 (§2.5)
- **現 Task 19 Toolbar.tsx は最小限の改修**: prop shape を `{ onAlign, onShare }` に変更、`layoutMode`/`frameRatio`/`themeId` prop は削除
- **FramePresetPopover は削除**: シェアモーダルに機能移管 (Task 20 で作った `components/board/FramePresetPopover.tsx` + `.module.css` は削除)

### 2.5 シェアモーダル

`📤 シェア` クリックで全画面オーバーレイが開く。Esc で閉じる。構成:

| エリア | 内容 |
|---|---|
| トップ | タイトル `このボードをシェア` + 閉じる |
| 左 (200px) | プリセット一覧 (Instagram 1:1 / Story 9:16 / X 横 16:9 / Pinterest 2:3 / YT サムネ 16:9 / カスタム) |
| 中央 | canvas プレビュー (暗背景)、枠内フルカラー・枠外 desaturate。枠は **ドラッグ/リサイズ可能** |
| 右 (280px) | 仕上げトグル (desaturate ON/OFF, ウォーターマーク ON/OFF) + ブクマ埋込みインジケータ (「N 件のブクマ + 配置を URL に圧縮」) + キャプション |
| 下 | **ダイレクト共有ボタン群**: X / Instagram (モバイルのみ直接) / LINE / Pinterest / Threads。下段に手動の「URL コピー」「PNG 保存」 |

- **ウォーターマーク**: canvas 右下に AllMarks ロゴ + `booklage.pages.dev` 半透明チップ。ON/OFF トグル (デフォルト ON、バイラル重視)
- **ブクマ埋込み**: シェア URL に brotli 圧縮で全ブクマ + 配置を埋め込み (IDEAS.md §SNS シェアから中身ブクマを直接インポート)。B1 は **実装**する (これが AllMarks の核ウイルス機構)
- **Web Share API**: モバイルの Instagram ボタンは `navigator.share({ files: [pngBlob] })` 経由。PC は PNG DL フォールバック
- **Web Intent**: X / LINE / Pinterest / Threads は Web Intent URL で投稿画面を開く (画像は手動添付、技術的制約)

### 2.6 整列アクション (B1 スコープは最小)

- `⚡ 整列` ボタンで**全カードを masonry 整列**する単発アクション
- 裏側は既存の `computeAutoLayout` を呼んで各カードの `freePos` を grid 相当値に setState + persist
- アニメーション: `gsap.timeline` で 400ms morph (Task 14 の morph ロジック再利用)
- **範囲選択整列 (drag で範囲選択 → その中だけ整列) は B1.5 へ defer**。今回は全体整列のみ
- 整列後も free モードのまま。ユーザーが各カードを再配置すれば即 freePos 更新

---

## 3. 視覚言語

### 3.1 液体ガラス (屈折型、Chrome ベース)

IDEAS.md §kube.io に記載の recipe を採用:

```html
<svg><defs>
  <filter id="booklage-refract">
    <feImage href="/displacement-map.png" result="dmap"/>
    <feDisplacementMap in="SourceGraphic" in2="dmap"
      scale="var(--glass-scale, 12)"
      xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>
```

- **displacement-map**: 事前レンダリング PNG を `/public/displacement/glass-001.png` 等に配置
- **scale**: CSS 変数 `--glass-scale` で制御 (デフォルト 12、hover で 18 等にアニメ可)
- **半透明度**: `background: rgba(255,255,255,0.04)` (**ほぼ完全クリア**、blur ではなく屈折で存在感を出す)
- **エッジ**: `border: 1px solid rgba(255,255,255,0.55)` + `box-shadow: inset 0 1px 0 rgba(255,255,255,0.9)` でガラスエッジのハイライト
- **ブラウザ対応**: Chrome/Edge のみ `backdrop-filter: url(#...)` が効く。Firefox/Safari は半透明白 + 軽い blur (`backdrop-filter: blur(8px)`) のフォールバック。CSS `@supports not (backdrop-filter: url(#t))` で分岐

### 3.2 タイポグラフィ (ブラッシュアップ前提)

- **ロゴ / 見出し**: Playfair Display italic (serif) 系。フォントは後日確定 (本 spec は方向性のみ)
- **UI テキスト**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif`
- **件数・座標・サイズ**: SF Mono 系 monospace (`SF Mono, Monaco, 'Cascadia Code', monospace`)
- **CJK**: `'Hiragino Mincho ProN'` を serif 側のフォールバックに

### 3.3 色

- 主色: `#7c5cfc` (AllMarks violet、既存)
- neutral chrome 選択色: `#1a1a1a` (Task 19 で確定済、継続)
- canvas 背景: テーマごと (既存 ThemeLayer)
- 暗モーダル背景: `#1a1a24 → #2d2438` のグラデ (シェアモーダル用)

### 3.4 非対称・脱 "SaaS 感" 装飾

- サイドバー縦書きシグネチャ `BOARD · 2026` (mono, 9px, letter-spacing 0.35em) を右内側エッジに配置
- nav 選択表示は `border-left 2px #7c5cfc` + `linear-gradient(90deg, rgba(124,92,252,0.1), transparent)` (box 型 selection を避ける)
- セクションヘッダー `LIBRARY` は `letter-spacing 0.08em uppercase 10px` で editorial tone
- 件数は必ず monospace、テキストと視覚的に別レイヤー

### 3.5 CSS 変数化ルール

実装時、以下は必ず `:root` の CSS 変数として公開 (後調整のため):

```css
:root {
  --glass-clarity: 0.04;          /* 半透明度 (0 = 完全クリア) */
  --glass-blur: 0px;              /* フォールバック用の blur 量 */
  --glass-displacement-scale: 12; /* 屈折の強さ */
  --glass-edge: rgba(255,255,255,0.55);
  --glass-specular: rgba(255,255,255,0.9);
  --sidebar-width: 240px;
  --sidebar-collapsed: 52px;
  --sidebar-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --sidebar-duration: 340ms;
  --corner-radius-outer: 24px;
  --corner-radius-inner: 6px;
  --accent-primary: #7c5cfc;
  --accent-dark: #1a1a1a;
}
```

---

## 4. コンポーネント設計

新規 + 大改修コンポーネント一覧:

| 種別 | コンポーネント | 役割 |
|---|---|---|
| 新規 | `components/board/Sidebar.tsx` + `.module.css` | 左サイドバー全体 |
| 新規 | `components/board/LiquidGlass.tsx` + SVG filter | 屈折ガラスラッパー (displacement map 差し替え可) |
| 新規 | `components/board/ShareModal.tsx` + `.module.css` | シェアモーダル全体 |
| 新規 | `components/board/SharePresetList.tsx` | モーダル左列のプリセットリスト |
| 新規 | `components/board/ShareCanvasPreview.tsx` | モーダル中央のライブプレビュー + 枠 drag |
| 新規 | `components/board/ShareOptionsPanel.tsx` | モーダル右列のトグル + 埋込みインジケータ |
| 新規 | `components/board/ShareActions.tsx` | モーダル下のダイレクト共有ボタン群 |
| 新規 | `lib/share/url-encode.ts` | ブクマ + 配置の brotli 圧縮 → URL 生成 |
| 新規 | `lib/share/url-decode.ts` | 逆方向 (importer) |
| 新規 | `lib/share/sns-intents.ts` | X / LINE / Pinterest / Threads の Web Intent URL 生成 + Web Share API wrapper |
| 新規 | `lib/board/align.ts` | `alignAllToGrid(items) → items with freePos` |
| 大改修 | `components/board/Toolbar.tsx` | prop 縮小、`整列` + `シェア` のみ |
| 削除 | `components/board/FramePresetPopover.*` | シェアモーダルに機能統合 |
| 影響なし | `CardNode / CardsLayer / ResizeHandle / RotationHandle / InteractionLayer` | Task 14-18 の成果をそのまま使用 |

---

## 5. 既存 Task 14-20 への影響

### 5.1 そのまま使える

- **Task 14 (CardsLayer morph)**: 整列アクション実行時の GSAP timeline として継続使用
- **Task 15 (CardNode 2-div)**: 変更なし
- **Task 16 (free-drag state machine)**: 変更なし、これがデフォルト挙動になるのでむしろ主役
- **Task 17 (RotationHandle)**: 変更なし (free モード廃止ではなく「常に free」なので全カードで有効)
- **Task 18 (ResizeHandle 8 handles)**: 変更なし

### 5.2 改修または削除

- **Task 19 (Toolbar)**: `layoutMode` / `frameRatio` / `themeId` prop を削除、`onAlign` / `onShare` の 2 callback だけに縮小。CSS も 2 ボタン前提にシェイプダウン
- **Task 20 (FramePresetPopover)**: **削除**。機能はシェアモーダルに統合。`messages/ja.json` の `board.frame.*` キーは `board.share.*` にリネームして流用
- **`BoardConfig.layoutMode`**: IndexedDB v6 → v7 migration で削除

### 5.3 新規で増える主要依存

- なし (ガラスは pure SVG + CSS、brotli は Web Compression Streams API が Chrome/Firefox/Safari 全対応、追加ライブラリ不要)
- Web Share API は standard DOM API
- 事前レンダリングの `displacement-map.png` を 1 枚コミット (512x512 推奨、数 KB)

---

## 6. スコープ外 / defer

### 6.1 B1 完了後に継続

- **範囲選択整列**: ドラッグで矩形選択 → 選択カードのみ整列。B1.5 で追加
- **テーマ別アニメーション personality**: cork は「ポン」、glass は「水滴」等 (IDEAS.md §テーマ別アニメーションパーソナリティ)。D スタイル拡充時
- **displacement-map のアニメーション (ぽよん)**: hover で scale 値を動かすマイクロインタラクション。B1 実装後 polish 段階で追加

### 6.2 B2 で設計

- **検索の実装**: Sidebar の検索は UI shell のみ B1 で置き、実動作はフォルダ CRUD と一緒に B2 で
- **Folders CRUD**: dashed placeholder を本実装に差し替え
- **Triage モード**: IDEAS.md §Triage 参照、B2 の花形機能

### 6.3 後続

- Lism CSS / HTML-in-Canvas (VFX-JS) 導入はパフォーマンスが問題化してから
- Web Archive 対応、Creative Commons ライセンス指定等の権利系

---

## 7. 成功基準 (実装完了判定)

**MVP 最低ライン**:

1. `/board` を開くとサイドバーが左端にアンカーされて表示される
2. サイドバーに件数が出る (すべて / 未読 / 既読)
3. F キー or ボタンで折り畳み、52px icon rail になり、ヒッチなしアニメーション
4. サイドバーの素材は屈折ガラス (Chrome で背景が歪むのを目視確認)
5. Fallback: Firefox/Safari で見ても壊れない (blur + 半透明白)
6. Toolbar pill は `整列` + `シェア` の 2 ボタンだけ
7. `整列` 押すと 400ms morph で全カードが整う
8. `シェア` 押すとフルスクリーンモーダルが開く
9. プリセットを選ぶと canvas プレビューに枠が出る、枠は drag/resize 可能
10. `X で投稿` ボタンで Web Intent 画面が開き、URL とキャプションが入っている
11. 書き出した PNG の右下にウォーターマークが載っている (ON 時)
12. 生成された URL をブラウザに貼ると、ブクマ + 配置が復元される
13. Esc でモーダルが閉じて編集モードに戻る

**デザイン polish ライン** (MVP 後の反復で到達):

- ガラスの感触が Lopoly/miti と明確に違うと実機で感じられる
- エディトリアル/シグネチャ装飾が効いている
- 文字サイズ・重み・余白が Shopify.design / Linear 水準
- アニメーションにヒッチなし

### 7.1 テスト戦略

- **vitest**: `lib/share/*`, `lib/board/align.ts` の純関数ユニットテスト
- **Playwright**: `/board` の基本フロー (サイドバー展開/折り畳み、整列、シェアモーダル開閉、枠 drag、PNG 書き出し、URL コピー) を E2E
- **実機デプロイ**: 各主要コミット後に `booklage.pages.dev` へ自動デプロイ → モバイル実機でも確認 (Web Share API はモバイルでしか動かないため)

---

## 8. 実装順序の提案 (plan に回す前の大枠)

1. **Phase 1 — 骨**: CSS 変数 + 屈折ガラス基盤 + Sidebar shell (中身 placeholder)
2. **Phase 2 — Sidebar 中身**: ロゴ / 検索 shell / Library 3 項目 / テーマ移管 / 折り畳みアニメ / F キー
3. **Phase 3 — Toolbar 縮小**: `整列` + `シェア` の 2 ボタン化、BoardRoot の state 整理、`layoutMode` 削除 + migration
4. **Phase 4 — 整列アクション**: `alignAllToGrid` + morph 再利用 + persist
5. **Phase 5 — ShareModal 骨**: full-screen overlay + プリセットリスト + canvas プレビュー (枠 drag なし)
6. **Phase 6 — ShareModal 枠操作**: 枠の drag/resize + プリセット snap
7. **Phase 7 — 共有 + 埋込み**: `lib/share/url-encode.ts` + Web Intent + Web Share API + PNG 書き出し + ウォーターマーク
8. **Phase 8 — importer**: `lib/share/url-decode.ts` + `?d=...` 起動時復元
9. **Phase 9 — polish**: displacement-map 差し替え、微調整、E2E テスト

各 Phase でデプロイ → 実機確認 → フィードバックで次 Phase の細部調整。

---

## 9. 決まっていない項目 (実装しながら詰める)

- 正確なフォントファミリ (Playfair Display 候補、和文 serif は要候補出し)
- ウォーターマークの透明度・サイズの最終値
- `displacement-map.png` の具体デザイン (波状 / 有機的 / 幾何学的等、2-3 案を試す)
- アニメーション ease 曲線の微調整 (実機フィードバック次第)
- モーダル閉じるときの transition (fade / scale / slide のどれか)
- 範囲選択整列の UI (B1.5 で brainstorming)

---

## 変更履歴

- 2026-04-20 初稿 (Masaya + Claude brainstorming session)
