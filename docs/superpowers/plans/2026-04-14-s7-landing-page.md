# S7: ランディングページ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スクロール連動のインタラクティブデモ型LPを実装し、AllMarksで何ができるかを体験として伝える

**Architecture:** `app/page.tsx`（Server Component）が `LandingPage`（Client Component）を読み込む。LandingPageは6つのセクションコンポーネントで構成。Lenisでスムーズスクロール、GSAP ScrollTriggerでスクロール連動アニメーション。各セクションは独立したCSS Modulesを持つ。

**Tech Stack:** Next.js App Router, Lenis (smooth scroll), GSAP ScrollTrigger (既存GSAPに同梱), CSS Modules, 既存CSS Custom Properties

**Spec:** `docs/superpowers/specs/2026-04-14-s7-landing-page.md`

---

## ファイル構成

| ファイル | 操作 | 責務 |
|---------|------|------|
| `app/page.tsx` | 改修 | LPのServer Component。LandingPageを読み込む |
| `components/marketing/LandingPage.tsx` | 新規 | LP全体のClient Component。Lenis + ScrollTrigger初期化 |
| `components/marketing/LandingPage.module.css` | 新規 | LP全体のスタイル（セクション共通 + 背景テクスチャ） |
| `components/marketing/sections/HeroSection.tsx` | 新規 | Section 1: Hero |
| `components/marketing/sections/HeroSection.module.css` | 新規 | Heroスタイル |
| `components/marketing/sections/SaveDemoSection.tsx` | 新規 | Section 2: 保存デモ |
| `components/marketing/sections/SaveDemoSection.module.css` | 新規 | 保存デモスタイル |
| `components/marketing/sections/CollageDemoSection.tsx` | 新規 | Section 3: コラージュデモ |
| `components/marketing/sections/CollageDemoSection.module.css` | 新規 | コラージュデモスタイル |
| `components/marketing/sections/StyleSwitchSection.tsx` | 新規 | Section 4: スタイル切替 |
| `components/marketing/sections/StyleSwitchSection.module.css` | 新規 | スタイル切替スタイル |
| `components/marketing/sections/ShareDemoSection.tsx` | 新規 | Section 5: 共有デモ |
| `components/marketing/sections/ShareDemoSection.module.css` | 新規 | 共有デモスタイル |
| `components/marketing/sections/CtaSection.tsx` | 新規 | Section 6: CTA |
| `components/marketing/sections/CtaSection.module.css` | 新規 | CTAスタイル |
| `lib/scroll/use-smooth-scroll.ts` | 新規 | Lenis初期化Hook |
| `lib/scroll/use-scroll-trigger.ts` | 新規 | GSAP ScrollTrigger初期化Hook |

---

## Task 1: Lenis + ScrollTrigger 基盤

スムーズスクロールとスクロール連動アニメーションの基盤Hook2つを作成。

**Files:**
- Create: `lib/scroll/use-smooth-scroll.ts`
- Create: `lib/scroll/use-scroll-trigger.ts`

- [ ] **Step 1: Lenisをインストール**

Run: `npm install lenis`

- [ ] **Step 2: use-smooth-scroll.ts を作成**

```typescript
// lib/scroll/use-smooth-scroll.ts
'use client'

import { useEffect, useRef } from 'react'
import Lenis from 'lenis'

/**
 * Initialize Lenis smooth scrolling on mount, tear down on unmount.
 * Returns a ref to the Lenis instance for external control.
 */
export function useSmoothScroll(): React.RefObject<Lenis | null> {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    // Respect user preference for reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
    })
    lenisRef.current = lenis

    function raf(time: number): void {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return lenisRef
}
```

- [ ] **Step 3: use-scroll-trigger.ts を作成**

```typescript
// lib/scroll/use-scroll-trigger.ts
'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Register GSAP ScrollTrigger plugin on mount.
 * Call this once in the top-level LP component.
 */
export function useScrollTrigger(): void {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])
}
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/scroll/use-smooth-scroll.ts lib/scroll/use-scroll-trigger.ts package.json package-lock.json
git commit -m "feat(lp): add Lenis smooth scroll and ScrollTrigger hooks"
```

---

## Task 2: LandingPage シェル + app/page.tsx 改修

LP全体のClient Componentシェルと、page.tsxの改修。まだセクションは空のプレースホルダー。

**Files:**
- Create: `components/marketing/LandingPage.tsx`
- Create: `components/marketing/LandingPage.module.css`
- Modify: `app/page.tsx`

- [ ] **Step 1: LandingPage.module.css を作成**

```css
/* components/marketing/LandingPage.module.css */

.wrapper {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* Subtle noise texture overlay */
.wrapper::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
  pointer-events: none;
  z-index: 0;
}

.content {
  position: relative;
  z-index: 1;
}

/* Section shared style */
.section {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
}

@media (max-width: 767px) {
  .section {
    padding: var(--space-12) var(--space-4);
  }
}
```

- [ ] **Step 2: LandingPage.tsx を作成**

```tsx
// components/marketing/LandingPage.tsx
'use client'

import { useSmoothScroll } from '@/lib/scroll/use-smooth-scroll'
import { useScrollTrigger } from '@/lib/scroll/use-scroll-trigger'
import styles from './LandingPage.module.css'

/**
 * Landing page root client component.
 * Initializes Lenis smooth scrolling and GSAP ScrollTrigger.
 * Renders 6 marketing sections.
 */
export function LandingPage(): React.ReactElement {
  useSmoothScroll()
  useScrollTrigger()

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        {/* Sections will be added in Tasks 3-8 */}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: app/page.tsx を改修**

```tsx
// app/page.tsx
import { LandingPage } from '@/components/marketing/LandingPage'

export default function Home(): React.ReactElement {
  return <LandingPage />
}
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/LandingPage.tsx components/marketing/LandingPage.module.css app/page.tsx
git commit -m "feat(lp): add LandingPage shell with Lenis and ScrollTrigger"
```

---

## Task 3: HeroSection（Section 1）

キャッチコピー + 浮遊カード + CTAボタン。ページロード時にブラー→フォーカスのリビールアニメーション。

**Files:**
- Create: `components/marketing/sections/HeroSection.tsx`
- Create: `components/marketing/sections/HeroSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: HeroSection.module.css を作成**

```css
/* components/marketing/sections/HeroSection.module.css */

.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-16) var(--space-6);
  overflow: hidden;
}

/* ── Floating cards background ── */

.cardsLayer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.floatCard {
  position: absolute;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: float 6s var(--ease-in-out) infinite;
  animation-delay: var(--delay, 0s);
  opacity: 0;
}

/* ── Text content ── */

.textLayer {
  position: relative;
  z-index: 1;
  max-width: 640px;
}

.label {
  font-size: var(--text-xs);
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--color-accent-primary);
  margin-bottom: var(--space-4);
  opacity: 0;
}

.headline {
  font-family: var(--font-heading);
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: var(--weight-extrabold);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-4);
  opacity: 0;
}

.headlineGradient {
  background: linear-gradient(135deg, var(--color-accent-primary), #c084fc, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-8);
  opacity: 0;
}

/* ── CTA Buttons ── */

.ctaRow {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
  opacity: 0;
}

.ctaPrimary {
  display: inline-flex;
  align-items: center;
  padding: var(--space-3) var(--space-8);
  background: var(--color-accent-primary);
  color: #fff;
  border-radius: var(--radius-full);
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  text-decoration: none;
  transition: background var(--duration-fast) ease, transform var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
  box-shadow: 0 4px 20px rgba(124, 92, 252, 0.3);
}

.ctaPrimary:hover {
  background: var(--color-accent-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(124, 92, 252, 0.4);
}

.ctaGhost {
  display: inline-flex;
  align-items: center;
  padding: var(--space-3) var(--space-8);
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-glass-border);
  border-radius: var(--radius-full);
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--duration-fast) ease, color var(--duration-fast) ease;
}

.ctaGhost:hover {
  background: var(--color-glass-bg-hover);
  color: var(--color-text-primary);
}

/* ── Scroll hint ── */

.scrollHint {
  position: absolute;
  bottom: var(--space-8);
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  opacity: 0;
  animation: bounce 2s ease-in-out infinite;
  animation-delay: 2s;
}

@keyframes bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(6px); }
}

@media (max-width: 767px) {
  .hero {
    padding: var(--space-12) var(--space-4);
  }

  .ctaRow {
    flex-direction: column;
    align-items: center;
  }
}
```

- [ ] **Step 2: HeroSection.tsx を作成**

```tsx
// components/marketing/sections/HeroSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import Link from 'next/link'
import styles from './HeroSection.module.css'

/** Card layout data for the floating background cards */
const FLOAT_CARDS = [
  { left: '8%', top: '12%', w: 120, h: 80, rot: -5, delay: 0 },
  { left: '72%', top: '8%', w: 140, h: 90, rot: 4, delay: 0.8 },
  { left: '15%', top: '65%', w: 100, h: 70, rot: 3, delay: 1.6 },
  { left: '80%', top: '60%', w: 110, h: 75, rot: -3, delay: 0.4 },
  { left: '45%', top: '5%', w: 90, h: 60, rot: 2, delay: 1.2 },
  { left: '55%', top: '75%', w: 130, h: 85, rot: -4, delay: 2.0 },
  { left: '30%', top: '40%', w: 80, h: 55, rot: 6, delay: 2.4 },
] as const

/**
 * Hero section — first thing visitors see.
 * Gradient headline + floating glass cards + CTA buttons.
 * Entrance animation: blur→focus reveal on page load.
 */
export function HeroSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Floating cards entrance
    const cards = el.querySelectorAll(`.${styles.floatCard}`)
    if (prefersReduced) {
      gsap.set(cards, { opacity: 0.5 })
    } else {
      gsap.fromTo(
        cards,
        { opacity: 0, scale: 0.8, filter: 'blur(12px)' },
        { opacity: 0.5, scale: 1, filter: 'blur(0px)', duration: 1.2, stagger: 0.12, ease: 'power2.out' },
      )
    }

    // Text entrance
    const textEls = [
      el.querySelector(`.${styles.label}`),
      el.querySelector(`.${styles.headline}`),
      el.querySelector(`.${styles.subtitle}`),
      el.querySelector(`.${styles.ctaRow}`),
      el.querySelector(`.${styles.scrollHint}`),
    ].filter(Boolean)

    if (prefersReduced) {
      gsap.set(textEls, { opacity: 1 })
    } else {
      gsap.fromTo(
        textEls,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out', delay: 0.6 },
      )
    }
  }, [])

  const handleScrollDown = (): void => {
    const next = document.getElementById('save-demo')
    if (next) next.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section ref={sectionRef} className={styles.hero}>
      {/* Floating glass cards */}
      <div className={styles.cardsLayer}>
        {FLOAT_CARDS.map((card, i) => (
          <div
            key={i}
            className={styles.floatCard}
            style={{
              left: card.left,
              top: card.top,
              width: card.w,
              height: card.h,
              transform: `rotate(${card.rot}deg)`,
              '--delay': `${card.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Text content */}
      <div className={styles.textLayer}>
        <div className={styles.label}>Bookmark × Collage</div>
        <h1 className={styles.headline}>
          <span className={styles.headlineGradient}>
            Bookmark.<br />
            Collage.<br />
            Share.
          </span>
        </h1>
        <p className={styles.subtitle}>
          あらゆるWebサイトを、あなただけのコラージュに。
        </p>
        <div className={styles.ctaRow}>
          <Link href="/board" className={styles.ctaPrimary}>
            始める — 無料
          </Link>
          <button type="button" className={styles.ctaGhost} onClick={handleScrollDown}>
            ↓ デモを見る
          </button>
        </div>
      </div>

      <div className={styles.scrollHint}>scroll</div>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx にHeroSectionをimport**

```tsx
// components/marketing/LandingPage.tsx
'use client'

import { useSmoothScroll } from '@/lib/scroll/use-smooth-scroll'
import { useScrollTrigger } from '@/lib/scroll/use-scroll-trigger'
import { HeroSection } from './sections/HeroSection'
import styles from './LandingPage.module.css'

export function LandingPage(): React.ReactElement {
  useSmoothScroll()
  useScrollTrigger()

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HeroSection />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/HeroSection.tsx components/marketing/sections/HeroSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add HeroSection with floating cards and entrance animation"
```

---

## Task 4: SaveDemoSection（Section 2）

スクロールで「ブックマークレットの保存フロー」が3ステップで展開される。

**Files:**
- Create: `components/marketing/sections/SaveDemoSection.tsx`
- Create: `components/marketing/sections/SaveDemoSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: SaveDemoSection.module.css を作成**

```css
/* components/marketing/sections/SaveDemoSection.module.css */

.section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
}

.heading {
  font-family: var(--font-heading);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-2);
  opacity: 0;
}

.sub {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-12);
  opacity: 0;
}

/* ── 3-step flow ── */

.flow {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-wrap: wrap;
  justify-content: center;
}

.step {
  opacity: 0;
  transform: translateY(20px);
}

/* Browser mockup */
.browser {
  width: 220px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.browserBar {
  height: 28px;
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  gap: 5px;
}

.browserDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.browserUrl {
  flex: 1;
  margin-left: var(--space-2);
  height: 14px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.browserBody {
  padding: var(--space-4);
  text-align: center;
}

.bookmarkletBtn {
  display: inline-block;
  margin-top: var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--color-accent-primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

/* Popup mockup */
.popup {
  width: 160px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.popupHeader {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  margin-bottom: var(--space-2);
}

.popupPreview {
  height: 40px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
}

.popupFolder {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-2);
}

.popupSave {
  padding: var(--space-1) var(--space-2);
  background: var(--color-accent-primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 10px;
  text-align: center;
  font-weight: var(--weight-semibold);
}

/* Card arrival */
.cardArrive {
  width: 100px;
  height: 70px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  transform: rotate(-3deg);
  box-shadow: var(--shadow-md);
}

/* Arrow between steps */
.arrow {
  font-size: var(--text-xl);
  color: var(--color-accent-primary);
  opacity: 0;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .flow {
    flex-direction: column;
  }

  .arrow {
    transform: rotate(90deg);
  }

  .browser {
    width: 260px;
  }
}
```

- [ ] **Step 2: SaveDemoSection.tsx を作成**

```tsx
// components/marketing/sections/SaveDemoSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './SaveDemoSection.module.css'

/**
 * Section 2 — Save Demo.
 * Shows the bookmarklet save flow in 3 steps,
 * animated as the user scrolls into view.
 */
export function SaveDemoSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const steps = el.querySelectorAll(`.${styles.step}`)
    const arrows = el.querySelectorAll(`.${styles.arrow}`)

    if (prefersReduced) {
      gsap.set([heading, sub, ...steps, ...arrows], { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        end: 'center center',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
      .fromTo(sub, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3')

    steps.forEach((step, i) => {
      tl.fromTo(step, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, `-=0.2`)
      if (arrows[i]) {
        tl.fromTo(arrows[i], { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '-=0.3')
      }
    })

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} id="save-demo" className={styles.section}>
      <h2 className={styles.heading}>ワンクリックで保存</h2>
      <p className={styles.sub}>ブックマークレットをクリック → OGP自動取得 → カードが飛んでくる</p>

      <div className={styles.flow}>
        {/* Step 1: Browser */}
        <div className={styles.step}>
          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <div className={styles.browserDot} style={{ background: '#ff5f57' }} />
              <div className={styles.browserDot} style={{ background: '#febc2e' }} />
              <div className={styles.browserDot} style={{ background: '#28c840' }} />
              <div className={styles.browserUrl} />
            </div>
            <div className={styles.browserBody}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                任意のWebサイト
              </div>
              <div className={styles.bookmarkletBtn}>📌 Save</div>
            </div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 2: Popup */}
        <div className={styles.step}>
          <div className={styles.popup}>
            <div className={styles.popupHeader}>📌 AllMarks に保存</div>
            <div className={styles.popupPreview} />
            <div className={styles.popupFolder}>My Collage</div>
            <div className={styles.popupSave}>保存</div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 3: Card arrives */}
        <div className={styles.step}>
          <div className={styles.cardArrive}>新しいカード</div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx にSaveDemoSectionを追加**

`components/marketing/LandingPage.tsx` の import に追加:

```typescript
import { SaveDemoSection } from './sections/SaveDemoSection'
```

JSXの `<HeroSection />` の後に追加:

```tsx
        <HeroSection />
        <SaveDemoSection />
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/SaveDemoSection.tsx components/marketing/sections/SaveDemoSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add SaveDemoSection with scroll-triggered 3-step flow"
```

---

## Task 5: CollageDemoSection（Section 3）

スクロールでカードが一枚ずつ飛んできてコラージュが組み上がる。

**Files:**
- Create: `components/marketing/sections/CollageDemoSection.tsx`
- Create: `components/marketing/sections/CollageDemoSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: CollageDemoSection.module.css を作成**

```css
/* components/marketing/sections/CollageDemoSection.module.css */

.section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
}

.heading {
  font-family: var(--font-heading);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-2);
  opacity: 0;
}

.sub {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-12);
  opacity: 0;
}

.canvas {
  position: relative;
  width: min(90vw, 600px);
  height: 400px;
}

.card {
  position: absolute;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  box-shadow: var(--shadow-md);
  opacity: 0;
}

/* Float after all cards land */
.floating {
  animation: float 5s var(--ease-in-out) infinite;
  animation-delay: var(--delay, 0s);
}

@media (max-width: 767px) {
  .canvas {
    height: 300px;
  }
}
```

- [ ] **Step 2: CollageDemoSection.tsx を作成**

```tsx
// components/marketing/sections/CollageDemoSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './CollageDemoSection.module.css'

/** Card layout definitions for the collage demo */
const DEMO_CARDS = [
  { label: 'YouTube', left: '2%', top: '5%', w: 160, h: 100, rot: -4, color: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.25)', from: 'top' },
  { label: 'Twitter/X', left: '25%', top: '25%', w: 170, h: 110, rot: 2, color: 'rgba(124,92,252,0.12)', border: 'rgba(124,92,252,0.25)', from: 'left' },
  { label: 'ブログ記事', left: '58%', top: '3%', w: 140, h: 95, rot: 5, color: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', from: 'right' },
  { label: 'Instagram', left: '8%', top: '55%', w: 155, h: 105, rot: -2, color: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', from: 'bottom' },
  { label: 'TikTok', left: '50%', top: '50%', w: 130, h: 90, rot: 3, color: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', from: 'right' },
] as const

function getFromPosition(from: string): { x: number; y: number } {
  switch (from) {
    case 'top': return { x: 0, y: -200 }
    case 'bottom': return { x: 0, y: 200 }
    case 'left': return { x: -300, y: 0 }
    case 'right': return { x: 300, y: 0 }
    default: return { x: 0, y: -200 }
  }
}

/**
 * Section 3 — Collage Demo.
 * Cards fly in one-by-one as the user scrolls, assembling a collage.
 */
export function CollageDemoSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const cards = el.querySelectorAll(`.${styles.card}`)

    if (prefersReduced) {
      gsap.set([heading, sub, ...cards], { opacity: 1 })
      cards.forEach((c) => c.classList.add(styles.floating))
      return
    }

    // Heading entrance
    gsap.fromTo([heading, sub], { opacity: 0, y: 20 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 75%', toggleActions: 'play none none reverse' },
    })

    // Cards fly in with stagger
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 50%',
        end: 'center center',
        toggleActions: 'play none none reverse',
      },
    })

    DEMO_CARDS.forEach((cardData, i) => {
      const fromPos = getFromPosition(cardData.from)
      tl.fromTo(
        cards[i],
        { opacity: 0, x: fromPos.x, y: fromPos.y, scale: 0.6, rotation: cardData.rot + 10 },
        {
          opacity: 1, x: 0, y: 0, scale: 1, rotation: cardData.rot,
          duration: 0.7, ease: 'back.out(1.4)',
          onComplete: () => { cards[i].classList.add(styles.floating) },
        },
        i * 0.15,
      )
    })

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>自由に並べる</h2>
      <p className={styles.sub}>ドラッグ、回転、リサイズ。あなたのキャンバスに制限はない。</p>

      <div className={styles.canvas}>
        {DEMO_CARDS.map((card, i) => (
          <div
            key={i}
            className={styles.card}
            style={{
              left: card.left,
              top: card.top,
              width: card.w,
              height: card.h,
              transform: `rotate(${card.rot}deg)`,
              background: card.color,
              borderColor: card.border,
              '--delay': `${i * 0.6}s`,
            } as React.CSSProperties}
          >
            {card.label}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx にCollageDemoSectionを追加**

import追加:
```typescript
import { CollageDemoSection } from './sections/CollageDemoSection'
```

JSX追加（SaveDemoSectionの後）:
```tsx
        <SaveDemoSection />
        <CollageDemoSection />
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/CollageDemoSection.tsx components/marketing/sections/CollageDemoSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add CollageDemoSection with scroll-triggered card assembly"
```

---

## Task 6: StyleSwitchSection（Section 4）

スクロール進行でカードスタイルが4種に順次切り替わる。

**Files:**
- Create: `components/marketing/sections/StyleSwitchSection.tsx`
- Create: `components/marketing/sections/StyleSwitchSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: StyleSwitchSection.module.css を作成**

```css
/* components/marketing/sections/StyleSwitchSection.module.css */

.section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
}

.heading {
  font-family: var(--font-heading);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-12);
  opacity: 0;
}

.showcase {
  display: flex;
  gap: var(--space-6);
  flex-wrap: wrap;
  justify-content: center;
  max-width: 700px;
}

.styleCard {
  width: 150px;
  padding: var(--space-5) var(--space-3);
  text-align: center;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  opacity: 0;
  transform: translateY(20px);
  transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.styleCard:hover {
  border-color: var(--color-accent-primary);
  box-shadow: var(--shadow-glow);
}

.stylePreview {
  width: 80px;
  height: 56px;
  margin: 0 auto var(--space-3);
  border-radius: var(--radius-sm);
}

/* Glass preview */
.previewGlass {
  composes: stylePreview;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Polaroid preview */
.previewPolaroid {
  composes: stylePreview;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
  position: relative;
}

.previewPolaroid::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 0;
  right: 0;
  height: 10px;
  background: #fff;
  border-radius: 0 0 2px 2px;
}

/* Newspaper preview */
.previewNewspaper {
  composes: stylePreview;
  background: #f5f0e8;
  border: 1px solid #d4c9b4;
  border-radius: 2px;
}

/* Magnet preview */
.previewMagnet {
  composes: stylePreview;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 3px 0 #bbb;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
}

.magnetPin {
  width: 24px;
  height: 4px;
  background: #ff6b6b;
  border-radius: 2px;
}

.styleName {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  font-family: var(--font-heading);
}

@media (max-width: 767px) {
  .showcase {
    gap: var(--space-4);
  }

  .styleCard {
    width: 140px;
  }
}
```

- [ ] **Step 2: StyleSwitchSection.tsx を作成**

```tsx
// components/marketing/sections/StyleSwitchSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './StyleSwitchSection.module.css'

/**
 * Section 4 — Style Switch.
 * Shows 4 card style options with staggered reveal on scroll.
 */
export function StyleSwitchSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const cards = el.querySelectorAll(`.${styles.styleCard}`)

    if (prefersReduced) {
      gsap.set([heading, ...cards], { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 65%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
    tl.fromTo(
      cards,
      { opacity: 0, y: 30, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.12, ease: 'back.out(1.4)' },
      '-=0.2',
    )

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>スタイルを着せ替え</h2>

      <div className={styles.showcase}>
        <div className={styles.styleCard}>
          <div className={styles.previewGlass} />
          <div className={styles.styleName}>Glass</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewPolaroid} />
          <div className={styles.styleName}>Polaroid</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewNewspaper} />
          <div className={styles.styleName}>Newspaper</div>
        </div>
        <div className={styles.styleCard}>
          <div className={styles.previewMagnet}>
            <div className={styles.magnetPin} />
          </div>
          <div className={styles.styleName}>Magnet</div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx にStyleSwitchSectionを追加**

import追加:
```typescript
import { StyleSwitchSection } from './sections/StyleSwitchSection'
```

JSX追加（CollageDemoSectionの後）:
```tsx
        <CollageDemoSection />
        <StyleSwitchSection />
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/StyleSwitchSection.tsx components/marketing/sections/StyleSwitchSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add StyleSwitchSection with 4 card style previews"
```

---

## Task 7: ShareDemoSection（Section 5）

コラージュ→PNG→SNSシェアの3ステップフロー。

**Files:**
- Create: `components/marketing/sections/ShareDemoSection.tsx`
- Create: `components/marketing/sections/ShareDemoSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: ShareDemoSection.module.css を作成**

```css
/* components/marketing/sections/ShareDemoSection.module.css */

.section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
}

.heading {
  font-family: var(--font-heading);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-2);
  opacity: 0;
}

.sub {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-12);
  opacity: 0;
}

.flow {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-wrap: wrap;
  justify-content: center;
}

.step {
  opacity: 0;
  transform: translateY(20px);
}

.collageThumb {
  width: 160px;
  height: 120px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
}

/* Mini cards inside collage thumbnail */
.miniCard {
  position: absolute;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.pngOutput {
  width: 110px;
  height: 90px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}

.pngIcon {
  font-size: var(--text-2xl);
}

.pngLabel {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.socialBtns {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.socialBtn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  border: 1px solid;
}

.socialX {
  composes: socialBtn;
  background: rgba(29, 161, 242, 0.1);
  border-color: rgba(29, 161, 242, 0.3);
  color: #1da1f2;
}

.socialInsta {
  composes: socialBtn;
  background: rgba(225, 48, 108, 0.1);
  border-color: rgba(225, 48, 108, 0.3);
  color: #e1306c;
}

.arrow {
  font-size: var(--text-xl);
  color: #f472b6;
  opacity: 0;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .flow {
    flex-direction: column;
  }

  .arrow {
    transform: rotate(90deg);
  }
}
```

- [ ] **Step 2: ShareDemoSection.tsx を作成**

```tsx
// components/marketing/sections/ShareDemoSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import styles from './ShareDemoSection.module.css'

/**
 * Section 5 — Share Demo.
 * Collage → PNG → SNS share flow, animated on scroll.
 */
export function ShareDemoSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const heading = el.querySelector(`.${styles.heading}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const steps = el.querySelectorAll(`.${styles.step}`)
    const arrows = el.querySelectorAll(`.${styles.arrow}`)

    if (prefersReduced) {
      gsap.set([heading, sub, ...steps, ...arrows], { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
      .fromTo(sub, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3')

    steps.forEach((step, i) => {
      tl.fromTo(step, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.2')
      if (arrows[i]) {
        tl.fromTo(arrows[i], { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '-=0.3')
      }
    })

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.heading}>コラージュを世界へ</h2>
      <p className={styles.sub}>画像として保存 → SNSにシェア → バイラル</p>

      <div className={styles.flow}>
        {/* Step 1: Collage */}
        <div className={styles.step}>
          <div className={styles.collageThumb}>
            <div className={styles.miniCard} style={{ left: '8%', top: '10%', width: 50, height: 35, transform: 'rotate(-3deg)', background: 'rgba(124,92,252,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '40%', top: '25%', width: 60, height: 40, transform: 'rotate(2deg)', background: 'rgba(244,114,182,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '15%', top: '55%', width: 55, height: 35, transform: 'rotate(-1deg)', background: 'rgba(52,211,153,0.15)' }} />
            <div className={styles.miniCard} style={{ left: '55%', top: '50%', width: 45, height: 30, transform: 'rotate(4deg)', background: 'rgba(99,102,241,0.15)' }} />
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 2: PNG */}
        <div className={styles.step}>
          <div className={styles.pngOutput}>
            <div className={styles.pngIcon}>🖼️</div>
            <div className={styles.pngLabel}>collage.png</div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        {/* Step 3: Social */}
        <div className={styles.step}>
          <div className={styles.socialBtns}>
            <div className={styles.socialX}>𝕏 でシェア</div>
            <div className={styles.socialInsta}>📷 ストーリーに投稿</div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx にShareDemoSectionを追加**

import追加:
```typescript
import { ShareDemoSection } from './sections/ShareDemoSection'
```

JSX追加（StyleSwitchSectionの後）:
```tsx
        <StyleSwitchSection />
        <ShareDemoSection />
```

- [ ] **Step 4: TypeScriptチェック**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/ShareDemoSection.tsx components/marketing/sections/ShareDemoSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add ShareDemoSection with collage-to-social flow"
```

---

## Task 8: CtaSection（Section 6）+ ビルド確認

最終CTAセクション。全体ビルドを通して完了。

**Files:**
- Create: `components/marketing/sections/CtaSection.tsx`
- Create: `components/marketing/sections/CtaSection.module.css`
- Modify: `components/marketing/LandingPage.tsx`

- [ ] **Step 1: CtaSection.module.css を作成**

```css
/* components/marketing/sections/CtaSection.module.css */

.section {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-20) var(--space-6);
}

.headline {
  font-family: var(--font-heading);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: var(--weight-extrabold);
  margin-bottom: var(--space-3);
  opacity: 0;
}

.headlineGradient {
  background: linear-gradient(135deg, var(--color-accent-primary), #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sub {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-8);
  opacity: 0;
}

.ctaBtn {
  display: inline-flex;
  align-items: center;
  padding: var(--space-4) var(--space-10);
  background: linear-gradient(135deg, var(--color-accent-primary), #9f7aea);
  color: #fff;
  border-radius: var(--radius-full);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  text-decoration: none;
  box-shadow: 0 4px 24px rgba(124, 92, 252, 0.4);
  transition: transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  opacity: 0;
}

.ctaBtn:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 36px rgba(124, 92, 252, 0.5);
}

.privacy {
  margin-top: var(--space-4);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  opacity: 0;
}
```

- [ ] **Step 2: CtaSection.tsx を作成**

```tsx
// components/marketing/sections/CtaSection.tsx
'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Link from 'next/link'
import styles from './CtaSection.module.css'

/**
 * Section 6 — Final CTA.
 * "Make it yours." with a prominent call-to-action button.
 */
export function CtaSection(): React.ReactElement {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const headline = el.querySelector(`.${styles.headline}`)
    const sub = el.querySelector(`.${styles.sub}`)
    const btn = el.querySelector(`.${styles.ctaBtn}`)
    const privacy = el.querySelector(`.${styles.privacy}`)

    if (prefersReduced) {
      gsap.set([headline, sub, btn, privacy], { opacity: 1 })
      return
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        toggleActions: 'play none none reverse',
      },
    })

    tl.fromTo(headline, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' })
      .fromTo(sub, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3')
      .fromTo(btn, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)' }, '-=0.2')
      .fromTo(privacy, { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.2')

    return () => { tl.kill() }
  }, [])

  return (
    <section ref={sectionRef} className={styles.section}>
      <h2 className={styles.headline}>
        <span className={styles.headlineGradient}>Make it yours.</span>
      </h2>
      <p className={styles.sub}>
        無料。登録不要。データはあなたのブラウザだけに。
      </p>
      <Link href="/board" className={styles.ctaBtn}>
        コラージュを始める
      </Link>
      <p className={styles.privacy}>
        サーバーにデータを送りません。完全プライバシー。
      </p>
    </section>
  )
}
```

- [ ] **Step 3: LandingPage.tsx を最終版に更新**

```tsx
// components/marketing/LandingPage.tsx
'use client'

import { useSmoothScroll } from '@/lib/scroll/use-smooth-scroll'
import { useScrollTrigger } from '@/lib/scroll/use-scroll-trigger'
import { HeroSection } from './sections/HeroSection'
import { SaveDemoSection } from './sections/SaveDemoSection'
import { CollageDemoSection } from './sections/CollageDemoSection'
import { StyleSwitchSection } from './sections/StyleSwitchSection'
import { ShareDemoSection } from './sections/ShareDemoSection'
import { CtaSection } from './sections/CtaSection'
import styles from './LandingPage.module.css'

/**
 * Landing page root client component.
 * Initializes Lenis smooth scrolling and GSAP ScrollTrigger.
 * Renders 6 marketing sections.
 */
export function LandingPage(): React.ReactElement {
  useSmoothScroll()
  useScrollTrigger()

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HeroSection />
        <SaveDemoSection />
        <CollageDemoSection />
        <StyleSwitchSection />
        <ShareDemoSection />
        <CtaSection />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScriptチェック + ビルド**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/marketing/sections/CtaSection.tsx components/marketing/sections/CtaSection.module.css components/marketing/LandingPage.tsx
git commit -m "feat(lp): add CtaSection and complete all 6 LP sections"
```

---

## Task 9: ブラウザテスト + TODO.md更新

Playwrightでスクロール体験を確認。

**Files:** なし（テストスクリプトは /tmp）

- [ ] **Step 1: dev serverでLPを開いて確認**

Playwright で `http://localhost:3000/` を開き、以下を確認:
- HeroSection: キャッチコピー表示、浮遊カードのアニメーション
- スクロールダウン: 各セクションが順次リビール
- SaveDemoSection: 3ステップフローが表示
- CollageDemoSection: カードが飛んできてコラージュが組み上がる
- StyleSwitchSection: 4スタイルが表示
- ShareDemoSection: 共有フローが表示
- CtaSection: 「コラージュを始める」ボタンが表示
- 「始める — 無料」リンクが /board に遷移する

- [ ] **Step 2: スクリーンショット取得**

各セクションのスクリーンショットを `/tmp/` に保存。

- [ ] **Step 3: TODO.md更新**

S7完了を記録。

- [ ] **Step 4: コミット**

```bash
git add docs/TODO.md
git commit -m "docs: mark S7 landing page as complete"
```

---

## 実装順序まとめ

```
Task 1 (Lenis + ScrollTrigger基盤) — 依存なし
    ↓
Task 2 (LandingPage シェル + page.tsx) — Task 1に依存
    ↓
Task 3 (HeroSection) — Task 2に依存
    ↓
Task 4 (SaveDemoSection) — Task 3に依存（LandingPage更新）
    ↓
Task 5 (CollageDemoSection) — Task 4に依存
    ↓
Task 6 (StyleSwitchSection) — Task 5に依存
    ↓
Task 7 (ShareDemoSection) — Task 6に依存
    ↓
Task 8 (CtaSection + ビルド確認) — Task 7に依存
    ↓
Task 9 (ブラウザテスト + TODO.md) — Task 8に依存
```
