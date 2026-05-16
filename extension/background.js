import { dispatchSave } from './lib/dispatch.js'

// In-memory PiP state. Reported from any booklage tab's content script via
// MutationObserver. dispatch.js reads this to decide whether to suppress
// the cursor pill (PiP itself surfaces the new card visually).
let pipActive = false

export function isPipActive() {
  return pipActive
}

async function safeDispatch(args, tabId) {
  try {
    await dispatchSave({ ...args, isPipActive: pipActive })
  } catch (e) {
    console.warn('[booklage] save failed:', e)
    chrome.tabs.sendMessage(tabId, { type: 'booklage:cursor-pill', state: 'error' }).catch(() => {})
  }
}

// Trigger 1: keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-current-page') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  await safeDispatch({ trigger: 'shortcut', tabId: tab.id }, tab.id)
})

// Trigger 2: context menu — page + link (registered on install)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'booklage-save-page',
    title: 'Save to AllMarks',
    contexts: ['page'],
  })
  chrome.contextMenus.create({
    id: 'booklage-save-link',
    title: 'Save link to AllMarks',
    contexts: ['link'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === 'booklage-save-page') {
    await safeDispatch({ trigger: 'context-page', tabId: tab.id }, tab.id)
  } else if (info.menuItemId === 'booklage-save-link' && info.linkUrl) {
    await safeDispatch({ trigger: 'context-link', tabId: tab.id, linkUrl: info.linkUrl }, tab.id)
  }
})

// Trigger 3: bookmarklet hand-off (forwarded from content script)
//   Trigger 4: PiP state report (forwarded from content script on booklage tab)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return
  if (msg.type === 'booklage:pip-state') {
    pipActive = !!msg.active
    return
  }
  if (msg.type === 'booklage:dispatch-bookmarklet') {
    const tabId = sender.tab?.id
    if (!tabId) return
    void safeDispatch(
      { trigger: 'bookmarklet', tabId, ogpFromBookmarklet: msg.ogp || null },
      tabId,
    )
    return
  }
})
