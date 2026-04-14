import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Booklage — bookmark collage app.',
}

export default function FaqPage(): React.ReactElement {
  return (
    <>
      <h1>FAQ</h1>
      <p className="updated">よくある質問</p>

      <h2>Booklage とは何ですか？</h2>
      <p>
        Booklage は、あらゆるWebサイトのブックマークをビジュアルコラージュとして
        管理・共有できる無料のWebアプリです。ブックマークを「整理」するのではなく
        「表現」するツールです。
      </p>

      <h2>無料で使えますか？</h2>
      <p>
        はい、完全に無料です。アカウント登録も不要です。ブラウザがあればすぐに始められます。
      </p>

      <h2>データはどこに保存されますか？</h2>
      <p>
        すべてのデータはあなたのブラウザ内（IndexedDB）に保存されます。
        サーバーにデータを送信することは一切ありません。あなたのブックマークは
        完全にプライベートです。
      </p>

      <h2>ブックマークレットの使い方を教えてください</h2>
      <ol>
        <li><a href="/board">Board ページ</a>を開きます</li>
        <li>左下の「📌 Booklage に保存」リンクを見つけます</li>
        <li>そのリンクをブックマークバーにドラッグ＆ドロップします</li>
        <li>保存したいWebサイトを開き、ブックマークバーの「Booklage に保存」をクリックします</li>
        <li>ポップアップでフォルダを選んで「保存」をクリックします</li>
      </ol>

      <h2>どのブラウザに対応していますか？</h2>
      <p>
        Chrome、Edge、Firefox、Safari の最新版に対応しています。
        最高の体験のために Chrome または Edge の最新版をおすすめします
        （リキッドグラス効果は Chrome 系ブラウザでのみ利用可能です）。
      </p>

      <h2>スマホでも使えますか？</h2>
      <p>
        はい、スマートフォンのブラウザでも利用できます。
        URL をコピーして Board ページに貼り付けることでブックマークを保存できます。
      </p>

      <h2>コラージュを共有する方法は？</h2>
      <p>
        Board ページの右上にある「画像として保存」ボタンでコラージュを PNG 画像として
        ダウンロードできます。そのまま SNS にシェアしてください。
        また「X でシェア」ボタンでワンクリック投稿も可能です。
      </p>

      <h2>ブラウザのデータを消したらどうなりますか？</h2>
      <p>
        ブラウザのデータ（キャッシュ、Cookie 等）を消去すると、Booklage のデータも
        削除されます。データはブラウザ内にのみ存在するため、サーバーからの復元はできません。
        大切なコラージュは画像として保存しておくことをおすすめします。
      </p>

      <h2>対応しているサイトは？</h2>
      <p>
        あらゆる Web サイトに対応しています。特に以下のサイトは専用の表示に対応しています：
      </p>
      <ul>
        <li><strong>Twitter/X</strong> — ツイートのリッチ表示</li>
        <li><strong>YouTube</strong> — 動画サムネイル表示</li>
        <li><strong>TikTok</strong> — 動画サムネイル表示</li>
        <li><strong>Instagram</strong> — 投稿サムネイル表示</li>
        <li><strong>その他</strong> — OGP 情報（タイトル、説明、画像）を自動取得</li>
      </ul>

      <h2>オープンソースですか？</h2>
      <p>
        はい。Booklage のソースコードは{' '}
        <a href="https://github.com/masaya-men/booklage" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        {' '}で公開されています。プライバシーを重視する方は、コードを直接確認いただけます。
      </p>

      <h2>他に質問がある場合は？</h2>
      <p>
        <a href="/contact">お問い合わせページ</a>からご連絡ください。
      </p>
    </>
  )
}
