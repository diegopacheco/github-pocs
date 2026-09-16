const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const script = path.join(__dirname, "../ci/pages.sh");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pages-"));
  const remote = path.join(base, "remote.git");
  const work = path.join(base, "work");
  git(base, "init", "--quiet", "--bare", remote);
  git(base, "init", "--quiet", work);
  git(work, "remote", "add", "origin", remote);
  return { base, remote, work };
}

function preview(base, name, expiresAt) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "index.html"), name);
  fs.writeFileSync(path.join(dir, "expires-at"), String(expiresAt));
  return dir;
}

function run(work, now, ...args) {
  return execFileSync("bash", [script, ...args], { cwd: work, encoding: "utf8", env: { ...process.env, PAGES_NOW: String(now) } });
}

function files(remote) {
  return git(remote, "ls-tree", "-r", "--name-only", "gh-pages").split("\n").sort();
}

test("publish adds the preview next to existing ones", () => {
  const { base, remote, work } = setup();
  run(work, 1000, "publish", "pr-1", preview(base, "one", 5000));
  run(work, 1000, "publish", "pr-2", preview(base, "two", 5000));
  assert.deepStrictEqual(files(remote), [".nojekyll", "index.html", "previews/pr-1/expires-at", "previews/pr-1/index.html", "previews/pr-2/expires-at", "previews/pr-2/index.html", "robots.txt"]);
});

test("prune deletes pages after 24h and leaves no history with the old content", () => {
  const { base, remote, work } = setup();
  run(work, 1000, "publish", "pr-1", preview(base, "one", 2000));
  run(work, 1000, "publish", "pr-2", preview(base, "two", 9000));
  run(work, 3000, "prune");
  assert.ok(!files(remote).includes("previews/pr-1/index.html"));
  assert.ok(files(remote).includes("previews/pr-2/index.html"));
  assert.strictEqual(git(remote, "rev-list", "--count", "gh-pages"), "1");
});

test("remove deletes a preview right away when the PR closes", () => {
  const { base, remote, work } = setup();
  run(work, 1000, "publish", "pr-3", preview(base, "three", 9000));
  run(work, 1000, "remove", "pr-3");
  assert.ok(!files(remote).some((f) => f.startsWith("previews/pr-3")));
});

test("prune with nothing expired does not push a new commit", () => {
  const { base, remote, work } = setup();
  run(work, 1000, "publish", "pr-1", preview(base, "one", 9000));
  const before = git(remote, "rev-parse", "gh-pages");
  run(work, 2000, "prune");
  assert.strictEqual(git(remote, "rev-parse", "gh-pages"), before);
});

test("names that could escape the previews folder are refused", () => {
  const { base, work } = setup();
  assert.throws(() => run(work, 1000, "publish", "../x", preview(base, "bad", 9000)));
});
