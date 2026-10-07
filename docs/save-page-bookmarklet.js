/*
 * "Save for PriceSniffs": a bookmark the owner clicks on a shop page they have
 * opened in their own browser (docs/OWNER-STEPS.md section 9). It fetches
 * nothing and clicks nothing: it saves the page already on screen.
 *
 * It keeps only the page's product data (its JSON-LD blocks), its canonical
 * address and the time, and downloads them as one small .html file that
 * `npm run catalogue:import-pages` reads. Everything else on the page is
 * left behind, which matters on Notino: its page source also carries the
 * signed in shopper's email address and session tokens.
 *
 * To install, make a new bookmark and paste as its address the one line
 * `javascript:` form of this file (minified), printed by
 * `npm run -s catalogue:bookmarklet`. tests/saveBookmarklet.test.ts runs this
 * file against a saved Notino page.
 */
(function () {
  var blocks = Array.prototype.slice
    .call(document.querySelectorAll('script[type="application/ld+json"]'))
    .map(function (s) {
      return '<script type="application/ld+json">' + s.textContent.replace(/<\/script/gi, '<\\/script') + '</scr' + 'ipt>';
    });
  if (!blocks.length) {
    alert('No product data on this page. If it says "Just a moment...", wait for the real page and click again.');
    return;
  }
  var link = document.querySelector('link[rel="canonical"]');
  var canonical = (link && link.href) || location.href;
  var attr = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  };
  var comment = function (s) {
    return String(s).replace(/--/g, '%2D%2D');
  };
  var out =
    '<!-- saved: ' + new Date().toISOString() + ' -->\n' +
    '<!-- url: ' + comment(location.href) + ' -->\n' +
    '<html><head><link rel="canonical" href="' + attr(canonical) + '"/></head><body>\n' +
    blocks.join('\n') +
    '\n</body></html>\n';
  var name =
    (location.hostname.replace(/^www\./, '') + location.pathname + location.search)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) + '.html';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out], { type: 'text/html' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
})();
