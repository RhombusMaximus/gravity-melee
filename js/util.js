// gravity-melee :: shared math + torus helpers
// Everything runs on a wrapped (torus) arena: the shortest path between two
// points may cross an edge. wrapDelta() is the canonical way to measure it.
window.GM = window.GM || {};
(function (GM) {
  const U = {};
  const TAU = Math.PI * 2;
  U.TAU = TAU;

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.len = (x, y) => Math.sqrt(x * x + y * y);
  U.norm = (x, y) => { const l = U.len(x, y) || 1; return { x: x / l, y: y / l, len: l }; };
  U.ang = (dx, dy) => Math.atan2(dy, dx);
  // shortest signed angle from heading a to heading b
  U.angDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  U.rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

  U.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.randSign = () => (Math.random() < 0.5 ? -1 : 1);
  U.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  U.chance = (p) => Math.random() < p;
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // torus wrap
  U.wrapX = (x) => ((x % GM.W) + GM.W) % GM.W;
  U.wrapY = (y) => ((y % GM.H) + GM.H) % GM.H;

  // shortest wrapped vector FROM (ax,ay) TO (bx,by)
  U.wrapDelta = (ax, ay, bx, by) => ({
    x: U.wrapX(bx - ax + GM.W / 2) - GM.W / 2,
    y: U.wrapY(by - ay + GM.H / 2) - GM.H / 2,
  });

  // effective on-screen position of a world point: nearest wrapped copy to the
  // camera, in WORLD-CANVAS units (GM.WV x GM.WH canvas)
  U.eff = (wx, wy) => ({
    x: U.wrapX(wx - GM.CAM.x + GM.W / 2) - GM.W / 2 + GM.WV / 2,
    y: U.wrapY(wy - GM.CAM.y + GM.H / 2) - GM.H / 2 + GM.WH / 2,
  });

  // same world point in HUD-overlay space (640x360)
  U.effH = (wx, wy) => ({
    x: (U.wrapX(wx - GM.CAM.x + GM.W / 2) - GM.W / 2 + GM.WV / 2) * GM.VW / GM.WV,
    y: (U.wrapY(wy - GM.CAM.y + GM.H / 2) - GM.H / 2 + GM.WH / 2) * GM.VH / GM.WH,
  });

  // world position of a viewport (screen) point
  U.unscreen = (vx, vy) => ({
    x: U.wrapX(GM.CAM.x + vx - GM.VW / 2),
    y: U.wrapY(GM.CAM.y + vy - GM.VH / 2),
  });

  // distance from point (cx,cy) to segment (ax,ay)-(bx,by) <= r ?
  U.segCircle = (ax, ay, bx, by, cx, cy, r) => {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((cx - ax) * dx + (cy - ay) * dy) / l2;
    t = U.clamp(t, 0, 1);
    return U.len(cx - (ax + dx * t), cy - (ay + dy * t)) <= r;
  };

  GM.U = U;
})(window.GM);