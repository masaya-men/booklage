# 次セッションのゴール (= セッション 24)

## ゴール
**Lightbox 動画カードの「カクッ」 を再生ボタン overlay 方式で根治**。 セッション 23
で B-#17 clone refactor を ship したが、 動画カード (YouTube 等) で open 時に
clone (= board サムネ) → `.media` (= iframe 黒帯) のジャンプが残った。 これを
LightboxMedia 改修 + Play ボタン overlay で根治する。

## 前提 (セッション 23 で揃った)
- B-#17 Lightbox clone refactor の open/close path が本番稼働中
- 静止画カードは instant swap で完璧、 close 角丸 AA 違和感は構造的消滅
- master HEAD: セッション 23 の 2 commit (slider fixes + B-#17 clone refactor)
- 本番 `booklage.pages.dev` deploy 済 (`428cef71`)
- spec [docs/specs/2026-05-14-lightbox-play-button-overlay.md](./specs/2026-05-14-lightbox-play-button-overlay.md) 完成済

## やること

1. **着工前チェック**
   - master HEAD に B-#17 commit が乗っているか確認
   - 本番動画カードで「カクッ」 を実機再現 → スクショ保存 (= 改修後の比較用)
   - memory `reference_youtube_iframe_api_limits` / `reference_tiktok_inline_playback` / `reference_instagram_inline_impossible` を読み直す
   - spec [2026-05-14-lightbox-play-button-overlay.md](./specs/2026-05-14-lightbox-play-button-overlay.md) を熟読

2. **Play overlay UI のデザイン方向性をユーザーと決める**
   - シンプル ▶ / ガラス系円 / SF 系十字 / 完全カスタム … 何系で行くか相談
   - hover / 押下のミクロ演出も含めて

3. **LightboxMedia の改修** (YouTube 最優先)
   - `mediaState: 'thumb' | 'playing'` の state 設計
   - 初期 `'thumb'`: board card と同じサムネ画像 (`object-fit: cover` + 同じ thumb URL) を表示
   - Play overlay を中央配置
   - クリック → `setMediaState('playing')` で iframe mount + autoplay (controls=1 維持)
   - サムネ → iframe の遷移時の小さな fade

4. **退行確認**
   - 静止画カードは触らない (instant swap で完璧、 既存挙動維持)
   - mediaSlots ホバー切替 / customCardWidth / thumbnail healing
   - close path は B-#17 のまま動くか (Play 押下後 → close でも壊れないか)
   - tsc / vitest / build clean
   - 本番 deploy → ユーザー視覚確認 (= 動画 open でジャンプが消えたか)

5. **TikTok / Instagram への展開判断**
   - YouTube だけ Phase 1 として ship するか、 動画系まとめて Phase 1 でやるか
   - TikTok は既存 inline playback ロジックを呼ぶ、 Instagram は link-out

## 工数見積
2-3h 級 (LightboxMedia 改修 + UI デザイン + 検証)。 YouTube のみ Phase 1 なら 1.5-2h。

## 着工 NG 条件
- ユーザーがセッション 23 の本番動作を未確認のうちは着工しない
- Play ボタンのデザイン方向性が未合意のうちは UI 実装に入らない

## 並行 backlog (= このセッション内で着手しないが、 終了時の TODO 整理で言及)
- B-#17-#3 internal nav の clone-based 移行 (中期)
- スライダー精度カスタム slider 実装 (= IDEAS.md "E. スライダー精度") — 装飾セッション
- 数字表記の遊び (130 → 0.0130 等) — 装飾セッション
- 論理キャンバス導入検討 (= IDEAS.md "G. 論理キャンバス案") — 別 spec
- 角丸 24 → 20 検討 (= B-#17 落ち着いたら視覚比較)
