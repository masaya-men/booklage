# 次セッションのゴール (= セッション 32)

## ゴール

**foundation 3 本柱 sprint 着手** — もしくは Bug B 震えの本番体感を確認して、 残っていれば B-c 本格 fix を先に。

セッション 31 で Lightbox 周りはひと段落 (= TextCard 再設計 + Lightbox 統合 + Bug B 軽量 fix の 3 タスク完遂、 本番 deploy 済)。 触らないリストにあった foundation 3 本柱に本腰を入れる sprint。

## 前提 (= セッション 31 で揃った)

- master HEAD: セッション 31 close-out commit
- セッション 31 の主要変更:
  - **TextCard 再設計** (= 白地 / 黒地 2 パターン deterministic 分配、 typography 40% 縮小、 9:16 上限 + ellipsis)
  - **Lightbox 統合** (= `.media` で大 TextCard、 Bug A-1 自動解決)
  - **Bug B 軽量 fix (B-b)** (= sub-pixel snap + will-change + GPU hint)
- 本番反映済 → `https://booklage.pages.dev`
- vitest 488 / tsc / build clean

## セッション 32 の進め方

### Phase 0: 本番動作確認 (= セッション開始時 user 確認)

- `https://booklage.pages.dev` をハードリロードして:
  1. TextCard の 2 色 (= 白地 / 黒地) deterministic 分配が見えるか
  2. Lightbox を開いた時 TextCard が「同じ世界」 (= 急変なし) で morph するか
  3. **Bug B 震え** が体感で残っているかどうか
- 震え残っていれば → **B-c 本格修正を先に**:
  - clone の border-radius を child element に逃がして、 親を transform:scale 化
  - GSAP timeline を `top/left/width/height` から `transform` ベースへ書き換え
  - refactor scope: `createLightboxClone` + open / close tween 全部、 中規模
- 震え気にならない → **foundation 3 本柱** に進む

### Phase 1 (= foundation を始めるなら): サイジング汎用化

- spec: `docs/specs/2026-05-12-sizing-migration-spec.md`
- Phase 2-6 が残っている (= Phase 1 は session 15 で完了済)
- 全プロジェクト共通思想: `C:\Users\masay\.claude\design-philosophy-sizing.md`
- 核心: 「開発者画面 = 1489px が anchor + 上限」、 clamp(MIN, vw, BASE) で proportional scaling

### Phase 2 (= 順次): 広告 placement 予約 slot

- 戦略 memory: `project_ad_strategy_2026_05`
- まず slot 確保だけ (= 配信は後)

### Phase 3 (= 順次): manual tag schema

- IDB schema bump 必要 (= 不可逆、 慎重)
- セッション 17 の VersionError 事故を教訓に、 dev で v→v+1 を必ず実機検証

## 月末リマインダー (= 2026-05-31)

**`allmarks.app` ドメイン取得確認**。 セッション開始時に user に確認を促す。 取得済 → Cloudflare Pages 新 project 作成 + 拡張機能 v1.0 submission sprint に進める。 未取得 → 取得を促す。

## 触らない (= セッション 32 短期スコープ外)

- 拡張機能 polish 3 項目 (= PiP 常駐 / SNS いいね連動 / 代替ショートカット) — 拡張機能 sprint で別途
- LP リデザイン (= IDEAS.md `project_lp_redesign_vision`)
- Favicon (= AllMarks identity 決定後)
- B-#3 重複 URL バグ、 B-#7 サイジング縮小 clipping (= foundation Phase 1 と一部重なる可能性、 そのとき判断)
