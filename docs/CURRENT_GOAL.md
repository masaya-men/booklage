# 次セッションのゴール (= セッション 23)

## ゴール
**destefanis 方式 Lightbox clone refactor** を専用セッションで実装。 open / close / 内部 nav の 3 経路すべてを `cloneNode(true)` + position:fixed + width/height ベースに書き換える。

## 前提 (セッション 22 で揃った)
- カードと Lightbox の border-radius が **24px fixed** に統一済 → radius animate 不要
- カード幅 / ギャップが **連続 px 値**で管理 (SizeLevel 廃止済) → source rect 取得が単純化
- master HEAD はセッション 22 commit (E + F + spec)
- 本番 `booklage.pages.dev` deploy 済、 ユーザー目視確認段階

## やること

1. **着工前チェック** (spec 末尾の 5 点)
   - master HEAD に E + F + spec 含む commit が乗っているか
   - `--card-radius` と `--lightbox-media-radius` 両方 24px か (`app/globals.css`)
   - SizeSlider / GapSlider が本番で動いているか
   - destefanis 本家 `app.js` L270-459 をもう一度読み直す (local: `C:/Users/masay/AppData/Local/Temp/destefanis-app.js`)
   - mediaSlots / customCardWidth / thumbnail healing の現状動作スクリーンショットを保存 (リファクタ後の比較用)

2. **spec を読む**: [docs/specs/2026-05-14-lightbox-clone-refactor.md](./specs/2026-05-14-lightbox-clone-refactor.md) の「実装方針」 §1-§5 を熟読

3. **clone host 要素を導入**: body 直下に `<div id="lightbox-clone-host" />` 常駐、 ここに clone を append (`.frame` の containing block 罠を完全 escape)

4. **open path 書換** ([Lightbox.tsx:705-820 周辺](components/board/Lightbox.tsx)):
   - 現 FLIP scale + radius interpolation を捨て、 clone を host に append → GSAP `to({ top, left, width, height })` の 4 値だけ animate
   - source card を `visibility: hidden` で隠す

5. **close path 書換** ([Lightbox.tsx:437-480 周辺](components/board/Lightbox.tsx)):
   - 同じ clone を逆向きに source rect へ animate
   - 最終フレームで clone remove + source visibility 復元

6. **内部 nav 書換** (wheel scroll で隣カード):
   - 現 clone を fade-out、 next card の clone を fade-in、 もしくは現 clone を next rect へ直接 animate で繋ぐ。 本家挙動を見比べて決定

7. **検証**:
   - mediaSlots ホバー切替が壊れていないか実機
   - customCardWidth の自由リサイズが壊れていないか実機
   - thumbnail healing が壊れていないか実機
   - close 角丸 AA 違和感が完全に消滅したか実機
   - tsc / vitest / build clean
   - 本番 deploy → ユーザー視覚確認

## 工数見積
2-3h 級 (E + F が前提に揃った効果)。 当初 4-6h 見積から圧縮。

## 着工 NG 条件
- ユーザーがセッション 22 deploy の動作を未確認のうちは clone refactor に進まない (= 角丸固定 / スライダーの体感を先に確認、 問題あれば revert 判断する)
