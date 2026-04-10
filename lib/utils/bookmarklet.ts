/**
 * Generates a bookmarklet JavaScript URI.
 * When executed in a browser, it loads the Booklage bookmarklet script
 * with the current page's URL and title.
 */
export function generateBookmarkletCode(appUrl: string): string {
  const script = `
    (function(){
      var d=document,s=d.createElement('script');
      s.src='${appUrl}/bookmarklet.js?url='+encodeURIComponent(d.location.href)+'&title='+encodeURIComponent(d.title)+'&t='+Date.now();
      d.body.appendChild(s);
    })();
  `.replace(/\s+/g, ' ').trim()

  return `javascript:${encodeURIComponent(script)}`
}
