# 次セッションのゴール (= セッション 29)

## ゴール

**セッション 28 で本番反映した Apple v3 chrome の視覚 fine-tune** + **③ Slider 精密化** の着工。 まずは booklage.pages.dev でユーザーが実機確認し、 直したい所を 1 周してから、 ③ slider に進む流れ。

## 前提 (セッション 28 で揃った)

- master HEAD: `1588d54 style(board-chrome): thin-stroke text chrome on all header islands (Apple v3 step 7)`
- spec `docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md` §4 の 10 ステップ完全消化、 3 commit に分けて実装
- 本番 deploy 済 — `https://booklage.pages.dev` ハードリロードで最新
- vitest 478 / tsc / build clean
- ③ Slider 精密化 / ④ AllMarks pin / ⑥ 拡張機能 polish は持ち越し中

## セッション 29 の進め方 (= 2 phase 想定)

### Phase 1: Apple v3 視覚 fine-tune (= 必須、 短時間)

ユーザーが本番をハードリロードして気になった所を Claude に伝える。 候補:

**⭐ session 28 末ユーザー報告 (= 最優先 fine-tune)**:
- **ScrollMeter counter の scramble 頻度** — 現状はスクロール中 (= visibleRange / totalCount が変化したタイミング) しか scramble せず、 settle 後は ±1 micro-jitter のみ。 ユーザー要望: settle 中も**たまに full scramble** を発火させたい (= 「震えるだけじゃない、 数字が大きく動く瞬間を周期的に入れる」)。 実装案: settle 後ランダムタイマー (e.g., 5-15 秒間隔で N1/N2/TOTAL のいずれかを 600-1500ms scramble) を仕込む。 [components/board/ScrollMeter.tsx](components/board/ScrollMeter.tsx) の rAF loop に「periodic scramble trigger」 を追加

**その他の候補** (= 必要なら user 指示で着工):
- counter readout の font-size / letter-spacing 微調整 (= 現在 11px / 0.10em、 視認性次第)
- scrim 濃度 (= 0.32 → もっと薄く or 濃く) / scrim 高さ (= 80px → 60 or 100px)
- chrome text の base opacity (= 0.85 → 0.78 or 0.9)
- ScrollMeter の幅 (= 現在 360px、 360 だと canvas 中央寄り、 もっと細くするか?)
- counter scramble 動き (= TOTAL 1500ms が長すぎる感じ等)
- 「intro fade (= mount 後 2.4 秒 高 opacity + glow → ambient)」 が **spec にあるが未実装** (= 必要かを user に確認、 必要なら実装)
- divider dot 「·」 が 2 slot レイアウトで削除済 (= space-between で代替)。 戻したい場合に再追加

### Phase 2: ③ Slider 精密化 + 板に馴染ませる

Phase 1 が終わったら着工。 IDEAS.md §セッション 23 D + E (= 数値表記の遊び + slow slider 根本治療) 参照。 実装方針:
- `setPointerCapture` + `movementX × ratio` でカスタム slider を組み、 native `<input type=range>` を脱却
- visual も Apple v3 路線で文字 chrome 化 (= W/G label + value は既に stroke 化済、 thumb / track の path を引き直す)
- spec を最初に書く方が良い (= writing-plans skill 起動)

## 着工前読み込み

- `docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md` (= 視覚 fine-tune の基準値)
- `components/board/ScrollMeter.tsx` / `.module.css` (= counter readout のパラメータ位置)
- `components/board/SliderControl.module.css` (= 既存 slider の構造)
- `docs/private/IDEAS.md` §セッション 23 D + E (= slider 精密化方針)

## 触らない (= 短期スコープ外)

- リブランド (= AllMarks ドメイン取得後、 月末 2026-05-31 リマインダー)
- ④ AllMarks pin / ⑥ 拡張機能 polish (= ② ③ 後)
- ⑤ カスタムマウスポインタ (= テーマシステム未確定なので保留)
- B-#7 自由サイジング縮小 clipping (= 体感バグ、 後日)
- B-#17-#3 Lightbox internal nav clone 移行 (= 中期)

## 着工 NG 条件

- 動的反転 (mix-blend-mode / JS sampling / backdrop-filter v4-v6) の再検討 → spec §2-4 で物理制約と判断記録済、 蒸し返さない
- backdrop blur / Motion One spring polish (= session 25-27 で全部外した、 28 でも外したまま)
- LiquidGlass を chrome に戻す (= テーマ切替時の話、 default chrome では使わない)
