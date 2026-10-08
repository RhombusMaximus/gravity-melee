// gravity-melee :: particles, stars, floaters, screenshake
// Stars/particles live in world space; they are drawn at their nearest
// wrapped copy relative to the camera (U.eff) and culled to the viewport.
(function (GM) {
  const { U } = GM;
  const FX = { parts: [], stars: [], floats: [], shake: 0, flash: 0 };

  FX.init = () => {
    FX.parts = []; FX.floats = []; FX.shake = 0; FX.flash = 0;
    FX.stars = [];
    // keep roughly the same on-screen density as the old 640x360 arena
    const n = Math.round((GM.W * GM.H) / 2560);
    for (let i = 0; i < n; i++) {
      FX.stars.push({
        x: U.rand(GM.W), y: U.rand(GM.H),
        s: U.chance(0.75) ? 1 : 2,
        b: U.rand(0.25, 0.9),
        tw: U.rand(0, Math.PI * 2), tws: U.rand(0.5, 2.2),
      });
    }
  };

  FX.emit = (x, y, n, opt) => {
    opt = opt || {};
    const spd = opt.spd || 40, life = opt.life || 0.6, size = opt.size || 1;
    for (let i = 0; i < n; i++) {
      const a = opt.ang !== undefined
        ? opt.ang + U.rand(-(opt.arc || 1), opt.arc || 1)
        : U.rand(U.TAU);
      const v = spd * U.rand(0.25, 1);
      FX.parts.push({
        x, y,
        vx: (opt.vx || 0) + Math.cos(a) * v,
        vy: (opt.vy || 0) + Math.sin(a) * v,
        life: life * U.rand(0.5, 1.2), t: 0,
        size: size * U.rand(0.6, 1.4),
        col: opt.col || '#ffd28a',
        grav: opt.grav || 0,
        drag: opt.drag !== undefined ? opt.drag : 0.9,
      });
    }
  };

  FX.float = (x, y, text, col) => FX.floats.push({ x, y, text, col: col || '#fff', t: 0, life: 1.1 });

  FX.addShake = (amt) => { FX.shake = Math.min(14, FX.shake + amt); };
  FX.addFlash = (amt) => { FX.flash = Math.min(0.5, FX.flash + amt); };

  FX.update = (dt) => {
    FX.shake *= Math.pow(0.02, dt);
    FX.flash *= Math.pow(0.02, dt);

    for (let i = FX.parts.length - 1; i >= 0; i--) {
      const p = FX.parts[i];
      p.t += dt;
      if (p.t >= p.life) { FX.parts.splice(i, 1); continue; }
      const dg = Math.pow(p.drag, dt * 60);
      p.vx *= dg; p.vy *= dg;
      p.vy += p.grav * dt;
      p.x = U.wrapX(p.x + p.vx * dt);
      p.y = U.wrapY(p.y + p.vy * dt);
    }
    for (let i = FX.floats.length - 1; i >= 0; i--) {
      const f = FX.floats[i];
      f.t += dt;
      if (f.t >= f.life) FX.floats.splice(i, 1);
    }
  };

  FX.drawStars = (g, t) => {
    for (const s of FX.stars) {
      const e = U.eff(s.x, s.y);
      if (e.x < -2 || e.x > GM.VW + 2 || e.y < -2 || e.y > GM.VH + 2) continue;
      const tw = 0.7 + 0.3 * Math.sin(t * s.tws + s.tw);
      const b = s.b * tw;
      g.globalAlpha = b;
      g.fillStyle = b > 0.65 ? '#eef4ff' : '#8ea4c8';
      g.fillRect(e.x | 0, e.y | 0, s.s, s.s);
    }
    g.globalAlpha = 1;
  };

  FX.draw = (g) => {
    for (const p of FX.parts) {
      const e = U.eff(p.x, p.y);
      if (e.x < -8 || e.x > GM.VW + 8 || e.y < -8 || e.y > GM.VH + 8) continue;
      const k = 1 - p.t / p.life;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = p.col;
      g.fillRect((e.x - p.size / 2) | 0, (e.y - p.size / 2) | 0, p.size, p.size);
    }
    g.globalAlpha = 1;
    g.font = 'bold 10px monospace';
    g.textAlign = 'center';
    for (const f of FX.floats) {
      const e = U.eff(f.x, f.y);
      const k = 1 - f.t / f.life;
      g.globalAlpha = Math.min(1, k * 2);
      g.fillStyle = f.col;
      g.fillText(f.text, e.x, e.y - f.t * 14);
    }
    g.globalAlpha = 1;
  };

  GM.FX = FX;
})(window.GM);