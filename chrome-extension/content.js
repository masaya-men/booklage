// Content script — extracts OGP/meta data from the current page.
// Runs in the page context, responds to messages from the popup.

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'extractPageInfo') {
    const getMeta = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          const content = el.getAttribute('content') || el.getAttribute('href')
          if (content) return content
        }
      }
      return ''
    }

    const info = {
      url: window.location.href,
      title:
        getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
        document.title,
      description:
        getMeta([
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
          'meta[name="description"]',
        ]),
      thumbnail:
        getMeta([
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
        ]),
      siteName:
        getMeta(['meta[property="og:site_name"]']) ||
        window.location.hostname.replace(/^www\./, ''),
      favicon:
        getMeta([
          'link[rel="icon"][sizes="32x32"]',
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
        ]) || `${window.location.origin}/favicon.ico`,
    }

    sendResponse(info)
  }
  return true // Keep message channel open for async response
})
