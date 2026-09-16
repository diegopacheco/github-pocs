const test = require("node:test");
const assert = require("node:assert");
const { renderMarkdown } = require("../src/markdown.js");

test("headings get anchors so README links like #how-it-works keep working", () => {
  assert.strictEqual(renderMarkdown("## How it Works"), '<h2 id="how-it-works">How it Works</h2>');
});

test("fenced code is escaped so html inside code shows as text and never executes", () => {
  const html = renderMarkdown("```html\n<script>alert(1)</script>\n```");
  assert.strictEqual(html, '<pre><code class="language-html">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>');
});

test("tables keep column alignment used by comparison tables in docs", () => {
  const html = renderMarkdown("| a | b |\n|:---|---:|\n| 1 | 2 |");
  assert.match(html, /<th style="text-align:left">a<\/th><th style="text-align:right">b<\/th>/);
  assert.match(html, /<td style="text-align:left">1<\/td><td style="text-align:right">2<\/td>/);
});

test("nested lists stay nested instead of flattening the outline", () => {
  const html = renderMarkdown("- one\n  - inner\n- two");
  assert.strictEqual(html, "<ul><li>one\n<ul><li>inner</li></ul></li>\n<li>two</li></ul>");
});

test("ordered lists keep their start number", () => {
  assert.match(renderMarkdown("3. three\n4. four"), /^<ol start="3">/);
});

test("task lists render checkboxes with their done state", () => {
  const html = renderMarkdown("- [x] done\n- [ ] todo");
  assert.match(html, /<input type="checkbox" disabled checked> done/);
  assert.match(html, /<input type="checkbox" disabled> todo/);
});

test("inline formatting, links and images render like GitHub", () => {
  const html = renderMarkdown("**bold** *it* ~~old~~ `x<y` [site](https://a.dev) ![logo](img/logo.png)");
  assert.strictEqual(html, '<p><strong>bold</strong> <em>it</em> <del>old</del> <code>x&lt;y</code> <a href="https://a.dev">site</a> <img src="img/logo.png" alt="logo"></p>');
});

test("underscores inside words are not italic so snake_case names survive", () => {
  assert.strictEqual(renderMarkdown("use my_var_name here"), "<p>use my_var_name here</p>");
});

test("javascript links are neutralized", () => {
  const html = renderMarkdown("[x](javascript:alert(1)) [y](JavaScript:void(0))");
  assert.ok(!/href="javascript/i.test(html));
  assert.match(html, /<a href="#">x<\/a>/);
});

test("raw html blocks pass through because READMEs use <img width> tags", () => {
  const block = '<img src="diagrams/flow.png" width="900"/>';
  assert.strictEqual(renderMarkdown(block), block);
});

test("blockquotes and horizontal rules render", () => {
  assert.strictEqual(renderMarkdown("> note\n\n---"), "<blockquote><p>note</p></blockquote>\n<hr>");
});

test("setext headings render as headings, not as text followed by a rule", () => {
  assert.strictEqual(renderMarkdown("Title\n====="), '<h1 id="title">Title</h1>');
});

test("text next to angle brackets is escaped", () => {
  assert.strictEqual(renderMarkdown("a < b & c"), "<p>a &lt; b &amp; c</p>");
});
