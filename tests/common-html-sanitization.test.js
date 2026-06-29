const assert = require('node:assert/strict');
const {
  isSafeHtmlUrl,
  sanitizeHtmlElement
} = require('../utils/common.js');

function createElement(attributes, tagName = 'A') {
  const values = new Map(Object.entries(attributes));
  return {
    tagName,
    get attributes() {
      return Array.from(values, ([name, value]) => ({ name, value }));
    },
    removeAttribute(name) {
      values.delete(name);
    },
    getAttribute(name) {
      return values.has(name) ? values.get(name) : null;
    }
  };
}

assert.equal(isSafeHtmlUrl('https://example.com/docs'), true);
assert.equal(isSafeHtmlUrl('/docs/getting-started'), true);
assert.equal(isSafeHtmlUrl('#section'), true);
assert.equal(isSafeHtmlUrl('mailto:help@example.com'), true);
assert.equal(isSafeHtmlUrl('data:image/png;base64,AAAA', { allowImageData: true }), true);
assert.equal(isSafeHtmlUrl('javascript:alert(1)'), false);
assert.equal(isSafeHtmlUrl('vbscript:msgbox(1)'), false);
assert.equal(isSafeHtmlUrl('data:text/html,<script>alert(1)</script>', { allowImageData: true }), false);

const element = createElement({
  onclick: 'alert(1)',
  style: 'background:url(javascript:alert(1))',
  srcdoc: '<script>alert(1)</script>',
  href: 'java\nscript:alert(1)',
  src: 'data:text/html,<script>alert(1)</script>',
  title: 'Safe title'
});

sanitizeHtmlElement(element);

assert.equal(element.getAttribute('onclick'), null);
assert.equal(element.getAttribute('style'), null);
assert.equal(element.getAttribute('srcdoc'), null);
assert.equal(element.getAttribute('href'), null);
assert.equal(element.getAttribute('src'), null);
assert.equal(element.getAttribute('title'), 'Safe title');

const image = createElement({ src: 'data:image/jpeg;base64,BBBB', alt: 'Screenshot' }, 'IMG');
sanitizeHtmlElement(image);
assert.equal(image.getAttribute('src'), 'data:image/jpeg;base64,BBBB');
assert.equal(image.getAttribute('alt'), 'Screenshot');
