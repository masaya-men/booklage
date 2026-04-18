# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み
> デザイン参考資料は [DESIGN_REFERENCES.md](./DESIGN_REFERENCES.md) を参照

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `master`（push済み）
- **進捗**: S1〜S3, S5〜S9 完了 → **UX磨きスプリント進行中**
- **本番URL**: `https://booklage.pages.dev`
- **DBバージョン**: v4（ogpStatus追加）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）
- **ビルド**: `output: 'export'`（静的書き出し）、出力先は `out/`
- **デプロイ**: `npx wrangler pages deploy out/ --project-name=booklage --commit-dirty=true`（手動）
- **テスト**: 全108件パス（vitest）、TypeScript型チェッククリア

### 直近の作業（2026-04-16セッション④）

- **UX磨きリスト全7項目完了**
- LP: ライトテーマデフォルト + ☀/☾テーマトグル（localStorage保持）
- ブックマークレット: パルスリングアニメ、スプリングホバー、pill形状に改善
- カードガラスblur修正: CardStyleWrapper 24px→6px
- テーマ切替ボタン: ボード右上に☀/☾トグル追加
- キャンバス操作ガイド: 空キャンバスにズーム/移動ヒント表示
- カードホバーツールチップ: 「クリックで開く ↗」表示
- リストパネル: 外クリックで閉じるように修正（document mousedown方式）
- 死んだCSS削除（.bookmarkCardセレクタ）

### 重要な技術判断（確定済み）

1. **ReactのDOM管理がGSAP Draggableを壊す** → DOM API + createPortal方式
2. **リキッドグラス** — Chrome検出、物理ベース屈折、UIパネル+カードに適用済み
3. **React Strict Mode** — GSAP互換性のため`reactStrictMode: false`
4. **カードナビゲーション座標変換** — getBoundingClientRect→ビューポート相対→ワールド座標逆算。`use-infinite-canvas.ts`に`setTransform()`追加済み

---

## 次にやること: UX磨きスプリント（最優先）

**目標: Booklageを「触って感動する」レベルにする**

必ず `docs/DESIGN_REFERENCES.md` を読んでから着手すること。

### 優先度1（コア体験の品質）— 完了 ✓
- [x] **リキッドグラス透明化 + ぽよんぽよん変形**
- [x] **カスタムスクロールバー（全ページ統一）**
- [x] **カード自由リサイズ改善**
- [x] **ビューポートカリング + パフォーマンス最適化（1000枚60fps）**

### 優先度2（見た目の差別化）— 完了 ✓
- [x] **背景テーマ追加（現実マテリアル系）**
  - カッティングマット（緑）、ノート、点線ノート、作図用紙
- [x] **Moodboard 3000風グリッド整理**
  - ジャスティファイドレイアウト: 行ごとにカードを幅いっぱいに配置、隙間4px
  - カードはアスペクト比を保ちつつ行高さを揃える

### 優先度3（インタラクションの楽しさ）— 完了 ✓
- [x] **カード回転アニメーション**
  - クリック時に3Dフリップ（rotateY 360°、power2.inOut、0.55秒）→URL遷移
- [x] **Fluid Functionalismアニメーション**
  - 全カードにスプリング物理ホバー（ease-out-back + translateY(-2px) + scale(1.03)）
  - リキッドグラスUIパネルにスプリングトランジション適用

### 将来（ユーザー反応を見てから）
- [x] カスタムカーソル: ガラスレンズ + 12種エモジカーソル、設定で切替可、IndexedDB保持
- [x] 3D球体ナビゲーション実装（Task 1〜11完了 / Task 12=視覚確認は次セッション）
  - ブランチ: `claude/hardcore-yalow`、master 未マージ
  - トグル: テーマボタン下に 🌐/📋（既存 grid/collage とは別管理）
  - デフォルト `canvasMode: 'flat'` opt-in、WebGL 非対応は自動 flat
  - 139/139 テスト pass、ビルド OK
- [ ] html-in-canvas（ブラウザ未実装、待ち）
- [ ] S4: 広告基盤（ユーザーが付いてから）
- [x] Chrome拡張: manifest v3, ワンクリック保存, /save経由でIndexedDBに追加
- [x] 15言語i18n完了: ja,en,zh,ko,es,fr,de,pt,it,nl,tr,ru,ar,th,vi

---

## 確定した設計方針

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- 無限キャンバス: Figma/Miro風
- ReactのDOM管理はGSAP Draggableと互換性がない → DOM API + createPortal方式

## 既存のUX磨きリスト（前セッションから引き継ぎ）

- [x] ガラス縁: CardStyleWrapperで全カード共通適用済み。blur 24px→6pxに修正
- [x] UIレイアウト整理: ツールバー統合、ボタン重なり解消
- [x] テーマ切替ボタン: 右上に☀/☾トグル追加（ダーク↔ライト即切替）
- [x] LP/全ページのダーク↔ライト切替: ライトデフォルト + ☀/☾トグル（localStorage保持）
- [x] キャンバス操作の案内UI: 空キャンバスにズーム/移動操作ヒント表示
- [x] ブックマークレットのデザイン改善: パルスリングアニメ、スプリングホバー、pill形状
- [x] カードホバー時に「クリックで開く ↗」ツールチップ表示

## YouTube Takeout の問題

- Google Takeoutは「後で見る」を含むが、エクスポートに**数時間かかり非現実的**
- ZIP直接アップロード未対応（手動展開が必要）
- 代替手段を検討すべき: YouTube API直接 or Chrome拡張推奨

## アイデア・やりたいこと

- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- LPの磨き上げ（マーケティング開始前に実施）
- LPは明るいテーマをデフォルト
- [redacted-strategy]
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
