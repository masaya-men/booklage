const $ = (id) => document.getElementById(id)
const DEFAULTS = { autoOpenPip: false, cursorPillFallbackPosition: 'cursor' }

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  $('autoOpenPip').checked = stored.autoOpenPip
  const pillPosInput = document.querySelector(
    'input[name="pillPos"][value="' + stored.cursorPillFallbackPosition + '"]'
  )
  if (pillPosInput) pillPosInput.checked = true
}

$('autoOpenPip').addEventListener('change', () => {
  chrome.storage.sync.set({ autoOpenPip: $('autoOpenPip').checked })
})

document.querySelectorAll('input[name="pillPos"]').forEach((el) => {
  el.addEventListener('change', () => {
    chrome.storage.sync.set({ cursorPillFallbackPosition: el.value })
  })
})

$('shortcuts-link').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
})

load()
