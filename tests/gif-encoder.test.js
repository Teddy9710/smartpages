const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gif-recording', 'gif-encoder.js'), 'utf8');
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

function readWord(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readSubBlocks(bytes, start) {
  const output = [];
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset++];
    if (size === 0) break;
    output.push(...bytes.slice(offset, offset + size));
    offset += size;
  }
  return { bytes: Uint8Array.from(output), offset };
}

function decodeLzw(data, minimumCodeSize, expectedPixels) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let dictionary;
  let nextCode;
  let codeSize;
  let bitOffset = 0;
  let previous = null;
  const output = [];

  const reset = () => {
    dictionary = Array.from({ length: clearCode }, (_value, index) => [index]);
    dictionary[clearCode] = null;
    dictionary[endCode] = null;
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
    previous = null;
  };
  const readCode = () => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const sourceBit = bitOffset + bit;
      code |= ((data[sourceBit >> 3] >> (sourceBit & 7)) & 1) << bit;
    }
    bitOffset += codeSize;
    return code;
  };

  reset();
  while (bitOffset + codeSize <= data.length * 8) {
    const code = readCode();
    if (code === clearCode) { reset(); continue; }
    if (code === endCode) break;

    let entry = dictionary[code];
    if (!entry && code === nextCode && previous) entry = [...previous, previous[0]];
    if (!entry) throw new Error(`Invalid GIF LZW code ${code} at dictionary index ${nextCode}`);
    output.push(...entry);

    if (previous && nextCode < 4096) {
      dictionary[nextCode++] = [...previous, entry[0]];
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  assert.equal(output.length, expectedPixels, 'decoded frame must contain every pixel');
  return Uint8Array.from(output);
}

function decodeFrames(bytes) {
  assert.equal(Buffer.from(bytes.slice(0, 6)).toString('ascii'), 'GIF89a');
  const width = readWord(bytes, 6);
  const height = readWord(bytes, 8);
  const globalTableSize = 3 * (1 << ((bytes[10] & 7) + 1));
  let offset = 13 + globalTableSize;
  const frames = [];

  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 1; // extension label
      offset = readSubBlocks(bytes, offset).offset;
      continue;
    }
    assert.equal(marker, 0x2c, `unexpected GIF block marker 0x${marker.toString(16)}`);
    const frameWidth = readWord(bytes, offset + 4);
    const frameHeight = readWord(bytes, offset + 6);
    const packed = bytes[offset + 8];
    offset += 9;
    if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
    const minimumCodeSize = bytes[offset++];
    const blocks = readSubBlocks(bytes, offset);
    offset = blocks.offset;
    frames.push(decodeLzw(blocks.bytes, minimumCodeSize, frameWidth * frameHeight));
  }

  return { width, height, frames };
}

function makeFrame(width, height, phase) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = (x * 3 + phase * 71) & 0xff;
      rgba[offset + 1] = (y * 5 + phase * 43) & 0xff;
      rgba[offset + 2] = (x + y * 2 + phase * 97) & 0xff;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

const width = 320;
const height = 180;
const encoder = new sandbox.SmartGifEncoder(width, height, 10);
encoder.addFrame(makeFrame(width, height, 0));
encoder.addFrame(makeFrame(width, height, 1));

const decoded = decodeFrames(encoder.finish());
assert.equal(decoded.width, width);
assert.equal(decoded.height, height);
assert.equal(decoded.frames.length, 2);
assert.notDeepEqual(decoded.frames[0], decoded.frames[1], 'recorded GIF frames must retain visual changes');
