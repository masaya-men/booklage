# Bookmarklet Final Polish — 設計書

**作成日**: 2026-05-09
**ブランチ**: `master`
**前提**: ブクマレット popup chrome (タイトル + アドレスバー) は技術的に消去不能。これを **天井** と認め、popup 内側を限界まで磨く方針。

---

## 1. 目的

現状のブクマレット save popup (240×130 / 中央 pill / 白背景にちらつき) を、**正方形 320×320 / 右下出現 / 黒背景フル + 中央演出 + サムネ背景化** に刷新する。「保存ボタンを押した瞬間に小さな儀式が始まる」レベルまで作り込み、ブクマレット路線の最終版とする。これ以降は Chrome 拡張 (Phase 1) → 一括インポート (Phase 2) → PiP (Phase 3) に投資先を移す。

## 2. ユーザー決定事項 (ブレスト確定済)

| Q | 決定 |
|---|------|
| サイズ | **320×320** (chrome 込みでほぼ正方形に見える) |
| 自動 close | 成功表示後 **1.5 秒** |
| 出現位置 | **画面右下** 20px 内側 |
| サムネ無し時 | **黒背景 + 微妙な radial glow + ✓ + テキスト** |

## 3. 全体フロー (タイムライン)

```
[t=0ms]      window.open() — 320×320, 右下, chrome 黒, 中身も最初から黒
[0→200ms]    ステージ A "Awaken": 中央リング (radial pulse) が opacity 0→1, scale 0.92→1.00
             "Booklage" wordmark が 8px 下から slide-up + fade-in
             ease: cubic-bezier(0.16, 1, 0.3, 1)
[200→Nms]    ステージ B "Save in progress": リングが slow rotate (linear 1.4s/loop)
             "保存中…" テキスト
[OGP 取れた] ステージ C "Reveal" (= 基準点 t'=0):
             - サムネがある場合: <img> が背景に absolute 配置で fade-in (250ms),
               object-fit: cover, filter: blur(6px) + brightness(0.55)
             - サムネ無しの場合: 黒のまま、中央に薄い radial-gradient glow を維持
             リングが消滅 + ✓ stroke-draw アニメ (300ms)
             "保存しました" テキストが文字単位 stagger fade-in (40ms ずつ)
[t'=+1250ms] ステージ D "Recede": 全要素 250ms で fade-out + scale 0.96
             サムネ背景は同 250ms で opacity 0
[t'=+1500ms] window.close()
             → ユーザーから見て「保存しました」が表示されてから消えるまで合計 1.5 秒

[エラー時]   ✓ の代わりに ! アイコン + "保存できませんでした" テキスト
             auto-close は 2.6 秒 (現状仕様継続)
```

## 4. ちらつき排除策 (4 つの原因を特定して個別に対処)

| 原因 | 対策 |
|------|------|
| **白フラッシュ** (popup 開いた瞬間の Chrome デフォルト白) | `app/save/layout.tsx` を新設し `<html style="background:#000">` `<body style="background:#000;margin:0">` を直書き。critical CSS を `<head>` 先頭で inline。Next.js の root layout には影響させない (route segment 単独 layout) |
| **hydration 中のレイアウトシフト** | SaveToast を SSR 完成形 markup として返す ('use client' のままで OK、SSR は Next.js が走らせる)。クライアントは state 遷移のみ担当。Suspense fallback も同じ黒背景に書き換え |
| **アニメ開始の jank** | GPU transform (`translate / scale / opacity`) のみ使用。`will-change: transform, opacity` を animated 要素に指定。layout-thrashing なプロパティ (width/height/top/left) アニメは禁止 |
| **window 開いた瞬間の resize** | `window.open` features で width/height/left/top を完全指定。open 後の `resizeTo()` 呼び出しなし |

## 5. ファイル変更一覧

### 5.1 新規

- **`app/save/layout.tsx`** (新規)
  - `<html lang="ja" style={{ background: '#000' }}>`
  - `<body style={{ background: '#000', margin: 0, padding: 0, overflow: 'hidden' }}>`
  - 既存 root layout (`app/layout.tsx`) は触らない (board 等への影響を避けるため)
  - Next.js の route segment layout 機能で、`/save` 配下のみ別 shell

### 5.2 変更

- **`lib/utils/bookmarklet.ts`** — `BOOKMARKLET_SOURCE` の `window.open` features を更新
  ```
  width=320, height=320
  left = screen.availWidth - 320 - 20  // 画面右下 20px 内側
  top  = screen.availHeight - 320 - 20
  ```
  - 旧: `screen.height - 154` で下中央。新: 右下絶対座標
  - 既存ユーザーは **再インストール必須** (これは前回も同じ問題、TODO に明記)

- **`components/bookmarklet/SaveToast.tsx`** — 構造を全面書き換え
  - `useTransparentPopupShell` を削除 (新 layout が黒背景を保証するので不要)
  - 新 markup:
    ```
    <div className={styles.stage} data-state={state}>
      {image && <img className={styles.bgThumb} src={image} alt="" />}
      <div className={styles.glow} />              {/* radial gradient overlay */}
      <div className={styles.center}>
        <div className={styles.indicator}>         {/* ring or checkmark */}
          {state === 'saving' && <Ring />}
          {state === 'saved'  && <CheckmarkDraw />}
          {state === 'error'  && <ErrorMark />}
        </div>
        <div className={styles.brand}>Booklage</div>
        <div className={styles.label}>{label}</div>
      </div>
    </div>
    ```
  - timer 値: 既存 `setTimeout(..., 600)` (saving→saved hold) は維持。close timer を **`saved` state set から +1500ms** に再調整。recede トランジション (250ms) は close timer の last 250ms とオーバーラップさせる (新たに `'recede'` state を追加し +1250ms で apply、+1500ms で `window.close()`)
  - 文字 stagger アニメは `<span>` 単位で `style={{ animationDelay }}` を付与

- **`components/bookmarklet/SaveToast.module.css`** — 全面書き換え
  - `.stage` — `position: fixed; inset: 0; background: #000; overflow: hidden;`
  - `.bgThumb` — `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(6px) brightness(0.55); opacity: 0; animation: bgFadeIn 250ms ease-out forwards;`
    - `@keyframes bgFadeIn { to { opacity: 1; } }` (state=saved 時のみ apply)
  - `.glow` — `position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 60%); pointer-events: none;`
  - `.center` — `position: absolute; inset: 0; display: grid; place-items: center; gap: 12px;` で縦中央
  - `.indicator` — 64×64px、ring は `border: 2px solid rgba(255,255,255,0.18); border-top-color: #fff; border-radius: 50%; animation: spin 1.4s linear infinite;`
  - `.checkmark` — `<svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7" stroke-dasharray="30" stroke-dashoffset="30" /></svg>` を 300ms で stroke-draw
  - `.brand` — `font: 600 16px/1 'Geist', sans-serif; color: #fff; letter-spacing: 0.02em;`
  - `.label` — `font: 400 13px/1 'Geist'; color: rgba(255,255,255,0.72);`
    - state=saved 時、文字単位 stagger は `.label > span:nth-child(N) { animation-delay: ${N * 40}ms; }`
  - `[data-state]` 切替で fade-in/out アニメを control
  - `[data-state="recede"]` (close 直前 250ms) で全体に scale 0.96 + opacity 0 トランジション

### 5.3 テスト

- **`components/bookmarklet/SaveToast.test.tsx`** — 既存テストを新 markup に追従
  - `data-testid="save-toast"`, `data-state` 属性を使ったアサーションは保持
  - 新規テストケース:
    1. `image` param がある時、`<img>` が render される
    2. `image` param が空の時、`<img>` が render されない (radial glow のみ)
    3. saved state で stagger 文字が `<span>` 単位で render される
    4. error state で error mark が出る
- **`tests/e2e/bookmarklet-save.spec.ts`** — 既存 E2E が通ることを確認 (壊れたら markup の test selector を調整)

## 6. アーキテクチャ図 (簡易)

```
[ source page ]
      │ click bookmarklet (javascript: URI)
      ▼
[ extractOgpFromDocument() ]
      │ build URLSearchParams { url, title, image, desc, site, favicon }
      ▼
[ window.open(/save?...&image=..., 320x320, 右下) ]
      │
      ▼
[ /save (route segment) ]
   │
   ├── app/save/layout.tsx       ← 黒背景 inline, ちらつきゼロ
   │      <html bg=#000><body bg=#000>
   │
   └── app/save/page.tsx
          <Suspense fallback={<DarkFallback />}>
            <SaveToast />
              ├── ステージ A→B: ring + brand
              ├── (IDB write & OGP image load)
              ├── ステージ C: bgThumb fade-in + checkmark draw + stagger text
              └── ステージ D: 1500ms 後に recede → window.close()
```

## 7. エラーハンドリング

- **画像 fetch 失敗** (CORS / 404 / hot-link block): `<img>` の `onError` で `display: none`、サムネ無し演出 (radial glow のみ) に degrade
- **IDB write 失敗**: 既存 `state='error'` 路線継続。エラーマーク + メッセージ + 2.6 秒で close
- **OGP image URL が空**: そもそも `<img>` を render しない (条件分岐)

## 8. パフォーマンス

- popup 起動から first paint まで: **< 100ms** (黒背景は inline style、外部 CSS 待機なし)
- ステージ A→B 遷移: **< 200ms** で完了
- IDB write 〜 ステージ C: **< 600ms** (現状の 600ms hold で吸収)
- close まで: 成功時 **save 完了から +600ms hold + 1500ms 表示 = ~2.1 秒**、エラー時 **2.6 秒**

## 9. アクセシビリティ

- `aria-live="polite"` を `.label` に付与 → state 変化を screen reader に通知
- ✓ アイコンに `role="img" aria-label="保存しました"` (既存仕様継続)
- アニメは `prefers-reduced-motion` を尊重: `@media (prefers-reduced-motion: reduce) { .indicator { animation: none; } .label > span { animation-delay: 0s !important; } }`

## 10. 非対応事項 (やらないこと)

- **PiP モード**: Phase 3 で別設計
- **拡張機能化**: Phase 1 で別設計
- **複数同時保存**: 1 popup = 1 保存 の現状仕様維持
- **自動 close を無効化するオプション**: ユーザー要望なし
- **サムネを blur せずクリアに見せる選択肢**: 現状の blur(6px) + brightness(0.55) で「ボヤけた背景」演出に統一

## 11. ロールバック計画

- 全変更が 4 ファイル (`SaveToast.tsx` / `SaveToast.module.css` / `bookmarklet.ts` / `app/save/layout.tsx`) に閉じる
- 問題が出たら git revert 1 発で前バージョンに戻る
- ブクマレット URI が変わるため、既存ユーザーは再インストールが必要 (前回 `9f43509` と同じ案内)

## 12. リリース手順

1. tsc + vitest + 既存 E2E 全 pass を確認
2. `pnpm build` で out/ 生成
3. `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true --commit-message="bookmarklet final polish"`
4. 本番 (`booklage.pages.dev`) にハードリロード → ブクマレット再ドラッグ → 任意サイトでテスト
5. テスト項目: ちらつきゼロ / 右下に出る / サムネ有り (例: GitHub README) と無し (例: docs.google.com) 両方 / 黒背景 / アニメ滑らか / 1.5 秒で auto-close

## 13. 残課題 (この後 Phase 1 へ持ち越し)

- ブクマレットの限界 (chrome 強制表示) は本設計で打開できない → **Chrome 拡張 v0** で解消
- iOS / Android 対応も未着手 → 拡張 + Web Share Target で別途設計
- PiP インボックスは Phase 3 (Chrome 116+ 限定だが体験は強い、メモリに idea 保管済)
