import type { Metadata } from 'next'
import Link from 'next/link'

import { GuideCalloutDragLink } from '@/components/bookmarklet/GuideCalloutDragLink'

export const metadata: Metadata = {
  title: 'Guide',
  description:
    'AllMarks の使い方ガイド — ブックマークレットの設置から、ボード上でのコラージュ操作まで。',
}

export default function GuidePage(): React.ReactElement {
  return (
    <>
      <aside className="guide-callout" role="note" aria-label="bookmarklet update notice">
        <h2>ブックマークレットを更新しました (2026-05-09)</h2>
        <p>
          PiP 表示中は popup なしの静かな保存に切り替わります。それ以外は従来どおりです。
          古いブックマークレットも引き続き動作はしますが、PiP との見た目被り問題が残るため、入れ替えを推奨します。
        </p>
        <p>
          下のリンクをブックマークバーへ <strong>ドラッグ&ドロップ</strong> してください。
        </p>
        <p>
          <GuideCalloutDragLink />
        </p>
      </aside>

      <h1>Guide</h1>
      <p className="updated">使い方ガイド</p>

      <h2>はじめに</h2>
      <p>
        AllMarks はアカウント登録もインストールも不要です。
        ブラウザがあれば 30 秒で始められます。手順は以下の 3 ステップのみ。
      </p>
      <ol>
        <li>ブックマークレットをブックマークバーに設置する</li>
        <li>保存したい Web サイトでブックマークレットをクリックする</li>
        <li>Board に戻ってコラージュとして眺める</li>
      </ol>

      <h2>1. ブックマークレットの設置</h2>
      <p>
        ブックマークレットは、Web サイト上で実行できる小さなプログラムです。
        AllMarks では、これを使ってあらゆるサイトをワンクリックで保存します。
      </p>
      <ol>
        <li><Link href="/board">Board ページ</Link>を開きます</li>
        <li>初回は中央に「ようこそ」画面が表示されます。「ブックマークレットを設置」をクリック</li>
        <li>表示された「📌 AllMarks に保存」リンクを、ブラウザのブックマークバーに <strong>ドラッグ&ドロップ</strong> します</li>
        <li>ブックマークバーに「AllMarks に保存」が現れたら設置完了</li>
      </ol>
      <h3>ブックマークバーが見えない場合</h3>
      <ul>
        <li><strong>Chrome / Edge</strong>: <code>Ctrl + Shift + B</code>（Windows）/ <code>⌘ + Shift + B</code>（Mac）でブックマークバー表示切替</li>
        <li><strong>Firefox</strong>: ツールバーを右クリック → 「ブックマークツールバー」→「常に表示」</li>
        <li><strong>Safari</strong>: 表示メニュー → 「お気に入りバーを表示」</li>
      </ul>

      <h2>2. ブックマークを保存する</h2>
      <ol>
        <li>保存したい Web サイト（X の投稿、YouTube 動画、ブログ記事、なんでも）を開きます</li>
        <li>ブックマークバーの「📌 AllMarks に保存」をクリックします</li>
        <li>ポップアップで自動的にタイトルとサムネイルが取得されます</li>
        <li>そのまま「保存」をクリックすると Board に追加されます</li>
      </ol>
      <p>
        メディアの種類は自動判別されます。X / YouTube / TikTok / Instagram は専用カードに、
        それ以外は OGP 画像つきの一般カードとして表示されます。
      </p>

      <h2>3. コラージュを楽しむ</h2>
      <p>
        Board は保存したブックマークがビジュアルカードとして並ぶ場所です。
        ここで自由に整理・閲覧できます。
      </p>

      <h3>カードの操作</h3>
      <ul>
        <li><strong>クリック</strong> — Lightbox（拡大表示）が開き、動画ならその場で再生されます</li>
        <li><strong>右クリック</strong> — そのカードを削除（ゴミ箱に移動）</li>
        <li><strong>ホバー</strong> — カード横に S / M / L のサイズ切替ボタンが現れる</li>
      </ul>

      <h3>表示モードの切替</h3>
      <p>Board 右上のトグルで 3 つの表示モードを切り替えられます。</p>
      <ul>
        <li><strong>Visual</strong> — 画像中心、ムードボード的なコラージュ表示</li>
        <li><strong>Editorial</strong> — テキストとタイトル中心、リーダブル重視</li>
        <li><strong>Native</strong> — 最小装飾、サムネイルのみのミニマル表示</li>
      </ul>

      <h3>絞り込み</h3>
      <p>
        左サイドバーから「すべて」「アーカイブ（削除済み）」を切り替えられます。
        右クリックで削除したカードはアーカイブから確認できます。
      </p>

      <h2>4. メディアの再生</h2>
      <p>カードをクリックすると Lightbox が開き、メディアの種類ごとに最適な表示になります。</p>
      <ul>
        <li><strong>X (Twitter)</strong> — 本文・画像・動画を埋め込みで表示。動画はクリックで再生</li>
        <li><strong>YouTube</strong> — 純正プレーヤーで再生（画質変更・字幕・関連動画もそのまま使用可能）</li>
        <li><strong>TikTok</strong> — Lightbox 内で動画再生</li>
        <li><strong>Instagram</strong> — Meta の制約により Lightbox 内では再生不可。「Instagram で開く」ボタンから新しいタブで開く</li>
        <li><strong>画像 URL</strong> — 大きく拡大表示</li>
        <li><strong>一般 Web サイト</strong> — OGP 画像 + 本文 + 元ページへのリンク</li>
      </ul>

      <h2>5. データについて知っておくこと</h2>
      <ul>
        <li>
          <strong>データはこのブラウザ内のみに保存されます</strong> — 別のブラウザや別の端末で同じ AllMarks を開いても、保存したブックマークは見えません
        </li>
        <li>
          <strong>シークレットモードでは保存されません</strong> — プライベートウィンドウを閉じるとデータも消えます
        </li>
        <li>
          <strong>ブラウザのキャッシュを完全削除するとデータも消えます</strong> — 「サイトデータ」をクリアする操作にご注意ください
        </li>
      </ul>
      <p>
        詳しいデータの扱いは <Link href="/privacy">プライバシーポリシー</Link> をご覧ください。
      </p>

      <h2>6. トラブル対処</h2>

      <h3>カードが表示されない</h3>
      <ul>
        <li>ページをハードリロードしてください（<code>Ctrl + Shift + R</code> / <code>⌘ + Shift + R</code>）</li>
        <li>ブラウザの拡張機能がブックマークレットの動作を妨げている可能性があります。一時的に無効化して再試行してください</li>
      </ul>

      <h3>動画が再生できない</h3>
      <ul>
        <li>YouTube / TikTok の動画再生にはネットワーク接続が必要です</li>
        <li>Instagram は仕様により Lightbox 内で再生できません。「Instagram で開く」ボタンを使ってください</li>
        <li>動画コンテンツが削除済みの場合、サムネイルのみ表示されます</li>
      </ul>

      <h3>サムネイルが正しく表示されない</h3>
      <p>
        一部の Web サイトは OGP 画像を提供していない、または X のように特殊な仕様を持っています。
        AllMarks は自動的にメディア API へ問い合わせて補完しますが、取得できない場合はテキストカードとして表示されます。
      </p>

      <h2>困ったときは</h2>
      <p>
        うまくいかない場合は <Link href="/contact">お問い合わせ</Link> からご連絡ください。
        さらに詳しい質問は <Link href="/faq">FAQ</Link> を参照してください。
      </p>
      <p>
        準備ができたら、<Link href="/board">Board を開く</Link> から始めましょう。
      </p>
    </>
  )
}
