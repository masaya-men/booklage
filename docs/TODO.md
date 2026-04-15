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

### 直近の作業（2026-04-15セッション②）

- **UX磨きスプリント優先度1完了:**
  - リキッドグラス透明化（SVGフィルターにblur+saturate追加、背景ほぼ透明、スペキュラー55%）
  - ぽよんぽよん変形（マウス追従border-radius変形、GSAP elastic、UIパネルのみ）
  - カスタムスクロールバー統一（globals.cssにグローバル定義、4コンポーネントの重複削除）
  - カードリサイズ改善（リアルタイムwidth/height更新、TweetCard可変化、VideoEmbed aspect-ratio化）
- **パフォーマンス最適化:**
  - ビューポートカリング — 1000枚中24枚のみレンダリング（画面外スキップ）
  - カードからSVGフィルター除去 → 軽量CSS backdrop-filterに
  - CSS `contain: layout style paint` でカードラッパー最適化
  - **結果: 1000枚カードで60fps維持、フレームドロップなし**

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

### 優先度2（見た目の差別化）
- [ ] **背景テーマ追加（現実マテリアル系）**
  - カッティングマット（緑）、普通のノート、点線ノート、作図用紙
- [ ] **Moodboard 3000風グリッド整理**
  - 参考: Figma plugin Moodboard 3000
  - 画像をぴったり隙間なく美しく配置

### 優先度3（インタラクションの楽しさ）
- [ ] **カード回転アニメーション**
  - クリック→くるっと横回転（参考: marijanapav）
- [ ] **Fluid Functionalismアニメーション**
  - 参考: https://github.com/mickadesign/fluid-functionalism

### 将来（ユーザー反応を見てから）
- [ ] カスタムカーソル（リキッドグラス虫眼鏡 + コレクション12種）
- [ ] 3D球体ナビゲーション（snapdom参考、地球の反対側感）
- [ ] html-in-canvas（パフォーマンス改善）
- [ ] S4: 広告基盤（ユーザーが付いてから）
- [ ] Booklage専用Chrome拡張（S10）
- [ ] 残り13言語のi18n対応

---

## 確定した設計方針

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- 無限キャンバス: Figma/Miro風
- ReactのDOM管理はGSAP Draggableと互換性がない → DOM API + createPortal方式

## 既存のUX磨きリスト（前セッションから引き継ぎ）

- [ ] ガラス縁: 動画カードにもガラスの縁を常時表示
- [ ] UIレイアウト整理: 配置が不明瞭な箇所の修正
- [ ] テーマ切替ボタン: 設定パネル以外からもアクセス可能に
- [ ] LP/全ページのダーク↔ライト切替対応（明るいテーマをデフォルトに）
- [ ] キャンバス操作の案内UI
- [ ] ブックマークレットのデザイン/アニメーション改善
- [ ] カードホバー時に「クリックで開く」のツールチップ表示

## YouTube Takeout の問題

- Google Takeoutは「後で見る」を含むが、エクスポートに**数時間かかり非現実的**
- ZIP直接アップロード未対応（手動展開が必要）
- 代替手段を検討すべき: YouTube API直接 or Chrome拡張推奨

## アイデア・やりたいこと

- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- LPの磨き上げ（マーケティング開始前に実施）
- LPは明るいテーマをデフォルト
- 複数動画の同時視聴はBooklageならではの体験 → 訴求ポイント
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
