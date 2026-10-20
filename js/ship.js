// gravity-melee :: ship entity: physics, damage, weapons, specials, death
(function (GM) {
  const { U } = GM;

  // pre-loaded SC2 ship sprite images (data URIs from content.js)
  const SPRITE_CACHE = {};
  function getSprite(uri) {
    if (SPRITE_CACHE[uri]) return SPRITE_CACHE[uri];
    const img = new Image();
    img.src = uri;
    SPRITE_CACHE[uri] = img;
    return img;
  }

  // kick off decoding for all SC2 ship sprites at load time so they're
  // never invisible during the first frames of a match.
  // ALSO resolves 'SHIP:<species>' references to data URIs — this must
  // run AFTER content.js loads, which is why it's here and not in
  // config.js's normalization loop (config.js loads before content.js).
  function preloadSprites() {
    const C = GM.CONTENT;
    if (!C || !C.shipsprites) return;
    for (const sp of GM.SHIPS) {
      // resolve 'SHIP:kohrah' -> data URI from content.js
      if (sp.sprite && sp.sprite.startsWith('SHIP:')) {
        sp.sprite = C.shipsprites[sp.sprite.slice(5)] || null;
      }
      // kick off image decoding
      if (sp.sprite && !SPRITE_CACHE[sp.sprite]) {
        getSprite(sp.sprite);
      }
      // X-Form Y-shape sprite (ywing-big) + the Orz howitzer turret
      if (sp.forms && C.shipsprites[sp.cap + '_yform']) {
        sp.spriteY = C.shipsprites[sp.cap + '_yform'];
        getSprite(sp.spriteY);
      }
      if (C.shipsprites.orz_turret && !SPRITE_CACHE[C.shipsprites.orz_turret]) {
        getSprite(C.shipsprites.orz_turret);
      }
    }
  }

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
      this.form = 'x';   // Mmrnmhrm X-Form (spec.forms present)
      this.slowT = 0; this.pdT = 0; this.cloakT = 0; this.blazerT = 0;
      this.turretOff = 0;   // Orz howitzer turret (hull-relative angle)
      this.burn = 0; this.burnActive = false;
      this.strafing = 0;
      this.mines = [];
      this.sats = [];      // Chmmr Avatar's orbiting zap satellites
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
      const fm = s.forms ? s.forms[this.form] : s;   // X-Form stats per form
      const want = this.human ? this.humanInput : this.ctrl;
      const thrust = want.thrust || 0;
      const turn = want.turn || 0;
      const strafe = want.strafe || 0;   // Q/E lateral thrust

      // VUX limpets: glued limpets drag the hull (turn + thrust)
      const slowK = this.slowT > 0 ? 0.55 : 1;
      this.slowT = Math.max(0, this.slowT - dt);
      this.pdT = Math.max(0, this.pdT - dt);
      this.cloakT = Math.max(0, this.cloakT - dt);

      this.thrusting = thrust > 0;
      // Orz turret doctrine (orz.c): hold SPECIAL + turn to swing the howitzer
      // turret; the hull holds heading while you swing (our refinement of the
      // original, where the hull turned too — aiming reads far better this way)
      const turretSteer = s.turret && want.special;
      this.ang += turretSteer ? 0 : turn * fm.turn * slowK * dt;
      if (turretSteer) this.turretOff += turn * s.turretRate * dt;

      let accel = fm.accel * slowK * thrust;
      if (this.blazerT > 0) accel = fm.accel * 1.5;   // comet: always thrusting
      if (thrust > 0 && this.burnActive) accel *= 2.1;
      if (accel) {
        this.vx += Math.cos(this.ang) * accel * dt;
        this.vy += Math.sin(this.ang) * accel * dt;
      }
      // strafe: lateral thrust at 60% power (keeps the nose authoritative)
      if (strafe) {
        const sa = fm.accel * 0.6 * strafe;
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
      if (this.blazerT > 0) {
        // Blazer comet form: invulnerable, overthrust, burns battery
        this.batt -= 3 * dt;
        if (this.batt <= 0) { this.blazerT = 0; this.batt = 0; }
      }
      if (v > fm.maxSpeed) {
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

      // Blazer comet trail
      if (this.blazerT > 0 && U.chance(0.9)) {
        GM.FX.emit(this.x, this.y, 2, { spd: 20, life: 0.5, col: '#ffb04a', size: 3,
          vx: this.vx * 0.1, vy: this.vy * 0.1 });
      }

      // mines tick
      for (const m of this.mines) {
        m.t += dt;
        if (m.armed) {
          for (const s2 of world.ships) {
            if (s2.dead || s2 === this || s2.team === this.team) continue;
            const md = U.wrapDelta(m.x, m.y, s2.x, s2.y);
            if (U.len(md.x, md.y) < this.spec.special.rad + s2.r) {
              if (this.spec.special.slow) {
                // limpet: glues to the hull and drags it, no blast
                s2.slowT = Math.max(s2.slowT, this.spec.special.slowDur);
                s2.damage(this.spec.special.dmg, this, world, 'shot');
                GM.FX.emit(m.x, m.y, 6, { spd: 30, life: 0.4, col: '#b6ff9e', size: 1.5 });
                if (!GM.A.playBuf(this.spec.cap + '_limpet_bite', 0.5)) GM.A.SND.hit();
              }
              m.explode = true; break;
            }
          }
        } else if (m.t > 0.5) {
          m.armed = true;
        }
      }
      this.mines = this.mines.filter((m) => {
        if (m.explode) {
          if (!this.spec.special.slow) {
            world.explode(m.x, m.y, this.spec.special.dmg, this.spec.special.rad, this, 'mine');
          }
          return false;
        }
        return m.t < 25;
      });
    }

    fire(world) {
      if (this.wcd > 0 || this.dead) return;
      const w = this.spec.forms ? this.spec.forms[this.form].weapon : this.spec.weapon;
      if (this.batt < w.cost) return;
      this.batt -= w.cost;
      this.wcd = w.cd;
      const n = w.count || 1;
      this.totalShots += n;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i - (n - 1) / 2) * w.spread * 2.2;
        const aim = this.spec.turret ? this.ang + this.turretOff : this.ang;
        world.spawnShot(this, aim + off + U.rand(-w.spread, w.spread));
      }
      // Druuge recoil: every shell shoves the hull backwards
      if (w.recoil) {
        this.vx -= Math.cos(this.ang) * w.recoil;
        this.vy -= Math.sin(this.ang) * w.recoil;
      }
      // the real SC2 weapon sound when the buffer decoded
      const cap = this.spec.cap;
      const sndKey = this.spec.forms ? cap + '_primary' + this.form : cap + '_primary';
      if (!cap || !GM.A.playBuf(sndKey, 0.5)) GM.A.SND[w.snd]();
    }

    useSpecial(world) {
      if (this.scd > 0 || this.dead) return;
      const sp = this.spec.special;
      // UQM launch queue: a Dreadnought cannot launch while any fighter is
      // airborne, and needs crew to spare. A blocked launch burns nothing.
      if (sp.type === 'fighters') {
        const airborne = world.fighters.filter((f) => f.by === this).length;
        if (airborne > 0 || this.crew <= 1) { this.scd = 0.25; return; }
      }
      if (this.batt < sp.cost) return;
      this.batt -= sp.cost;
      this.scd = sp.cd;

      switch (sp.type) {
        case 'furnace': {
          // Druuge: burn a crew member for a fresh battery charge
          if (this.crew > 1) {
            this.crew--;
            this.batt = Math.min(this.battMax, this.batt + sp.gain);
            GM.FX.float(this.x, this.y - 16, 'CREW BURNED', '#ff9a6a');
            GM.FX.emit(this.x, this.y, 8, { spd: 60, life: 0.5, col: '#ff9a6a', size: 2 });
            if (!GM.A.playBuf(this.spec.cap + '_secondary', 0.5)) GM.A.SND.burn();
          }
          break;
        }
        case 'satellites': {
          // respawn any dead satellites
          let n = 0;
          for (const sat of this.sats) {
            if (sat.hp <= 0) { sat.hp = sp.satHP; n++; }
          }
          if (n) {
            GM.A.SND.shield();
            GM.FX.emit(this.x, this.y, 12, { spd: 60, life: 0.4, col: '#8ef2ff', size: 2 });
          }
          break;
        }
        case 'glory': {
          // Shofixti: the Glory Device — a suicidal detonation
          GM.FX.float(this.x, this.y - 18, 'GLORY!', '#ffd28a');
          world.explode(this.x, this.y, sp.dmg, sp.rad, this, 'blast');
          world.explosions.push({ x: this.x, y: this.y, t: 0, dur: 0.8, big: true, sprite: 'shofixti_destruct' });
          this.die(world, null);
          break;
        }
        case 'call': {
          // Syreen: beg the enemy crew to abandon ship and join us
          let joined = 0;
          for (const s2 of world.ships) {
            if (s2.dead || s2.team === this.team || s2 === this) continue;
            const wd = U.wrapDelta(this.x, this.y, s2.x, s2.y);
            if (U.len(wd.x, wd.y) < sp.range + s2.r) {
              const before = s2.crew;
              s2.damage(2, this, world, 'shot');
              joined += Math.max(0, before - s2.crew);
              GM.FX.emit(s2.x, s2.y, 6, { spd: 90, life: 0.6, col: '#9dff7a', size: 2 });
            }
          }
          if (joined) {
            this.crew = Math.min(this.crewMax, this.crew + joined);
            GM.FX.float(this.x, this.y - 18, '+' + joined + ' CREW', '#9dff7a');
            GM.A.SND.crew();
          }
          break;
        }
        case 'cloak': {
          this.cloakT = sp.dur;
          if (!GM.A.playBuf(this.spec.cap + '_cloak', 0.5)) GM.A.SND.blink();
          GM.FX.emit(this.x, this.y, 10, { spd: 40, life: 0.4, col: '#8a4aff', size: 2 });
          break;
        }
        case 'blazer': {
          this.blazerT = sp.dur;
          GM.A.SND.burn();
          break;
        }
        case 'pointdef': {
          this.pdT = sp.dur;
          GM.A.SND.shield();
          break;
        }
        case 'xform': {
          this.form = this.form === 'x' ? 'y' : 'x';
          GM.FX.emit(this.x, this.y, 12, { spd: 80, life: 0.4, col: '#9ff0ff', size: 2 });
          if (!GM.A.playBuf(this.spec.cap + '_secondary', 0.5)) GM.A.SND.ui();
          break;
        }
        case 'reverse': {
          // Umgah: the famous retro-propulsion kick
          this.vx -= Math.cos(this.ang) * sp.kick;
          this.vy -= Math.sin(this.ang) * sp.kick;
          GM.FX.emit(this.x, this.y, 10, { spd: 70, life: 0.4, col: '#b6ff9e', size: 2 });
          if (!GM.A.playBuf(this.spec.cap + '_secondary', 0.5)) GM.A.SND.missile();
          break;
        }
        case 'zap': {
          // Zoq-Fot-Pik: point-blank Tongue lash at the nearest enemy
          let best = null, bd = 1e9;
          for (const s2 of world.ships) {
            if (s2.dead || s2.team === this.team || s2 === this) continue;
            const wd = U.wrapDelta(this.x, this.y, s2.x, s2.y);
            const d = U.len(wd.x, wd.y);
            if (d < bd) { bd = d; best = s2; }
          }
          if (best && bd < sp.range + best.r + this.r) {
            best.damage(sp.dmg, this, world, 'shot');
            this.totalHits++;
            GM.FX.addShake(2);
            GM.FX.emit(this.x + Math.cos(this.ang) * this.r, this.y + Math.sin(this.ang) * this.r, 8,
              { spd: 60, life: 0.3, col: '#b6ff9e', size: 2 });
            if (!GM.A.playBuf(this.spec.cap + '_secondary', 0.5)) GM.A.SND.laser();
          }
          break;
        }
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
        case 'mine': case 'limpet': {
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
        case 'fighters': {
          // Launch 2 if crew > 2, else 1 (UQM: i = crew_level > 2 ? 2 : 1).
          // Each fighter IS a crew member: -1 crew per launch, refunded on dock.
          // They eject from the REAR bay in a ±40° fan (UQM: facing+180°, ±2).
          const n = this.crew > 2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            this.crew--;
            const back = this.ang + Math.PI + (i === 0 ? 0.7 : -0.7);
            world.fighters.push({
              x: U.wrapX(this.x + Math.cos(back) * (this.r + 6)),
              y: U.wrapY(this.y + Math.sin(back) * (this.r + 6)),
              vx: this.vx * 0.4 + Math.cos(back) * sp.fspeed * 0.45,
              vy: this.vy * 0.4 + Math.sin(back) * sp.fspeed * 0.45,
              ang: back, team: this.team, by: this,
              life: sp.flife, laserCd: 0.4 + i * 0.25, retgtT: 0,
              tgt: null, beamT: 0, dead: false,
            });
          }
          GM.A.SND.missile();
          GM.FX.emit(this.x, this.y, 10, { spd: 90, life: 0.4, col: GM.TEAMS[this.team].glow, size: 2 });
          break;
        }
      }
    }

    damage(amt, by, world, kind) {
      if (this.dead || this.spawnProt > 0) return;
      if ((this.shield > 0 || this.blazerT > 0) && kind !== 'gravpulse' && kind !== 'crash') {
        GM.FX.emit(this.x, this.y, 3, { spd: 50, life: 0.3, col: '#8ef2ff', size: 1.5 });
        return;
      }
      this.crew -= amt;
      this.hitT = 0.12;
      if (by) this.lastHitBy = by;
      GM.A.SND.hit();
      GM.FX.emit(this.x, this.y, 4, { spd: 70, life: 0.35, col: '#ff8a6a', size: 1.5 });
      GM.A.SND.boom(amt);   // SC2 tiered melee boom by damage amount
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
      GM.A.SND.dies();
      world.explosions.push({ x: this.x, y: this.y, t: 0, dur: 0.5, big: true });
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
      const e = U.eff(this.x, this.y);        // camera-space position
      const PS = Math.max(2, Math.round(2.25 * GM.zoomCur));   // pixel scale, 25% smaller (was 3)
      if (e.x < -40 || e.x > GM.WV + 40 || e.y < -40 || e.y > GM.WH + 40) return;   // culled

      if (this.shield > 0) {
        g.strokeStyle = '#8ef2ff';
        g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 20);
        g.beginPath();
        g.arc(e.x, e.y, (this.r + 4) * GM.zoomCur, 0, U.TAU);
        g.stroke();
        g.globalAlpha = 1;
      }

      // SC2 sprite path: draw the real Star Control II ship art, rotated
      if (this.spec.sprite) {
        // Mmrnmhrm X-Form: the Y shape has its own sprite (ywing-big)
        const sprUri = (this.spec.forms && this.form === 'y' && this.spec.spriteY)
          ? this.spec.spriteY : this.spec.sprite;
        const img = getSprite(sprUri);
        const cloaked = this.cloakT > 0;
        if (img.complete && img.naturalWidth > 0) {
          g.save();
          g.translate(e.x, e.y);
          g.rotate(this.ang + Math.PI / 2);   // sprite faces "north"
          const sw = img.naturalWidth * PS;
          const sh = img.naturalHeight * PS;
          g.imageSmoothingEnabled = false;
          g.globalAlpha = cloaked ? 0.13 : 1;   // cloaked: a faint shimmer
          g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
          g.globalAlpha = 1;
          g.restore();
          // NOTE: no team tint on SC2 sprites — 'source-atop' on the
          // shared world canvas would tint the star field in a visible
          // rectangle; the sprites have their own colors already
          if (!cloaked && this.hitT > 0) {
            g.globalAlpha = 0.5;
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(e.x, e.y, this.r * GM.zoomCur, 0, U.TAU);
            g.fill();
            g.globalAlpha = 1;
          }
          if (this.spawnProt > 0) {
            g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 12);
            g.strokeStyle = '#fff';
            const q = 12 * GM.zoomCur;
            g.strokeRect(e.x - q, e.y - q, q * 2, q * 2);
            g.globalAlpha = 1;
          }
        }
        // Orz Nemesis: the howitzer turret rides on top, hull-relative,
        // placed by its .ani anchor (6,11) at the ship's center
        if (this.spec.turret && GM.CONTENT.shipsprites.orz_turret) {
          const timg = getSprite(GM.CONTENT.shipsprites.orz_turret);
          if (timg && timg.complete && timg.naturalWidth > 0) {
            g.save();
            g.translate(e.x, e.y);
            g.rotate(this.ang + this.turretOff + Math.PI / 2);
            g.imageSmoothingEnabled = false;
            g.globalAlpha = cloaked ? 0.13 : 1;
            g.drawImage(timg, -6 * PS, -11 * PS, timg.naturalWidth * PS, timg.naturalHeight * PS);
            g.globalAlpha = 1;
            g.restore();
          }
        }
        return;   // SC2 ships have no string-map art; never fall through
      }
      // NOTE: if a sprite ship's image hasn't decoded yet (rare after
      // preloadSprites), it's invisible for one frame — acceptable

      // string-map pixel art path (original ships)
      const art = this.spec.art;
      const w = art[0].length, h = art.length;

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
        const q = 12 * GM.zoomCur;
        g.strokeRect(e.x - q, e.y - q, q * 2, q * 2);
        g.globalAlpha = 1;
      }
    }
  }

  GM.Ship = Ship;
  GM.preloadSprites = preloadSprites;
})(window.GM);