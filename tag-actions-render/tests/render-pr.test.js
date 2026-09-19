const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "../scripts/render-pr.sh");

const fakeGh = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE/calls"
case "$1 $2" in
  "secret set") cat > "$FAKE/secret" ;;
  "secret list") [ -f "$FAKE/secret" ] && echo RENDER_PASS || true ;;
  "secret delete") rm "$FAKE/secret" ;;
  "pr edit") ;;
  "workflow run") ;;
  "run list") echo 42 ;;
  "run watch") cp "$FAKE/secret" "$FAKE/secret-during-run"; exit "$FAKE_WATCH_EXIT" ;;
  "repo view") echo DiegoPacheco/github-pocs ;;
  *) echo "unexpected gh $*" >&2; exit 9 ;;
esac
`;

function run(args, watchExit = 0) {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), "render-pr-"));
  fs.mkdirSync(path.join(fake, "bin"));
  fs.writeFileSync(path.join(fake, "bin/gh"), fakeGh, { mode: 0o755 });
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, FAKE: fake, FAKE_WATCH_EXIT: String(watchExit), PATH: `${path.join(fake, "bin")}:${process.env.PATH}` },
  });
  const read = (name) => (fs.existsSync(path.join(fake, name)) ? fs.readFileSync(path.join(fake, name), "utf8") : null);
  return { ...result, secret: read("secret"), secretDuringRun: read("secret-during-run"), calls: read("calls") || "" };
}

test("the password exists as a secret only while the run is going and only the owner terminal sees it", () => {
  const r = run(["12"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.secret, null);
  assert.match(r.secretDuringRun, /^[A-Za-z0-9]{24}$/);
  assert.ok(r.stdout.includes(`password: ${r.secretDuringRun}`));
  assert.ok(r.stdout.includes("page:     https://diegopacheco.github.io/github-pocs/previews/pr-12/"));
});

test("the secret is deleted even when the run fails, and the password is not printed", () => {
  const r = run(["12"], 1);
  assert.notStrictEqual(r.status, 0);
  assert.strictEqual(r.secret, null);
  assert.ok(!r.stdout.includes(r.secretDuringRun));
  assert.match(r.stderr, /run 42 failed/);
});

test("every run gets a new password so a leaked one opens a single preview", () => {
  assert.notStrictEqual(run(["12"]).secretDuringRun, run(["12"]).secretDuringRun);
});

test("a bad pull request number never touches github", () => {
  const r = run(["12; rm -rf /"]);
  assert.notStrictEqual(r.status, 0);
  assert.strictEqual(r.calls, "");
});
