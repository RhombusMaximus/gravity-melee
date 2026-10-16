// gravity-melee :: WebAudio bleeps — synthesized, zero assets
(function (GM) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const A = { ctx: null, master: null, muted: false };

  A.ensure = () => {
    if (A.ctx) return A.ctx;
    if (!AC) return null;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.vol;
    A.master.connect(A.ctx.destination);
    return A.ctx;
  };
  A.resume = () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };
  A.toggleMute = () => { A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : A.vol; return A.muted; };
  A.vol = 0.22;
  A.volStep = 0.04;
  A.volUp = () => { A.vol = Math.min(0.6, +(A.vol + A.volStep).toFixed(2)); if (!A.muted && A.master) A.master.gain.value = A.vol; return A.vol; };
  A.volDown = () => { A.vol = Math.max(0, +(A.vol - A.volStep).toFixed(2)); if (!A.muted && A.master) A.master.gain.value = A.vol; return A.vol; };

  // generic tone
  function tone(freq, dur, type, vol, slide, delay = 0) {
    if (!A.ctx || A.muted || GM.SILENT) return;
    const t0 = A.ctx.currentTime + delay;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1) {
    if (!A.ctx || A.muted || GM.SILENT) return;
    const t0 = A.ctx.currentTime;
    const n = A.ctx.createBufferSource();
    const len = Math.max(1, (dur * A.ctx.sampleRate) | 0);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(f); f.connect(g); g.connect(A.master);
    n.start(t0); n.stop(t0 + dur);
  }

  // ---- embedded Star Control II sounds (js/content.js, CC BY-NC-SA 2.5) ----
  // Decoded once at boot; every play falls back to the synthesized set if a
  // buffer is missing or the browser refuses to decode.
  A.buffers = null;
  A.loadContent = async () => {
    if (!AC || !GM.CONTENT || !GM.CONTENT.wavs || A.buffers) return;
    const ctx = A.ensure();
    if (!ctx) return;
    A.buffers = {};
    for (const [name, uri] of Object.entries(GM.CONTENT.wavs)) {
      try {
        const raw = atob(uri.split(',')[1]);
        const buf = new ArrayBuffer(raw.length);
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        A.buffers[name] = await ctx.decodeAudioData(buf);
      } catch (e) { /* synthesized fallback stays for this sound */ }
    }
  };
  A.playBuf = (n, vol = 1, rate = 1) => {
    if (!A.ctx || A.muted || GM.SILENT || !A.buffers || !A.buffers[n]) return false;
    const src = A.ctx.createBufferSource();
    src.buffer = A.buffers[n];
    src.playbackRate.value = rate;
    const g = A.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(A.master);
    src.start();
    return true;
  };

  A.SND = {
    laser:   () => { tone(880, 0.07, 'square', 0.10, 0.4); },
    pellet:  () => { tone(700, 0.05, 'square', 0.08, 0.5); },
    bolt:    () => { tone(320, 0.10, 'sawtooth', 0.14, 0.6); },
    shot:    () => { tone(500, 0.08, 'square', 0.10, 0.5); tone(430, 0.08, 'square', 0.07, 0.5, 0.03); },
    plasma:  () => { tone(150, 0.30, 'sawtooth', 0.20, 0.5); noise(0.18, 0.12, 700, 0.7); },
    lob:     () => { tone(240, 0.18, 'sine', 0.16, 1.7); },
    missile: () => { noise(0.30, 0.10, 400, 0.8); tone(520, 0.08, 'square', 0.08, 0.7); },
    mine:    () => { tone(200, 0.12, 'square', 0.10, 0.6); },
    blink:   () => { tone(1200, 0.12, 'sine', 0.14, 0.25); tone(1600, 0.10, 'sine', 0.10, 0.25, 0.05); },
    shield:  () => { tone(300, 0.30, 'sine', 0.16, 1.4); tone(450, 0.30, 'sine', 0.10, 1.4, 0.05); },
    burn:    () => { noise(0.45, 0.10, 520, 0.7); tone(240, 0.40, 'sawtooth', 0.08, 1.9); },
    hit:     () => { noise(0.06, 0.16, 900, 0.9); },
    crunch:  () => { noise(0.20, 0.28, 260, 0.8); tone(90, 0.18, 'sawtooth', 0.20, 0.4); },
    boom:    (dmg) => {
      // Star Control II tiered melee booms (boom1/23/45/67 by crew damage);
      // fall back to the synthesized explosion until buffers are decoded.
      let n = 'boom45';
      if (dmg !== undefined) {
        if (dmg < 2.5) n = 'boom1';
        else if (dmg < 5.5) n = 'boom23';
        else if (dmg < 9.5) n = 'boom45';
        else n = 'boom67';
      }
      if (A.playBuf(n, 0.9)) return;
      noise(0.55, 0.34, 180, 0.6); tone(70, 0.5, 'sawtooth', 0.26, 0.3); tone(45, 0.7, 'sine', 0.24, 0.5, 0.05);
    },
    dies:    () => {
      if (A.playBuf('shipdies', 1)) return;
      noise(0.7, 0.34, 150, 0.5); tone(50, 0.9, 'sawtooth', 0.28, 0.4);
    },
    crew:    () => {
      if (A.playBuf('getcrew', 0.8)) return;
      tone(400, 0.10, 'sine', 0.14, 2.0); tone(800, 0.12, 'sine', 0.10, 2.0, 0.06);
    },
    thrust:  () => {},  // continuous loop not worth it; jets are silent
    surge:   () => { tone(60, 0.8, 'sawtooth', 0.16, 1.6); noise(0.7, 0.10, 150, 0.5); },
    ui:      () => { tone(660, 0.05, 'square', 0.10, 1); },
    victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.14, 1, i * 0.12)); },
    possess: () => { tone(400, 0.10, 'sine', 0.14, 2.0); tone(800, 0.12, 'sine', 0.10, 2.0, 0.06); },
  };

  GM.A = A;
})(window.GM);