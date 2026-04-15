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

### 直近の作業（2026-04-15セッション③）

- **UX磨きスプリント優先度2完了:**
  - 背景テーマ4種追加: カッティングマット（緑）、ノート、点線ノート、作図用紙
  - Moodboard 3000風ジャスティファイドグリッド: 行ごとに幅いっぱい、隙間最小4px
- **UX磨きスプリント優先度3完了:**
  - カード回転アニメーション: クリック時rotateY(360°) + perspective(800px)で3Dフリップ
  - Fluid Functionalismアニメーション: 全カードにスプリング物理ホバー（ease-out-back, translateY(-2px)）、リキッドグラスパネルにもスプリングトランジション適用
- **SSRバグ修正:** getVisibleBounds の `window` 参照ガード追加

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

- [x] ガラス縁: CardStyleWrapperで全カード共通適用済み。blur 24px→6pxに修正
- [x] UIレイアウト整理: ツールバー統合、ボタン重なり解消
- [x] テーマ切替ボタン: 右上に☀/☾トグル追加（ダーク↔ライト即切替）
- [ ] LP/全ページのダーク↔ライト切替対応（明るいテーマをデフォルトに）
- [x] キャンバス操作の案内UI: 空キャンバスにズーム/移動操作ヒント表示
- [ ] ブックマークレットのデザイン/アニメーション改善
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
- 複数動画の同時視聴はBooklageならではの体験 → 訴求ポイント
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
