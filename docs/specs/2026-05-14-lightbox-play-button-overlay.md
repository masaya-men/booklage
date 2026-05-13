# Lightbox 動画カード — 再生ボタン overlay 方式 spec

> **位置付け**: セッション 23 で B-#17 (Lightbox clone refactor) を実装した結果、
> 静止画カードは完璧に滑らかに開閉するようになったが、 動画カード (YouTube /
> TikTok / Instagram 等) では「カクッ」 と見た目が切り替わる問題が残った。
> その根治方法として、 ユーザー提案の「再生ボタン押すまでサムネ状態を維持」
> パターンを実装する。 別セッション専用 spec。

---

## 背景

B-#17 clone refactor 完成後の動作:

- **静止画カード**: board card のサムネ画像と Lightbox の `.media` は同じ画像なので、
  clone から `.media` への instant swap が不可視 (= 完璧)
- **動画カード (YouTube 等)**: board card は **サムネ画像をカードのアスペクト比で
  cover クロップ表示**、 Lightbox の `.media` は **YouTube iframe を 16:9 で表示
  (= 黒帯付き)**。 表示内容が物理的に違うので instant swap で「カクッ」 と切り替わる

cross-fade で滑らかにしようとしたが、 cross-fade 中は両方の opacity が 100%
未満になり、 後ろの backdrop (半透明) が透けて見える違和感が出るため不採用。

---

## 提案する解決方式

destefanis 本家 (`twitter-bookmarks-grid` `app.js` L312-355) と同じ思想:

> **動画カードは、 サムネ画像を下地として表示し、 ユーザーが Play ボタンを
> 明示的に押した瞬間に動画 iframe を mount する。**

これにより:
- Lightbox を開いた直後は board card のサムネと**完全に同じ見た目** (= clone と
  `.media` の境目が消える、 instant swap が不可視)
- ユーザーが「Play」 を押すまで iframe は mount されない (= 帯域 / バッテリー節約、
  意図しない自動再生なし)
- 「コラージュ感」 = 動画も静止画も同じ「画像カード」 として扱われ、 視覚統一感

---

## メリット

- B-#17 で残った「動画カクッ」 問題を **構造的に根治**
- 帯域 / バッテリー節約
- 意図しない自動再生なし (= 静かな UX)
- ユーザーが意思を以て動画再生 → 「自分で世界を作る」 AllMarks 思想と整合
- 将来の **動画同時再生** ビジョン (memory `project_booklage_vision_multiplayback`)
  と素直に統合 — Play ボタンを「ミックス開始」 のスイッチとして再利用可能

## デメリット

- ユーザーが動画見たい時に **+1 クリック** (= Play ボタン押下)
- 一瞬「動画なのに動かない」 と感じる人がいる可能性 (= Play ボタンが目立てば緩和)
- 実装規模 1 セッション級 (= LightboxMedia 改修 + state 設計 + UI デザイン)

---

## 対象メディア種別

実装優先順位:

1. **YouTube** (B-#17 で カクッが確認された) — 必須
2. **TikTok** (同様の iframe + 縦長アスペクト) — Phase 2
3. **Instagram Reel** (memory `reference_instagram_inline_impossible` で link-out
   方針が確定済 → Play ボタン押下で外部リンクに飛ぶ動作にする)
4. **Twitter video / animated GIF** — Phase 2
5. **音声系** (将来 SoundCloud 等) — Phase 3

---

## 実装方針

### 1. LightboxMedia の state 追加

```ts
// components/board/LightboxMedia.tsx (or similar)
type MediaState = 'thumb' | 'playing'
const [mediaState, setMediaState] = useState<MediaState>('thumb')
```

- 初期 state: `'thumb'` (= board card と同じサムネ画像を表示)
- Play 押下 → `setMediaState('playing')` で iframe mount + autoplay

### 2. サムネ表示部分

```tsx
{mediaState === 'thumb' && (
  <>
    <img
      src={thumbUrl}  // = board card と同じ thumb URL
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',  // board card と同じクロップ
        borderRadius: '24px',
      }}
      alt=""
    />
    <PlayOverlay onClick={() => setMediaState('playing')} />
  </>
)}
```

`object-fit: cover` で **board card と同じクロップ**が決め手。 これで clone (=
board card 由来) と `.media` の初期表示が**ピクセル単位で一致**する。

### 3. Play ボタン UI

中央配置の半透明ボタン。 デザイン候補:

- 半透明ガラス円 + ▶ 三角アイコン (LiquidGlass 系の薄いガラス質感)
- destefanis 本家 (`assets/play-icon.svg` + "Play on Twitter" pill) を参考
- AllMarks らしい個性を出すなら、 hover で微妙にゆらぐ / 押下で同心円リップル等

詳細デザインはこのセッションで一緒に詰める。

### 4. iframe mount 部分

```tsx
{mediaState === 'playing' && (
  <iframe
    src={getEmbedUrl(item.url) + '?autoplay=1'}
    style={{ width: '100%', height: '100%', border: 'none' }}
    allow="autoplay; encrypted-media"
    allowFullScreen
  />
)}
```

`autoplay=1` を URL に付与。 YouTube IFrame API limits (memory
`reference_youtube_iframe_api_limits`) に従い `controls=1` 維持。

### 5. State 遷移時の cross-fade

サムネ → iframe の遷移は LightboxMedia 内部で完結するので **両方とも opacity:1
固定**で重ねて、 iframe が `onLoad` で fade-in できる:

```tsx
<img style={{ opacity: mediaState === 'thumb' ? 1 : 0, transition: 'opacity 0.2s' }} />
{mediaState === 'playing' && <iframe onLoad={...} />}
```

backdrop の透けは Lightbox の `.media` の境界では発生しない (= サムネと iframe
が同じ `.media` 内に重なるため、 backdrop は media の後ろに留まる)。

### 6. Close での扱い

Lightbox 閉じる時:
- Play 押されていない場合 → 普通に B-#17 close (= clone を source rect へ animate)、
  iframe は mount されていないので問題なし
- Play 押されている場合 → iframe を unmount してから clone-based close を実行、
  もしくは clone を生成しつつ iframe を即 stop / unmount

close 時のサムネ復元: B-#17 の close clone は **源 source card** から作るので、
iframe → clone の swap は「iframe が消えて、 サムネ画像の clone が source rect
へ animate」 という流れになる。 「ピタっと止まって、 サムネが戻る」 感じ。

---

## YouTube IFrame API limits との整合

memory `reference_youtube_iframe_api_limits` 内容:
- `controls=0` 自製 UI では画質 / 字幕 / 関連動画選択ができないため `controls=1` 強制
- v70 で controls=1 戻し

→ Play 押下後の iframe は **controls=1** で mount する。 ユーザーが
画質 / 字幕 / フル画面を選べる状態にする。

---

## TikTok / Instagram への展開

- **TikTok**: memory `reference_tiktok_inline_playback` (Referer + Cookie + Sec-Fetch
  headers + session-bound URLs + 3-tier fallback) を経由してインライン再生
  実装済。 Play overlay 押下 → 既存 inline playback ロジックを呼ぶ
- **Instagram**: memory `reference_instagram_inline_impossible` でインライン
  再生は不可能と確定 → Play overlay 押下 → 外部リンク `window.open(url, '_blank')`
  で Instagram へ遷移。 link-out が明確なので「インライン再生想定して失敗」
  より UX クリア

---

## 工数見積

1 セッション級 (2-3h):
- LightboxMedia state 設計 + 改修: 60 min
- Play overlay UI デザイン + 実装: 45-60 min
- 動画系メディアごとの分岐実装: 30-45 min
- 検証 + 微調整: 30-45 min

YouTube だけ Phase 1、 TikTok / Instagram は Phase 2 として別セッションに分けても
良い (= 1 セッションで全部やると詰め込みすぎ)。

---

## 着工前の前提

このセッションを開始する時点で:

1. master HEAD に B-#17 commit が含まれている (= 静止画は instant swap で完璧、
   動画だけ Play 方式が必要、 という状態の確認)
2. 本番 `booklage.pages.dev` deploy 済
3. ユーザーが Play ボタンのデザイン方向性 (= シンプル / ガラス系 / SF 系 / その他)
   についてある程度希望を持っている
4. memory `reference_youtube_iframe_api_limits` / `reference_tiktok_inline_playback` /
   `reference_instagram_inline_impossible` を再度読み直す

---

## 関連

- `docs/specs/2026-05-14-lightbox-clone-refactor.md` — 親 spec、 B-#17 本体
- `docs/private/IDEAS.md` §H — このアイデアの最初の保管場所
- memory `project_booklage_vision_multiplayback` — 動画同時再生ビジョンとの統合
- destefanis 本家 `app.js` L312-355 (local: `C:/Users/masay/AppData/Local/Temp/destefanis-app.js`)
