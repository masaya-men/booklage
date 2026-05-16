# 次セッションのゴール (= セッション 31)

## ゴール

**Lightbox 周りまとめ sprint** — TextCard 再設計 + Lightbox 統合 + 震え修正 を 1 sprint で。

3 タスクは互いに密結合 (= 同じ file 群を触る) なので、 一括着工して文脈効率最大化。 まず TextCard 再設計 から、 続けて Lightbox 統合、 最後に震え修正。

## 前提 (= セッション 30 で揃った)

- master HEAD: `0fd7b8a fix(lightbox): aspect-driven wrapper for general image cards`
- セッション 30 の 2 commit:
  - **`e8beadd`** visual pivot (= 全画面化 + gap=97 + Phase A→C 切替)
  - **`0fd7b8a`** Bug A-2 (= サムネ付きカード「奥に消える」) 修正
- 本番反映済 → `https://booklage.pages.dev`
- vitest 488 / tsc / build clean

## セッション 31 の進め方

### Phase 1: TextCard 再設計 (= 主題、 60-90 分)

**ユーザー希望の方向** (= reference 画像 3 枚 + 言語で確定済、 詳細 `docs/private/IDEAS.md` D 項):

- **2 パターン random 分配**:
  - 白地に黒字 (= editorial 風、 informative)
  - 黒地に白字 (= statement / display 風、 印象に残る)
- **タイトル typography が主役**、 文字サイズは reference 画像くらい (= 今より小さく、 抑えめ)
- **装飾は最小** (= 角丸 + パディング + ホスト名 小 + タイトル の 4 要素)
- ホスト名は控えめ、 矢印アイコン (`↓`) 等の素朴な装飾は OK
- 角丸は既存 `--card-radius: 20px` 維持
- 高コントラスト (= AllMarks の destefanis 系直球美)

**着工前に決めること**:
1. **random 分配の単位** (= per card / per session、 deterministic vs runtime random)
2. **文字サイズの具体値** (= reference 画像から計測 → user 好み微調整)
3. **黒地カードの背景色** (= `#000` / `#0a0a0a` / `#101010`)
4. **画像 2 系の all-caps display 路線**を含めるか、 別パターン扱いか
5. **複数行タイトル時の挙動** (= 行高、 文字サイズ自動縮小、 等)

**実装スコープ**:
- `components/board/cards/TextCard.tsx`: typography / layout 再設計
- `components/board/cards/TextCard.module.css`: 2 色パターン + base style
- random 分配ロジック (= cardId hash で deterministic 推奨)
- 既存 e2e テスト (= `tests/e2e/`) の TextCard 関連を更新

### Phase 2: Lightbox 統合 (= A-1 自動解決、 20-30 分)

**変更**:
- `components/board/Lightbox.tsx` の `LightboxMedia` 関数 ([L1597-1639](components/board/Lightbox.tsx#L1597-L1639)):
  - L1638 placeholder div を削除
  - 代わりに再設計 TextCard を**大サイズ** (= cardWidth: 600px 程度) で描画
- clone morph はそのまま使える (= 小 TextCard → 大 TextCard、 同じ装飾なので急変なし) → **A-1 自動解決**

**選択肢**: `.text` 右パネルの扱い
- そのまま残す (= 既存 2 列構造を維持、 .media の TextCard と .text のタイトル / 説明が duplicate になるので片方を整理)
- text-only カードでは `.text` 非表示、 `.media` の TextCard だけ表示
- セッション内で実際に見ながら決定

### Phase 3: Bug B (= 震え) 修正 (= 30-60 分、 scope による)

**root cause** (= セッション 30 で特定済、 詳細 IDEAS.md E 項):
- clone tween が `top` / `left` / `width` / `height` を直接 animate (= layout property、 GPU 加速不可)
- sub-pixel float 補間で増幅

**修正案 3 つから選択**:
- **B-a**: `transform: translate + scale` に変更 (= 軽実装、 ただし border-radius が animation 中歪む)
- **B-b**: sub-pixel snap (= rect 値 `Math.round` 化) + `will-change` 追加 (= 最軽、 軽減程度 / 完全 fix 期待薄)
- **B-c**: transform 路線 + clone の border-radius を child element に逃がす radius 維持 workaround (= 完全 fix、 refactor 規模大)

**判断手順**:
1. まず Lightbox clone 周辺の refactor scope を測定 (= B-c の現実性確認)
2. B-c が現実的 → B-c で完全 fix
3. B-c が重い → B-a (= 多少 radius 歪んでも shake 消す方を優先) と B-b の併用

## 月末リマインダー (= 2026-05-31)

**`allmarks.app` ドメイン取得確認**。 セッション開始時に user に確認を促す。 取得済 → Cloudflare Pages 新 project 作成 + 拡張機能 v1.0 submission sprint に進める。 未取得 → 取得を促す。

## 触らない (= セッション 31 短期スコープ外)

- foundation 3 本柱 (= サイジング汎用化 / tag schema / 広告 placement) — セッション 32 以降
- 拡張機能 polish 3 項目 (= PiP 常駐 / SNS いいね連動 / 代替ショートカット) — セッション 32 以降
- LP リデザイン (= IDEAS.md `project_lp_redesign_vision`)
- Favicon (= AllMarks identity 決定後)
- B-#3 重複 URL バグ、 B-#7 サイジング縮小 clipping
