/*
 * Tiny dependency-free GIF89a encoder. It uses a fixed RGB332 palette which
 * keeps recording fast and memory bounded; frames are encoded immediately.
 */
(function() {
  'use strict';

  class ByteWriter {
    constructor() { this.parts = []; }
    byte(value) { this.parts.push(value & 0xff); }
    word(value) { this.byte(value); this.byte(value >> 8); }
    bytes(values) { for (const value of values) this.byte(value); }
    finish() { return new Uint8Array(this.parts); }
  }

  class SmartGifEncoder {
    constructor(width, height, delay) {
      this.width = width;
      this.height = height;
      this.delay = delay;
      this.output = new ByteWriter();
      this.writeHeader();
    }

    writeHeader() {
      const out = this.output;
      out.bytes([71, 73, 70, 56, 57, 97]); // GIF89a
      out.word(this.width); out.word(this.height);
      out.byte(0xf7); // global RGB palette, 256 colors
      out.byte(0); out.byte(0);
      for (let index = 0; index < 256; index += 1) {
        const red = ((index >> 5) & 7) * 255 / 7;
        const green = ((index >> 2) & 7) * 255 / 7;
        const blue = (index & 3) * 255 / 3;
        out.byte(red); out.byte(green); out.byte(blue);
      }
      // Loop forever. A one-frame GIF remains valid as well.
      out.bytes([0x21, 0xff, 0x0b, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0, 0, 0]);
    }

    addFrame(rgba) {
      const pixels = new Uint8Array(this.width * this.height);
      for (let src = 0, dest = 0; dest < pixels.length; src += 4, dest += 1) {
        // RGB332: enough color for UI recording and dramatically faster than
        // creating a custom palette for every video frame.
        pixels[dest] = (rgba[src] & 0xe0) | ((rgba[src + 1] & 0xe0) >> 3) | ((rgba[src + 2] & 0xc0) >> 6);
      }
      const out = this.output;
      out.bytes([0x21, 0xf9, 0x04, 0x04]); // disposal: restore background
      out.word(this.delay);
      out.bytes([0, 0]);
      out.byte(0x2c); out.word(0); out.word(0); out.word(this.width); out.word(this.height); out.byte(0);
      out.byte(8); // minimum LZW code size
      const compressed = this.compress(pixels);
      for (let offset = 0; offset < compressed.length; offset += 255) {
        const chunk = compressed.slice(offset, offset + 255);
        out.byte(chunk.length); out.bytes(chunk);
      }
      out.byte(0);
    }

    compress(pixels) {
      const clearCode = 256;
      const endCode = 257;
      let nextCode = 258;
      let codeSize = 9;
      const dictionary = new Map();
      const output = [];
      let current = 0;
      let bits = 0;
      const write = code => {
        current |= code << bits;
        bits += codeSize;
        while (bits >= 8) { output.push(current & 0xff); current >>>= 8; bits -= 8; }
      };
      const reset = () => { dictionary.clear(); nextCode = 258; codeSize = 9; };
      write(clearCode);
      let prefix = pixels[0];
      for (let index = 1; index < pixels.length; index += 1) {
        const suffix = pixels[index];
        const key = `${prefix},${suffix}`;
        const found = dictionary.get(key);
        if (found !== undefined) { prefix = found; continue; }
        write(prefix);
        if (nextCode < 4096) {
          dictionary.set(key, nextCode++);
          // A GIF decoder adds dictionary entries one emitted code behind the
          // encoder. Switch widths only after crossing the boundary; changing
          // at equality makes complex frames unreadable from code 512 onward.
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize += 1;
        } else {
          write(clearCode);
          reset();
        }
        prefix = suffix;
      }
      write(prefix); write(endCode);
      if (bits) output.push(current & 0xff);
      return output;
    }

    finish() { this.output.byte(0x3b); return this.output.finish(); }
  }

  globalThis.SmartGifEncoder = SmartGifEncoder;
})();
