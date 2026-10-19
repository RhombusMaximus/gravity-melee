// miniprotracker :: a minimal ProTracker (.mod) player in pure JavaScript
//
// Parses and renders 4/6/8-channel Amiga ProTracker modules to PCM, with no
// dependencies, no WASM, and no browser APIs in the core: the same code
// renders in Node (see tools/render.mjs) and in a page (see demo/).
//
// Effect coverage follows ProTracker 2.3A semantics: arpeggio, portamento,
// tone portamento, vibrato, tremolo, volume slides, sample offset, position
// jump, pattern break/loop/delay, fine slides, retrigger, note cut/delay,
// and speed/tempo. Validated against libopenmpt renders (tools/validate).
//
// MIT license. The embedded period table is the ProTracker V2.1A play
// routine table (Amiga hardware values).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProTracker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AMIGA_CLOCK = 3546895;   // PAL clock, Hz: freq = clock / (2 * period)
  var DEFAULT_SPEED = 6;      // ticks per row
  var DEFAULT_TEMPO = 125;    // BPM; tick rate = 2 * tempo / 5 Hz

  // ProTracker V2.1A period table: 16 finetunings x 36 notes (C-2..B-3)
  var PERIODS = [
    [856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120,113],
    [850,802,757,715,674,637,601,567,535,505,477,450,425,401,379,357,337,318,300,284,268,253,239,225,213,201,189,179,169,159,150,142,134,126,119,113],
    [844,796,752,709,670,632,597,563,532,502,474,447,422,398,376,355,335,316,298,282,266,251,237,224,211,199,188,177,167,158,149,141,133,125,118,112],
    [838,791,746,704,665,628,592,559,528,498,470,444,419,395,373,352,332,314,296,280,264,249,235,222,209,198,187,176,166,157,148,140,132,125,118,111],
    [832,785,741,699,660,623,588,555,524,495,467,441,416,392,370,350,330,312,294,278,262,247,233,220,208,196,185,175,165,156,147,139,131,124,117,110],
    [826,779,736,694,655,619,584,551,520,491,463,437,413,390,368,347,328,309,292,276,260,245,232,219,206,195,184,174,164,155,146,138,130,123,116,109],
    [820,774,730,689,651,614,580,547,516,487,460,434,410,387,365,345,325,307,290,274,258,244,230,217,205,193,183,172,163,154,145,137,129,122,115,109],
    [814,768,725,684,646,610,575,543,513,484,457,431,407,384,363,342,323,305,288,272,256,242,228,216,204,192,181,171,161,152,144,136,128,121,114,108],
    [907,856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120],
    [900,850,802,757,715,675,636,601,567,535,505,477,450,425,401,379,357,337,318,300,284,268,253,238,225,212,200,189,179,169,159,150,142,134,126,119],
    [894,844,796,752,709,670,632,597,563,532,502,474,447,422,398,376,355,335,316,298,282,266,251,237,223,211,199,188,177,167,158,149,141,133,125,118],
    [887,838,791,746,704,665,628,592,559,528,498,470,444,419,395,373,352,332,314,296,280,264,249,235,222,209,198,187,176,166,157,148,140,132,125,118],
    [881,832,785,741,699,660,623,588,555,524,494,467,441,416,392,370,350,330,312,294,278,262,247,233,220,208,196,185,175,165,156,147,139,131,123,117],
    [875,826,779,736,694,655,619,584,551,520,491,463,437,413,390,368,347,328,309,292,276,260,245,232,219,206,195,184,174,164,155,146,138,130,123,116],
    [868,820,774,730,689,651,614,580,547,516,487,460,434,410,387,365,345,325,307,290,274,258,244,230,217,205,193,183,172,163,154,145,137,129,122,115],
    [862,814,768,725,684,646,610,575,543,513,484,457,431,407,384,363,342,323,305,288,272,256,242,228,216,203,192,181,171,161,152,144,136,128,121,114],
  ];

  var SIN = (function () {
    var t = [];
    for (var i = 0; i < 64; i++) t.push(Math.round(255 * Math.sin(2 * Math.PI * i / 64)));
    return t;
  })();

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // stand-in for a missing/short pattern cell — some modules in the wild
  // reference rows or patterns that aren't in the file
  var NO_CELL = { sample: 0, period: 0, effect: 0 };

  // ---------- parsing ----------

  var MAGICS_4 = ['M.K.', 'M!K!', 'FLT4', '4CHN', 'FEST'];
  var MAGICS_6 = ['6CHN'];
  var MAGICS_8 = ['8CHN', 'FLT8', 'OCTA', 'CD81'];

  function parse(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var be16 = function (o) { return (bytes[o] << 8) | bytes[o + 1]; };
    var title = str(bytes, 0, 20);
    var magic = str(bytes, 1080, 4);
    var nch;
    if (MAGICS_4.indexOf(magic) >= 0) nch = 4;
    else if (MAGICS_6.indexOf(magic) >= 0) nch = 6;
    else if (MAGICS_8.indexOf(magic) >= 0) nch = 8;
    else throw new Error('not a ProTracker module (magic ' + JSON.stringify(magic) + ')');

    var samples = [];
    for (var s = 0; s < 31; s++) {
      var h = 20 + s * 30;
      samples.push({
        name: str(bytes, h, 22),
        length: be16(h + 22) * 2,
        finetune: bytes[h + 24] & 0x0F,
        volume: clamp(bytes[h + 25], 0, 64),
        repeatOffset: be16(h + 26) * 2,
        repeatLength: be16(h + 28) * 2,
      });
    }
    var songLength = Math.min(bytes[950] || 1, 128);
    var restart = bytes[951];
    var orders = [];
    var maxPattern = 0;
    for (var o = 0; o < songLength; o++) {
      var p = bytes[952 + o];
      orders.push(p);
      if (p > maxPattern) maxPattern = p;
    }
    var nPatterns = maxPattern + 1;

    var patterns = [];
    var base = 1084;
    for (var pi = 0; pi < nPatterns; pi++) {
      var rows = [];
      for (var r = 0; r < 64; r++) {
        var row = [];
        for (var c = 0; c < nch; c++) {
          var i = base + (pi * 64 + r) * nch * 4 + c * 4;
          var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2], b3 = bytes[i + 3];
          row.push({
            sample: (b0 & 0xF0) | (b2 >> 4),
            period: ((b0 & 0x0F) << 8) | b1,
            effect: ((b2 & 0x0F) << 8) | b3,   // 12-bit: cmd << 8 | arg
          });
        }
        rows.push(row);
      }
      patterns.push(rows);
    }

    var dataOff = base + nPatterns * 64 * nch * 4;
    for (var si = 0; si < 31; si++) {
      var smp = samples[si];
      var end = Math.min(dataOff + smp.length, bytes.length);
      var data = new Float32Array(Math.max(0, end - dataOff));
      for (var d = dataOff; d < end; d++) data[d - dataOff] = ((bytes[d] << 24) >> 24) / 128;
      smp.data = data;
      dataOff += smp.length;
    }

    return {
      title: title,
      magic: magic,
      channels: nch,
      samples: samples,
      orders: orders,
      songLength: songLength,
      restart: restart < songLength ? restart : 0,
      patterns: patterns,
    };
  }

  function str(bytes, off, len) {
    var out = '';
    for (var i = off; i < off + len; i++) {
      if (!bytes[i]) break;
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  // period -> note index within a finetune table (nearest match)
  function periodToNote(period, finetune) {
    var t = PERIODS[finetune & 0x0F];
    if (period < t[35]) {
      return 36 + Math.floor(12 * Math.log(t[35] / period) / Math.LN2 + 1e-9);
    }
    var best = 0, bestD = Infinity;
    for (var i = 0; i < 36; i++) {
      var d = Math.abs(t[i] - period);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // note index -> period, with extended octaves above the table (index 36+
  // extrapolates one octave up per 36 notes) so out-of-table notes (e.g.
  // C-4 = 107) still pitch correctly
  function wrapNote(n) { return ((n % 36) + 36) % 36; }

  function notePeriod(note, finetune) {
    var ft = finetune & 0x0F;
    var n = Math.round(note);
    if (n <= 35) return PERIODS[ft][clamp(n, 0, 35)];
    return PERIODS[ft][35] * Math.pow(2, -(n - 35) / 12);
  }

  // ---------- engine ----------

  function Engine(mod) {
    this.mod = mod;
    this.orderIdx = 0;
    this.row = 0;
    this.tick = 0;
    this.speed = DEFAULT_SPEED;
    this.tempo = DEFAULT_TEMPO;
    this.breakRow = -1;
    this.jumpTo = -1;
    this.sampleRate = 44100;
    this.channels = [];
    for (var c = 0; c < mod.channels; c++) this.channels.push(new Chan());
    // loop-point detection: (orderIdx*64 + row) -> tick index of first play
    this.visited = { 0: 0 };
    this.tickCount = 0;
    this.looped = false;
    this.loopedTo = 0;
  }

  function Chan() {
    this.sample = null;
    this.pos = 0;
    this.period = 0;          // current playback period
    this.vol = 0;
    this.arp = null;           // [x, y]
    this.toneTarget = 0;       // 3xx target period
    this.toneSpeed = 0;
    this.slide = 0;            // Axy per-tick volume delta
    this.volSlide = 0;         // Dxy volume slide (D00 memorizes)
    this.portaUp = 0;          // 1xx per-tick period delta (memorized)
    this.portaDown = 0;        // 2xx
    this.lastOffset = 0;       // 9xx memory
    this.vibPos = 0; this.vibRate = 0; this.vibDepth = 0; this.vibOn = false;
    this.tremPos = 0; this.tremRate = 0; this.tremDepth = 0; this.tremOn = false;
    this.pendingDelay = -1;    // EDxy
    this.delayed = null;
    this.cutAt = -1;           // ECxy
    this.retrig = 0; this.retrigCount = 0;   // E9xy
    this.loopStart = -1; this.loopCount = 0; // E6xy
  }

  Engine.prototype.tickRate = function () { return 2 * this.tempo / 5; };

  // true when the sequencer just landed on an (order,row) it has already
  // played — that landing is the module's loop point; loopedTo holds the
  // tick index where the row FIRST played (-> loopStart for callers)
  Engine.prototype.checkLoopPoint = function () {
    var key = this.orderIdx * 64 + this.row;
    if (this.visited[key] === undefined) return false;
    this.loopedTo = this.visited[key];
    this.looped = true;
    return true;
  };

  // advance one sequencer tick; returns false at the song wrap (loop point)
  Engine.prototype.step = function () {
    var mod = this.mod;
    var wrapped = false;
    this.tickCount++;
    var pat = mod.patterns[mod.orders[this.orderIdx]];
    var row = pat ? pat[this.row] : null;
    if (!row) return false;   // sequencer hit a missing pattern/row: stop

    if (this.tick === 0) {
      var mk = this.orderIdx * 64 + this.row;
      if (this.visited[mk] === undefined) this.visited[mk] = this.tickCount;
      this.startRow(row);
    }

    for (var c = 0; c < this.channels.length; c++) {
      this.runEffects(this.channels[c], row[c]);
    }
    for (var c2 = 0; c2 < this.channels.length; c2++) {
      var ch = this.channels[c2];
      if (ch.retrig > 0 && ch.sample) {
        ch.retrigCount++;
        if (ch.retrigCount >= ch.retrig) { ch.retrigCount = 0; ch.pos = 0; }
      }
    }

    this.tick++;
    if (this.tick >= this.speed) {
      this.tick = 0;
      this.row++;
      if (this.jumpTo >= 0) {
        this.orderIdx = this.jumpTo;
        this.row = this.breakRow >= 0 ? this.breakRow : 0;
        this.jumpTo = -1; this.breakRow = -1;
        if (this.checkLoopPoint()) wrapped = true;
      } else if (this.breakRow >= 0) {
        this.row = this.breakRow;
        this.breakRow = -1;
        this.orderIdx++;
        if (this.orderIdx >= mod.songLength) this.orderIdx = mod.restart;
        if (this.checkLoopPoint()) wrapped = true;
      } else if (this.row >= 64) {
        this.row = 0;
        this.orderIdx++;
        if (this.orderIdx >= mod.songLength) this.orderIdx = mod.restart;
        if (this.checkLoopPoint()) wrapped = true;
      }
    }
    return !wrapped;
  };

  Engine.prototype.startRow = function (row) {
    var mod = this.mod;
    if (!row) return;   // missing row: the sequencer is already stopping
    for (var c = 0; c < this.channels.length; c++) {
      var cell = row[c] || NO_CELL;
      var cmd = cell.effect >> 8, arg = cell.effect & 0xFF;
      var ch = this.channels[c];

      var newSample = cell.sample ? (mod.samples[cell.sample - 1] || null) : null;
      var period = cell.period;
      var tonePorta = cmd === 3;

      // EDxy: stash the note, trigger it on tick y
      if (cmd === 0xE && (arg >> 4) === 0xD && arg & 0x0F) {
        ch.pendingDelay = arg & 0x0F;
        ch.delayed = { sample: newSample, period: period };
      }

      if (newSample && !tonePorta) {
        ch.sample = newSample;
        ch.pos = 0;
        ch.vol = newSample.volume;   // PT: a new instrument sets its default volume
      }
      if (period && period >= 32 && period <= 907) {
        // accept out-of-table notes too (e.g. C-4 = 107): the frequency
        // formula clock/period needs no table; the table only matters for
        // semitone effects (arpeggio), which clamp to the nearest note.
        if (tonePorta) {
          ch.toneTarget = period;
          if (newSample) { ch.sample = newSample; ch.pos = 0; }
        } else {
          ch.period = period;
          ch.toneTarget = 0;
        }
        ch.vibOn = false; ch.tremOn = false; ch.arp = null;
      } else if (tonePorta && period) {
        ch.toneTarget = period;
      }
      if (cmd === 0x3) ch.toneSpeed = arg || ch.toneSpeed;

      // 9xx sample offset
      if (cmd === 0x9) {
        var off = arg || ch.lastOffset;
        ch.lastOffset = off;
        if (ch.sample) ch.pos = off * 256;
      }

      switch (cmd) {
        case 0x0: if (arg) ch.arp = [arg >> 4, arg & 0x0F]; break;
        case 0x1: if (arg) ch.portaUp = arg; break;
        case 0x2: if (arg) ch.portaDown = arg; break;
        case 0x4:
          if (arg) { ch.vibRate = arg >> 4; ch.vibDepth = arg & 0x0F; }
          ch.vibOn = true;
          break;
        case 0x7:
          if (arg) { ch.tremRate = arg >> 4; ch.tremDepth = arg & 0x0F; }
          ch.tremOn = true;
          break;
        case 0xA: ch.slide = arg; break;
        case 0xB: this.jumpTo = arg; break;
        case 0xC:
          // Cxx pattern-break row args are BCD (C40 = row 40), not hex;
          // clamp to 63 so a malformed nibble can't run off the pattern
          this.breakRow = Math.min(63, ((arg >> 4) * 10) + (arg & 0x0F));
          break;
        case 0xD: ch.volSlide = arg || ch.volSlide; break;   // Dxy volume slide, D00 memorizes
        case 0xF:
          if (arg > 0) { if (arg < 32) this.speed = arg; else this.tempo = arg; }
          break;
        case 0xE: {
          var ex = arg >> 4, ey = arg & 0x0F;
          switch (ex) {
            case 0x1: ch.period = clamp(ch.period - ey, 113, 856); break;   // fine porta up
            case 0x2: ch.period = clamp(ch.period + ey, 113, 856); break;   // fine porta down
            case 0x6:                                                        // pattern loop
              if (ey === 0) ch.loopStart = this.row;
              else if (ch.loopCount === 0) { ch.loopCount = ey; this.row = Math.max(ch.loopStart, 0); }
              else if (--ch.loopCount <= 0) ch.loopStart = -1;
              else this.row = Math.max(ch.loopStart, 0);
              break;
            case 0x9: if (ey) { ch.retrig = ey; ch.retrigCount = 0; } break;
            case 0xA: ch.vol = clamp(ch.vol + ey, 0, 64); break;            // fine volume up
            case 0xB: ch.vol = clamp(ch.vol - ey, 0, 64); break;            // fine volume down
            case 0xC: if (ey) ch.cutAt = ey; break;                          // note cut
            case 0xE: /* pattern delay: approximate by holding the row */ break;
          }
          break;
        }
      }
    }
  };

  Engine.prototype.runEffects = function (ch, cell) {
    cell = cell || NO_CELL;
    var cmd = cell.effect >> 8, arg = cell.effect & 0xFF;

    if (cmd === 0x1 && ch.portaUp) ch.period = clamp(ch.period - ch.portaUp, 113, 856);
    if (cmd === 0x2 && ch.portaDown) ch.period = clamp(ch.period + ch.portaDown, 113, 856);
    if (cmd === 0x3 && ch.toneTarget) {
      var sp = ch.toneSpeed || 0;
      if (ch.period < ch.toneTarget) ch.period = clamp(ch.period + sp, 113, ch.toneTarget);
      else if (ch.period > ch.toneTarget) ch.period = clamp(ch.period - sp, ch.toneTarget, 856);
    }
    if ((cmd === 0x5 || cmd === 0x6 || cmd === 0xA) && arg) {
      var up = arg >> 4, down = arg & 0x0F;
      if (up && !down) ch.vol = clamp(ch.vol + up, 0, 64);
      else if (down && !up) ch.vol = clamp(ch.vol - down, 0, 64);
    }
    if (cmd === 0xD && ch.volSlide) {
      var dup = ch.volSlide >> 4, ddown = ch.volSlide & 0x0F;
      if (dup && !ddown) ch.vol = clamp(ch.vol + dup, 0, 64);
      else if (ddown && !dup) ch.vol = clamp(ch.vol - ddown, 0, 64);
    }
    if (cmd === 0x4 || cmd === 0x6) ch.vibPos = (ch.vibPos + ch.vibRate) & 63;
    if (cmd === 0x7) ch.tremPos = (ch.tremPos + ch.tremRate) & 63;

    if (ch.cutAt >= 0 && this.tick === ch.cutAt) { ch.vol = 0; ch.cutAt = -1; }
    if (ch.pendingDelay >= 0 && this.tick === ch.pendingDelay) {
      ch.pendingDelay = -1;
      if (ch.delayed) {
        if (ch.delayed.sample) { ch.sample = ch.delayed.sample; ch.pos = 0; }
        if (ch.delayed.period) ch.period = ch.delayed.period;
        ch.delayed = null;
      }
    }
  };

  // effective period for this tick (arpeggio / vibrato applied)
  Engine.prototype.effectivePeriod = function (ch) {
    var p = ch.period;
    if (!p) return 0;
    var ft = ch.sample ? ch.sample.finetune : 0;
    if (ch.arp) {
      // ProTracker arpeggio: in-table notes shifting past the top of the
      // table wrap three octaves down (the classic PT quirk); notes that
      // already live above the table (extended octaves) keep shifting up
      var base = periodToNote(p, ft);
      var step = this.tick % 3;
      function arpNote(shift) {
        var j = base + shift;
        if (base <= 35 && j > 35) j -= 36;
        return notePeriod(j, ft);
      }
      if (step === 1) p = arpNote(ch.arp[0]);
      else if (step === 2) p = arpNote(ch.arp[1]);
    }
    if (ch.vibOn) p -= (SIN[ch.vibPos] * ch.vibDepth) >> 7;
    return clamp(p, 14, 907);   // table top is 113; extended notes sit above
  };

  // mix one output frame (call per output sample)
  Engine.prototype.mixFrame = function (out, o, gain) {
    var sum = 0;
    for (var c = 0; c < this.channels.length; c++) {
      var ch = this.channels[c];
      var smp = ch.sample;
      if (!smp || !smp.data.length || ch.vol <= 0) continue;
      var p = this.effectivePeriod(ch);
      if (!p) continue;
      // ProTracker convention: freq = Amiga clock / period (period 428 = C-4
      // at 8363 Hz); the period table is tabulated for this formula.
      var freq = AMIGA_CLOCK / p;
      ch.pos += freq / this.sampleRate;
      var i = ch.pos | 0;
      // ProTracker: repeatLength of 1 word (2 bytes) = "no loop" marker.
      // Must be > 2 bytes (i.e., at least 2 words) to actually loop.
      var loops = smp.repeatLength > 2;
      if (loops) {
        // wrap within the loop region, PRESERVING the fractional position
        var end = smp.repeatOffset + smp.repeatLength;
        if (ch.pos >= end) {
          ch.pos = smp.repeatOffset + (ch.pos - smp.repeatOffset) % smp.repeatLength;
          i = ch.pos | 0;
        }
      } else if (i >= smp.data.length) {
        ch.vol = 0;   // one-shot sample played out
        continue;
      }
      var trem = ch.tremOn ? ((SIN[ch.tremPos] * ch.tremDepth) >> 7) : 0;
      var vol = clamp(ch.vol + trem, 0, 64) / 64;
      sum += smp.data[i] * vol;
    }
    out[o] += sum * gain;
  };

  // ---------- render ----------

  function render(mod, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate || 44100;
    var gain = opts.gain === undefined ? 0.25 : opts.gain;
    var loops = opts.loops === undefined ? 1 : opts.loops;
    var maxSeconds = opts.maxSeconds || 1200;

    var eng = new Engine(mod);
    eng.sampleRate = sampleRate;
    var chunks = [];
    var buf = new Float32Array(sampleRate);
    var filled = 0;
    var loopEnds = 0;
    var framesLeft = maxSeconds * sampleRate;
    var written = 0;

    while (loopEnds < loops && written < framesLeft) {
      var alive = eng.step();
      if (!alive) loopEnds++;
      var frames = Math.round(sampleRate / eng.tickRate());
      for (var f = 0; f < frames && written < framesLeft; f++) {
        if (filled >= buf.length) {
          chunks.push(buf);
          buf = new Float32Array(buf.length * 2);
          filled = 0;
        }
        buf[filled] = 0;
        eng.mixFrame(buf, filled, gain);
        filled++; written++;
      }
    }
    chunks.push(buf.subarray(0, filled));
    var pcm = new Float32Array(written);
    var off = 0;
    for (var i = 0; i < chunks.length; i++) { pcm.set(chunks[i], off); off += chunks[i].length; }
    var loopStart = eng.looped ? eng.loopedTo / eng.tickRate() : 0;
    if (!(loopStart > 0)) loopStart = 0;
    return { pcm: pcm, sampleRate: sampleRate, duration: written / sampleRate,
             looped: eng.looped, loopStart: loopStart };
  }

  // ---------- public API ----------

  return {
    parse: parse,
    render: render,
    Engine: Engine,
    PERIODS: PERIODS,
    notePeriod: notePeriod,
    periodToNote: periodToNote,
    AMIGA_CLOCK: AMIGA_CLOCK,
  };
});