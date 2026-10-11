// Paytm's Node checksum implementation, adapted from Paytm's published utility:
// https://github.com/paytm/Paytm_Node_Checksum
// and the official docs at https://www.paytmpayments.com/docs/checksum/.
// Paytm's checksum is AES-128-CBC encryption of SHA256(data + '|' + salt) + salt.
import crypto from "node:crypto";

const IV = "@@@@&&&&####$$$$";

function assertKey(key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") !== 16) {
    throw new Error("Paytm merchant key must be exactly 16 bytes.");
  }
}

function encrypt(value, key) {
  assertKey(key);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, IV);
  return cipher.update(value, "binary", "base64") + cipher.final("base64");
}

function decrypt(value, key) {
  assertKey(key);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, IV);
  return decipher.update(String(value), "base64", "binary") + decipher.final("binary");
}

function paramsToString(params) {
  const safe = {};
  for (const key of Object.keys(params || {}).sort()) {
    const value = params[key];
    // Callback parameters are scalar strings. A nested object is rejected rather than
    // silently signed using a different representation than Paytm's documented utility.
    if (value != null && typeof value === "object") throw new Error("Unsupported Paytm checksum parameter.");
    safe[key] = value == null ? "" : String(value);
  }
  return Object.values(safe).join("|");
}

function checksumPayload(data, salt) {
  const hash = crypto.createHash("sha256").update(`${data}|${salt}`).digest("hex");
  return `${hash}${salt}`;
}

export async function generatePaytmSignature(data, key) {
  assertKey(key);
  const source = typeof data === "string" ? data : paramsToString(data);
  const salt = crypto.randomBytes(3).toString("base64").slice(0, 4);
  return encrypt(checksumPayload(source, salt), key);
}

export function verifyPaytmSignature(data, key, signature) {
  try {
    assertKey(key);
    if (typeof signature !== "string" || !signature) return false;
    const source = typeof data === "string" ? data : (() => {
      const params = { ...(data || {}) };
      delete params.CHECKSUMHASH;
      delete params.checksumHash;
      return paramsToString(params);
    })();
    const decoded = decrypt(signature, key);
    if (decoded.length < 5) return false;
    const salt = decoded.slice(-4);
    const expected = checksumPayload(source, salt);
    const a = Buffer.from(decoded), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
