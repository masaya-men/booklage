# 次セッションのゴール (= セッション 22)

## ゴール
**Lightbox refactor の前提作業 = 角丸 fixed 24px 化 + サイズスライダー化**を実装。 これが終わったら次々セッションで destefanis 方式 clone refactor 本体に進む。

## 確定済み方針 (セッション 21 で合意)

ユーザーと合意した A-G 全 7 点:

- **A**. ボードカードのリッチ機能 (mediaSlots ホバー切替、 将来の動画同時再生) は**絶対保持**、 最優先
- **B**. その制約下で Lightbox open/close animation を destefanis 並みにする価値あり
- **C**. 「ついで」 でなく専用セッションで腰据えて取り組む
- **D**. 動画同時再生 (B1 花形機能) より**先に** animation refactor を片付ける優先順
- **E**. **角丸を 24px fixed に変更** (size 連動でなく) — destefanis 完全互換、 小カードがぽってり丸くなる味の変化は受容、 「ぱくり」 にはならない (24px は業界標準値、 AllMarks 個性は機能と世界観で出す)
- **F**. **カードサイズを 5 段階 → 連続スライダー化** + **ギャップスライダー** とセットで実装、 デフォルト = 現 size 3、 リセットボタン = デフォルトに戻る 1 ボタン
- **G**. 実装順序は Claude 判断、 ただし E (radius fixed) は refactor の前提として先行

## やること (実装順)

1. **角丸 fixed 24px 化** (E)
   - [CardsLayer.tsx:448](components/board/CardsLayer.tsx#L448) の formula `Math.min(24, Math.min(p.w, p.h) * 0.075)` を `24` 固定に変更
   - 全カードサイズで 24px 統一、 小カードがぽってり丸くなることを Visual Companion で確認
   - Lightbox の `--lightbox-media-radius` も 24px に統一 (現状は別値の可能性、 要確認)
   - これだけで Lightbox close の「角丸 AA 違和感」 が**完全消滅**するはず (radius が変化しないため、 GPU resample 由来の差も発生しない)
   - tsc / vitest / build clean 確認 → deploy

2. **サイズスライダー化** (F)
   - 現 5 段階 (`lib/board/size-levels.ts`) を連続値に
   - スライダー UI: TopHeader 内、 ギャップスライダーと並べる
   - デフォルト = 現 size 3 のカード幅値、 リセットボタンで戻す
   - column 数は viewport / card 幅 から自動算出
   - 既存の自由リサイズ機能 (個別カード) との共存確認

3. **ギャップスライダー実装** (F の併設)
   - 既存 `docs/private/IDEAS.md` のアイデアを着工
   - サイズスライダーと同じ TopHeader 領域に配置

4. **destefanis 方式 clone refactor の spec 起こし** (次々セッション以降)
   - `docs/specs/2026-05-14-lightbox-clone-refactor.md` に書く
   - 核心: `lightboxClone = sourceCard.cloneNode(true)` を body に append (`.frame` の will-change containing block を escape)、 width/height + translate3d で animate
   - radius が fixed 24px なので border-radius アニメは不要 = **destefanis 本家と完全に同じ最小実装**になる
   - カバー範囲: open / close / Lightbox 内 nav (wheel scroll で隣カード) の 3 経路
   - 保持必須: A の全機能
   - 工数見積: 当初 4-6h → radius fixed が前提に揃うことで **2-3h 級**に圧縮見込み

## 前提
- master HEAD: `53677b1` = セッション 21 close anim revert + doc 更新の安定状態
- 本番 `booklage.pages.dev` deploy 済、 close 動き正常 (ただし角丸 AA 差は微妙に残存 = 次セッションで E により根本解消予定)
- 全 484 vitest + tsc + build clean
- destefanis 本家 (`https://github.com/destefanis/twitter-bookmarks-grid` app.js L270-459) は調査済、 source は `C:/Users/masay/AppData/Local/Temp/destefanis-app.js` にも保存済
- 確定方針 A-G は本ファイル上記参照
