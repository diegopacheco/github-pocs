const test = require("node:test");
const assert = require("node:assert");
const { seal, unseal } = require("../src/seal.js");

test("content opens with the right user and password", async () => {
  const box = await seal({ files: [{ path: "a.md" }] }, "pr-1", "secret");
  assert.deepStrictEqual(await unseal(box, "pr-1", "secret"), { files: [{ path: "a.md" }] });
});

test("wrong password cannot open the page", async () => {
  const box = await seal({ a: 1 }, "pr-1", "secret");
  await assert.rejects(unseal(box, "pr-1", "Secret"));
});

test("wrong user cannot open the page even with the right password", async () => {
  const box = await seal({ a: 1 }, "pr-1", "secret");
  await assert.rejects(unseal(box, "pr-2", "secret"));
});

test("published payload never contains the plain text content", async () => {
  const box = await seal({ note: "private-roadmap-text" }, "pr-1", "secret");
  assert.ok(!JSON.stringify(box).includes("private-roadmap-text"));
});

test("sealing twice gives different ciphertext so equal files are not detectable", async () => {
  const one = await seal({ a: 1 }, "u", "p");
  const two = await seal({ a: 1 }, "u", "p");
  assert.notStrictEqual(one.data, two.data);
  assert.notStrictEqual(one.salt, two.salt);
});
