import { pillStateView } from './lib/pill-state-machine.js'

let lastMouse = { x: window.innerWidth - 220, y: window.innerHeight - 60 }
window.addEventListener('mousemove', (e) => {
  lastMouse = { x: e.clientX, y: e.clientY }
}, { passive: true })

let pill = null
let hideTimer = null

function ensurePill() {
  if (pill) return pill
  pill = document.createElement('div')
  pill.className = 'booklage-pill'
  pill.innerHTML =
    '<span class="booklage-pill__icon" data-role="icon"></span>' +
    '<span class="booklage-pill__brand">Booklage</span>' +
    '<span class="booklage-pill__sep">' + String.fromCharCode(183) + '</span>' +
    '<span class="booklage-pill__state" data-role="state">Saving</span>'
  document.documentElement.appendChild(pill)
  return pill
}

function positionPill() {
  const p = ensurePill()
  const x = Math.min(window.innerWidth - 220, Math.max(8, lastMouse.x + 12))
  const y = Math.min(window.innerHeight - 56, Math.max(8, lastMouse.y - 52))
  p.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
}

const ICONS = {
  ring: '<span class="ring"></span>',
  check: '<svg viewBox="0 0 24 24" class="check"><path d="M5 12 L10 17 L19 7"/></svg>',
  bang: '<span class="bang">!</span>',
}

function setState(state) {
  const view = pillStateView(state)
  if (!view) return
  const p = ensurePill()
  positionPill()
  const stateEl = p.querySelector('[data-role="state"]')
  const iconEl = p.querySelector('[data-role="icon"]')
  if (stateEl) stateEl.textContent = view.label
  if (iconEl) iconEl.innerHTML = ICONS[view.icon] || ''
  p.dataset.state = state
  p.classList.add('is-visible')
  clearTimeout(hideTimer)
  if (view.autoHideMs !== null) {
    hideTimer = setTimeout(() => p.classList.remove('is-visible'), view.autoHideMs)
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'booklage:cursor-pill') return
  setState(msg.state)
})
