const fs = require("node:fs");
const path = require("node:path");
const { seal } = require("./seal.js");

const PAGE_TYPES = { ".md": "md", ".markdown": "md", ".html": "html", ".htm": "html" };
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

function parseArgs(argv) {
  const options = { files: [], hours: 24, title: "Temp Render" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") options.root = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--user") options.user = argv[++i];
    else if (arg === "--pass") options.pass = argv[++i];
    else if (arg === "--hours") options.hours = Number(argv[++i]);
    else if (arg === "--title") options.title = argv[++i];
    else if (arg === "--files-from") options.filesFrom = argv[++i];
    else if (arg.startsWith("--")) throw new Error("unknown option " + arg);
    else options.files.push(arg);
  }
  if (options.filesFrom) {
    fs.readFileSync(options.filesFrom, "utf8").split(/[\0\n]/).filter(Boolean).forEach((f) => options.files.push(f));
  }
  if (!options.root || !options.out || !options.user || !options.pass) throw new Error("required: --root --out --user --pass");
  if (!(options.hours > 0)) throw new Error("--hours must be a positive number");
  return options;
}

function insideRoot(root, relative) {
  if (path.isAbsolute(relative)) return null;
  const full = path.resolve(root, relative);
  if (!fs.existsSync(full)) return null;
  const real = fs.realpathSync(full);
  if (real !== root && !real.startsWith(root + path.sep)) return null;
  if (!fs.statSync(real).isFile()) return null;
  return real;
}

function toRepoPath(root, real) {
  return path.relative(root, real).split(path.sep).join("/");
}

function collectPages(root, files) {
  const pages = [];
  const seen = new Set();
  for (const file of files) {
    const type = PAGE_TYPES[path.extname(file).toLowerCase()];
    const real = type && insideRoot(root, file);
    if (!real) throw new Error("rejected file: " + file);
    const repoPath = toRepoPath(root, real);
    if (seen.has(repoPath)) continue;
    seen.add(repoPath);
    pages.push({ path: repoPath, type, content: fs.readFileSync(real, "utf8") });
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}

function imageRefs(page) {
  const refs = [];
  const patterns = [/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi, /!\[[^\]]*\]\(\s*([^)\s]+)/g];
  for (const pattern of patterns) {
    for (const match of page.content.matchAll(pattern)) refs.push(match[1]);
  }
  return refs.filter((ref) => !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref));
}

function collectAssets(root, pages) {
  const assets = {};
  for (const page of pages) {
    for (const ref of imageRefs(page)) {
      let clean;
      try { clean = decodeURI(ref.split(/[?#]/)[0]); } catch (e) { continue; }
      const mime = IMAGE_TYPES[path.extname(clean).toLowerCase()];
      const real = mime && insideRoot(root, path.posix.join(path.posix.dirname(page.path), clean));
      if (!real || fs.statSync(real).size > MAX_ASSET_BYTES) continue;
      assets[toRepoPath(root, real)] = "data:" + mime + ";base64," + fs.readFileSync(real).toString("base64");
    }
  }
  return assets;
}

function inlineScript(source) {
  if (/<\/script/i.test(source)) throw new Error("script contains a closing script tag");
  return source;
}

async function build(options) {
  const root = fs.realpathSync(options.root);
  const pages = collectPages(root, options.files);
  if (pages.length === 0) throw new Error("no html or md files to render");
  const assets = collectAssets(root, pages);
  const expiresAt = Date.now() + options.hours * 3600 * 1000;
  const sealed = await seal({ files: pages, assets }, options.user, options.pass);
  const payload = JSON.stringify({ title: options.title, expiresAt, sealed }).replace(/</g, "\\u003c");
  const template = fs.readFileSync(path.join(__dirname, "viewer.html"), "utf8");
  const html = template
    .replace("__PAYLOAD__", () => payload)
    .replace("__SEAL_JS__", () => inlineScript(fs.readFileSync(path.join(__dirname, "seal.js"), "utf8")))
    .replace("__MARKDOWN_JS__", () => inlineScript(fs.readFileSync(path.join(__dirname, "markdown.js"), "utf8")));
  fs.mkdirSync(options.out, { recursive: true });
  fs.writeFileSync(path.join(options.out, "index.html"), html);
  fs.writeFileSync(path.join(options.out, "expires-at"), String(Math.floor(expiresAt / 1000)) + "\n");
  return { pages: pages.length, assets: Object.keys(assets).length, expiresAt };
}

if (require.main === module) {
  build(parseArgs(process.argv.slice(2)))
    .then((result) => console.log("rendered " + result.pages + " files, " + result.assets + " images, expires " + new Date(result.expiresAt).toISOString()))
    .catch((error) => {
      console.error("build failed: " + error.message);
      process.exit(1);
    });
}

module.exports = { build, parseArgs };
