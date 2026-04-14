/**
 * Generates a bookmarklet JavaScript URI.
 *
 * When executed on any website, it:
 * 1. Reads OGP meta tags from the current page
 * 2. Falls back to document.title, favicon, hostname
 * 3. Opens Booklage /save in a popup window with OGP data as URL params
 */
export function generateBookmarkletCode(appUrl: string): string {
  // Remove trailing slash from appUrl
  const base = appUrl.replace(/\/$/, '')

  const script = `
    (function(){
      var d=document;
      var m=function(p){
        var el=d.querySelector('meta[property="'+p+'"]');
        return el?el.getAttribute('content')||'':'';
      };
      var mn=function(n){
        var el=d.querySelector('meta[name="'+n+'"]');
        return el?el.getAttribute('content')||'':'';
      };
      var fi=(function(){
        var l=d.querySelector('link[rel="icon"]')||d.querySelector('link[rel="shortcut icon"]');
        return l?l.href:location.origin+'/favicon.ico';
      })();
      var p=new URLSearchParams();
      p.set('url',location.href);
      p.set('title',m('og:title')||d.title);
      p.set('desc',(m('og:description')||mn('description')).slice(0,200));
      p.set('image',m('og:image'));
      p.set('site',m('og:site_name')||location.hostname);
      p.set('favicon',fi);
      window.open(
        '${base}/save?'+p.toString(),
        'booklage-save',
        'width=480,height=600,scrollbars=yes'
      );
    })();
  `.replace(/\s+/g, ' ').trim()

  return `javascript:${encodeURIComponent(script)}`
}
