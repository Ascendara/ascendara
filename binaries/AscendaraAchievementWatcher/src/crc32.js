"use strict";

// Steam achievement names use the standard IEEE CRC-32 polynomial.
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

module.exports = function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(value, "utf8")) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
