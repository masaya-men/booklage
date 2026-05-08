import { dispatchSave } from './lib/dispatch.js'

// Trigger 1: keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-current-page') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  await dispatchSave({ trigger: 'shortcut', tabId: tab.id })
})

// Trigger 2: context menu — page + link (registered on install)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'booklage-save-page',
    title: 'Save to Booklage',
    contexts: ['page'],
  })
  chrome.contextMenus.create({
    id: 'booklage-save-link',
    title: 'Save link to Booklage',
    contexts: ['link'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === 'booklage-save-page') {
    await dispatchSave({ trigger: 'context-page', tabId: tab.id })
  } else if (info.menuItemId === 'booklage-save-link' && info.linkUrl) {
    await dispatchSave({ trigger: 'context-link', tabId: tab.id, linkUrl: info.linkUrl })
  }
})
