# Lightbox open/close anim — destefanis 方式 clone refactor spec

> **位置付け**: 次々セッション (= セッション 23 以降の専用セッション) で着工する Lightbox
> アニメーション本体のリファクタ。 セッション 22 で「角丸 24px fixed 化 (E)」 と「サイズ /
> ギャップスライダー化 (F)」 が完了したことで、 destefanis 本家とまったく同じ最小実装に
> 落とせる状態が整った。

---

## 背景

セッション 21 で Lightbox close の「角丸 AA 違和感」 を 3 段 (49f20d3 / 8e43648 /
cf6b8d1) で潰そうとして全て revert。 cf6b8d1 では destefanis 方式 (width/height +
position:fixed) を試みたが、 `.frame { will-change: transform }` が containing
block を作る罠で position:fixed が viewport 基準でなくなり崩壊。

revert 後、 destefanis 本家ソース (`github.com/destefanis/twitter-bookmarks-grid`
`app.js` L270-459、 local: `C:/Users/masay/AppData/Local/Temp/destefanis-app.js`)
を読破して核心パターンを把握:

- `lightboxClone = sourceCard.cloneNode(true)` を **document.body の直下に append**
  (= `.frame` の containing-block 罠を回避)
- `position: fixed` + `top/left` で source card 位置に重ねる
- `width` / `height` を **transform: scale ではなく直接** animate (= GPU resample
  による AA 差が完全に消える)
- `transform: translate3d` は位置補正のみに使う
- close は同じ clone を逆向きに走らせて、 最終フレームで source card を unhide

セッション 22 で:

- **E (角丸 24px fixed)**: カード全種・Lightbox の `--lightbox-media-radius` も
  24px に統一。 これで radius 変化ゼロ = `border-radius` を animate する理由が
  消滅、 本家と同じ「border-radius は静的、 width/height だけ動く」 構造に揃った
- **F (サイズ / ギャップスライダー)**: SizeLevel 5 段階を廃止、 連続 px 値に。
  カード幅は board-wide な 1 値 + 個別 customWidths 例外、 という構造が整理され、
  Lightbox 側で「source card のサイズ」 を取得するロジックがシンプルになった

---

## 目的

Lightbox の open / close / 内部 nav (wheel scroll で隣カード) **3 経路すべて**を
destefanis 方式に書き換える。 現在の FLIP (transform scale + 補正) を捨て、 width/
height + position:fixed の clone で動かす。

期待効果:

- close 時の「角丸 AA 違和感」 完全消滅 (radius 静的、 scale 不使用 = GPU resample
  ゼロ)
- open / close の体感が destefanis 本家と同じ「ぬるっと延びる」 感覚に
- コードが大幅シンプル化 (FLIP の補正計算群が削除可能)

---

## 保持必須 (= 触ってはいけない)

memory `project_allmarks.md` および AllMarks のコアバリューに直結する以下の機能は
**絶対に維持**する:

- **A**: ボードカードの mediaSlots ホバー切替 (`feedback_minimal_card_affordances`)
- **A**: 将来の動画同時再生 (`project_booklage_vision_multiplayback`)
- mediaSlots 周辺 (`components/board/cards/ImageCard.tsx` 等) の構造、 thumbnail
  healing (セッション 21 ship 済)、 自由リサイズ済カード (`customCardWidth=true`)
  の挙動

clone を作るのは **Lightbox 表示用の visual proxy のみ**。 元のカード DOM は
そのまま、 `visibility: hidden` で source card を隠して、 clone がそれを覆う。
従ってカード側のリッチ機能は一切影響を受けない。

---

## 実装方針

### 1. Clone 戦略

open 時:

```ts
const sourceCard = document.querySelector(`[data-bookmark-id="${id}"]`)
const clone = sourceCard.cloneNode(true) as HTMLElement
clone.style.position = 'fixed'
clone.style.top = `${rect.top}px`
clone.style.left = `${rect.left}px`
clone.style.width = `${rect.width}px`
clone.style.height = `${rect.height}px`
clone.style.zIndex = '...'  // Lightbox の上、 close button より下
document.body.appendChild(clone)  // .frame ではなく body 直下

sourceCard.style.visibility = 'hidden'  // 元を隠す

// GSAP で target width/height へ animate
gsap.to(clone, {
  top: targetTop,
  left: targetLeft,
  width: targetWidth,
  height: targetHeight,
  duration: OPEN_BASE_DUR,
  ease: 'power2.out',
})
```

close 時は逆向きの to で source rect に戻し、 最終フレームで clone を remove +
source card visibility 復元。

内部 nav (隣カード swipe) も同じ pattern — 現 clone を fade out しつつ next card
の clone を fade in する、 もしくは現 clone を next card の rect に直接 animate
で繋ぐ。 どちらが本家挙動に近いかは実装中に決定。

### 2. .frame containing-block 罠への対策

`document.body` に直接 append することで、 祖先の `transform` / `will-change:
transform` / `filter` などが作る containing block を完全に escape する。 これが
cf6b8d1 失敗の root cause だった。

ただし body 直下に append すると Theme / Z-INDEX 構造から外れる可能性があるので、
clone 専用の host 要素 `<div id="lightbox-clone-host" />` を body 直下に常駐させて、
そこに append する形が安全。

### 3. radius 静的 (border-radius animation 不要)

セッション 22 で `--card-radius` と `--lightbox-media-radius` がともに 24px に
統一済。 clone は cloneNode(true) で source の CSS variable をそのまま継承するので、
表示上 24px 角丸が保たれる。 width/height が変わっても **border-radius は数値変化
しない** → GPU resample による AA 差は構造的に発生しない。

### 4. 既存 Lightbox.tsx の reflow

現在の `components/board/Lightbox.tsx` は FLIP scale ベースで、 以下を含む:

- L437-470: close path の radius pre-tween + scale 補正計算
- L715-754: open path の radius interpolation + scale 補正計算
- `mediaEl` 直接 DOM 操作 + GSAP 多段 timeline

これらを clone-based に置き換える。 radius interpolation ロジックは丸ごと不要に
なるので削除。 FLIP scale 補正も削除。 残るのは width/height/top/left の 4 値の
GSAP `to` 1 つだけになる見込み。

### 5. テスト戦略

- 既存 vitest は Lightbox の open/close を JSDOM ベースで mock している箇所が
  あるので、 そちらは prop 入出力のテストとして維持
- 実際のアニメ動作は Playwright で手動視覚確認 (Visual Companion でフレーム比較)
- 退行検証: mediaSlots ホバー切替・自由リサイズ・thumbnail healing が壊れて
  いないか実機で確認

---

## 工数見積

セッション 21 時点では 4-6h と見積もったが、 セッション 22 で **E + F が前提に
揃ったため、 2-3h 級に圧縮見込み**。 内訳:

- clone host + open path 書換: 60-90 min
- close path 書換: 30-45 min
- 内部 nav 書換: 30-45 min
- 検証 + 微調整: 30-60 min

専用セッションを 1 本確保すれば完了する規模。

---

## 着工前の最終確認事項

専用セッションを開始したら、 以下を **着工前に**チェック:

1. master HEAD が セッション 22 (E + F) commit を含んでいる
2. `--card-radius: 24px` / `--lightbox-media-radius: 24px` が globals.css で
   揃っている (今回の commit で揃えた)
3. SizeSlider / GapSlider が動作している (本番 deploy 済)
4. 本家 destefanis app.js L270-459 を当該セッションでもう一度読み直す (時間
   が経つと細部を忘れる)
5. mediaSlots / customCardWidth / thumbnail healing の動作を着工前にスクリーン
   ショットで保存しておく → リファクタ後の比較用

---

## 参考リンク

- destefanis 本家: `https://github.com/destefanis/twitter-bookmarks-grid`
  `static/js/app.js` L270-459
- ローカル copy: `C:/Users/masay/AppData/Local/Temp/destefanis-app.js`
- セッション 21 失敗の経緯: `docs/TODO_COMPLETED.md` セッション 21 narrative
  (49f20d3 / 8e43648 / cf6b8d1 / 3f2115c)
- セッション 22 で揃った前提: `docs/CURRENT_GOAL.md` の A-G 合意
