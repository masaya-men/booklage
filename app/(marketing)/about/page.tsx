import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About',
  description: 'About Booklage — a bookmark collage app that puts privacy first.',
}

export default function AboutPage(): React.ReactElement {
  return (
    <>
      <h1>About Booklage</h1>

      <h2>ブックマークを、もっと楽しく。</h2>
      <p>
        Booklage は「ブックマーク × コラージュ」をテーマにした Web アプリです。
        あらゆる Web サイトのブックマークを、自由に並べて、自分だけの
        ビジュアルコラージュとして楽しむことができます。
      </p>

      <h2>Why Booklage?</h2>
      <p>
        ブックマークは「あとで読む」リストに埋もれがちです。
        Booklage は、ブックマークを「整理」するのではなく「表現」するツールとして
        デザインしました。服飾学生のムードボードのように、
        お気に入りのコンテンツを自由に並べて、眺めて、シェアする体験を提供します。
      </p>

      <h2>Privacy First</h2>
      <p>
        Booklage は一切のユーザーデータをサーバーに保存しません。
        すべてのデータはあなたのブラウザ内（IndexedDB）に保存されます。
        アカウント登録も不要。完全に無料。これが私たちの哲学です。
      </p>
      <p>
        詳しくは <Link href="/privacy">プライバシーポリシー</Link> をご覧ください。
      </p>

      <h2>Open Source</h2>
      <p>
        Booklage はオープンソースプロジェクトです。
        ソースコードは{' '}
        <a href="https://github.com/masaya-men/booklage" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        {' '}で公開しています。
        プライバシーを重視する方は、実際にコードを確認して
        データが外部に送信されていないことを検証できます。
      </p>

      <h2>Tech Stack</h2>
      <ul>
        <li><strong>Next.js</strong> — React フレームワーク</li>
        <li><strong>IndexedDB</strong> — ブラウザ内データベース</li>
        <li><strong>GSAP</strong> — アニメーション</li>
        <li><strong>Cloudflare Pages</strong> — ホスティング</li>
        <li><strong>TypeScript</strong> — 型安全な開発</li>
      </ul>

      <h2>Contact</h2>
      <p>
        ご質問やフィードバックは <Link href="/contact">お問い合わせページ</Link> からどうぞ。
      </p>
    </>
  )
}
