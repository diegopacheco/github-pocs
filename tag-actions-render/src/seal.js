const SEAL_ITERATIONS = 310000;

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(user, pass, salt, iterations) {
  const secret = new TextEncoder().encode(user + ":" + pass);
  const material = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function seal(data, user, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(user, pass, salt, SEAL_ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return { iterations: SEAL_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(cipher) };
}

async function unseal(box, user, pass) {
  const key = await deriveKey(user, pass, fromBase64(box.salt), box.iterations);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, key, fromBase64(box.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

if (typeof module !== "undefined") module.exports = { seal, unseal };
