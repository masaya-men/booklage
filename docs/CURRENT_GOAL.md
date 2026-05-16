# 次セッションのゴール (= セッション 30)

## ゴール

**ムードボードを全画面化する** (= 額縁付き destefanis homage から、 AllMarks 個性 = 「自分の世界」 表現への visual pivot)。 30 分で実装、 実機確認、 気に入らなければロールバック可能な小規模 sprint。

## 前提 (= セッション 29 で揃った)

- master HEAD: `feat/style/docs 6 commit shipped、 push 済`
- セッション 29 の主要成果:
  - ScrollMeter periodic full-scramble 実装
  - PrecisionSlider 新規 (= 自前 pointer-based slider、 マウス 1000px で min→max)
  - Gap 上限 60 → 300、 値は float 化
  - Chrome v4 legibility (= stroke 0.75px / 0.6 黒 + soft halo、 globals.css に token 集約)
  - ScrollMeter counter / FilterPill の括弧削除、 数字 brightness 統一
  - **Booklage → AllMarks rebrand 完了** (= 113 ファイル、 UI / i18n / 拡張 / docs / memory)
- 本番反映済 → `https://booklage.pages.dev` ハードリロードで最新
- vitest 488 / tsc / build clean

## セッション 30 の進め方

### Phase 1: ムードボード全画面化 (= 短時間、 必須)

実装スコープ (= 全部 CSS):

```diff
 :root {
-  --bg-outer: #ebebeb;
+  --bg-outer: #0a0a0a;   /* canvas と同色 = 視覚的に「全画面」 */
 }

 .canvas {
-  margin: 24px;
-  border-radius: 24px;
+  margin: 0;
+  border-radius: 0;
 }
```

`BoardRoot.module.css` / `BoardChrome.module.css` あたりを実機確認しながら調整。 カードの絶対座標は canvasWrap の内側基準なので変動なし。

### Phase 2: chrome (= ヘッダー / scroll meter) の位置検証

- TopHeader は viewport 上端絶対配置のはず → 全画面化でも問題なし、 検証だけ
- ScrollMeter は canvas 下端基準 → margin 0 で全画面化すると viewport 下端ぴったりになる、 体感確認

### Phase 3: 判定 + spec 更新

- 全画面が良い感触なら **Phase A → Phase C 切替宣言** を memory / spec に記録
- ロールバック判定なら revert で戻す (= 1 commit reverse、 1 deploy)
- `feedback_strict_reference.md` (= 「destefanis 忠実コピー、 個性は Phase C」) のフェーズ宣言更新

## セッション 31 (= その次) の予告

**autoplay + auto-cycle MVP**:
- 動画 autoplay (= `<video>` + YouTube IFrame、 mute、 IntersectionObserver)
- 複数写真 auto-cycle (= hover swap 機構 + 4-5 秒タイマー、 スタガー)
- 「表示オプション」 トグル UI 新規 (= autoplay / 背景タイポ 等)
- スコープ外: TikTok inline、 同時再生数の精密チューニング
- 既存「ユーザー mix」 ビジョンとは 2-layer 構造で整合 (= ambient mute / promoted unmute)

## 着工前読み込み

- `components/board/BoardChrome.tsx` + `.module.css` (= 額縁構造の中身)
- `components/board/BoardRoot.module.css` (= canvas / canvasWrap の margin / radius)
- `app/globals.css` (= `--bg-outer` `--canvas-margin` `--canvas-radius` 定義場所)
- メモリ `reference_destefanis_visual_spec.md` (= 「白外周 + 中央 dark canvas」 が destefanis、 これと別れる宣言になる)

## 触らない (= 短期スコープ外)

- ④ AllMarks pin (= 全画面化と並行して着手しても良いが、 まず全画面化判定が先)
- ⑥ 拡張機能 polish
- LP リデザイン
- B-#3 重複 URL バグ、 B-#7 サイジング縮小 clipping

## 月末リマインダー (= 2026-05-31)

**`allmarks.app` ドメイン取得確認**。 セッション開始時に user に確認を促す。 取得済 → Cloudflare Pages 新 project 作成・redirect 設定の sprint に進める。 未取得 → 取得を促す。
