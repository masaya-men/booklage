# 次セッションのゴール (= セッション 35)

## ゴール

**transform-scale FLIP を完成させる**。 セッション 34 で着手したが「角丸 20px 固定」 と「テキスト一緒に拡大」 の両方が未達 → 頭すっきり状態で再着手。

## 背景 (= 開始時にこれを読む)

セッション 34 で得た学び:

- **destefanis 本家は Motion One spring で transform:scale で拡大** (= 私たちの「A 案」 そのもの)
- 当時 (cf6b8d1 / session 23-24) は **radius 24→20 動的 morph + GPU AA の複合問題** で「角丸間に合ってない」 になり width/height tween に逃げた
- session 32 で全 radius 20px 統一済 = morph 不要、 残るは **GPU AA の subtle 差のみ** = 当時より A 案成功率高い
- user 判断: 「A 案再評価すべき」 → 試行 OK

セッション 34 で試した実装 (= rolled back):

- **v1** (= clone を MEDIA size、 scale-down 開始): ImageCard / Video OK、 TextCard は text 固定で jump
- **v2** (= clone を SOURCE size、 scale-UP 拡大): 理論上 LargeTextCardScaler 内部 transform と一致するはず、 加えて border-radius を毎フレーム `20 / scaleX` で逆補正
- user 確認: **テキスト jump 残り**、 **角丸が 20px に固定されず変動**
- 仮説: `gsap.getProperty('scaleX')` が想定通り動いていない可能性高

WIP の diff は `docs/private/session-34-flip-wip.diff` に保存 (= 116 行)、 そのまま貼り戻して微調整から始めるのが効率的。

## 開始時の動き

1. user と挨拶
2. `docs/private/session-34-flip-wip.diff` を読む
3. **角丸 20px 固定** を真っ先に直す = scale compensation の動作確認
4. 候補手段 (= まず 1 つ試して動作確認):
   - GSAP `modifiers` で scale 値を inject + radius を同じ tween 内で更新
   - 別の proxy object を同 tween に乗せて proxy.scale を radius 計算に使う
   - `getComputedStyle(clone).transform` を matrix parse して scale 取り出す
5. 角丸 OK 後に text grow 問題 (= v2 設計で text が想定通り拡大するかを実機確認)

## 角丸 fix の検証手順

実装したら playwright で animation frames を sample:

```js
// 6 frames during open
for (let i = 0; i < 6; i++) {
  const sample = await page.evaluate(() => {
    const clone = document.querySelector('[some clone selector]')
    if (!clone) return { found: false }
    const cs = getComputedStyle(clone)
    const t = cs.transform  // matrix(...) で scale 取り出せる
    return { transform: t, borderRadius: cs.borderRadius }
  })
  await page.waitForTimeout(60)
}
```

期待: **borderRadius が 20/scaleX で動的更新**されていること (= 視覚 radius は constant 20px)。

## 残課題 (= transform FLIP 完成後)

Item 2 / 4 (= テキストのみカードの構造再設計、 Lightbox 右エリア整理) は時間あれば。 transform FLIP 完成だけでも 1 セッション分の価値あり。

## 月末リマインダー (= 2026-05-31 約 2 週間後)

`allmarks.app` ドメイン取得確認。 残り約 2 週間。

## 引き継ぎ resources

- `docs/private/session-34-flip-wip.diff` — v2 実装の生 diff
- `docs/TODO_COMPLETED.md` セッション 34 セクション — 経緯と次の手段候補
- session 32 modifier revert (= Lightbox.tsx comment 内) — 整数 snap の罠
- cf6b8d1 commit message — GPU scale で躓いた当時の状況 (radius morph 同期問題)
