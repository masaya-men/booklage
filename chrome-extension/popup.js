// Popup script — communicates with content script and opens Booklage save page.

const BOOKLAGE_SAVE_URL = 'https://booklage.pages.dev/save'

let pageInfo = null

// Extract page info from the active tab
async function extractInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractPageInfo' })
    if (response) {
      pageInfo = response
      renderPreview(response)
    }
  } catch {
    // Content script not injected (chrome:// pages, etc.)
    pageInfo = {
      url: tab.url || '',
      title: tab.title || '',
      description: '',
      thumbnail: '',
      siteName: '',
      favicon: tab.favIconUrl || '',
    }
    renderPreview(pageInfo)
  }
}

function renderPreview(info) {
  document.getElementById('title').textContent = info.title || '(タイトルなし)'
  document.getElementById('url').textContent = info.url

  const thumb = document.getElementById('thumb')
  if (info.thumbnail) {
    thumb.src = info.thumbnail
    thumb.classList.add('visible')
  }

  document.getElementById('saveBtn').disabled = false
}

// Save: open Booklage with the page data encoded in the URL
document.getElementById('saveBtn').addEventListener('click', () => {
  if (!pageInfo) return

  // Match SavePopup's expected param names
  const params = new URLSearchParams({
    url: pageInfo.url,
    title: pageInfo.title,
    desc: pageInfo.description,
    image: pageInfo.thumbnail,
    site: pageInfo.siteName,
    favicon: pageInfo.favicon,
  })

  chrome.tabs.create({ url: `${BOOKLAGE_SAVE_URL}?${params.toString()}` })

  const btn = document.getElementById('saveBtn')
  btn.textContent = '保存しました!'
  btn.classList.add('saved')
  document.getElementById('status').textContent = 'Booklageが開きます...'

  setTimeout(() => window.close(), 1500)
})

// Init
extractInfo()
