# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み
> デザイン参考資料は `docs/private/IDEAS.md`（非公開、gitignored）を参照

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `master` 単一運用
- **本番**: `https://booklage.pages.dev` に **v74 反映済**（ハードリロードで確認）
- **Service Worker**: `v72-2026-05-05-site-nav-header-footer-board-chrome`（SW 番号は次回 polish 時に更新）

### 🎯 今セッション (2026-05-06 朝, v73 → v74) の到達点

**Plan A 部分対応 + 受信側 URL バグ診断 UI 出荷**:

- **SharedView エラー画面に診断 UI を追加** ([components/share/SharedView.tsx](components/share/SharedView.tsx)) — 失敗ステージ / hash 長 / fragment 長 / decode 後 bytes / 先頭 4byte / 末尾 16byte / 解凍後 bytes / JSON 先頭 / raw error をすべて画面表示。受信者がスクショ送るだけで原因特定可能
- **decode.ts に詳細診断情報を返す DecodeDiagnostics 型を追加** ([lib/share/decode.ts](lib/share/decode.ts)) — 既存テストは `result.ok` のみ確認なので互換維持
- **ShareActionSheet に URL 長表示 + ESC 閉じ** ([components/share/ShareActionSheet.tsx](components/share/ShareActionSheet.tsx)) — 「URL 長: NNNN 文字」を表示し送受信側で比較可能、ESC は Composer と統一
- **「全部入れる」を toggle 化** ([components/share/ShareSourceList.tsx](components/share/ShareSourceList.tsx)) — 100% selected で「全部外す」に切替、`onClearAll` を ShareComposer に追加
- **Watermark 11px → 14px** ([lib/share/watermark-config.ts](lib/share/watermark-config.ts)) — paddingX 9→11, paddingY 4→5, borderRadius 4→5, margin 12→14, secondary 8.5→10 で全体スケール

### 🚨 次セッション最優先: 受信側 URL バグの診断手順

ユーザーに依頼:

1. ボードで普段通り Share → Composer → 「画像 + URL でシェア →」
2. ActionSheet に表示される **「URL 長: NNNN 文字」** を memo
3. 「URL をコピー」 → **別ブラウザ / シークレットウィンドウ** で開く
4. エラー画面が出たら、画面の **診断ボックスをスクショで送付**
5. 比較ポイント:
   - **fragment 長 + 3 ≒ 送信側 URL 長 - (origin + /share の長さ)** なら URL は無傷で届いている → encode/decode バグ確定
   - 不一致なら受信ブラウザ or クリップボード or 共有経路で truncation
   - 末尾 16byte の hex の最後 8byte が gzip footer (CRC32 + ISIZE)、ISIZE 値が小さければ正常 truncation 無し

### 🎯 前セッション (2026-05-06, v72 → v73) の到達点

**Share System sender flow 出荷 + ユーザー実機テストでバグ・改善項目発見**：22 commits / 235 tests / 本番 deploy 済み。

**完成して動作確認済み**:
- Toolbar の **Share ↗ pill** (hover で accent オレンジに変化)
- **ShareComposer モーダル** — タイトル / アスペクト 4 ピル切替 / 中央 frame / 下部 source 横スクロール / 確定 outline CTA
- **ShareActionSheet** — PNG プレビュー + DL / Copy URL / X intent
- **PNG 出力** — ウォーターマーク右下 (Variant A、`Booklage` 11px)
- 全色 `--share-*` CSS 変数化（`app/globals.css` `:root` で集中管理）
- 受信側 `/share#d=...` ルート（view-only 表示、左下に `Booklage で表現する ↗` リンク、import ボタンは未実装）
- E2E sender flow `tests/e2e/share-sender.spec.ts` 1 passed
- `dom-to-image-more` の SSR クラッシュを dynamic import で回避

**実装プラン**: `docs/superpowers/plans/2026-05-06-share-system.md` （Phase 1-6, 26 タスク、うち 21 完了）

### 🚨 緊急バグ（次セッション継続）

**Plan A 残作業**:

1. **【致命的】 受信側 URL「シェアデータが破損しています」バグ — 診断 UI 出荷済 (v74)**
   - 2026-05-06 解析: Node `zlib.gunzipSync` で `Z_BUF_ERROR` = gzip 末尾 truncation 確定
   - **v74 で診断 UI 出荷**: 受信側エラー画面に hash 長 / fragment 長 / 失敗ステージ / 末尾 16byte hex / raw error を表示。送信側 ActionSheet に URL 長表示
   - **次セッション**: ユーザー実機テスト（送信側 URL 長 + 受信側スクショ）→ 真因特定 → 修正
     - fragment 長 ≒ 送信側 URL 長 - 35（origin + /share の長さ）なら無傷 → encode/decode バグ → `pako` 等への置換検討
     - 不一致なら受信側 truncation → ブラウザ or 共有経路の問題
   - 既知の壊れ URL `/share#d=invalid` でのエラー画面表示は OK

2. **Composer の見た目欠陥（次セッション最優先、規模大）**
   - **カードが枠から切れる / スクロールしない** → アスペクト切替時に column-masonry を **枠サイズ基準で再計算** して reflow させる必要あり
   - **カード並び替え・サイズ変更不可** → ShareFrame に編集 layer 追加 (board の InteractionLayer 簡易版、drag / S/M/L / 削除)
   - 「シェア時の見た目に直結する」とユーザーから明言、シェア体験の質に直結するので必須
   - brainstorming → plan → 実装 で 1 セッション丸ごと使う規模

3. ~~**細かい改善 3 件**~~ — **v74 で完了**
   - ✅ 「全部入れる」ボタンを toggle 化
   - ✅ ウォーターマーク 11px → 14px
   - ✅ ShareActionSheet ESC キー閉じる

### 🆕 別タスクとして登録（後回し OK、Plan A の後）

- **AdSense / Amazon Associates 申請** — マーケページ + Share 機能が揃った。`docs/private/launch-plan-2026-04.md` 参照
- **受信者側 import フロー** — ユーザー曰く「matching-app 風振り分け」UX を希望。`superpowers:brainstorming` で UX 詰めてから実装。`lib/share/import.ts` (Task 4.1) と `<ImportConfirmModal>` (Task 4.2) は未実装、deferred
- **i18n プロジェクト全体の多言語化** — share だけでなく Toolbar / Lightbox 等すべて日本語ハードコード。15 言語対応のため別タスクで一括 messages/*.json 化が必要（spec 上 next-intl / i18next 想定）
- **Source list のタグ絞り込み / タグ単位シェア** — タグ機能 (mood) がボードで成熟してから検討、post-launch
- **サービス名再考** — Booklage で OK か別 brainstorming で確認したい
- **B1: スライダー型カード拡縮** — 連続値 80-480px、masonry 滑らか追従
- **絞込機能（動画/写真/テキスト）** — FilterPill 拡張、半日
- **同時再生機能（B1）** — IFrame API loader を commit 1cee968 から復元
- **ゴミ箱 / 復元 UI** — archive フィルタ既存、UI polish のみ

### 🆕 別タスクとして登録（後回し OK）

- **サービス名再考** — Booklage で OK か別 brainstorming で確認したい（Share 完了後に実施）。memory `project_booklage.md` 更新可能性あり
- **B1: スライダー型カード拡縮** — 個別カードを連続値スライダーで滑らかにリサイズ。S/M/L 離散値ではなく 80px-480px 連続値。masonry が滑らかに追従する必要あり。Share とは別タスク
- **絞込機能（動画/写真/テキスト）** — Toolbar の FilterPill 拡張で実装可、半日
- **同時再生機能（B1）** — IFrame API loader を commit 1cee968 から復元して使う
- **ゴミ箱 / 復元 UI** — archive フィルタは既存、UI polish のみ

### 触らないもの（テーマ用に保管）
- `lib/glass/presets.ts` / `components/ui/LiquidGlass.tsx` / `components/ui/GlassPill.tsx`
- `lib/glass/displacement-map.ts` / `/glass-lab`

---

### 🎯 前セッション (v69 → v70) の到達点

**YouTube IFrame API + 自製 hover-only controls を試して revert** (v69 → v70):

- **v69** ([commit 1cee968](https://github.com/masaya-men/booklage/commit/1cee968)): IFrame API singleton loader (`lib/youtube/iframe-api.ts`) + 自製コントロール (`components/board/embeds/YouTubeEmbed.tsx` + `.module.css`) を新規実装。`controls=0` で native chrome を完全 OFF、上端タイトル + 下端 progress (赤) / 再生停止 / 音量 / 時間 / YouTube ロゴ link / 全画面 を 140ms hover fade で重ねる。再生中・一時停止中問わず leave 即消えを実現
- **問題**: ユーザー要望「画質変更 / 字幕 / 関連動画 / もっと見る もすべて純正と同じに使えてほしい」と判明。これは `controls=0` 自製路線では実装不可:
  - `setPlaybackQuality` は 2018 年に effective deprecated、YouTube 内部が回線/画面で自動決定
  - `loadModule('captions')` は public API でなく不安定
  - 関連動画 / カードは iframe 内 chrome、外から制御不可
- **v70** ([commit f109599](https://github.com/masaya-men/booklage/commit/f109599)): v69 を完全 revert。native iframe (`controls=1`) + autoplay の v68 構成に戻し。純正機能 100% 利用可能、leave 時の即消えは断念 (native auto-fade 3秒 + 一時停止時は中央 ▶ + 関連動画タイル永続表示)

**v69 のコード回収方法**:
- `git checkout 1cee968 -- components/board/embeds/ lib/youtube/`
- `git show 1cee968:components/board/Lightbox.tsx > /tmp/lightbox-v69.tsx` で旧 import + 配線を参照
- 将来 **B1 同時再生機能** (memory `project_booklage_vision_multiplayback.md`) で IFrame API loader が必要になれば、`lib/youtube/iframe-api.ts` だけ復元すれば即使える

### 🔥 次セッション最優先: ユーザーの次の指示待ち

YouTube の挙動はこれで confirmed (純正路線確定)。次の作業候補:
- **絞込機能** (動画 / 写真 / テキスト)
- **同時再生機能 (B1)** — Booklage の差別化機能、IFrame API loader を復元して使う
- **ゴミ箱 / 復元 UI** (右クリック削除した bookmarks の復活)
- **B1 装飾レイヤー全般** (カード装飾、スプリング物理、3D タイル等)
- **広告戦略 Phase 1 着手** (`docs/private/launch-plan-2026-04.md`)

---

### 🎯 前セッション (v60 → v68) の到達点

**広告戦略の方針シフト確定** (`docs/private/launch-plan-2026-04.md`):
- 「広告は最大化、世界観は完璧維持」の 3 phase
- Phase 1: board 広告ゼロ、サイトページ AdSense + 自動 affiliate
- Phase 2: Pro サブスク導入 + board に ad-card mode (無料ユーザーのみ)
- Phase 3: ad-card mode を Curated Ad Card (Prada 等の direct 契約) に置換
- 詳細: `docs/private/IDEAS.md` の Curated Ad Card 構想セクション

**LiquidGlass はテーマ機能扱いに格下げ** (project memory `project_liquidglass_as_theme.md`):
- Phase A (destefanis-strict) には refraction が richful すぎてミスマッチ
- Toolbar / Lightbox 再生ボタンから削除、コードは保管
- 今セッションの蓄積: shape-aware refraction / glass-pill preset / rim mask / soft shadow / `<GlassPill>` wrapper / data-testid prop 追加 — すべて再利用可能で残置
- 将来「glass theme」キーで一括 enable できる構造を Phase C 装飾フェーズで整える

**flat editorial chrome (Phase A α 路線、v66)**:
- Toolbar (FilterPill / DisplayModeSwitch): text-only pill、opacity 0.72 → 1 hover、letter-spacing 0.01em
- Lightbox 再生ボタン: rgba(0,0,0,0.55) flat disc + 0 6px 28px shadow、hover scale 1.05

**Lightbox open animation 質感アップ (v66)**:
- Main scale tween: 0.7s power4.out → 0.85s expo.out (より aggressive な deceleration、weighted arrival)
- Opacity: 0.35s power2.out → 0.45s power3.out
- Motion blur: max 5 → 7 px、duration 0.45s → 0.55s
- Backdrop: 0.22s → 0.45s power2.out (slower envelopment)
- Apple HIG / Linear / Vercel 流の layered timing

**v67 → v68 で revert** (YouTube URL params の noop 変化):
- v67 で `rel=0&modestbranding=1&iv_load_policy=3` を試したが視覚的にほぼ変化ゼロ → v68 で削除
- 真ん中のでかい一時停止ボタンは URL params では消せない (YouTube 側管理)

### 🔥 次セッション最優先: YouTube IFrame API 化

ユーザー要望: 動画再生時の YouTube chrome (中央の停止ボタン、上下バー) を真の hover-only にしたい。+ 画質を 1080p+ に request したい。

**実装方針** (次セッション):
1. `https://www.youtube.com/iframe_api` をロード → `YT.Player` インスタンス化
2. iframe URL に `controls=0` を加えて native chrome を完全非表示化
3. 自前の控えめなコントロール UI (再生/停止/seek/音量/全画面) を Lightbox iframe wrap に重ねて作る
   - flat editorial 路線 (Phase A α) に揃える、控えめなオーバーレイ + hover でだけ表示
4. `setPlaybackQuality('hd1080' or 'hd1440')` を click 時に呼ぶ (YouTube が override する場合あり、それは仕様)
5. **コスト ゼロ、API key 不要**、Google 公式 (IFrame API は YouTube Data API v3 とは別物)
6. 影響範囲: YouTube embed のみ、TikTok / Instagram は別問題で今回は触らない

**技術メモ**:
- IFrame API ref: https://developers.google.com/youtube/iframe_api_reference
- 一時停止状態でも overlay 全消し可能 → Phase A α と相性◎
- 将来の simul-view (B1 同時再生) でも自製プレイヤー基盤として再利用可能
- TikTok / Instagram も同様の API があれば応用検討

### 触らないもの (確認)
- ✅ `lib/glass/presets.ts` (lens-magnify / glass-pill 数値保護)
- ✅ `components/ui/LiquidGlass.tsx` (本体)
- ✅ `components/ui/GlassPill.tsx` (auto-fit wrapper)
- ✅ `lib/glass/displacement-map.ts` (shape-aware refraction)
- ✅ `/glass-lab` (チューニング page)

→ すべて将来の glass テーマ用に保管。デフォルト chrome からは外したが、コードは残してある。

### 🎯 今セッション (v48 → v59) の到達点

**Lightbox の richness 実験は v50 で全部捨てて v47 baseline に戻した**:
- v48-v49 で box-shadow growth / back.out elastic / control pop / dynamic transformOrigin 等を試したが、ユーザーが「狙ったような出方じゃない / バウンドも要らない / 中身の反射も画質粗い」と判断 → v50 で v47 motion (motion blur + 3D tilt + power4.out) に revert
- 残ったのは **`.media` の border-radius + position relative** と **backdrop の CSS transition 削除** (どちらも視覚に出ない土台のみ)

**Lightbox UX 改善**:
- v51: **Instagram → poster + 「Instagramで開く ↗」link-out** (Meta は embed iframe で再生不可、技術的に inline 不可能)。caption text の dedup parser、`.text` panel に thin scrollbar
- v51: caption の OGP boilerplate (`<handle> - Instagram: "<caption>"` / `<date>, <likes> likes - <handle>: "<caption>"`) を strip して byline + caption + meta footer の 3 段表示に
- v53: TikTok を inline iframe に戻す (v52 で性急に link-out 化したのを撤回)、右クリック削除の修正 (drag handler が button 0 以外も pointerCapture してた → contextmenu イベント奪われてた → `if (e.button > 0) return` 追加)
- v55-v57: **TikTok を YouTube/X 並みに inline 再生**:
  - `functions/api/tiktok-meta.ts`: 公開ページ HTML から `__UNIVERSAL_DATA_FOR_REHYDRATION__` 抽出 → playAddr 取得
  - `functions/api/tiktok-video.ts`: mp4 を Referer + tt_chain_token cookie 付きで proxy
  - 3-tier fallback: scrape success → clean `<video>` / scrape failure → 既存 iframe / 全ダメ → text panel の sourceLink
  - v56 で **cookie 転送** (`headers.getSetCookie()` → `c=` query param → upstream Cookie ヘッダ) を追加して 502 解消
  - v57 で diagnostic ヘッダ (`X-Upstream-Status`) と Sec-Fetch-* 強化 → ユーザー実機で再生成功

**カード視覚言語の整理**:
- v54: TikTok のサムネ修正 (oEmbed thumbnail を BoardRoot で backfill して IndexedDB に永続化、TikTok ロゴ → 動画フレーム)
- v54: LiquidGlass の displacement map を **3x supersampling 強制** (was: cap 2x のみ → 1x display で blocky だった)
- v58-v59: 全動画への play overlay 試したが「うっとおしい / ダサい」→ **全削除して、ホバー時のみ S/M/L 隣に小さい `MediaTypeIndicator` (video/photo アイコン)** に置換
- 残った IG reel 専用 tint (`filter: brightness(0.86) saturate(0.92)` + radial dark gradient): IG が JPEG に焼き込んでる play アイコンを沈める専用 (削除しない)

**データ層追加** (将来の絞込/同時再生用):
- `BoardItem.hasVideo?: boolean` — Twitter video の判定持たせる (tweet syndication backfill が自動セット)
- `lib/utils/url.ts` の `isInstagramReel()` helper
- 写真/動画は `urlType + hasVideo + thumbnail` から実行時に derive (新規永続フィールド不要)

**右クリック削除**:
- v52 で実装、v53 で drag handler の pointer 奪い問題を修正 → 動作確認済
- 確認 dialog なし (ユーザー指定: 「とり急ぎなので右クリック即削除でよい」)
- soft delete のみ (`isDeleted` フラグ)、復元 UI は未実装

### 🔥 次セッション最優先: ユーザーの次の指示待ち

セッションを締める段階。次の作業候補としては:
- **絞込機能** (動画 / 写真 / テキストでフィルタ — `deriveMediaType` を流用すれば実装容易)
- **同時再生機能** (ボード上で複数動画を同時再生 — Booklage の差別化機能、過去 memory 参照)
- **ゴミ箱 / 復元 UI** (右クリック削除した bookmarks の復活手段)
- **Lightbox 演出** (今回 revert したので別アプローチが必要なら再検討)
- **B1 装飾レイヤー全般** (カード装飾、スプリング物理、3D タイル等)

### 🚧 触らないものの再確認 (絶対に弄らない)
- ✅ `lib/glass/presets.ts` (`lens-magnify` プリセット)
- ✅ `components/ui/LiquidGlass.tsx`
- ✅ Glass Lab (`/glass-lab`)
- ⚠️ `lib/glass/displacement-map.ts` は v54 で 3x supersampling 強制に変更済 (ユーザー許可済)

### 🅐 R3F shader FLIP (凍結継続)
- v46 で scaffolding、v47 で `SCENE_ENABLED = false` 固定
- ユーザーの今後判断次第で復活させる際の必須対応:
  - CORS proxy (`functions/api/img-proxy.ts`): thumbnail を server-side fetch + relay
  - Safety timeout: scene mode 起動後 1.5s 以内 onComplete 来なければ強制 frame 表示
  - Texture pre-check: scene 起動前に thumbnail crossorigin で先読み
  - Reduced motion fallback: `prefers-reduced-motion: reduce` 時 CSS FLIP 強制

### 🎯 Task 31 + UI polish 完了サマリー (2026-05-04)

**v32**: Lab 構築 + `lens-magnify` 確定 + 共通 `<LiquidGlass>` コンポーネント + Lightbox に適用
**v33**: Lab tuned 値を完全復元 (dead-code 整理を撤回) + filter region 300% 拡大
**v34**: play button reveal animation (`canplay` → ぽよん表示) + close styles トークン化
**v35**: 多重イベント監視 (canplay 不十分問題)
**v36**: rAF networkState polling に切替 (event 取りこぼし対策)
**v37**: Chrome native overlay play button を CSS で suppress
**v38**: preload="auto" + readyState >= 4 厳格化 + close button を **plain ✕** に変更 (LiquidGlass 撤去、ユーザー指定)
**v40**: close button の auto-focus 削除 + `:focus-visible` のみ ring 表示 (programmatic focus で枠出ないように)

**確定したリキッドグラスの設計思想 (将来も継承)**:
- **本質はレンズ屈折** (kube.io frog 風の Map B 拡大)。ぷるぷる水玉変形は **本質ではない**
- **子要素は backdrop-filter を通らない** ので、ガラス内側に icon/text を置けば歪まない
- **完全透明トリオ**: `bgAlpha=0` / `saturate=1` / `blurStdDev=0` を維持
- **黒ずみ主犯**: `feColorMatrix saturate>1` / `specularMaxAlpha` 高すぎ — 両方 0 で解決
- **小さなボタンには glass を当てない**: 36px close は plain ✕、92px play は full LiquidGlass、card 用は将来別 preset

**検証**: tsc EXIT=0 / vitest 209 PASS / pnpm build 成功 / 本番 deploy 完了 / Playwright で挙動確認済 (focus ring / 動画 polling timeline)

### 🚧 次フェーズ候補 (Spinner 問題後にユーザー判断)

- **`card-rect` プリセット** — B1 装飾フェーズで Lab を使って詰める (角丸長方形 / カード hover)
- **`cursor-lens` プリセット** — 将来テーマ。R3F or HTML in Canvas で別途検討
- **B1 全体 (装飾レイヤー) 着手** — カード装飾、スプリング物理、3D タイル演出

---

### 💡 アイデア memo: HTML in Canvas (3D / WebGL 演出フック)

「HTML in Canvas」(react-three-fiber `<Html>` / Three.js `CSS3DObject` 等) を使うと、HTML 要素を 3D シーン内に配置して視差・屈折・depth・流体歪みなどを掛けられる。Lightbox など single-element の polish には過剰だが、以下の領域では効果的:

- **テーマ別ボード演出**: テーマごとに 3D 背景 (シェーダ) + HTML カードがその上に浮かぶ。スクロールで世界観切替
- **ブクマ整理 (マッチングアプリ風 swipe UI、要件再確認待ち)**: カードを 3D で奥行き手前に出し、swipe でフェード+回転して視覚的に "去っていく" 体験
- **スクロールで unique に消える表現**: HTML カードを WebGL で歪ませながらフェードアウト、紙が燃える / 水で滲む / 粒子化など

実装着手前に: (a) どこで使うかをロードマップ化、(b) 初手は小さく (1 画面・1 演出) で実験、(c) パフォーマンス予算を測ってから本採用、の順で。

---

### 🎯 Task 30 完了 (2026-05-02 v25)

**真因**: Lightbox の tweet 専用 lazy backfill effect ([components/board/Lightbox.tsx](components/board/Lightbox.tsx)) が `persistThumbnail` を呼ぶ → `setItems` で items 配列 reference が新規化 → BoardRoot の `lightboxItem` (useMemo) が新 reference → Lightbox の `item` prop 変動 → effect 再発火、**無限ループ**。GSAP open animation も同 dep で巻き込まれ、opacity 0→1 が周期的に繰り返されることで「tweet が薄く透ける / 点滅する」とユーザーには見えていた。YouTube は `tweetId` ガードで早期 return し無傷。

**修正 (commit `5a7c98e`)**:
1. `Lightbox.tsx`: lazy backfill effect 削除、persistThumbnail prop 除去、effect deps を `item` (object) → `bookmarkId` (string) に変更
2. `BoardRoot.tsx`: <Lightbox> への persistThumbnail 渡し削除 (BoardRoot の bulk backfill effect が引き続き全 tweet 処理)
3. `use-board-data.ts/persistThumbnail`: 「同値なら no-op」ガード追加 (defense in depth)
4. SW CACHE_VERSION → `v25-2026-05-02-task30-lightbox-rerender-loop-fix`

**検証**: vitest 206/206 PASS、tsc EXIT=0、pnpm build OK、本番デプロイ済 (`booklage.pages.dev`)。
**ユーザー側の確認待ち**: ハードリロード後に tweet card クリック → Lightbox が点滅せず安定表示されること。

---

- **🎯 v24 (2026-05-02) — Lightbox UX 修正**:
  - backdrop opacity 0.5 → 0.78、blur 6 → 12px
  - tweetWrap を transparent → solid #15202b + 1px subtle border + lift shadow
  - react-tweet root にも background: #15202b !important で念押し override
- **🎯 v22-v23 (2026-05-02) — Twitter syndication 完全動作 (Task 29)**:
- **🎯 v22 で真の解決 (2026-05-02)** — CORS 問題を Cloudflare Pages Function proxy で完全突破:
  - 真因: `cdn.syndication.twimg.com` は `Access-Control-Allow-Origin: https://platform.twitter.com` 限定 CORS。client-side fetch は **絶対不可能**
  - 修正: `functions/api/tweet-meta.ts` を新規作成 (server-side で computeToken → syndication CDN へ server-to-server fetch → CORS は適用されない → response に Access-Control-Allow-Origin: * 付けて relay)
  - `lib/embed/tweet-meta.ts` を proxy endpoint (`/api/tweet-meta?id=...`) に切り替え、computeToken は server side に移動
  - **memory 追加**: `reference_twitter_syndication_cors.md`
- **🎯 v23 で本番化 (2026-05-02)**:
  - BoardRoot に `processedTweetIdsRef` を追加して同 tweet の再 fetch を防止 (effect が items.length 変化で再起動しても dedupe される)
  - デバッグ用 console.log を全削除 (本番クリーンアップ)
- **🎯 v20 で入れた追い込み (2026-05-02)** — 全 X bookmarks が「SEE WHAT'S HAPPENING」に化けていた致命問題を解決:
  - 真因: bookmarklet が X 個別 og:image を取れず、X 全体の generic OGP placeholder (`abs.twimg.com/...`) を全 tweet bookmark に一律保存していた
  - 修正: `isXDefaultThumbnail()` helper (`abs.twimg.com` URL 検知) を `lib/utils/url.ts` に追加
  - `persistThumbnail` に **force option** 追加 (既存上書き許可)。default は no-op (good og:image を破壊しない安全装置)、force=true で X default や empty 上書き OK
  - **BoardRoot mount 時に bulk backfill effect**: items load 後、tweet で thumbnail が X default のものを順次 fetchTweetMeta → photoUrl/videoPosterUrl で persistThumbnail(force=true)。200ms throttle、cancelled flag で unmount 安全
  - **photoUrl も videoPosterUrl もない (text-only tweet)** は thumbnail を `''` で上書き → pickCard で TextCard 振り分けに切り替わる
  - Lightbox の lazy backfill も force=true に変更 (Lightbox 内 view で同じく X default 上書き)
- **🎯 Task 29 完了 (2026-05-02 v19)** — Twitter (X) で動画/画像/本文/著者が全部見える状態に完全修復:
- **🎯 Task 29 完了 (2026-05-02 v19)** — Twitter (X) で動画/画像/本文/著者が全部見える状態に完全修復:
  - **真因確定**: bookmarklet が X.com から og:image を取れない (X は SPA で og:image を head に置かない)。これにより v17/v18 では `item.thumbnail` が空 → Lightbox が placeholder のみ → 「画像が見えない」「parseTweetTitle がブレる」が複合発生していた
  - **Phase 1**: Lightbox の tweet 分岐に **react-tweet を復活**。card 上では使わない (v17 で削除した re-render storm 対策はそのまま) が、Lightbox は 1 個だけなので problem-free。動画再生 / 画像 / 本文 / 著者 / actions を react-tweet が直接 render
  - **Phase 1.5**: Lightbox open 時に **lazy syndication API fetch** (`cdn.syndication.twimg.com`)。response から `photoUrl` / `videoPosterUrl` を抽出 → `persistThumbnail` で IndexedDB の bookmark.thumbnail を上書き保存 → 次回 reload で card 上が **TextCard → ImageCard に振り分け変更** + ImageCard の natural aspect 計測で縦長画像も正しい縦長 thumbnail で表示される
  - **TweetMeta 拡張**: `photoUrl` (photos[0].url) / `videoPosterUrl` (mediaDetails[video].media_url_https) を返すように parser 拡張、tweet-meta.test.ts に photo/video テスト 2 件追加
  - **新 hook**: `useBoardData.persistThumbnail(bookmarkId, thumbnail)` — 既に thumbnail がある bookmark には no-op (bookmarklet が拾えた og:image を上書きしない安全装置)
  - **削除**: `parseTweetTitle` と Lightbox の tweet 専用 layout (.tweetText, .tweetAuthor, .tweetMeta)。react-tweet が author/text を直接出すので不要に
  - **CSS**: `.frameTweet` (centered column 600px max), `.tweetWrap` 復活 (X dark theme + scrollable + Geist font 適用)
- **🎯 v18 で入れた追い込み (2026-05-02)**:
- **🎯 v18 で入れた追い込み (2026-05-02)**:
  - ImageCard / VideoThumbCard に img onload aspect 再計測 (`naturalWidth/naturalHeight`) → persistMeasuredAspect。**旧 TweetCard 由来の縦長 aspect が原因の card 巨大化を自動修正**
  - Lightbox frame grid `auto minmax(...)` → `1fr 320px` (auto 列 0 圧縮で media 消失していた問題解消)。media `display:flex; justify-content:center`、img `object-fit: contain`
  - Lightbox に **tweet 専用 layout**: 「Xユーザーの○○さん:「内容」/X」 / 「○○ on X: 内容」を parse して `text + author` に分離して表示。`.tweetText` `.tweetAuthor` `.tweetMeta` CSS 追加
  - `--font-sans` chain 強化: `Yu Gothic UI / Yu Gothic / Hiragino Sans / Hiragino Kaku Gothic ProN / Meiryo` を追加。Geist が CJK 含まないため日本語が serif fallback (MS Mincho) に落ちていた問題対策
  - dark canvas 上下に **scroll affordance fade** (linear-gradient 64px、`.fadeTop` `.fadeBottom`)
  - memory `reference_destefanis_visual_spec.md` 修正: 「フル画面 dark canvas」→「白外周 + 中央 framed dark canvas」が真の destefanis 仕様であることを記録
- **🎯 Task 28 完了 (2026-05-02 v17)** — destefanis 完全コピーから離脱、ユーザー要望ベースの「白外周 + 中央 dark canvas が浮かぶ枠デザイン」に転換:
- **🎯 Task 28 完了 (2026-05-02 v17)** — destefanis 完全コピーから離脱、ユーザー要望ベースの「白外周 + 中央 dark canvas が浮かぶ枠デザイン」に転換:
  - **画面構成変更**: body 全体 `--bg-outer: #ebebeb` (白外周)、`--canvas-margin: 24px` 余白で中央に `border-radius: 24px` の dark canvas が浮かぶ。canvas 内に masonry + Toolbar、外側 margin はクリーン
  - **Sidebar 完全削除**: BoardRoot から `<Sidebar>` render とすべての Sidebar 関連 state/handlers を削除 (sidebarCollapsed, handleSidebarToggle, handleCreateMood, handleTriageStart, F キー toggle)。Sidebar.tsx ファイルは将来再利用想定で残置 (orphan)
  - **Toolbar position fixed → absolute**: canvas 内右上 (24/24) に固定、canvas からはみ出ない
  - **pickCard 振り分け変更**: tweet URL も image があれば `ImageCard` / なければ `TextCard`。TweetCard component (react-tweet 描画) は使われなくなり削除。pickCard test に tweet 振り分け 2 件追加
  - **Lightbox tweet 分岐削除**: react-tweet import 廃止、tweet も image/website と同じ thumbnail-or-placeholder で表示。tweetWrap CSS 削除
  - **TweetCard.tsx + .module.css 削除**: react-tweet の重い intrinsicHeight 計測ロジック (4 タイマー safety net 含む) 完全廃止 → 全 card 内 tweet による re-render storm リスクが消滅
- **⚠️ UX 退行 (要対応)**:
  - 既存ユーザーが bookmarklet install modal を再度開く UI が無くなった (今は EmptyStateWelcome 経由のみ → 既にカードがあるユーザーは開けない)
  - triage 画面に飛ぶ UI が無くなった (URL `/triage` 直打ちでのみアクセス可)
  - mood 作成は triage 内 NewMoodInput で可能、board からは不可
  - **対応策**: Toolbar に「+」 menu (bookmarklet install / triage / settings) を追加 (Phase 2-1 として次セッション)
- **🎯 Task 27-F (body スクロール抑制)、27-G (TikTok/IG iframe 直接埋め込み)、27-H (Lightbox 縦動画 9:16 対応) 完了 (2026-05-02 v16)**
  - 27-F: BoardRoot mount 時に `html/body { overflow:hidden }` を局所適用、unmount で復元 → destefanis 流のフル画面 dark canvas (pan のみ) 実現
  - 27-G: TikTok を `https://www.tiktok.com/embed/v2/<id>` の iframe 直接埋め込みに、Instagram を `https://www.instagram.com/p/<shortcode>/embed` に置換 → embed.js + blockquote 方式 (CSP 失敗しがち) を全廃
  - 27-H: Lightbox に `.iframeWrap9x16` (height-led, max 50vw, aspect 9:16) を新設、`.iframeWrap16x9` を `width: min(920px, 60vw)` に。frame grid を `auto minmax(280px, 360px)` に、media は object-fit: contain。YouTube Shorts URL `youtube.com/shorts/<id>` 検知 → 縦表示
  - 新規 helper: `lib/utils/url.ts` に `isYoutubeShorts()` + `extractYoutubeId()` の Shorts URL 対応
- **🎯 Task 27 A〜D 完了 (2026-05-02 前半セッション)** — destefanis 視覚 polish 4 件:
  - 27-A: `CardNode.inner` の白枠 chrome (background:#fff + 1px border + 4px radius) を完全削除し radius を `var(--card-radius)`(24px) に統一 → **これが最大の視覚改善**。これまでカード外形が 4px ガビガビ + 薄白枠で destefanis から最も乖離していた根本原因
  - 27-B: `--lightbox-backdrop` を `rgba(10,10,10,0.95)`(不透明) → `rgba(0,0,0,0.5) + backdrop-filter: blur(6px)` (背景 blur で透ける destefanis 流)
  - 27-C: Lightbox `.tweetWrap` の `background: #15202b` + border 削除 → 透明にして内側 `--tweet-bg-color` のみで X dark テーマ成立
  - 27-D: Toolbar の FilterPill / DisplayModeSwitch を「ほぼ不透明な黒 pill」→ destefanis 真値「白 glass pill」(`rgba(255,255,255,0.1)` + 12px blur + padding 10/16 + font 14px) に。Toolbar 位置 16→24px
- **未完了 (Task 27-E: 実機確認後に判断)**:
  - Tweet 本文切れ問題が v16 で解決しているか (TweetCard の intrinsicHeight feedback 追い込み)
  - v16 で TikTok / Instagram / YouTube Shorts の Lightbox 実機動作確認
  - card click → Lightbox open が確実に動くか (前セッションでユーザーが「クリックしても内容の確認ができない」と指摘 — Lightbox visibility / click path の追加診断が必要なら手当て)
- **テスト**: vitest 204/204 PASS、tsc EXIT=0、pnpm build 成功
- **SW CACHE_VERSION**: v16-2026-05-02-task27-bodyscroll-vertical-video
- **Task 26 で実施した変更**:
  - 26-1 board 背景: ベージュ + ドット → `var(--bg-dark)` 真っ黒
  - 26-2 全カード装飾削除: border / box-shadow / hover lift / ImageCard `.title` overlay / VideoThumbCard `.titleBar` 削除
  - 26-3 intrinsic-sized: `MasonryCard.intrinsicHeight` フィールド追加 + CardsLayer の `intrinsicHeights` state + `reportIntrinsicHeight` callback。Tweet/Text card は実 height を masonry に直接 feed（aspectRatio の line-wrap proportional 仮定の破綻を解消）
  - 26-4 Lightbox media 全種別: tweet (react-tweet) / YouTube (iframe) / TikTok (公式 embed.js + blockquote) / Instagram (同) / image/website (大 img) / fallback (placeholder)。description フィールドを BoardItem に追加
  - 26-5 フォント Geist 統一: `next/font/google` の `Geist` + `Geist_Mono` 追加、`Playfair_Display` loader 削除。`--font-sans` / `--font-mono` token 確立、全 module CSS / canvas font spec を `var(--font-sans)` 等に置換。italic / Noto Serif JP / Fraunces / Inter / JetBrains Mono の参照ゼロ
  - 26-6 GAP_PX 10 → 6 (中央寄せ + 左右余白の destefanis layout は維持、隙間のみ詰め)
  - 26-7 corner-radius: card 系は `var(--card-radius)` (10px) 統一、Sidebar の asymmetric `--corner-radius-inner` (6px) は据え置き
- **destefanis-pivot の最新 cluster 3 commits（Task 19-25）**:
  - `794f4a8` — chore(sw): bump CACHE_VERSION to v12 (cluster 3)
  - `2076e7b` — fix(triage): cancel in-flight HeuristicTagger.suggest on current change
  - `b6948ec` — Task 24: HeuristicTagger suggestion highlights in TagPicker
  - `c9c3ba9` — fix(e2e): clear settings store in display-mode spec to allow re-runs
  - `270b72b` — Task 23: E2E displayMode switch + persistence
  - `660d812` — refactor: remove dead advance() helper
  - `ef565c0` — Task 22: E2E triage 3-card classify flow + handleTag double-advance fix
  - `1da4c02` — fix: memoize handleTag/handleSkip to stop keydown listener churn
  - `8a35d9f` — Task 21: TagPicker 1-9/S/Z keys + NewMoodInput
  - `ca206fc` — fix: quote TriageCard background-image URL to handle ) in paths
  - `38388ee` — Task 20: TriageCard destefanis minimal 4:5 aspect
  - `ea61bda` — fix: clear lastAction on skip
  - `ed02c00` — Task 19: /triage route scaffold + TriagePage
- **進捗**: 全 **25/25 完了（100%）** + Task 26（Phase A 復元）8/8 完了
- **テスト**: vitest 204/204 PASS（+7 from Task 26: intrinsicHeight 2 + TikTok/Instagram URL parser 5）、tsc clean、pnpm build 成功
- **E2E**: Task 26 後の再実行は次セッション (visual のみ変更、E2E logic 影響軽微の見込み)

---

### Task 27: destefanis 視覚完全コピーの追い込み (A〜D 完了 / E 残)

**経緯 (2026-05-02)**:
- v14 まででも user スクショ比較で「まだ違う」と指摘 → 後半セッションで原因特定 + 修正
- 最大の犯人: `CardNode.inner` の白枠 chrome (Task 26 で見落としていた外殻装飾)
- memory: `reference_destefanis_visual_spec.md` に destefanis 完全仕様 (CSS values 含) を保存

#### ✅ 27-A: CardNode.inner chrome 削除 (DONE)
- `background: #fff` / `border: 1px solid rgba(0,0,0,0.08)` / `border-radius: 4px` 全削除
- `border-radius: var(--card-radius)`(24px) に統一 → 内側 ImageCard 等の radius と二重にならない
- 効果: カード外形が 4px ガビガビ + 薄白枠から、24px の clean な destefanis 角丸に
- 修正ファイル: [components/board/CardNode.module.css:15-23](components/board/CardNode.module.css#L15-L23)

#### ✅ 27-B: Lightbox backdrop transparent + blur (DONE)
- `--lightbox-backdrop: rgba(10,10,10,0.95)` → `rgba(0,0,0,0.5)`
- `.backdrop` に `backdrop-filter: blur(6px)` 追加 (Webkit 対応含む)
- 修正ファイル: [app/globals.css:278](app/globals.css#L278), [components/board/Lightbox.module.css:1-13](components/board/Lightbox.module.css#L1-L13)

#### ✅ 27-C: Lightbox tweetWrap chrome 削除 (DONE)
- `.tweetWrap` から `background: #15202b` + `border-radius` (二重に効いていた) を削除
- 透明化して内側 `--tweet-bg-color: #15202b` のみで X dark テーマ表現
- 修正ファイル: [components/board/Lightbox.module.css:54-64](components/board/Lightbox.module.css#L54-L64)

#### ✅ 27-D: Toolbar pill destefanis 真値化 (DONE)
- FilterPill + DisplayModeSwitch の pill を「黒 pill」→ destefanis 「白 glass pill」へ:
  - background: `rgba(20,20,20,0.92)` → `rgba(255,255,255,0.1)`
  - border: `rgba(255,255,255,0.08)` → `rgba(255,255,255,0.15)`
  - padding: `8px 14px` → `10px 16px` (destefanis 真値)
  - font-size: 13 → 14px
  - blur: 10 → 12px
- ドロップダウン menu: `rgba(20,20,20,0.96)` → `rgba(30,30,30,0.95)`, radius 10 → 24, blur 12 → 16
- Toolbar 位置: top/right 16px → 24px (destefanis 真値)
- 修正ファイル: [components/board/Toolbar.module.css](components/board/Toolbar.module.css), [components/board/FilterPill.module.css](components/board/FilterPill.module.css), [components/board/DisplayModeSwitch.module.css](components/board/DisplayModeSwitch.module.css)

#### 🔜 27-E: 実機確認後の追い込み (次セッション)
1. **booklage.pages.dev v15 ハードリロード** → user スクショ撮影 → destefanis 公式と diff
2. **Tweet 本文切れ**が v15 で改善しているか確認:
   - もしまだ初回 transient clipping があれば、TweetCard 初期 aspectRatio を低めに (height 高めに) 設定して measurement で縮める方向に
   - または BoardRoot の contentBounds 計算にも intrinsicHeights を反映
3. **TikTok / Instagram embed 実機動作**:
   - lightbox 開いて embed.js が動いているか確認
   - 動かなければ thumbnail + 外部リンク fallback に格下げ
4. その他、A〜D デプロイ後の実機目視で気になった点を列挙

---

### 🎯 v14 デプロイ済の確認項目 (Task 27 着手前に user smoke test)

1. **このファイル (docs/TODO.md) を読む** ← 今ここ
2. **`booklage.pages.dev` をハードリロード**（Ctrl+Shift+R）
3. **visual 確認 (Task 26)**:
   - 背景が真っ黒 (#0a0a0a) になっている
   - カード border / shadow / hover lift / 画像下グラデ overlay が消えている
   - tweet / text card が高さ自然に伸びて切れていない
   - 全画面のフォントが Geist (italic 撤去、シンプルな sans)
   - カード隙間が以前より詰まっている (10→6px)
4. **Lightbox 動作確認 (新規)**: 各カードを click
   - tweet → react-tweet 表示 + 右側 description
   - YouTube → iframe 動画再生 + 右側 description
   - **TikTok → 公式 embed iframe で再生 (要動作確認、ダメなら次セッションで fallback 化)**
   - Instagram → 公式 embed iframe で表示
   - image/website → 大 thumbnail
5. **既存 smoke test (機能)**:
   - bookmarklet click → /save popup → ✓ → 自動 close、Board 新カードが fade-in
   - サイドバー「📌 仕分けを始める」→ /triage、+ 新 mood → 1 枚目タグ → 2 枚目「1」キー → 3 枚目「s」スキップ → done
   - mood filter: design click → 2 枚絞り込み
6. 問題あれば次セッションで修正タスク化

---

### 🆕 Task 26: destefanis Phase A 完全コピー復元 + Lightbox media + フォント modernize

**経緯 (2026-05-02 セッション)**: brainstorm 14 項目 (TODO L120-141) で lock 済の方針「wholesale copy → Launch → 個性化」のうち **Phase A（完全コピー）をスキップして Booklage 個性を最初から足してしまった**。Launch 前に Phase A まで戻す。サイドバーは hybrid 方針通り Booklage identity 維持（destefanis 参考にはサイドバー無し）。

**ユーザー承認済 (2026-05-02)**:
- (a) Phase A 完全コピー → Launch → Phase C 個性化 で進める
- (b) Lightbox は **tweet 全文 + YouTube 埋め込み + TikTok 埋め込み + 画像/website 詳細表示** の全種別対応。動画再生しながら右側でテキスト読めるレイアウト維持
- (c) フォントは **Geist** に統一（イタリック / Noto Serif JP / Playfair Display 撤去）。Phase C で再個性化検討
- 動画同時視聴 (multi-playback) は **launch 後** の核機能。今回スコープ外（IDEAS.md 既収載）

#### 26-1: Board 背景を真っ黒に

- [components/board/themes.module.css](components/board/themes.module.css) `.dottedNotebook` を destefanis 同等のフラット dark に置換
- 案: `background-color: #0a0a0a;` のみ、dots / grid なし（純黒 `#000` か近黒 `#0a0a0a` は destefanis 拡大画像で実測）
- [lib/board/theme-registry.ts](lib/board/theme-registry.ts) DEFAULT_THEME_ID 据え置き、定義中身を destefanis dark に書き換え
- gridPaper / 旧 dottedNotebook の定義は **legacy として残置** or 削除（Phase C で用途検討）

#### 26-2: カード装飾削除（destefanis 同等）

- [TweetCard.module.css:7-15](components/board/cards/TweetCard.module.css#L7-L15): `border` / `box-shadow` / hover lift 削除
- [ImageCard.module.css:10-18](components/board/cards/ImageCard.module.css#L10-L18): `border` / `box-shadow` / hover lift / **title overlay (.title 全体) 削除**。`.thumb` のみ残す
- [VideoThumbCard.module.css:8-19](components/board/cards/VideoThumbCard.module.css#L8-L19): `box-shadow` / hover / `titleBar` 削除、playOverlay は維持（destefanis にも play button あり）
- [TextCard.module.css:10-19](components/board/cards/TextCard.module.css#L10-L19): `border` / `box-shadow` / hover lift 削除、background gradient は flat dark grey へ
- [TweetCard.tsx:156-166](components/board/cards/TweetCard.tsx#L156-L166) editorial branch の inline `borderLeft + paddingLeft + fontFamily Noto Serif JP` 削除（Geist 統一と整合）

#### 26-3: Tweet/Text card を intrinsic-sized に（高さ自動 + 本文切れ解消）

- 現状: aspectRatio で高さ固定 → `overflow: hidden` で本文切れる（ユーザー指摘 #1）
- destefanis: tweet / text は中身の自然な高さで masonry が積む
- 設計案 A: `column-masonry.ts` の input に `intrinsicHeight?: number` を追加。tweet/text は ResizeObserver で測定した実 height を使い、aspectRatio を skip
- 設計案 B: 既存の `persistMeasuredAspect` 経路を活かし、実 height をそのまま column-masonry へ渡す override を CardsLayer 側で組む（侵襲少ない、推奨）
- どちらを採用するかは実装直前に判定
- [TweetCard.module.css:5](components/board/cards/TweetCard.module.css#L5) `overflow: hidden` 撤去または `overflow: visible`
- 影響範囲: `computeColumnMasonry` のテスト、`use-card-reorder-drag` の position 計算

#### 26-4: Lightbox を URL 種別ごとに分岐（media 全種対応 — ユーザー要望 #2）

[Lightbox.tsx:62-65](components/board/Lightbox.tsx#L62-L65) を URL 種別 switch:

| 種別 | 左 media 部 | 右 text 部 |
|---|---|---|
| **tweet** | `<Tweet id={tweetId} />` を 大サイズ width で再 mount。scroll 可 | OGP description + URL host + tags |
| **YouTube** | `<iframe src="https://www.youtube.com/embed/{videoId}" allowfullscreen>` 埋め込み | title + description + URL + tags |
| **TikTok** | TikTok oEmbed iframe（公式 oEmbed endpoint からの response を `dangerouslySetInnerHTML`、TikTok 公式由来なので XSS 観点 OK） | title + description + URL + tags |
| **image / website** | 大 thumbnail (max-height 88vh) | title + description + URL + tags |
| **text** | placeholder（content excerpt 装飾表示） | 全文 |

- `lib/utils/url.ts` の `detectUrlType` を Lightbox でも使用
- YouTube `videoId` extract helper 新設: `extractYouTubeId(url)`
- TikTok 埋め込み fetch は `app/api/oembed/route.ts` (任意) 経由 or client-side で TikTok oEmbed endpoint へ直接（CORS 確認）
- レイアウト: 現状 `grid-template-columns: 1.3fr 1fr` 維持（左 media + 右 text）→ desktop で動画見ながらテキスト読める
- mobile (< 900px): 縦積み（既存 media query OK）

#### 26-5: フォントを Geist に統一（Phase A 確定）

- [app/layout.tsx](app/layout.tsx) に `next/font/google` で `Geist` + `Geist_Mono` を loader 追加
- 現状 `Playfair_Display` の loader 削除
- [globals.css](app/globals.css) `:root` に `--font-sans: 'Geist', system-ui, sans-serif;` `--font-mono: 'Geist Mono', ui-monospace, monospace;` を確立
- `--font-playfair` 削除
- 全 module CSS で置換:
  - `'Noto Serif JP', Georgia, serif` → `var(--font-sans)`
  - `'Fraunces', 'Playfair Display', Georgia, serif` → `var(--font-sans)`
  - `'JetBrains Mono', ui-monospace, monospace` → `var(--font-mono)`
  - `'Inter', system-ui, sans-serif` → `var(--font-sans)`
- [TextCard.module.css:65](components/board/cards/TextCard.module.css#L65) `.headline .title` の `font-style: italic` 撤去
- TextCard 3 modes は **Phase A では Geist の weight + size 違いで表現**:
  - headline: Geist 700 large
  - editorial: Geist 500 regular
  - index: Geist Mono 400 small
- [SaveToast.module.css](components/save/SaveToast.module.css) `.brand` / [Sidebar.module.css](components/board/Sidebar.module.css) `.brandName` の Playfair 参照も Geist へ
- Lightbox `.text` (Lightbox.module.css:34) も Geist へ

#### 26-6: GAP / padding / max-width / column 幅 を destefanis に合わせる

- [lib/board/constants.ts](lib/board/constants.ts):
  - `COLUMN_MASONRY.GAP_PX: 10 → 6`（destefanis 実測ベース、要拡大画像確認）
  - `BOARD_INNER.MAX_WIDTH_PX: 1400 → 1800` or 撤廃で full viewport
  - `BOARD_INNER.SIDE_PADDING_PX: 64 → 16`
  - `COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX: 160 → 200`（destefanis のカード幅実測、tweet 横幅余裕も生まれる）
- 影響: BoardRoot の `effectiveLayoutWidth` 計算で reflow 発生。masonry テスト全部見直し

#### 26-7: corner-radius 調整

- [globals.css:257](app/globals.css#L257) `--corner-radius-inner: 6px` → destefanis 実測値（おそらく 12-16px、拡大画像で計測）

#### 26-8: smoke test 再実行 + v13 deploy

- Task 26 完了後 deploy → booklage.pages.dev で **destefanis 拡大画像と並べて見比べ**
- 差分が「色味の微調整」レベル以下になっていれば Phase A 達成
- 上記 smoke test シナリオ（save → fade-in / Lightbox / Triage / filter）も再確認

#### スコープ外（Phase B/C 以降）

- 動画同時視聴 multi-playback（launch 後核機能、IDEAS.md 既収載）
- Phase C の Booklage 独自個性化（色、フォント独自カラー、装飾、グロー、シグネチャモーション）
- gridPaper / dottedNotebook テーマの Phase C 再活用判断

#### 完了基準

- [ ] booklage.pages.dev で destefanis 拡大画像と並べて見比べ、board 部分の差分が「色味の微調整」レベル以下
- [ ] Lightbox で tweet / YouTube / TikTok / image / website / text 全種が media + text 並列表示できる
- [ ] フォントが全画面で Geist 統一、italic serif が消える
- [ ] tsc clean / vitest 全 PASS / E2E 全 PASS
- [ ] 本番 v13 deploy 済

---

### 📋 cluster 3 で plan からの逸脱（fix commit に分離済）

- **Task 19 fix `ea61bda`** — code review が Important 1 件: handleSkip が `setLastAction(null)` を呼ばないため、Skip 後に Undo すると無関係な前のタグを巻き戻す silent bug。1 行追加で解決
- **Task 20 fix `ca206fc`** — code review が Critical 1 件: `JSON.stringify(thumbnail).slice(1, -1)` は `)` を escape しないため、CDN paths に `)` が含まれると CSS `url()` が壊れる。`url("${thumbnail.replace(/"/g, '%22')}")` 形式に変更
- **Task 21 fix `1da4c02`** — code review が Important 1 件: TagPicker の `useEffect` deps `[onTag, onSkip]` が re-render ごとに新 identity → keydown listener が毎レンダーで再登録 thrash。handleTag / handleSkip を `useCallback` でメモ化（advance() inline 化）
- **Task 22 in `ef565c0` (E2E と同コミット)** — E2E 実装中に **plan の bug 発見**: `handleTag` 内の `setIndex(i+1)` が queue.filter の自然な縮みと double-advance して 2 枚目 (B) を skip して 3 枚目 (C) にタグしてしまう。`advance()` 呼び出しを削除し、tagging 自体が queue を縮めることに任せる。Skip は依然 `setIndex(i+1)` 必要（skip 済みアイテムは queue に残るので index 動かさないと無限ループ）。`660d812` で死んだ `advance` helper を後始末
- **Task 23 fix `c9c3ba9`** — code review が Critical 1 件: 既存 4 spec が clear しなかった `settings` store にこのテストは write する → 再実行時に prior run の `displayMode='native'` が残って初期 'Visual' assertion が失敗。clearDb の transaction に `'settings'` 追加で 4 store clear に拡張
- **Task 24 fix `2076e7b`** — code review が Critical 1 件: HeuristicTagger.suggest の async useEffect に cancellation guard 抜け。プロジェクト全体の `cancelled` flag pattern (use-board-data.ts / use-moods.ts / BoardRoot.tsx と同じ形) に揃えた

### 📋 cluster 3 で持ち越した polish（launch 後）

- **TriagePage で `useMoods` の loading flag 未参照** — moods が遅れて到着した瞬間に空 chip row が一瞬見える可能性。Triage 開く際に `if (loading || moodsLoading)` 化候補
- **NewMoodInput の `outline: 'none'` で focus 視覚なし** — WCAG 2.4.7 違反。CSS module 化して `:focus-visible` で box-shadow 焦点リング追加するか、inline outline をデザイン適合のものに置換（user 確認必要）
- **TagPicker chip に hover transition なし** — 他 component との一貫性で `transition: background 150ms ease`
- **TagPicker chip に `aria-keyshortcuts` なし** — screen reader 配慮の MVP 後対応
- **handleUndo の index 整合性 edge case** — Skip→Tag→Undo の順で復元位置がズレる（Task 19 review Important #3）。MVP 受容済
- **`moods.length > 9` 時の overflow indicator** — 10 個以上 mood 作っても triage で見えない。"+N more" 案
- **TagPicker の suggestion top-1 highlight 化検討** — 現状は全 match を outline で highlight、UI ノイズ低減の選択肢
- **Triage 「全部 Skip 完了 = 仕分け完了」表記** — 全 skip でも `done_title` 表示は誤りに近い (実際は何もタグしてない)。distinguish しても良い
- **`lib/utils/url.ts` に `getDisplayHost(url)` 抽出** — TriageCard inline parse の DRY 化（Task 25 sweep でやらず）
- **DisplayModeSwitch / triage chips に `data-testid` 拡充** — locale-coupled selector を回避

### 📋 cluster 2 で plan からの逸脱（fix commit に分離済）

- **Task 15 fix `d993793`** — implementer は plan verbatim、code review が 1 Critical (GSAP tween cleanup 抜け) + 3 Important (a11y dialog role / ESC stopPropagation / onClose useCallback) を発見。fix commit で全部解決。plan に書き戻すか launch 後判断
- **Task 17 fix `8a237ad`** — implementer は plan verbatim、code review が 2 Important を発見:
  - clearTimeout 抜け（unmount race） → timers 配列で集約 + cleanup で clear
  - **GSAP vs CSS transform 衝突** — plan の keyframe `transform: translateY(-4px) → 0` は CSS animation が GSAP の inline matrix を 400ms 間 override してしまい、新カードが world (0, 0) に滞在する視覚バグ。fix で **opacity-only keyframe** に変更（translateY 削除）。intent (静かな fade-in) は保たれる。plan 側 markdown は次セッション余裕あれば修正

### 📋 cluster 2 で持ち越した polish（cluster 3 か launch 後）

- **Lightbox: focus return on close** — 開く時 close button に focus は実装済、閉じる時に opener (card) への focus 戻しは未実装。WCAG 2.1 SC 2.4.3 best practice、accessibility pass で対応
- **Lightbox: focus trap** — Tab で背景の card に escape 可能。本当に必要になったタイミング (Task 25 a11y sweep) で追加
- **Lightbox z-index 300 inline** — `BOARD_Z_INDEX.LIGHTBOX = 300` を constants に登録するか、CSS にコメント追加。consistency 改善
- **E2E `clearDb` の重複** — 3 specs に同じ関数（bookmarklet-save は 2 stores、新 2 specs は 3 stores、それぞれ微妙に divergence）。`tests/e2e/helpers/idb.ts` に集約候補。Task 25 sweep で実施

### 📋 cluster 1 で plan-deviation はゼロ

Task 11-14 は plan 通りに verbatim 実装。inline-style 1 箇所（FilterPill の count badge 用 `marginLeft: auto`、TweetCard editorial branch の `borderLeft + paddingLeft + fontFamily`）は plan 内に明記されてた spec のまま。

### 📋 Task 12 code review で発見した latent bug（Task 12 由来ではない、cluster 3 で対応か別 task に切る）

**filter 中の drag-to-reorder で hidden item の orderIndex が壊れる**:
- `persistOrderBatch(orderedBookmarkIds)` は visible IDs のみ受け取り、それを 0..N-1 で書き直す
- 残りの hidden bookmarks は元の orderIndex 保持なので、restore したときに gap や collision が発生
- Task 5 で実装された関数の latent bug。Task 12 が filter UI を出して初めて顕在化
- 修正方針: `persistOrderBatch` を「全 bookmark を読んで dense reindex する」形に書き換える
- 緊急ではない（MVP では filter 中 reorder 頻度が低い見込み）。launch 後 polish で対応可能

### 📋 Task 6 で plan-bug fix を適用済（plan 側を後で更新するか判断）

**HeuristicTagger keyword branch**: plan-verbatim だと test #2（`'My photo diary'` → `'photography'` mood）が pass しない。Implementer が `haystackWords.some((w) => moodName.includes(w))` の symmetric clause を追加して解決。inline コメントあり。次セッションで余裕があれば plan の Task 6 markdown を後追い修正してもよい（緊急ではない）。

### 📋 Task 8 で plan-bug fix を 2 件適用済（plan 側を後で更新するか判断）

1. **`screen.width-w` vs test regex `screen.width-320`**: 変数 `w` を使う plan source と literal `320` を要求する test regex の矛盾。Implementer が IIFE 内で literal 320 を inline 化して解決。
2. **`JSON.stringify(appUrl)` vs origin substring test**: `JSON.stringify` だと `"https://booklage.pages.dev"` で literal substring が壊れる。Implementer が inline-with-escape (`\\` → `\\\\`, `'` → `\\'`) に変更。production の appUrl は `https://...` / `http://localhost:...` のみで escape 影響なし。security posture は内部 config 限定で acceptable。

### 📋 Task 9 で plan に明記されてない決定事項

- `/save` ルートを `app/(app)/save/page.tsx` から **top-level `app/save/page.tsx`** へ移動（plan は recommend、impl は採用）
- 理由: `app/(app)/layout.tsx` が `100vh flex` shell を被せて 320×120 popup viewport を破壊するため
- `app/save/page.tsx` 配下は global `app/layout.tsx` のみ継承 → クリーンな body で SaveToast が `width:100%; height:100%` で popup を埋める

### 📋 Task 9 polish で global font 追加

`app/layout.tsx` に `Playfair_Display` を追加（italic、weight 400/700、`--font-playfair`）。`SaveToast.module.css` `.brand` と `Sidebar.module.css` `.brandName` を `var(--font-playfair, 'Playfair Display'), Georgia, serif` に統一。`TextCard.module.css` は Fraunces primary なので未対応（将来 Fraunces loader 追加時に migrate）。

---

---

### 🌟 2026-04-21 brainstorm のまとめ (spec に全部入ってるが要約)

**lock した 14 項目**:
1. 分類モデル: フォルダ廃止 → タグ主体 (mood buckets、mymind 方式)
2. Tagger 抽象化: MVP HeuristicTagger、将来 Gemma 270M 差替え可能な interface
3. Save flow: **Zero-friction Inbox** (タグ選択なし、Inbox 直行)
4. 視覚スコープ: 案 X hybrid (destefanis board + Booklage サイドバー identity)
5. コピー戦略: **destefanis を wholesale copy してから個性化** (個性化は launch 後)
6. サイドバー哲学: テーマ駆動統一 (destefanis theme では dark minimal)
7. TextCard typography: **現状維持** (大 serif + favicon + domain)
8. 本文+画像カード: M (image-first minimal) デフォルト + PEM ユーザー切替
9. Lightbox layout: F2 floating 横並び (desktop) / F1 縦積み (mobile)、card chrome なし
10. Lightbox animation: destefanis Motion One spring 複製
11. Board entrance: A 静かな fade-in 400ms + FLIP reflow
12. Triage layout: T1 Linear (tag chip + 1-9 数字キー)
13. Triage animation: fade-out 120ms / fade-in 180ms 最小限
14. **ブランドカラー: 未決定**。紫は placeholder、brand color として扱わない

**保存フロー (§5.1 更新後)**: bookmarklet click → `window.open(320×120, top-center)` → auto-save on load → spinner → ✓ checkmark → `window.close()` (~1.3s)。**現バグ** (BroadcastChannel listener 無し) も §5.1 step 8 で同時解消

**IDEAS.md に退避した deferred ideas**: WASD Directional Triage / HTML-in-canvas ピーリングアニメ / Multi-playback / Gemma 270M

---

### 🚨 以前の最優先バグ: bookmarklet href React 19 block — **2026-04-21 修正 + デプロイ済**

- commit `6651f20` で [components/bookmarklet/BookmarkletInstallModal.tsx](components/bookmarklet/BookmarkletInstallModal.tsx) を ref + useEffect + setAttribute パターンに書き換え
- SW CACHE_VERSION `v10-2026-04-21-bookmarklet-href-fix` bump 済
- `booklage.pages.dev` 本番反映済 (deploy URL: `https://75949651.booklage.pages.dev`)
- tsc clean / vitest 173/173 pass / Playwright 11/11 pass
- **user 実機検証まだ** — `booklage.pages.dev` をハードリロード → bookmarklet 再ドラッグ → 任意サイトで click → エラー無しで /save が開けば成功

この検証結果は次セッションで確認。失敗していたら destefanis pivot 実装前に修正必要。

---

### 🔥 以前の進捗 (2026-04-21 前半)：ブックマーレット復活 v9 デプロイ済
  - **新規実装**:
    - `lib/utils/bookmarklet.ts` — `extractOgpFromDocument` + `generateBookmarkletUri` (pure inline `javascript:` URI 方式、外部 script 非注入で CSP 厳格サイトでも動く)
    - Board サイドバー に「📌 ブックマークレット」行（LIBRARY と Folders の間）→ click で導入モーダル開く
    - 空状態ウェルカムカード — Board カード 0 枚時に中央表示、install 導線
    - 導入モーダル — ドラッグ可能「📌 Booklage」リンク + Win/Mac ショートカット + 3 ステップ使い方
    - E2E: `tests/e2e/bookmarklet-save.spec.ts` — `/save` fixture param → IDB 永続化を Playwright 検証
    - `BOARD_Z_INDEX` に `EMPTY_STATE: 12` + `MODAL_OVERLAY: 200` 追加
  - **既存資産の再利用**:
    - `/save` ルート + `SavePopup` は無変更でそのまま活用（addBookmark → BroadcastChannel で Board 自動 reload）
    - IDB スキーマ変更なし（v8 のまま）
- **🚨 次セッション最初の実機検証（user 依頼）**:
  - `booklage.pages.dev` をハードリロード (Ctrl+Shift+R)
  - サイドバー「📌 ブックマークレット」クリック → モーダル開く → 📌 Booklage をブラウザのブックマークバーにドラッグ
  - 下記 7 URL パターンで保存 → 想定カードに分岐するか確認:

| # | テスト URL 種別 | 期待カード | 確認点 |
|---|---|---|---|
| 1 | Twitter/X tweet | TweetCard | 本文 + 画像 + footer |
| 2 | YouTube (通常) | VideoThumbCard 16:9 | maxres サムネ + タイトル + ▶ |
| 3 | YouTube Shorts | VideoThumbCard 9:16 | 縦長サムネ |
| 4 | TikTok 動画 | VideoThumbCard 9:16 | oEmbed タイトル + ▶ |
| 5 | GitHub ページ | TextCard | favicon + タイポグラフィ |
| 6 | r3f.maximeheckel.com/lens2 | TextCard | 白カードにならないこと |
| 7 | 画像直リンク | ImageCard | aspect 調整 |

- **次フェーズ: C → A の順**（ブクマで新規 URL を貯めて評価 → C へ）:
  - **C. Multi-playback** — 動画カード click で in-place 再生、unmute トグルは 1 枚ずつ（auto-mute others）
  - **A. ライトボックス拡大** — B+C で click 意味を確定後、ホバー expand ボタン等で中央拡大 spring
- **spec**: `docs/superpowers/specs/2026-04-21-bookmarklet-revival-design.md`
- **plan**: `docs/superpowers/plans/2026-04-21-bookmarklet-revival.md`（10 TDD tasks + 3 fix rounds）
- **本番URL**: `https://booklage.pages.dev`（2026-04-21 deploy **v9**, SW `v9-2026-04-21-bookmarklet-revival`）
- **DBバージョン**: **v8**（bookmarklet ではスキーマ変更なし）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）
- **ビルド**: `output: 'export'`（静的書き出し）、出力先は `out/`
- **デプロイ手順**: ⚠️ **必ず `public/sw.js` の `CACHE_VERSION` を bump してから** `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true`
- **テスト**: **173 vitest PASS / 0 FAIL**（+ 34 bookmarklet tests from 139） + **6 Playwright E2E PASS**（+ 2 bookmarklet-save from 4）。tsc strict clean

### bookmarklet revival で持ち越した polish/a11y 項目（次回以降）

1. **モーダル focus 管理** — open 時の close button 自動 focus は実装済。close 時に opener への focus 戻しは未実装。focus trap も未実装（tab で背景 interactive 要素に escape 可能）
2. **空状態ウェルカムの entrance animation** — 現状は突然現れる。fade-in + 軽い scale spring で「はじめまして」感を出せる
3. **モーダル install guide の図** — 現状はテキストのみ。ブックマークバーの見本を SVG/Lottie で動的化
4. **多言語 14 言語** — ja のみ。en/zh/es/... 13 locale 分の翻訳は後日スプリント
5. **URL ペースト保存フロー** — bookmarklet 以外の entry point（URL 手入力 → /save への遷移 UI）は未実装
6. **モバイル対応** — bookmarklet はデスクトップ前提。iOS/Android では Web Share Target / PWA 共有が必要
7. **重複 URL 検知** — 同じ URL を 2 回保存すると 2 枚のカードが追加される（spec 通り、設計判断）
8. **`BookmarkletInstall` の design polish** — ブックマークレット自体の見た目が user 曰く「ダサい」。install UI 側の artwork/文言で補う作戦、次の polish pass で実施
9. **BoardRoot.tsx 内の pre-existing cleanup** — return type 未明示（CLAUDE.md 違反）、`useBoardKeyboard()`/`useSpaceHoldPan()`/`useBoardViewport()` 抽出候補。bookmarklet 実装とは無関係だが TODO として残置

### 以前の残課題（B-embeds から持ち越し）

1. **動画付きツイートの表示が一部おかしい** — 例: [heyirfanaziz/status/2044092673141944565](https://x.com/heyirfanaziz/status/2044092673141944565)。v8 の media load event + 4段タイマー再測定を入れたが、改善せず。original root cause 未特定（user 判断で先送り、priority 低）
2. **YouTube カードのタイトルバー視認性** — 暗いサムネでは白文字 + 下からのグラデ overlay でも読みづらい。user 了解済の「後でブラッシュアップ」項目
3. **YouTube タイトルが「タイトル見えないことがある」問題** — 一部の既存ブクマは oEmbed fetch が 404 / ネットワーク失敗で degenerate title のまま残留

### 次セッション最初にやること（2026-04-21 夜 更新、destefanis pivot 採択後）

1. **`docs/TODO.md` を読む**（このファイル）
2. **`git push origin master`** — 未 push commits 3 個
3. **[docs/superpowers/specs/2026-04-21-destefanis-pivot-design.md](docs/superpowers/specs/2026-04-21-destefanis-pivot-design.md) を読む** (472 行)
4. **user に spec レビュー結果を聞く** — 修正箇所 or approval
5. **spec OK → `writing-plans` スキル invoke** で詳細実装プラン生成
6. **plan OK → `subagent-driven-development` or TDD で実装開始**

以前の論点 (a) 新規カード追加位置 / (b) 保存後の celebration は brainstorm で以下に集約されて解決:
- (a) → destefanis masonry は auto-computed なので「どこに追加」問題は消滅。top-left 挿入固定
- (b) → SaveToast (§6.5) + 静かな entrance animation (A) で確定

### destefanis pivot 実装開始のコピペ用 prompt

```
docs/TODO.md を読んで、次に destefanis pivot の writing-plans を開始してください。
spec: docs/superpowers/specs/2026-04-21-destefanis-pivot-design.md (全文必読、472 行)
方針: 14 lock 項目を MVP で全部実装。launch 2026-05-05 目標、+1 週間遅延許容。
plan → subagent-driven-development で実装の流れ
```

### 便利ツール

- **開発用デモ投入**: `/seed-demos` を開くと TikTok / Shorts / Instagram 実 URL が 6 個自動追加される（既存ブクマは消さない、非破壊）
- **IDB リセット**: DevTools > Application > IndexedDB > booklage-db > `cards` / `bookmarks` ストアから手動削除
- **特定カードの aspectRatio リセット**（再測定を強制したい時）: DevTools Console で `cards` ストアを iterate して `aspectRatio = 0` に上書き → リロード

### B-embeds 実装時のメモ（次セッションで参照する場合）

- **predict-tweet-height は v7 以降 dead code**: TweetCard は ResizeObserver 実測に完全移行したので `lib/embed/predict-tweet-height.ts` と test は使われていない。削除せず残置（将来 SSR / thumbnail preview で使う可能性あり）
- **scheduleMeasurement も TextCard では dead**: pretext が同期 API なので `scheduleMeasurement` の idle-callback 経由は不要、TextCard は useEffect 直接呼び出しで persist
- **vitest.setup.ts**: `CSS.supports` stub — Task 14 の pickCard test で CSS module loading を避けるため
- **Twitter syndication CORS**: `cdn.syndication.twimg.com` は CORS 全許可で Cloudflare Pages から直接 fetch 可能
- **TikTok oEmbed timeout**: 3s で AbortController。失敗時は placeholder + ▶
- **YouTube oEmbed timeout**: 4s。`isDegenerateYoutubeTitle` ("YouTube <id>" / `^https?://` / 空 / bare "YouTube") のときだけ fetch
- **react-tweet styling override**: `TweetCard.module.css` の `:global([data-theme])` で margin/border/radius/shadow/font-family リセット + actions bar 非表示
- **pretext は browser-only**: canvas 経由でフォントメトリクス取得するので SSR / jsdom では動かない。`typeof document === 'undefined'` guard 必須
- **TextCard の ASPECT_EPSILON = 0.005**: 同一 title を何度も再測定しても微小差で persist loop しないための threshold

### 2026-04-20 worktree 大掃除完了

- `claude/infallible-cray-c19657` を master に merge（merge commit `c83edd0`、本番デプロイ済コードを master に同期）
- 旧 13 ブランチ全削除（local + remote）。残るは `master` のみ + `backup-pre-filter-repo-2026-04-19`（2026-05-19 以降に削除可）
- worktree 7 個削除済、3 個（`adoring-mestorf-d27d8c` / `epic-brown-403380` / `infallible-cray-c19657`）が Windows ファイルロックで物理削除残り → 次セッション起動時に手動で `.claude/worktrees/` から削除
- **以後 worktree は使わない**（1 人 + Claude 1 人なので worktree 不要）

### B の論点（brainstorming で決める）

- **react-tweet の導入コスト**: パッケージ追加、SSR / client component の扱い
- **iframe 読み込みタイミング**: C でクリック時のみか、B の段階で常時か
- **Twitter/X 以外の埋め込み戦略**: YouTube は oEmbed iframe、TikTok/Instagram は制限あり
- **パフォーマンス**: 多数カード同時 react-tweet ロードで重くないか → viewport culling 活用
- **既存のサムネフォールバック**: OGP なしのケースの見た目

### 直近の作業（2026-04-21 緊急 bugfix 第 3 ラウンド + UX 余白追加）

第 2 ラウンドで入れた resize 後 auto-align が **「離すと元の大きさに戻る」の新規バグ** を引き起こしたので即撤回。併せて上余白を追加:

- **auto-align 撤回** — computeAutoLayout は row 内 scale factor で row height を normalize するので、resize で 1 カードが大きくなると同 row の scale が縮み、全カード（resize したやつ含む）が pre-resize サイズに shrink する設計矛盾。**ボタン押しの手動 Align は aspect ratio 反映 fix を維持**（前述）、auto-align のみ削除。collision push / pinned masonry での真のリフローは別仕様で後日
- **board 上部に 120px の breathing room 追加** — `BOARD_TOP_PAD_PX = 120` 定数、cards wrapper の translate3d に `+BOARD_TOP_PAD_PX`、contentBounds.height にも加算してスクロール範囲を追従。ThemeLayer wrapper は world y=0 のまま → 上余白にも dotted 背景が見える設計
- 86 vitest pass / tsc clean / `booklage.pages.dev` 反映済 (deploy 4 回目/日)

**残課題**: resize で下カードが buried される UX は未解決（auto-align で解消できないことが判明）。collision push（resize したカードに重なる隣接のみ下にシフト）を別 spec で検討。

### 直近の作業（2026-04-21 Batch B 後の緊急 bugfix 第 2 ラウンド）

user 実機テストで新たに 3 件発覚、全て即 fix + deploy 済 (`components/board/CardsLayer.tsx` + `components/board/BoardRoot.tsx`):

- **カードクリックで URL が開かない** — Task 6 で grid-drag ブランチを消した時、useCardDrag の onClick パス (window.open) が dead に。free-drag state machine に click 判定を足した (startPos ⇔ currentPos の距離 < 5px なら click と判定、`window.open(item.url, '_blank', 'noopener,noreferrer')`)。**user の IDEAS 発言**: 「別タブじゃなくても良いかも (GitHub みたいにインライン)」→ Plan B ShareModal か別 issue で再検討
- **整列ボタンが resize 後のサイズを無視** — handleAlign が `it.aspectRatio` (pristine 値) を使ってたので、整列するとカードが元のアスペクト比に戻る挙動。`it.freePos.w / it.freePos.h` を優先して aspect ratio 導出するよう変更 → resize 後の大きさが grid cell に反映される
- **resize しても隣のカードが埋まるだけ** — handleCardResizeEnd が persistCardPosition した後に自動整列するよう変更。ref + setTimeout(0) パターンで handleAlign を deferred 実行 (setItems flush 後に実行するため)
- 付随修正: `resolveResizeSource` ヘルパ追加 — handleCardResize/End/ResetToNative が `item.freePos` を優先参照するようにして、drag 後に resize すると pre-drag grid slot に戻る既存バグも同時 fix
- 86 vitest pass / tsc clean / `booklage.pages.dev` 反映済

### 直近の作業（2026-04-21 Batch B 後の緊急 bugfix — user 実機テストで発覚）

**user が実機で触ったら 3 つバグ報告。1 つは cache 起因、2 つは real bug → 即 fix + 再 deploy 済**。

- **"整列押しても全カード戻らない"** — cache 起因（Ctrl+Shift+R で解消）。Task 9 実装は仕様通り動作、新バグではなかった
- **リサイズで card がすっ飛ぶ** — **real bug、fix 済 (commit + deploy)**。Batch B で `activePositions = freeLayoutPositions` に切替えた時、resize が更新する `overrides` を freeLayoutPositions が無視する状態に。`freeLayoutPositions` で `overrides[bookmarkId]` を最優先するよう修正（`components/board/CardsLayer.tsx`）
- **スクロールが下まで届かない** — **real bug、fix 済 (同 commit)**。`handleScroll` の maxY が `layout.totalHeight` = grid の底辺だけを見ていて、free-placement で grid 外に出されたカードに追従してなかった。`contentBounds` を items の実 position から動的計算 + 600px margin を足す実装に変更（`components/board/BoardRoot.tsx`）
- 86 vitest pass / tsc clean、`booklage.pages.dev` 反映済

### 直近の作業（2026-04-21 Plan A Batch B 実装 + 本番デプロイ）

**ワンセッションで Task 6-9 全実装 + push + deploy 完了**（subagent が sandbox permission で edit 失敗 → main session 直接編集に切替）。

- **Task 6 (36cf611)** — `layoutMode` 概念完全削除 (`lib/board/types.ts` / `lib/storage/board-config.ts` / `lib/constants.ts` DB_VERSION 6→7 / `lib/storage/indexeddb.ts` migration / `components/board/BoardRoot.tsx` state+hydration+handler / `components/board/CardsLayer.tsx` の grid 分岐+prevModeRef+morph useEffect)。canvas 常に free placement、`CardsLayer.activePositions = freeLayoutPositions` で固定。Toolbar は optional 型化で一時的な互換 bridge に
- **Task 7 (eb0ac22)** — `lib/board/align.ts` 新規、`alignAllToGrid(items, { containerWidth, targetRowHeight, gap })` pure fn + 4 vitest。`computeAutoLayout` を `direction='2d'` で呼び、positions を各 item の `freePos` に書き戻す。rotation/zIndex/locked/isUserResized は preserve、x/y/w/h だけ上書き
- **Task 8 (94b8ead)** — Toolbar を `{ onAlign, onShare }` 2-prop 化。`⚡整列` + `📤シェア` の 2 ボタン、primary style は neutral `#1a1a1a`。`FramePresetPopover.tsx` + `.module.css` git rm、`messages/ja.json` の `board.mode`/`board.frame`/`board.toolbar.theme`/`board.toolbar.export` 削除、`board.toolbar.align` 追加。container の `left` を `calc(50% + var(--sidebar-width) / 2)` に変更、sidebar offset を考慮
- **Task 9 (7a84152)** — BoardRoot に `alignKey` state + `handleAlign` + `handleShare` stub を追加。`alignAllToGrid` の結果を `persistFreePosition` で N 回 optimistic setItems + IDB write、`setAlignKey(k+1)` で CardsLayer に morph trigger。CardsLayer は `useLayoutEffect` 内で `alignKey` 変化を検知、`gsap.to()` 400ms `power2.inOut` で morph（通常は `gsap.set()` で snap）。`effectiveLayoutWidth` / `horizontalOffset` も sidebar 分 offset。`frameRatio` state + `handleFrameRatioChange` は dead になるので削除（Plan B で復活予定）
- **検証**: tsc --noEmit clean / 86 vitest pass (既存 82 + align 4) / `pnpm build` 成功 (11 静的ページ生成)
- **Deploy**: `wrangler pages deploy out/ --branch=master --commit-dirty=true` で `booklage.pages.dev` 反映済
- **既知の dead code**（次スプリントで cleanup 可）:
  - BoardRoot の `useCardDrag` + `handleCardPointerDown` + `resolveStart` + `onDrag` + `onDragEnd` + `onCardClick` — grid drag 用インフラ全体が未使用（CardsLayer の `onCardPointerDown` prop も `void` で参照だけ）
  - Toolbar に `frameRatio` / `onFrameRatioChange` / `themeId` / `onThemeClick` / `onExportClick` の optional props が残存（Task 8 で使用箇所は削除済、Plan B で ShareModal 経由に再配線予定）

**X build-in-public 第 1 投稿は保留** — user 判断で「見栄えが上がってから」に延期。投稿予定文面 + スクショ構成は本 TODO 末尾「保留中の tweet 下書き」セクションに保管

### 直近の作業（2026-04-20 Plan A Batch A 実装）

**brainstorming (2026-04-20)**: B1-placement の UX に根本的ねじれ発覚 → 完全再設計
- Grid/Free モード概念を廃止 → canvas 常に free placement、`整列` は「モード」ではなく「アクション」
- Frame preset は Toolbar 常時表示ではなく「シェア」ボタンで開く full-screen モーダルに
- 左 edge-anchored サイドバー (kube.io 式 屈折液体ガラス) で dashboard 体験
- 既存 Task 14-18 (カード操作系) は温存、Task 19/20 は rework/削除
- spec `docs/superpowers/specs/2026-04-20-b1-dashboard-redesign-design.md` + plan `docs/superpowers/plans/2026-04-20-b1-dashboard-foundation.md` にまとめた

**Plan A Batch A (Task 1-5 + BoardRoot 統合)** — 本番デプロイ済 (`booklage.pages.dev`):
- **Task 1 (9a5a344 + alias fix)** — `app/globals.css` に B1 Dashboard 用 CSS 変数群 (`--glass-clarity: 0.35`, `--glass-blur: 6px`, `--glass-displacement-scale: 12`, `--glass-edge`, `--glass-specular`, `--sidebar-width: 240px`, `--sidebar-collapsed: 52px`, `--sidebar-ease`, `--sidebar-duration: 340ms`, `--corner-radius-outer: 24px`, `--corner-radius-inner: 6px`, `--accent-dark`, `--accent-primary` は既存 `--color-accent-primary` alias として追加)
- **Task 2 (23d6fc6)** — `scripts/generate-displacement-map.mjs` + `public/displacement/glass-001.png` (512x512, 70KB, radial ripple pattern)。`sharp` を dev dep に追加
- **Task 3 (1d1c9fe)** — `components/board/LiquidGlass.tsx` + `.module.css` 新規。SVG `<feDisplacementMap>` filter + blur fallback (`@supports not (backdrop-filter: url)`)
- **Task 4 (d875540)** — `components/board/Sidebar.tsx` + `.module.css` 新規 (shell)、edge-anchored 240px / 折り畳み 52px、`transform: translateX()` で ease-out 340ms
- **Task 5 (c07ab42)** — Sidebar 本実装。Playfair italic ロゴ / 検索 shell / LIBRARY 3 項 (すべて/未読/既読 + 件数) / Folders B2 placeholder / 🎨 テーマ / 縦書き `BOARD · 2026` signature。`messages/ja.json` に `board.sidebar.*` 13 キー追加
- **BoardRoot 統合** — Sidebar を BoardRoot に mount、`sidebarCollapsed` state + F キー global listener、`sidebarCounts` derived from items (isRead/isDeleted ベース)、`handleSidebarToggle` useCallback
- **Glass visibility fix** — 初回デプロイで `:global(.glass)` CSS Module スコープバグで glass チップが高さ 0 になりサイドバーがほぼ見えなかった → `<LiquidGlass className={styles.sidebarGlass}>` で className prop 経由に修正。さらに refraction が実機で効いていないため `--glass-clarity: 0.04 → 0.35` / `--glass-blur: 0 → 6px` でベースライン視認性確保 (CSS var なので後調整可)
- **実機確認** (2026-04-20 セッション後半):
  - ✅ サイドバー表示 OK (ロゴ/検索/Library/Folders/テーマ/signature 全部見える)
  - ⚠️ **リキッドガラスの屈折は実機で効いてない** — `backdrop-filter: url(#id)` の Chrome 互換性か feDisplacementMap 設定要再調査。MEMORY に `feedback_glass_blur_tuning.md` 記録、Batch B or polish で戻る
  - ⚠️ **「グリッドボタン押しても全カード整列しない」既知バグ** — 現在は「モード切替」で再レイアウトが部分的にしか効いてない。Batch B Task 6-8 で「整列アクション化」すれば解決予定 (Task 7 `alignAllToGrid` が全カード強制再計算する)
- 全 commits は `claude/b1-placement` に積まれ **origin に push 済**

### 🚨 次セッション起床後の最優先アクション

1. **`docs/private/launch-plan-2026-04.md` を読む** (非公開、launch 戦略の詳細 day-by-day プラン、2026-04-21 大幅改訂版)
2. **`docs/TODO.md` (このファイル) を読む** ← 今ここ
3. **現時点の選択肢 (user 判断)**: 詳細は `docs/private/launch-plan-2026-04.md` および `docs/private/IDEAS.md` 参照。次着手候補のラインナップは private 側で管理。

### 保留中の tweet 下書き（2026-04-21 作成、見栄え強化後に投稿）

**Task 6 完了 build-in-public 第 1 投稿**（140 字、案 A）:

```
Booklage、ブクマでコラージュを作れる Web アプリを作ってます。今月 5/5 ローンチ目標。
今日は Task 6 完了：canvas を常時自由配置化して、「整列」はボタン操作に分離しました。

https://booklage.pages.dev
#個人開発 #buildinpublic
```

**スクショ構成**: 通常 Chrome (`@men_masaya` 側) で `booklage.pages.dev/board` を最大化、カード 8-12 枚載ってる状態で **Win+Shift+S で矩形切り取り**。左端: sidebar 左端、右端: カードクラスタ右端付近、上端: Toolbar のすぐ上、下端: カード 2-3 行見える位置。横 1600×縦 900 (16:9) 目安。

投稿元は `@men_masaya` (既存 562 フォロワー、build-in-public は personal account から)。`@booklage_app` は放置で OK。

### Plan B (次着手候補)

Share System — ShareModal full-screen + フレーム drag/resize + SNS Web Intents + Web Share API + brotli URL encoding + importer + ウォーターマーク。Batch B 完了 → **次セッションで brainstorming → spec → plan → 実装** の流れ。

### 旧進捗 (2026-04-19 B1-placement Task 1-10 + Task 13-20 実装 — 一部 Plan A で superseded)

- **Task 20 (aa3d2b8 + 368a4a0)** — `FramePresetPopover.tsx` 本実装 + `.module.css` 新規。Task 19 で作った stub (// TODO(Task 20)) を SNS 9 プリセット + Custom 入力 UI に置換。9 preset tile (Instagram/Story/Reels/IG Landscape/X 横/X 縦/Pinterest/YT Thumb/A4) + 別描画の Custom tile、`isCustom` 時のみ width×height input + Apply button。**design override**: Shopify-tier glass chrome (rgba(255,255,255,0.98) + blur 10px + 12px radius + 紫 tinted shadow `0 8px 28px rgba(15,15,25,0.14)` + 1px hairline border)、selected は neutral `#1a1a1a` (Toolbar active と整合、violet は input focus ring のみ edit affordance として採用)、top: 56px (Toolbar との gap 詰め)。**plan バグ修正**: customW/customH の `useState` 初期値を `currentRatio.kind === 'custom' ? currentRatio.width : 800` に変更 (plan のまま 800 固定だと popover 再開時に state が消える)。**NaN guard + apply-time clamp** 方式: onChange は clamp せず自由入力、Apply ボタン押下時のみ `FRAME.MIN_PX` / `MAX_PX` で clamp (UX: 打ってる途中で "30" → "3000" の mid-typing を妨げない)。**a11y**: PresetCard を `<button type="button" aria-pressed>` に、container `role="group" aria-label` で labelled group、input に `aria-label={t(...)}` で i18n 経由。**code review で Important 3 件 fix** (368a4a0): aria-label のハードコード日本語 → i18n (`widthLabel`/`heightLabel` キー追加)、`role="dialog"` → `role="group"` downgrade (focus trap 未実装で dialog を名乗る矛盾解消)、未使用 `onClose` prop を Props 型と Toolbar 呼び出し両方から削除。`messages/ja.json` に `board.frame.popover.{title,applyCustom,widthLabel,heightLabel}` + `board.frame.preset.custom` の 5 キー追加。preset ラベルは `preset.label` 直接参照 (messageKey は Task 25 i18n 展開のため残置)。outside-click / ESC close は未実装 (Task 19 simplicity-first pattern 踏襲、将来必要になったら prop + 実装をセットで追加する方針)。82 vitest pass / tsc clean


- **superpowers:subagent-driven-development** で Task 1 から順次実装、implementer → spec reviewer → code-quality reviewer の二段レビュー loop を全タスクで実施
- **Task 1 (b58638b)** — `types.ts` に `LayoutMode` / `FreePosition` / `FrameRatio` / `BoardConfig` / `SnapGuideLine` / `CardRightClickAction` 追加
- **Task 2 (9ca2fc8)** — `constants.ts` に RESIZE / SNAP / ROTATION / Z_ORDER / FRAME / MODE_TRANSITION / UNDO 追加、`CARD_SIZE_LIMITS` を `RESIZE` にリネーム・値変更（MIN 80, MAX 1200）
- **Task 3 (367ad11)** — `aspect-ratio.ts` 新規、12 URL 種別 → アスペクト比推定の純関数 + 20 テスト
- **Task 4 (1a08532 + 5f0805e)** — `frame-presets.ts` 新規、SNS 9 プリセット + custom、8 テスト。spec 内部矛盾（custom clamp vs test）を TDD 原則に従って「test pass 優先」で解決（clamp 削除、caller 側で validation すべき旨のメモ）
- **Task 5 (61d9f7b)** — `free-layout.ts` 新規、snap guides / applySnap / bleed detection の純関数 + 8 テスト
- **Task 6 (a0fedfc)** — `auto-layout.ts` に `computeGridLayoutWithVirtualInsert` 追加（drag preview 用）、`auto-layout.test.ts` 新規 9 テスト
- **Task 7 (b19c9d2)** — IndexedDB v5→v6 migration、`BookmarkRecord` に isRead/isDeleted/deletedAt、`CardRecord` に locked/isUserResized/aspectRatio 追加
- **Task 8 (a0bfa59)** — `lib/storage/board-config.ts` 新規、`loadBoardConfig` / `saveBoardConfig` / `DEFAULT_BOARD_CONFIG`、fake DB での 2 テスト
- **Task 9 (ab76cd4 + 348da9a)** — `use-board-data.ts` を全面書き換え。`BoardItem` に freePos / isRead / isDeleted / aspectRatio / gridIndex 追加、`computeAspectRatio` 3 段階優先（isUserResized → cached → 推定）、persistFreePosition / persistGridIndex / persistReadFlag / persistSoftDelete の 4 persist 関数。BoardRoot 互換のため persistCardPosition を @deprecated shim として残存（Task 13 で除去）。後追い fix で コメント精度 + bookmarkId guard + computeAspectRatio の unit test 5 個追加
- **Task 10 (d06b672 + 93b485a)** — `components/board/SnapGuides.tsx` + `.module.css` 新規作成。plan 仕様通り verbatim の純 UI コンポーネント（Figma 風ピンク線 `#ff4080`、vertical / horizontal / spacing の 3 種）、`BOARD_Z_INDEX.SNAP_GUIDES = 25`、プロップは `guides: ReadonlyArray<SnapGuideLine>` + optional `offsetX/Y`。code-quality reviewer の指摘で `: React.ReactElement | null` return type 明示を追加（CLAUDE.md「return type は常に明示」に合わせる）
- **Task 13 (d376136 + 21710bb)** — **plan の順序を入れ替えて Task 11 より先に実装**（Task 11 が layoutMode state を前提にしてて、state 未導入だと動作確認不可だったため）。`BoardRoot` に `layoutMode: LayoutMode` と `frameRatio: FrameRatio` の 2 state 追加、mount 時に IndexedDB の board-config から hydrate（cancelled guard 付き async useEffect）、`handleModeChange` / `handleFrameRatioChange` を useCallback 化。plan Step 2（子コンポへの props 配線）は Task 14 で完了
- **UX polish 4 連発（Task 19 後、ユーザー実機確認 → 即フィードバック反映）**:
  - **(1) 83b99c8** — `BOARD_INNER` constants (max-width 1400 + side-padding 64) 追加、cards 中央寄せ、ResizeHandle hover 時のみ表示 (`hoveredId` + `resizingId` state で active resize 中も持続表示)、Space+drag pan + 中クリック pan を InteractionLayer に追加
  - **(2) fbdf454** — ThemeLayer を offset wrapper の外に分離 (背景 = viewport 全幅キープ、cards のみ中央寄せ)、hydration mismatch 解消
  - **(3) 2fe71d3 + 0e023dc** — Space+drag bug fix: `spaceHeld` state を BoardRoot に lift up、CardsLayer 側で early-bail (no stopPropagation) → InteractionLayer まで bubble、`body.user-select: none` + `e.preventDefault()` で native 選択枠抑止
  - **(4) 4ac1f84** — final fix (Space+drag が完全動作)
  - 全部実機テスト済、tsc clean / 82 vitest pass
- **Task 19 (426c5dc + 849bdb1)** — `Toolbar.tsx` + `.module.css` 新規作成、Shopify.design tier の pill toggle (top-center fixed、backdrop-blur 10px、`#1a1a1a` neutral active state、`rgba(15,15,25,0.1)` violet-tinted shadow)。BoardRoot に mount して `layoutMode`/`frameRatio`/`themeId` 切替がついに動く。FramePresetPopover stub も同時作成 (Task 20 で本実装)。`messages/ja.json` に `board.mode = { grid, free }` + `board.toolbar = { theme, export, share }` 追加。**重要な統合**: BoardRoot の旧 debug theme buttons 削除、`handleModeChange`/`handleFrameRatioChange` の eslint-disable も外して finally 正規 callback として認識される。`handleThemeClick` は theme cycle (localStorage で永続化、IDB themeId は dead state なので TODO コメント残置)。code review approved with minor revisions、polish (849bdb1) で I3 (try/catch + dev-only console.error で IDB 失敗を可視化)、N2 (dead i18n keys 削除)、N3 (sep に `role="separator"` + `aria-orientation`)、N6 (CSS コメントで「neutral chrome / violet edit affordance」分離方針 + 「always-light pill」決定を明文化)、I2 (theme dual-source TODO コメント) を一括対応。残 I1 (theme-aware pill 暗背景対応) は Notion/Figma パターンを採用して常に明るい chrome 維持で確定（後で実機で違和感あれば再考）。82 vitest pass / tsc clean
- **Task 18 (695fe98 + 17d481c)** — `ResizeHandle` を 1 ハンドル → 8 ハンドル化（4 隅 aspect-locked + 4 辺 free-axis）。新 props (`currentW/currentH/aspectRatio/onResize/onResetToNative`) で旧 API を完全置換、CardsLayer の call site も新 prop shape に更新、BoardRoot に `handleCardResetToNative` 追加。**design override**: Booklage 紫枠 + Shopify-tier polish (resting box-shadow + hover scale 1.15 + active scale 0.92 + 120ms ease-out)、JP a11y `LABELS` map で 8 hand の `aria-label` (`角リサイズ（左上）` 等)。**plan のバグも先回り修正**: corner aspect-lock を W 軸固定式 → larger-axis (`Math.abs(dx) > Math.abs(dy)`) に変更、redundant `||` 句簡素化。code review で I1 (毎ムーブ persist で 120Hz re-render の perf 懸念) 発見、17d481c で `onResizeEnd` を再導入 → BoardRoot に `handleCardResizeEnd` 追加して drag-end のみ persist する形に変更。残り I2 (top/left ハンドル drag で位置 anchor が動かない UX 問題) は plan-accepted limitation として L86-90 にコメント、free-mode 統合タイミングで対応予定。82 vitest pass / tsc clean
- **Task 17 (ee4bf85 + d5ca5ae)** — `RotationHandle.tsx` + `.module.css` 新規作成。14×14 白丸 + 12px tick line を選択カードの 24px 上に配置、pointer-capture で角度ドラッグ → 15° snap (Shift で自由) + double-click で reset。**design override**: Booklage 紫 (`var(--color-accent-primary)`) + Shopify-tier polish (resting drop shadow + hover で 4px glow ring + scale 1.08, active で scale 0.96, 140ms ease-out transition)、JP a11y (`aria-label="回転ハンドル"`)。React 19 で global `JSX` 名前空間が消えたので component return type に `ReactElement` 使用。code review で C1 (atan2 wrap-around → ±180° 跨ぐと 360° flip)、I1 (`role="slider"` + `aria-valuenow/min/max` 追加で AT に届く)、I2 (props を `cardCenterClientX/Y` に rename → 座標系を self-document) を発見、d5ca5ae で 3 件まとめて修正。**Task 17 はコンポーネント単独作成のみ — CardNode/CardsLayer への wiring は未来タスク**。82 vitest pass / tsc clean
- **Task 16 (3ee422a + 686ac86 + 0a1b0cd)** — `CardsLayer` に free-drag 状態機械を追加 (FreeDragState / freeDragStateRef / snapGuides)、`gridToFreePosition` を inline helper として作成、`handleCardPointerDown` で grid mode は既存 `useCardDrag` passthrough・free mode は内部 pointer-capture 状態機械に分岐。shift キー window listener で snap on/off リアルタイム切り替え。`displayedPositions` で drag 中のみ該当カードを上書き（render + GSAP `useLayoutEffect` + culling 全部に効く）、morph `useEffect` の deps は `activePositions` のままで drag が mode morph を kick しないよう保護。SnapGuides は `layoutMode === 'free'` 時のみ render。`onPersistFreePos` prop を required で BoardRoot から `useBoardData().persistFreePosition` を配線。**code review で C1 (snap-back 回帰)** 発見 — `persistFreePosition` が IDB だけ書いて local items を更新せず、drag 後に古い `freePos` から再 derive されてカードが元位置に snap back する致命バグ。fix (686ac86) で setItems 追加、followup (0a1b0cd) で setItems を await 前に移動して **optimistic update** 化、これで「同 React 用イベントハンドラ tick 内 batch」によりワンフレームの中間 paint も無し。同時に I2 (setSnapGuides を setFreeDragState updater 内から外出し、Strict Mode 二重実行への備え)、I3 (`onPersistFreePos` 必須化)、N1 (selectedIds deferred の 1 行コメント) も解決。82 vitest pass / tsc clean
- **Task 15 (416966c + 2c0d499 + 2a84b99)** — `CardNode` を outer/inner 2-div 構造に refactor。outer は full-size relative + drag handler、inner は rotation transform + 視覚 chrome (white bg, border, radius) + selection outline。新 props: `rotation?` / `selected?` / `locked?`。**ユーザー承認の design override**: 選択枠は plan の Figma青 `#3080e8` ではなく Booklage brand 紫 `var(--color-accent-primary)` (#7c5cfc) + glow halo `var(--color-selection-glow)` (Shopify.design tier polish)。lock indicator は plan の 🔒 emoji ではなく **Lucide-style inline SVG** (1.75 stroke, conditional render) を `backdrop-filter: blur(6px)` glass chip 内にマウント。a11y: chip に `role="img"` + `aria-label="ロック中"`。spec review で dead `position` prop 削除（2c0d499、Task 14 で wrapper 移管したため不要）。code quality review で nit 7 件中 0 critical/important、polish (2a84b99) で halo を CSS var 化 + JP a11y label 化を反映。82 vitest pass / tsc clean
- **Task 14 (2587634 + 7c68ee5 + 94c80be)** — `CardsLayer` を items + layoutMode 受け取り型に refactor、`gridLayout = computeAutoLayout(...)` を CardsLayer 内に移動、`freeLayoutPositions` で `it.freePos` 優先＋grid fallback、`activePositions` を mode で分岐。`gsap.timeline` で morph 実装。BoardRoot 側は CardsLayer JSX を新 props に差し替え、`cardsForLayer` useMemo 削除、`targetRowHeight` / `layoutGap` を hoist。spec review で dead `renderCardChildren` prop 削除（7c68ee5）。code review で C1（useLayoutEffect が gsap.set で先に最終位置スナップ → morph 無音）と C2（in-flight tween が unrelated re-render で消される）の race を発見、`morphTimelineRef` + `prevModeRef !== layoutMode` / `morphTimelineRef.isActive()` の二重 guard で修正（94c80be）。再 review で StrictMode / rapid toggle / unmount mid-morph 全て OK 確認、approved。**Task 19 で Toolbar 結線するまで無音バグは表面化しない設計だが、先回りで潰した**
- **全 commits** は `claude/b1-placement` ブランチに積まれ **origin に push 済**

### ⚠️ 次セッションの最初にやってほしい後処理

**worktree 物理ディレクトリの手動削除**（Windows ファイルロックで自動削除失敗が残存）:

`.claude/worktrees/` 配下の以下の 2 つは本セッションでも PowerShell/bash 両方で削除失敗。エクスプローラーで物理削除してください：

- `lucid-bardeen-c9a786/`
- `quirky-wilson-41d2b5/`

**削除済み**: `b0-impl/`, `cool-archimedes-0b85f7/`, `hardcore-yalow/`

**アクティブ worktree**（触らない）: `b1-placement/`（今回の作業ツリー）, `condescending-vaughan-e85ea7/`, `practical-brown-e05704/`, `relaxed-bartik-75778e/`, `zen-gould-55806b/`, `tender-chaplygin-e7c89c/`（前セッション）

### B1-placement 実装計画の要点

- Grid モードと Free モードの 2 切替。ボード設定（layoutMode + frameRatio）は永続化
- 中身に応じたアスペクト比マッピング（YouTube 16:9、長文ツイート 3:4 等、12 パターン）
- Free モード: ソフト境界フレーム + SNS プリセット + desaturated 外側 + ブリード配置
- カード変形（Free のみ）: 回転（Shift で自由）、8 ハンドルリサイズ、alignment snap（Shift で OFF）、z-order
- 右クリック: 既読 / 削除（10s Undo トースト）/ z-order / ロック
- Shopify.design tier の UI chrome、Designmd Style Extractor で数値抽出
- IndexedDB v5→v6 migration + `freePos` / `isRead` / `isDeleted` 追加 ← **Task 7 で完了**
- Grid drag: A++ Insert + FLIP reflow、C-pure は post-B1 upgrade として design 済

### B1-placement 残タスク（Task 10-27、次セッション以降）

**UI 層** (Task 11-24):
- Task 11: Grid drop indicator + virtual insert 統合（plan のコード例は現構造と divergence あり、BoardRoot が drag state 持つ形に適応して実装する予定）
- Task 12: FLIP animation (GSAP) for grid reflow
- Task 21: `Frame.tsx` visualizer + desaturation ← **次セッションここから**
- Task 22: `CardContextMenu.tsx` 右クリック
- Task 23: `UndoToast.tsx` + soft delete flow
- Task 24: z-order keyboard shortcuts + lock

✅ **完了**: Task 14 / 15 / 16 / 17 / 18 / 19 / 20 + UX polish 4 連発

**仕上げ** (Task 25-27):
- Task 25: i18n 文字列 15 言語追加
- Task 26: Playwright E2E（6+ シナリオ）
- Task 27: 1000-card パフォーマンス regression

### 次セッション最優先タスク

1. **B1-placement Task 21 (Frame visualizer) から継続** — `.claude/worktrees/b1-placement/` に入って `superpowers:subagent-driven-development` で着手。plan は `docs/superpowers/plans/2026-04-19-b1-placement.md` §Task 21 (line 2651〜)。Free モードで選択された frameRatio の境界線を可視化 + outside 領域を desaturate する UI。Task 20 で `FramePresetPopover` が完成してるので Free モード切替 → preset 選択 → フレーム可視化の流れが繋がる
2. **または Task 11 (Grid drop indicator + virtual insert 統合) を先にやる選択肢あり** — plan の順番だが、Task 11 は BoardRoot 側で drag state を持つ形に「plan のコード例から構造を適応」する必要あり (TODO.md の「plan 順序変更」メモ参照)。Task 21 の方が既存構造に綺麗に乗る
3. **このセッションで保管した重要アイデア**: `docs/private/IDEAS.md` に bath idea 追加済 — **常時 dashboard + focus mode (F キー) + liquid glass 被り** B2 候補、**韓国系参考は失われたまま** (ユーザーが思い出したら追記、2026-04-19 に `ryuri-r` の Postype 記事は発見したが dashboard 参考ではないと確認)。Task 21 直前に IDEAS.md 一読推奨
4. **Privacy 大掃除はもう完了**（バックアップ branch 削除済）— 過去のような worktree orphan 物理削除作業は不要

### 引き継ぎ時の重要メモ

- **Task 4 spec 内部矛盾メモ**: `computeFrameSize({ kind: 'custom', ... })` は現在 clamp しない実装。UI から custom サイズを受ける時は caller 側で FRAME.MIN_PX / MAX_PX に clamp する必要あり（実装時に気をつける）
- **Task 6 テスト extra**: `auto-layout.test.ts` に spec 指定より多い tests が含まれる（既存 `computeAutoLayout` baseline 4 + virtual insert 5）。害はないので削除不要
- **Task 7 DB migration**: worktree で DB_VERSION が 6 になった。master にマージする前に既存 booklage.pages.dev ユーザーの DB が自動 migration される設計（fire-and-forget cursor）。migration 失敗時のフォールバック無しなのは既存 v1-v5 パターン踏襲
- **Foundation + data integration 層 (1-9) と UI 層 (10-27) の境界**: Task 10 から UI 依存が増える。実装中に subagent が NEEDS_CONTEXT で止まる率が上がる見込み。controller は sonnet モデル昇格を検討
- **Task 9 メモ**: code-quality reviewer が指摘した `updateCard` のエラー silent swallow (Important #1) と `dbRef` の weak cast (Minor #4) は deferred。Task 13 (BoardRoot 書き直し) でエラーバウンダリを設計する際に併せて対応する予定
- **Task 10 メモ — 既存 React コンポーネントの return type 欠落**: `components/board/ThemeLayer.tsx` / `BoardRoot.tsx` は return type 未明示。CLAUDE.md「return type は常に明示」に違反。Task 10 の reviewer 指摘で発覚。他の新規コンポーネント（marketing/*, bookmarklet/SavePopup）は `: React.ReactElement` を明示済で整合済。将来の small cleanup で両ファイルに `: React.ReactElement` を追加すれば足りる
- **Task 13 メモ — plan Step 2 は未実装（意図的）**: plan の Task 13 Step 2 は `layoutMode` を `CardsLayer` / `InteractionLayer` / `Toolbar` に props 配線する記述だったが、現時点で各コンポーネントは該当 prop を受け取らない signature。plan 通りに wire すると build が壊れる旨 plan 自身も acknowledge（"signatures may error"）。controller 判断で Step 2 をスキップし、各コンポが必要としたタイミング（Task 14/11/19）で配線する方針に変更
- **Task 13 メモ — handler 未消費の eslint suppression**: `handleModeChange` / `handleFrameRatioChange` は定義済だがまだ UI に wire されてない（Task 19 の Toolbar で消費予定）。`// TODO(Task 19): wire into Toolbar` コメント + `// eslint-disable-next-line @typescript-eslint/no-unused-vars` で一時的に silence。Task 19 時点で必ず消すこと
- **plan 順序変更 — Task 11 ⇄ Task 13**: plan は Task 11 → Task 13 の順だが、Task 11 が `layoutMode` state を前提にしてた（plan のコード例内で `layoutMode === 'grid'` 分岐あり）。state がないと Task 11 の動作確認が不可能だったので Task 13 を先行実装。次は Task 14（CardsLayer mode 分岐）→ Task 11（Grid drag、ただし plan のコード例は CardsLayer が自前で drag state 持つ前提で現構造と不整合なので、BoardRoot が drag state 持つ形に適応して実装）→ Task 12 → 以降 plan 順の順序で進める予定
- **IDEAS.md sync**: 本セッションでは修正していない。`b1-placement` worktree と メインリポ両方で同一

### 2026-05-19 以降に削除する remote backup branch

- `git push origin --delete backup-pre-filter-repo-2026-04-19` （Phase 2 力ずくロールバック用、1 ヶ月で十分）

### 重要な技術判断（確定済み）

1. **B0 6層構成** — BoardRoot / ThemeLayer / CardsLayer / InteractionLayer / CardNode / ResizeHandle、`lib/board/*` に純関数レイアウト
2. **InteractionLayer は scrolled content を children として wrap する** — 直下 wrapper に `pointer-events: none`、カードだけ `auto`
3. **viewport culling** — 1-screen buffer で 1000 カード → DOM 66 枚
4. **i18n は静的 ja.json import** — next-intl 未導入。locale 化は将来スプリント
5. **IndexedDB v4 スキーマは現状維持** — rotation / scale / zIndex / gridIndex は dead column のまま（v5 マイグレーションは不要になるまで保留）

### B0 で削除された旧実装（git history 参照）

- `lib/glass/*`, `lib/sphere/*`, `lib/interactions/*`, `lib/theme/*`, `lib/import/*`, `lib/scraper/*`
- `lib/canvas/{auto-layout,use-infinite-canvas,collision}.ts`
- `components/board/*` の旧 UI 全系統（Canvas, BookmarkCard, DraggableCard, CustomCursor, Sphere*, SettingsPanel, FolderNav, UrlInput, ViewModeToggle, ThemeSelector, ExportButton, RandomPick, ColorSuggest, BookmarkListPanel, TweetCard, VideoEmbed, card-styles/）
- `components/import/*`（ImportModal 等）、`components/pwa/InstallPrompt`、`components/bookmarklet/BookmarkletBanner`

→ 再実装時はまず `docs/archive/liquid-glass-notes.md` / `docs/archive/sphere-navigation-notes.md` を読む

---

## 次にやること: リビルドフェーズ

`docs/REBUILD_VISION.md` の方針で B(board) → C(LP) → D(cards) → A(sphere)。B0 が完了したところ。

### 最優先（マージ直後にやる）

- [ ] **Task 17: B0 の実データ視覚調整**
  - `/board` を実ブラウザで開き、既存ブクマで auto layout の手触りを確認
  - `lib/board/constants.ts::LAYOUT_CONFIG` の `TARGET_ROW_HEIGHT_PX` / `GAP_PX` を必要なら微調整
  - 「触ってて気持ちいい」ラインまで来てから B1 へ進む

### 次フェーズ候補（ユーザー判断）

- **B1 装飾レイヤー**: kube.io 方式の液体ガラス再実装、カードスタイル、スプリング物理、3D タイル演出
  - 参照: `docs/archive/liquid-glass-notes.md`、`docs/private/IDEAS.md`（非公開）
- **B2 ブクマ管理再統合**: URL 入力 / フォルダ / インポート / 設定パネルを BoardRoot に戻す
  - 旧実装は B0 で完全削除済。git history から発掘してフルスクラッチ
- **B3 3D 球体ナビ再接続**: `theme-registry` に `direction: 'sphere'` を足して再統合
  - 参照: `docs/archive/sphere-navigation-notes.md`
- **C LP リビルド**: `app/(marketing)/` と `app/page.tsx` 全面刷新
- **D カードスタイル拡充**

### 未着手（スプリント未切）

- [ ] html-in-canvas（ブラウザ未実装、待ち）
- [ ] S4: 広告基盤（ユーザーが付いてから）

---

## 確定した設計方針

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- 無限キャンバス: Figma/Miro風
- B0 以降は「装飾ゼロの骨組み」を常に維持し、装飾は差し込み可能な形で追加する

## B1 の核ビジョン: 「Booklage 上で複数動画／音を同時ミックスして世界を作る」

ユーザー発案 2026-04-19、B1 で実装する重要機能の一つ。

**例**: クラシック音楽 + 森の散歩動画、ポケモンシティ BGM + 勉強机、AAA ゲーム trailer + 深海生物、etc.

**技術的実現性**: 全て合法・公式 embed あり
- YouTube: `youtube.com/embed/<id>` iframe（公式・利用規約明示許諾）
- TikTok: 公式 embed API
- Twitter/X: `react-tweet`（以前削除したので B1 で戻す）
- Vimeo / SoundCloud / Spotify: iframe 公式対応
- 複数同時再生: ブラウザ制限なし。音は各カードにミュートトグル、通常は 1 枚だけ unmute

**B1 実装時の論点**（brainstorming 必須）:
- click の意味を「新タブで開く」→「カード内で再生」に変える
- 再生中カードのアスペクト比を 16:9 に自動調整
- 音声競合の UX（自動 mute / 手動 unmute 切替）
- 同時再生時のパフォーマンス（iframe 多数 → 帯域 + CPU）
- ミックス状態の保存・共有（URL 圧縮エンコード方式で「このミックス」を SNS シェア？）

## アイデア・やりたいこと

- **B1 で優先したい**: **中身に応じてカードの縦横比を変える**（ユーザー発案 2026-04-19）
  - 長文ツイート → 縦長（3:4 / 1:2 など）、画像付きツイート → 横長（16:9）、YouTube → 16:9
  - 形が揃わない方が Moodboard 的な視覚リズムが出て見ていて楽しい
  - 実装箇所: `lib/storage/use-board-data.ts::toItem` の `aspectRatio` を IndexedDB 固定値ではなく「URL種別 + OGP メタから推定」に差し替え
- **B1 で優先したい**: **ドラッグ UX の brainstorming 済み版を実装**
  - 候補: Reorder drag vs Free placement vs Hybrid（詳細は docs/superpowers/specs/ 参照）
  - multi-playback の「ミックス配置」ニーズと合わせて設計
- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- LPの磨き上げ（マーケティング開始前に実施）
- LPは明るいテーマをデフォルト
- 複数動画の同時再生は B1 の中核機能の一つ
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
