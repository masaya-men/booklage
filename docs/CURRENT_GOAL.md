# 次セッションのゴール (= セッション 28)

## ゴール

**セッション 27 spec の実装**。 board chrome を Apple iOS Photos / visionOS 流の「edge gradient scrim + 文字 chrome (= thin paint-order stroke + text-shadow ゼロ)」 に置換 + ScrollMeter を下端に移動 + counter readout を追加。

## 前提 (セッション 27 で揃った)

- master HEAD: セッション 27 close-out commit (= spec 書き出し + dashboard 更新)
- **`docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md` が確定済 spec**
  - ① ScrollMeter 下配置 + counter readout (D ハイブリッド動き) 確定
  - ② TopHeader = Apple v3 (= edge scrim + thin stroke + 文字 chrome) 確定
  - 動的反転 (v4-v6) は物理制約で棄却、 学びを spec §5 に記録
- セッション 27 では brainstorm のみ、 **実装ゼロ**。 Visual Companion server を多用、 Sonnet weekly 制限近づき切り上げ

## 着工前読み込み必須

- **`docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md` 全文** (= これが contract、 §4 が実装 plan 順序)
- `components/board/ScrollMeter.tsx` / `.module.css` (= 現状の波形ロジック確認、 維持する)
- `components/board/TopHeader.tsx` / `.module.css` (= 改修対象)
- `components/board/LightboxNavMeter.tsx` (= counter slot machine + meterStack 構造を流用)
- `components/board/BoardRoot.tsx` (= ScrollMeter portal 化 + lightboxOpen 渡し)

## 実装手順 (= spec §4 と同じ)

1. **TopHeader.module.css 改修** = 黒帯削除 + position absolute + 文字 chrome 化
2. **board container に edge scrim** = `::before` 上端 80px + `::after` 下端 80px
3. **ScrollMeter portal 化** = TopHeader instrument slot から body / board 直下に移動、 `position: fixed; bottom: 24px; center;`
4. **ScrollMeter に counter readout** = `[ N1 — N2 / TOTAL ]` + D ハイブリッド動き (= N1/N2 scramble 600ms、 TOTAL 1500ms、 常時微振動)
5. **画面内範囲 N1〜N2 計算** = viewport y + skyline layout intersect、 60fps throttle
6. **Lightbox open 時 ScrollMeter fade out** = BoardRoot から hidden prop
7. **既存 chrome 文字を thin-stroke 化** = FilterPill / Share / SizePicker / ResetAll / PopOut 全部、 text-shadow 排除
8. **テスト更新** = TopHeader.test.tsx, ScrollMeter.test.tsx
9. **build + tsc + vitest clean**
10. **deploy**

各ステップは独立 commit 可能。 1-2 で「視覚的に Apple v3」、 3-6 で「ScrollMeter 下移動 + counter」、 7 で「文字 chrome 統一」。

## 推奨進行

- spec §4 の 10 ステップを TodoWrite に転記
- ステップ 1-2 を先に commit + deploy で見た目変化を確認 (= edge scrim だけで board の雰囲気が変わるはず)
- その後 ScrollMeter 移動 + counter を別 commit
- 最後に文字 chrome 統一 commit

## ③ Slider 精密化以降 (= セッション 28 のさらに次)

- セッション 27 で着工せず持ち越し
- IDEAS.md §セッション 23 D + E (= 数値表記の遊び + slow slider 根本治療) 参照
- 実装方針: `setPointerCapture` + `movementX × ratio` でカスタム slider、 visual も Apple v3 路線

## 着工 NG 条件

- 動的反転 (mix-blend-mode / JS sampling / backdrop-filter v4-v6) の再検討 → spec §2-4 で物理制約と判断記録済、 蒸し返さない
- backdrop blur / Motion One spring polish (= session 25 で外した、 27 も外した)

## 並行 backlog (= 触らない)

- リブランド (= AllMarks ドメイン取得後、 月末 2026-05-31 リマインダー)
- ④ Booklage pin 見直し + ⑥ 拡張機能 polish (= ② ③ 後)
- ⑤ カスタムマウスポインタ (= テーマシステム未確定なので保留)
- B-#7 自由サイジング縮小 clipping (= 体感バグ、 後日)
- B-#17-#3 Lightbox internal nav clone 移行 (= 中期)
