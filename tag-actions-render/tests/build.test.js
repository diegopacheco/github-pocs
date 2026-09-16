const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { build } = require("../src/build.js");
const { unseal } = require("../src/seal.js");

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-repo-"));
  fs.mkdirSync(path.join(root, "docs/img"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/guide.md"), '# Guide\n\n![flow](img/flow.png)\n\n<img src="img/flow.png">\n');
  fs.writeFileSync(path.join(root, "docs/page.html"), "<h1>Page</h1>");
  fs.writeFileSync(path.join(root, "docs/img/flow.png"), Buffer.from([137, 80, 78, 71]));
  return root;
}

function readPayload(out) {
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  return JSON.parse(html.match(/<script id="payload" type="application\/json">(.*?)<\/script>/)[1]);
}

test("builds one self-contained page with every file and referenced image inside", async () => {
  const root = repo();
  const out = path.join(root, "out");
  const result = await build({ root, out, user: "pr-7", pass: "pw", hours: 24, title: "PR #7", files: ["docs/page.html", "docs/guide.md"] });
  assert.deepStrictEqual({ pages: result.pages, assets: result.assets }, { pages: 2, assets: 1 });
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.ok(!html.includes("__SEAL_JS__") && !html.includes("__MARKDOWN_JS__") && !html.includes("__PAYLOAD__"));
  const data = await unseal(readPayload(out).sealed, "pr-7", "pw");
  assert.deepStrictEqual(data.files.map((f) => f.path), ["docs/guide.md", "docs/page.html"]);
  assert.match(data.assets["docs/img/flow.png"], /^data:image\/png;base64,/);
});

test("page never leaks machine paths, only repo relative paths", async () => {
  const root = repo();
  const out = path.join(root, "out");
  await build({ root, out, user: "u", pass: "p", hours: 24, title: "PR #1", files: ["docs/guide.md"] });
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  const data = JSON.stringify(await unseal(readPayload(out).sealed, "u", "p"));
  assert.ok(!html.includes(root) && !data.includes(root) && !data.includes(os.homedir()));
});

test("files outside the repo are rejected so a PR cannot publish host files", async () => {
  const root = repo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  fs.writeFileSync(path.join(outside, "secret.md"), "secret");
  fs.symlinkSync(path.join(outside, "secret.md"), path.join(root, "docs/link.md"));
  const out = path.join(root, "out");
  await assert.rejects(build({ root, out, user: "u", pass: "p", hours: 24, title: "t", files: ["../" + path.basename(outside) + "/secret.md"] }), /rejected/);
  await assert.rejects(build({ root, out, user: "u", pass: "p", hours: 24, title: "t", files: ["docs/link.md"] }), /rejected/);
  await assert.rejects(build({ root, out, user: "u", pass: "p", hours: 24, title: "t", files: [path.join(outside, "secret.md")] }), /rejected/);
});

test("images pointing outside the repo are not embedded", async () => {
  const root = repo();
  fs.writeFileSync(path.join(root, "docs/escape.md"), "![x](../../../../etc/hosts.png)");
  const out = path.join(root, "out");
  const result = await build({ root, out, user: "u", pass: "p", hours: 24, title: "t", files: ["docs/escape.md"] });
  assert.strictEqual(result.assets, 0);
});

test("expiry is written for the cleanup job and matches the page", async () => {
  const root = repo();
  const out = path.join(root, "out");
  const before = Math.floor(Date.now() / 1000);
  await build({ root, out, user: "u", pass: "p", hours: 24, title: "t", files: ["docs/page.html"] });
  const expires = Number(fs.readFileSync(path.join(out, "expires-at"), "utf8"));
  assert.ok(expires >= before + 86400 && expires <= before + 86401);
  assert.strictEqual(Math.floor(readPayload(out).expiresAt / 1000), expires);
});

test("a title with a closing script tag cannot break out of the payload", async () => {
  const root = repo();
  const out = path.join(root, "out");
  await build({ root, out, user: "u", pass: "p", hours: 24, title: "</script><script>alert(1)</script>", files: ["docs/page.html"] });
  assert.strictEqual(readPayload(out).title, "</script><script>alert(1)</script>");
});

test("fails loud when there is nothing to render", async () => {
  const root = repo();
  await assert.rejects(build({ root, out: path.join(root, "out"), user: "u", pass: "p", hours: 24, title: "t", files: [] }), /no html or md/);
});

test("inlined scripts share one global scope so no top level name may be declared twice", () => {
  const src = path.join(__dirname, "../src");
  const viewer = fs.readFileSync(path.join(src, "viewer.html"), "utf8").match(/<script>\s*(const payload[\s\S]*?)<\/script>/)[1].replace(/^  /gm, "");
  const sources = [fs.readFileSync(path.join(src, "seal.js"), "utf8"), fs.readFileSync(path.join(src, "markdown.js"), "utf8"), viewer];
  const names = sources.flatMap((code) => [...code.matchAll(/^(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+|\$)\s*=)/gm)].map((m) => m[1] || m[2]));
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepStrictEqual(duplicates, []);
});
