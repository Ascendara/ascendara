// Electron's IPC used structured clone. Electrobun's RPC is JSON, so values that
// JSON would flatten (binary data, dates, maps, sets, undefined) are tagged on
// the way out and rebuilt on the way in. Both the main process and the preload
// bundle use this file, so it must stay free of Node and DOM specifics.

const TAG = "__ascendaraWire";

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encode(value, seen = new WeakSet()) {
  if (value === undefined) return { [TAG]: "undefined" };
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { [TAG]: "nan" };
    if (!Number.isFinite(value)) return { [TAG]: value > 0 ? "inf" : "-inf" };
    return value;
  }
  if (typeof value === "bigint") return { [TAG]: "bigint", v: value.toString() };
  if (typeof value === "function" || typeof value === "symbol")
    return { [TAG]: "undefined" };
  if (value instanceof Date) return { [TAG]: "date", v: value.getTime() };
  if (value instanceof ArrayBuffer)
    return { [TAG]: "bytes", v: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [TAG]: "bytes", v: bytesToBase64(bytes) };
  }
  if (value instanceof Error) {
    return {
      [TAG]: "error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (seen.has(value)) return null;
  seen.add(value);
  try {
    if (value instanceof Map) {
      return {
        [TAG]: "map",
        v: [...value].map(([k, v]) => [encode(k, seen), encode(v, seen)]),
      };
    }
    if (value instanceof Set)
      return { [TAG]: "set", v: [...value].map(v => encode(v, seen)) };
    if (Array.isArray(value)) return value.map(v => encode(v, seen));
    if (typeof value.toJSON === "function") return encode(value.toJSON(), seen);
    const out = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      // Structured clone drops functions on objects instead of failing.
      if (typeof item === "function" || typeof item === "symbol") continue;
      out[key] = encode(item, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function decode(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decode);
  const tag = value[TAG];
  if (typeof tag === "string") {
    switch (tag) {
      case "undefined":
        return undefined;
      case "nan":
        return NaN;
      case "inf":
        return Infinity;
      case "-inf":
        return -Infinity;
      case "bigint":
        return BigInt(value.v);
      case "date":
        return new Date(value.v);
      case "bytes":
        return base64ToBytes(value.v);
      case "map":
        return new Map(value.v.map(([k, v]) => [decode(k), decode(v)]));
      case "set":
        return new Set(value.v.map(decode));
      case "error": {
        const error = new Error(value.message);
        error.name = value.name;
        if (value.stack) error.stack = value.stack;
        return error;
      }
    }
  }
  const out = {};
  for (const key of Object.keys(value)) out[key] = decode(value[key]);
  return out;
}

export function encodeArgs(args) {
  return args.map(arg => encode(arg));
}

export function decodeArgs(args) {
  return Array.isArray(args) ? args.map(decode) : [];
}
