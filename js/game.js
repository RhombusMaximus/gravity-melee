// gravity-melee :: world simulation — gravity, shots, missiles, explosions, victory
(function (GM) {
  const { U } = GM;

  const SHOT_COL = {
    dart: '#8ef2ff', bolt: '#ffd070', plasma: '#ff9040',
    shot: '#ff9ad0', lob: '#b6ff9e', pellet: '#e8e0ff',
  };
  const SHOT_GRAV = { dart: 0.25, bolt: 0.3, plasma: 0.8, shot: 0.25, lob: 1.0, pellet: 0.25 };

  class World {
    constructor(mode, opts) {
      this.mode = mode;
      this.demo = !!(opts && opts.demo);
      this.time = 0;
      this.shots = [];
      this.missiles = [];
      this.surgeMult = 1;
      this.surged = false;
      this.winner = null;      // null = ongoing, -1 = draw, else team idx
      this.ships = [];
      this.teams = [];

      const P = GM.PHYS.planet;
      const nTeams = mode.teams.length;
      const pilots = U.shuffle(GM.PILOTS);
      let pi = 0;

      mode.teams.forEach((count, ti) => {
        const teamShips = [];
        for (let i = 0; i < count; i++) {
          const spec = GM.SHIPS[(Math.random() * GM.SHIPS.length) | 0];
          const arch = U.pick(GM.ARCHETYPES);
          const s = new GM.Ship(spec, ti, pilots[pi++ % pilots.length], arch);
          // spawn: ring around planet, teams spread, slight per-ship offset
          const baseA = (ti / nTeams) * U.TAU + (i / Math.max(1, count)) * (U.TAU / nTeams) * 0.5 + U.rand(-0.06, 0.06);
          const rr = GM.PHYS.spawnR + U.rand(-6, 10);
          s.x = U.wrapX(P.x + Math.cos(baseA) * rr);
          s.y = U.wrapY(P.y + Math.sin(baseA) * rr);
          // tangential velocity for a near-circular orbit (all prograde)
          const tangA = baseA + Math.PI / 2;
          const vOrb = Math.sqrt(P.GM / rr);
          s.vx = Math.cos(tangA) * vOrb;
          s.vy = Math.sin(tangA) * vOrb;
          s.ang = tangA;
          s.aiBrain = GM.AI.mkBrain();
          teamShips.push(s);
          this.ships.push(s);
        }
        this.teams.push(teamShips);
      });
    }

    moonPos() {
      const P = GM.PHYS.planet, M = GM.PHYS.moon;
      const a = this.time * M.omega + 1.1;
      return { x: U.wrapX(P.x + Math.cos(a) * M.orbitR), y: U.wrapY(P.y + Math.sin(a) * M.orbitR) };
    }

    gravityAt(x, y) {
      const P = GM.PHYS.planet, M = GM.PHYS.moon;
      let ax = 0, ay = 0;

      // planet
      const pd = U.wrapDelta(x, y, P.x, P.y);
      const pdist = U.len(pd.x, pd.y);
      if (pdist < P.rInf && pdist > 1) {
        let f = P.GM / (pdist * pdist);
        if (pdist >= P.knee) f *= 1 - (pdist - P.knee) / (P.rInf - P.knee);
        const a = Math.min(P.aCap, f * this.surgeMult);
        ax += a * pd.x / pdist;
        ay += a * pd.y / pdist;
      }

      // moon
      const mp = this.moonPos();
      const md = U.wrapDelta(x, y, mp.x, mp.y);
      const mdist = U.len(md.x, md.y);
      if (mdist < M.rInf && mdist > 1) {
        let f = M.GM / (mdist * mdist);
        if (mdist >= M.knee) f *= 1 - (mdist - M.knee) / (M.rInf - M.knee);
        const a = Math.min(M.aCap, f * this.surgeMult);
        ax += a * md.x / mdist;
        ay += a * md.y / mdist;
      }
      return { x: ax, y: ay };
    }

    spawnShot(ship, ang) {
      const w = ship.spec.weapon;
      const sx = ship.x + Math.cos(ang) * (ship.r + 2);
      const sy = ship.y + Math.sin(ang) * (ship.r + 2);
      this.shots.push({
        x: sx, y: sy,
        vx: ship.vx * 0.35 + Math.cos(ang) * w.speed,
        vy: ship.vy * 0.35 + Math.sin(ang) * w.speed,
        life: w.life, team: ship.team, dmg: w.dmg, size: w.size,
        kind: w.kind, aoe: w.aoe || 0, by: ship,
        col: SHOT_COL[w.kind] || '#fff',
        grav: SHOT_GRAV[w.kind] !== undefined ? SHOT_GRAV[w.kind] : 0.3,
      });
    }

    spawnMissile(ship) {
      const sp = ship.spec.special;
      this.missiles.push({
        x: ship.x + Math.cos(ship.ang) * (ship.r + 3),
        y: ship.y + Math.sin(ship.ang) * (ship.r + 3),
        vx: ship.vx * 0.4 + Math.cos(ship.ang) * sp.speed,
        vy: ship.vy * 0.4 + Math.sin(ship.ang) * sp.speed,
        ang: ship.ang, team: ship.team, dmg: sp.dmg, life: sp.life,
        turn: sp.turn, by: ship, retgtT: 0, tgt: null,
      });
    }

    gravPulse(ship) {
      const sp = ship.spec.special;
      GM.A.SND.crunch();
      GM.FX.addShake(5);
      GM.FX.emit(ship.x, ship.y, 26, { spd: 180, life: 0.45, col: '#8ef2ff', size: 2 });
      for (const s of this.ships) {
        if (s === ship || s.dead) continue;
        const w = U.wrapDelta(ship.x, ship.y, s.x, s.y);
        const d = U.len(w.x, w.y);
        if (d < sp.rad) {
          const k = 1 - d / sp.rad;
          const n = U.norm(w.x, w.y);
          s.vx += n.x * 230 * k;
          s.vy += n.y * 230 * k;
          s.damage(2 * k, ship, this, 'gravpulse');
        }
      }
    }

    explode(x, y, dmg, rad, by, kind) {
      GM.A.SND.boom();
      GM.FX.addShake(4);
      GM.FX.addFlash(0.08);
      GM.FX.emit(x, y, 20, { spd: 130, life: 0.6, col: '#ffd28a', size: 2 });
      GM.FX.emit(x, y, 10, { spd: 55, life: 0.8, col: '#ff7a4a', size: 2 });
      for (const s of this.ships) {
        if (s.dead) continue;
        const w = U.wrapDelta(x, y, s.x, s.y);
        const d = U.len(w.x, w.y);
        if (d < rad + s.r) {
          const k = Math.max(0.15, 1 - d / rad);
          const n = U.norm(w.x, w.y);
          s.vx += n.x * 150 * k;
          s.vy += n.y * 150 * k;
          s.damage(dmg * k, by, this, kind || 'blast');
        }
      }
    }

    step(dt) {
      this.time += dt;
      const P = GM.PHYS.planet, M = GM.PHYS.moon;

      // gravity surge
      if (this.time > GM.PHYS.surgeAt) {
        this.surgeMult = Math.min(GM.PHYS.surgeMax,
          1 + (this.time - GM.PHYS.surgeAt) * GM.PHYS.surgeRate);
        if (!this.surged) {
          this.surged = true;
          if (!this.demo) GM.A.SND.surge();
        }
      }

      // AI + ships
      for (const s of this.ships) {
        if (s.dead) continue;
        if (!s.human) GM.AI.update(s, this, dt);
        else { s.humanInput = s.humanInput || {}; }
        s.update(dt, this);
        if (s.ctrl.fire || (s.humanInput && s.humanInput.fire)) s.fire(this);
        if (!s.human && s.ctrl.special) s.useSpecial(this);
        if (s.human && s.humanInput && s.humanInput.special) s.useSpecial(this);
      }

      // moon body collisions
      const mp = this.moonPos();
      for (const s of this.ships) {
        if (s.dead) continue;
        const w = U.wrapDelta(s.x, s.y, mp.x, mp.y);
        const d = U.len(w.x, w.y);
        if (d < M.r + s.r - 1) {
          const spd = U.len(s.vx, s.vy);
          const n = U.norm(w.x, w.y);
          s.x = U.wrapX(mp.x + n.x * (M.r + s.r + 0.5));
          s.y = U.wrapY(mp.y + n.y * (M.r + s.r + 0.5));
          const vn = s.vx * n.x + s.vy * n.y;
          if (vn < 0) { s.vx -= 1.6 * vn * n.x; s.vy -= 1.6 * vn * n.y; }
          const outV = s.vx * n.x + s.vy * n.y;
          if (outV < 60) { const add = 60 - outV; s.vx += n.x * add; s.vy += n.y * add; }
          GM.A.SND.crunch();
          GM.FX.emit(s.x, s.y, 8, { spd: 40, life: 0.4, col: '#c9cdd8', size: 1.5 });
          const dmg = Math.max(0, spd - 40) * 0.06;
          if (dmg > 0.5 && (s.crashT || 0) <= 0) { s.damage(dmg, null, this, 'crash'); s.crashT = 0.5; }
        }
      }

      // shots
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const sh = this.shots[i];
        const g = this.gravityAt(sh.x, sh.y);
        sh.vx += g.x * sh.grav * dt;
        sh.vy += g.y * sh.grav * dt;
        sh.x = U.wrapX(sh.x + sh.vx * dt);
        sh.y = U.wrapY(sh.y + sh.vy * dt);
        sh.life -= dt;
        let dead = sh.life <= 0;

        // planet
        const pd = U.wrapDelta(sh.x, sh.y, P.x, P.y);
        if (!dead && U.len(pd.x, pd.y) < P.r) {
          GM.FX.emit(sh.x, sh.y, sh.aoe ? 14 : 5, { spd: 60, life: 0.4, col: sh.col, size: 1.5 });
          if (sh.aoe) this.explode(sh.x, sh.y, sh.dmg, sh.aoe, sh.by, 'blast');
          GM.A.SND.hit();
          dead = true;
        }
        // moon
        if (!dead) {
          const md = U.wrapDelta(sh.x, sh.y, mp.x, mp.y);
          if (U.len(md.x, md.y) < M.r) {
            GM.FX.emit(sh.x, sh.y, 4, { spd: 40, life: 0.3, col: sh.col, size: 1.5 });
            dead = true;
          }
        }
        // ships
        if (!dead) {
          for (const s of this.ships) {
            if (s.dead || s.team === sh.team || s.spawnProt > 0) continue;
            const w = U.wrapDelta(sh.x, sh.y, s.x, s.y);
            if (U.len(w.x, w.y) < s.r + sh.size * 0.5 + 1) {
              if (sh.aoe) this.explode(sh.x, sh.y, sh.dmg, sh.aoe, sh.by, 'blast');
              else {
                s.damage(sh.dmg, sh.by, this, 'shot');
                if (sh.by) sh.by.totalHits++;
                GM.FX.addShake(1);
              }
              dead = true;
              break;
            }
          }
        }
        if (dead) this.shots.splice(i, 1);
      }

      // missiles
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const ms = this.missiles[i];
        ms.retgtT -= dt;
        ms.life -= dt;
        if (ms.retgtT <= 0 || !ms.tgt || ms.tgt.dead) {
          ms.retgtT = 0.25;
          let best = null, bd = 1e9;
          for (const s of this.ships) {
            if (s.dead || s.team === ms.team || s.spawnProt > 0) continue;
            const w = U.wrapDelta(ms.x, ms.y, s.x, s.y);
            const d = U.len(w.x, w.y);
            if (d < bd) { bd = d; best = s; }
          }
          ms.tgt = best;
        }
        if (ms.tgt) {
          const w = U.wrapDelta(ms.x, ms.y, ms.tgt.x, ms.tgt.y);
          const want = U.ang(w.x, w.y);
          const diff = U.angDiff(ms.ang, want);
          ms.ang += U.clamp(diff, -ms.turn * dt, ms.turn * dt);
        }
        const sp = U.len(ms.vx, ms.vy) || 1;
        const nsp = Math.max(sp, 120);
        ms.vx = Math.cos(ms.ang) * nsp;
        ms.vy = Math.sin(ms.ang) * nsp;
        const g = this.gravityAt(ms.x, ms.y);
        ms.vx += g.x * 0.35 * dt;
        ms.vy += g.y * 0.35 * dt;
        ms.x = U.wrapX(ms.x + ms.vx * dt);
        ms.y = U.wrapY(ms.y + ms.vy * dt);

        let dead = ms.life <= 0;
        // planet / moon
        const pd = U.wrapDelta(ms.x, ms.y, P.x, P.y);
        if (U.len(pd.x, pd.y) < P.r) { this.explode(ms.x, ms.y, ms.dmg * 0.6, 16, ms.by, 'blast'); dead = true; }
        const md = U.wrapDelta(ms.x, ms.y, mp.x, mp.y);
        if (!dead && U.len(md.x, md.y) < M.r) { this.explode(ms.x, ms.y, ms.dmg * 0.6, 16, ms.by, 'blast'); dead = true; }
        // ships
        if (!dead) {
          for (const s of this.ships) {
            if (s.dead || s.team === ms.team) continue;
            const w = U.wrapDelta(ms.x, ms.y, s.x, s.y);
            if (U.len(w.x, w.y) < s.r + 3) {
              s.damage(ms.dmg, ms.by, this, 'blast');
              if (ms.by) ms.by.totalHits++;
              GM.FX.addShake(2);
              GM.FX.emit(ms.x, ms.y, 12, { spd: 90, life: 0.5, col: '#ffb04a', size: 2 });
              GM.A.SND.boom();
              dead = true;
              break;
            }
          }
        }
        if (dead) this.missiles.splice(i, 1);
      }

      GM.FX.update(dt);

      // victory check
      if (this.winner === null) {
        const aliveTeams = new Set();
        let anyAlive = false;
        for (const s of this.ships) if (!s.dead) { aliveTeams.add(s.team); anyAlive = true; }
        if (!anyAlive) this.winner = -1;
        else if (aliveTeams.size === 1) this.winner = [...aliveTeams][0];
      }
    }
  }

  GM.World = World;
})(window.GM);