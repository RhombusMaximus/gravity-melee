// gravity-melee :: ship entity: physics, damage, weapons, specials, death
(function (GM) {
  const { U } = GM;

  class Ship {
    constructor(spec, team, name, aiProfile) {
      this.spec = spec;
      this.team = team;
      this.name = name;
      this.ai = aiProfile;         // archetype object (null => pure player ship)
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.ang = 0;
      this.r = spec.r;
      this.crew = spec.crew; this.crewMax = spec.crew;
      this.batt = spec.batt * 0.8; this.battMax = spec.batt;
      this.shield = 0;
      this.wcd = 0; this.scd = 0;
      this.burn = 0; this.burnActive = false;
      this.strafing = 0;
      this.mines = [];
      this.dead = false;
      this.hitT = 0;
      this.thrusting = false;
      this.human = false;
      this.spawnProt = 1.2;
      this.kills = 0;
      this.totalShots = 0;
      this.totalHits = 0;
      this.lastHitBy = null;
      this.ctrl = { thrust: 0, turn: 0, fire: false, special: false, brake: false };
    }

    wrapPos() { this.x = U.wrapX(this.x); this.y = U.wrapY(this.y); }

    applyInput(dt) {
      const s = this.spec;
      const want = this.human ? this.humanInput : this.ctrl;
      const thrust = want.thrust || 0;
      const turn = want.turn || 0;
      const strafe = want.strafe || 0;   // Q/E lateral thrust

      this.thrusting = thrust > 0;
      this.ang += turn * s.turn * dt;

      let accel = s.accel * thrust;
      if (thrust > 0 && this.burnActive) accel *= 2.1;
      if (accel) {
        this.vx += Math.cos(this.ang) * accel * dt;
        this.vy += Math.sin(this.ang) * accel * dt;
      }
      // strafe: lateral thrust at 60% power (keeps the nose authoritative)
      if (strafe) {
        const sa = s.accel * 0.6 * strafe;
        this.vx += Math.cos(this.ang + Math.PI / 2) * sa * dt;
        this.vy += Math.sin(this.ang + Math.PI / 2) * sa * dt;
        this.strafing = strafe;
      } else {
        this.strafing = 0;
      }
      if (want.brake) {
        const v = U.len(this.vx, this.vy);
        if (v > 2) {
          const k = Math.min(1, (160 * dt) / v);
          this.vx -= this.vx * k; this.vy -= this.vy * k;
        }
      }
      const v = U.len(this.vx, this.vy);
      if (v > s.maxSpeed) {
        const k = s.maxSpeed / v;
        this.vx *= k; this.vy *= k;
      }

      this.wcd = Math.max(0, this.wcd - dt);
      this.scd = Math.max(0, this.scd - dt);
      this.crashT = Math.max(0, (this.crashT || 0) - dt);
      this.shield = Math.max(0, this.shield - dt);
      this.hitT = Math.max(0, this.hitT - dt);
      this.spawnProt = Math.max(0, this.spawnProt - dt);
      this.batt = Math.min(this.battMax, this.batt + s.regen * dt);

      if (this.burnActive) {
        this.batt -= s.special.drain * dt;
        this.burn += dt;
        if (this.batt <= 0 || this.burn > 1.6) { this.burn = 0; this.burnActive = false; }
      }
    }

    update(dt, world) {
      if (this.dead) return;
      this.applyInput(dt);

      const g = world.gravityAt(this.x, this.y);
      this.vx += g.x * dt;
      this.vy += g.y * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.wrapPos();

      const P = GM.PHYS.planet;
      const dx = this.x - P.x, dy = this.y - P.y;
      if (U.len(dx, dy) < P.r + this.r - 2) this.crash(world);

      if (this.thrusting && U.chance(0.7)) {
        const back = this.ang + Math.PI;
        GM.FX.emit(this.x + Math.cos(back) * (this.r + 1), this.y + Math.sin(back) * (this.r + 1), 2, {
          ang: back, arc: 0.5, spd: 55,
          vx: this.vx * 0.3, vy: this.vy * 0.3,
          life: 0.35, size: 2,
          col: this.burnActive ? '#b6f3ff' : '#ffca7a',
        });
      }

      // mines tick
      for (const m of this.mines) {
        m.t += dt;
        if (m.armed) {
          for (const s2 of world.ships) {
            if (s2.dead || s2 === this || s2.team === this.team) continue;
            const md = U.wrapDelta(m.x, m.y, s2.x, s2.y);
            if (U.len(md.x, md.y) < this.spec.special.rad + s2.r) { m.explode = true; break; }
          }
        } else if (m.t > 0.5) {
          m.armed = true;
        }
      }
      this.mines = this.mines.filter((m) => {
        if (m.explode) {
          world.explode(m.x, m.y, this.spec.special.dmg, this.spec.special.rad, this, 'mine');
          return false;
        }
        return m.t < 25;
      });
    }

    fire(world) {
      if (this.wcd > 0 || this.dead) return;
      const w = this.spec.weapon;
      if (this.batt < w.cost) return;
      this.batt -= w.cost;
      this.wcd = w.cd;
      const n = w.count || 1;
      this.totalShots += n;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i - (n - 1) / 2) * w.spread * 2.2;
        world.spawnShot(this, this.ang + off + U.rand(-w.spread, w.spread));
      }
      GM.A.SND[w.snd]();
    }

    useSpecial(world) {
      if (this.scd > 0 || this.dead) return;
      const sp = this.spec.special;
      if (this.batt < sp.cost) return;
      this.batt -= sp.cost;
      this.scd = sp.cd;

      switch (sp.type) {
        case 'afterburner':
          this.burnActive = true; this.burn = 0;
          GM.A.SND.burn();
          break;
        case 'shield':
          this.shield = sp.dur;
          GM.A.SND.shield();
          break;
        case 'pulse':
          world.gravPulse(this);
          break;
        case 'missile':
          world.spawnMissile(this);
          GM.A.SND.missile();
          break;
        case 'blink': {
          const dist = sp.range * U.rand(0.6, 1);
          const P = GM.PHYS.planet;
          let tx = U.wrapX(this.x + Math.cos(this.ang) * dist);
          let ty = U.wrapY(this.y + Math.sin(this.ang) * dist);
          const pd = U.wrapDelta(P.x, P.y, tx, ty);
          if (U.len(pd.x, pd.y) < P.r + this.r + 12) {
            const side = this.ang + (Math.PI / 2) * U.randSign();
            tx = U.wrapX(this.x + Math.cos(side) * dist);
            ty = U.wrapY(this.y + Math.sin(side) * dist);
          }
          GM.FX.emit(this.x, this.y, 14, { spd: 60, life: 0.5, col: '#9ff0ff', size: 2 });
          this.x = tx; this.y = ty;
          GM.FX.emit(tx, ty, 14, { spd: 60, life: 0.5, col: '#9ff0ff', size: 2 });
          GM.A.SND.blink();
          break;
        }
        case 'mine': {
          if (this.mines.length >= sp.maxMines) this.mines.shift();
          const back = this.ang + Math.PI;
          this.mines.push({
            x: U.wrapX(this.x + Math.cos(back) * (this.r + 4)),
            y: U.wrapY(this.y + Math.sin(back) * (this.r + 4)),
            t: 0, armed: false, explode: false,
          });
          GM.A.SND.mine();
          break;
        }
      }
    }

    damage(amt, by, world, kind) {
      if (this.dead || this.spawnProt > 0) return;
      if (this.shield > 0 && kind !== 'gravpulse' && kind !== 'crash') {
        GM.FX.emit(this.x, this.y, 3, { spd: 50, life: 0.3, col: '#8ef2ff', size: 1.5 });
        return;
      }
      this.crew -= amt;
      this.hitT = 0.12;
      if (by) this.lastHitBy = by;
      GM.A.SND.hit();
      GM.FX.emit(this.x, this.y, 4, { spd: 70, life: 0.35, col: '#ff8a6a', size: 1.5 });
      if (this.crew <= 0) this.die(world, by);
    }

    die(world, by) {
      if (this.dead) return;
      this.dead = true;
      if (by && by !== this && by.team !== this.team) by.kills++;
      const S = GM.SCALE;
      // shake the screen on death — UNLESS the match just ended: victory laps
      // are a celebration, not a disaster
      if (world.winner === null) {
        GM.FX.addShake(9);
        GM.FX.addFlash(0.28);
      }
      GM.A.SND.boom();
      GM.FX.emit(this.x, this.y, 34, { spd: 120 * S, life: 1.0, col: '#ffd28a', size: 2.5 });
      GM.FX.emit(this.x, this.y, 18, { spd: 60 * S, life: 0.8, col: '#ff7a4a', size: 2 });
      GM.FX.emit(this.x, this.y, 12, { spd: 200 * S, life: 0.5, col: '#fff', size: 1.5 });
      GM.FX.float(this.x, this.y - 14, this.name + ' down', '#ffd0a0');
    }

    crash(world) {
      const P = GM.PHYS.planet;
      const spd = U.len(this.vx, this.vy);
      GM.A.SND.crunch();
      GM.FX.emit(this.x, this.y, 14, { spd: Math.max(30, spd * 0.5), life: 0.5, col: '#c9b48a', size: 2 });
      const dx = this.x - P.x, dy = this.y - P.y;
      const d = U.len(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      this.x = P.x + nx * (P.r + this.r + 0.5);
      this.y = P.y + ny * (P.r + this.r + 0.5);
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {           // only reflect if moving into the planet
        this.vx -= 1.6 * vn * nx;
        this.vy -= 1.6 * vn * ny;
      }
      // escape boost: push outward near local escape velocity (capped) so a
      // downed-in-the-well ship doesn't grind on the surface until death
      const escapeV = Math.sqrt(2 * P.GM * (world.surgeMult || 1) / (P.r + this.r));
      const target = Math.min(escapeV, this.spec.maxSpeed * 1.5, 200);
      const outV = this.vx * nx + this.vy * ny;
      if (outV < target) {
        const add = target - outV;
        this.vx += nx * add; this.vy += ny * add;
      }
      // damage no faster than once per 0.5s (prevents surface-grinding instakill)
      this.crashT = this.crashT || 0;
      const dmg = Math.max(0, spd - 40) * 0.12;
      if (dmg > 0.5 && this.crashT <= 0) {
        this.damage(dmg, null, world, 'crash');
        this.crashT = 0.5;
      }
    }

    draw(g, t) {
      if (this.dead) return;
      const T = GM.TEAMS[this.team];
      const art = this.spec.art;
      const w = art[0].length, h = art.length;
      const e = U.eff(this.x, this.y);        // camera-space position
      const PS = 3;                            // pixel scale for the 13x12 art
      if (e.x < -20 || e.x > GM.WV + 20 || e.y < -20 || e.y > GM.WH + 20) return;   // culled

      if (this.shield > 0) {
        g.strokeStyle = '#8ef2ff';
        g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 20);
        g.beginPath();
        g.arc(e.x, e.y, this.r + 4, 0, U.TAU);
        g.stroke();
        g.globalAlpha = 1;
      }

      g.save();
      g.translate(e.x, e.y);
      g.rotate(this.ang + Math.PI / 2);
      const ox = -Math.floor(w / 2) * PS, oy = -Math.floor(h / 2) * PS;
      for (let r = 0; r < h; r++) {
        const row = art[r];
        for (let c = 0; c < w; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          let col = GM.CHARS[ch];
          if (ch === 'P') col = T.P;
          else if (ch === 'S') col = T.S;
          if (!col) continue;
          if (this.hitT > 0) col = '#fff';
          g.fillStyle = col;
          g.fillRect(ox + c * PS, oy + r * PS, PS, PS);
        }
      }
      g.restore();

      if (this.spawnProt > 0) {
        g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 12);
        g.strokeStyle = '#fff';
        g.strokeRect(e.x - 12, e.y - 12, 24, 24);
        g.globalAlpha = 1;
      }
    }
  }

  GM.Ship = Ship;
})(window.GM);