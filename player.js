// ════════════════════════════════════════════════════════════════
// ZapZone Player Controller — COD-Realistic 3D Models
// ════════════════════════════════════════════════════════════════

// ── Procedural Texture Generator ──────────────────────────────
const TexGen = {
  _cache: {},
  _mk(key, w, h, fn) {
    if (this._cache[key]) return this._cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this._cache[key] = t; return t;
  },
  woodland(scale=1) {
    return this._mk('wood'+scale, 256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#4a7c3f'; ctx.fillRect(0,0,W,H);
      const blobs = [[0x2d4a1e,45],[0x6b8e3b,30],[0x1a3010,38],[0x8aaf52,22],[0x3a5c28,50]];
      for (const [col, n] of blobs) {
        ctx.fillStyle = '#'+col.toString(16).padStart(6,'0');
        for (let i=0;i<n;i++) {
          const x=Math.random()*W, y=Math.random()*H, r=4+Math.random()*18;
          ctx.beginPath(); ctx.ellipse(x,y,r,r*0.6,Math.random()*Math.PI,0,Math.PI*2); ctx.fill();
        }
      }
    });
  },
  digital(scale=1) {
    return this._mk('dig'+scale, 128, 128, (ctx, W, H) => {
      ctx.fillStyle = '#2a3a2a'; ctx.fillRect(0,0,W,H);
      const sq = 8;
      const cols = ['#1a2a1a','#3a5a3a','#4a6a4a','#1e321e','#5a7a5a','#243424'];
      for (let y=0;y<H;y+=sq) for (let x=0;x<W;x+=sq) {
        ctx.fillStyle = cols[Math.floor(Math.random()*cols.length)];
        ctx.fillRect(x,y,sq,sq);
      }
    });
  },
  metal(col='#444') {
    return this._mk('metal'+col, 128, 128, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,'#888'); g.addColorStop(0.3,col); g.addColorStop(0.6,'#222'); g.addColorStop(1,'#666');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
      for (let y=0;y<H;y+=3) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // scratches
      ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=0.5;
      for (let i=0;i<20;i++) {
        const x=Math.random()*W, y=Math.random()*H;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.random()*30-15, y+Math.random()*5); ctx.stroke();
      }
    });
  },
  solid(hex, roughTex=false) {
    return this._mk('solid'+hex+(roughTex?'r':''), 64, 64, (ctx, W, H) => {
      ctx.fillStyle = hex; ctx.fillRect(0,0,W,H);
      if (roughTex) {
        for (let i=0;i<200;i++) {
          ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.15})`;
          ctx.fillRect(Math.random()*W, Math.random()*H, 2, 2);
        }
      }
    });
  },
  galaxy() {
    return this._mk('galaxy', 256, 256, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W/2);
      g.addColorStop(0,'#8833dd'); g.addColorStop(0.4,'#220066'); g.addColorStop(1,'#050010');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(255,255,255,0.9)';
      for (let i=0;i<180;i++) {
        const x=Math.random()*W, y=Math.random()*H, r=Math.random()*1.5;
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(180,100,255,0.3)';
      for (let i=0;i<8;i++) {
        ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,8+Math.random()*20,0,Math.PI*2); ctx.fill();
      }
    });
  },
  neonSolid(hex, glowHex) {
    return this._mk('neon'+hex+glowHex, 128, 128, (ctx, W, H) => {
      ctx.fillStyle = hex; ctx.fillRect(0,0,W,H);
      ctx.shadowColor = glowHex; ctx.shadowBlur = 20;
      ctx.strokeStyle = glowHex; ctx.lineWidth = 3;
      for (let i=0;i<5;i++) {
        ctx.beginPath(); ctx.moveTo(Math.random()*W,0); ctx.lineTo(Math.random()*W,H); ctx.stroke();
      }
    });
  }
};

// ── Skin Definitions ──────────────────────────────────────────
const SKINS = {
  default:           { body: TexGen.woodland,  bodyColor:0x4a7c3f, helmetColor:0x2d4a1e, vestColor:0x3a3a2a, trim:0x222222, metal:0x444444 },
  neon_blue:         { body: ()=>TexGen.neonSolid('#001a40','#00bfff'), bodyColor:0x00bfff, helmetColor:0x002266, vestColor:0x001133, trim:0x003388, metal:0x336699, glow:0x00bfff },
  flame_lord:        { body: ()=>TexGen.neonSolid('#3a0a00','#ff4500'), bodyColor:0xff4500, helmetColor:0x880000, vestColor:0x2a0800, trim:0xaa2200, metal:0x884400, glow:0xff4500 },
  toxic_green:       { body: ()=>TexGen.neonSolid('#001a00','#39ff14'), bodyColor:0x39ff14, helmetColor:0x004400, vestColor:0x001100, trim:0x228800, metal:0x336633, glow:0x39ff14 },
  purple_phantom:    { body: ()=>TexGen.neonSolid('#1a0033','#8a2be2'), bodyColor:0x8a2be2, helmetColor:0x440088, vestColor:0x110022, trim:0x6600cc, metal:0x553388, glow:0x8a2be2 },
  ghost_white:       { body: ()=>TexGen.solid('#e8e8e8',true), bodyColor:0xf0f0f0, helmetColor:0xcccccc, vestColor:0xdddddd, trim:0x999999, metal:0xaaaaaa },
  midnight_black:    { body: ()=>TexGen.solid('#111122',true), bodyColor:0x1a1a2e, helmetColor:0x080810, vestColor:0x0d0d1a, trim:0x111133, metal:0x222244 },
  golden_god:        { body: ()=>TexGen.metal('#aa8800'), bodyColor:0xffd700, helmetColor:0xaa8800, vestColor:0x886600, trim:0xccaa00, metal:0xffcc00 },
  crimson_demon:     { body: ()=>TexGen.neonSolid('#2a0010','#dc143c'), bodyColor:0xdc143c, helmetColor:0x660011, vestColor:0x1a0008, trim:0xaa0022, metal:0x880033, glow:0xff0044 },
  ocean_king:        { body: ()=>TexGen.solid('#003355',true), bodyColor:0x006994, helmetColor:0x003355, vestColor:0x002244, trim:0x004466, metal:0x336688 },
  diamond_skin:      { body: ()=>TexGen.neonSolid('#88ddff','#b9f2ff'), bodyColor:0xb9f2ff, helmetColor:0x66bbdd, vestColor:0x99ccee, trim:0x44aacc, metal:0x88ccee, glow:0x88ffff },
  rose_gold:         { body: ()=>TexGen.metal('#b76e79'), bodyColor:0xb76e79, helmetColor:0x884455, vestColor:0x996677, trim:0xcc8899, metal:0xdd99aa },
  galaxy_skin:       { body: ()=>TexGen.galaxy(), bodyColor:0x2d1b69, helmetColor:0x110033, vestColor:0x1a0044, trim:0x440088, metal:0x553399, glow:0x9933ff },
  combat_grey:       { body: ()=>TexGen.solid('#555555',true), bodyColor:0x666666, helmetColor:0x333333, vestColor:0x444444, trim:0x888888, metal:0x555555 },
  forest_warrior:    { body: TexGen.woodland, bodyColor:0x4a7c59, helmetColor:0x2d4a1e, vestColor:0x3a5a30, trim:0x2d4a1e, metal:0x445544 },
  shadow_reaper:     { body: ()=>TexGen.solid('#111122',true), bodyColor:0x222233, helmetColor:0x111122, vestColor:0x1a1a2a, trim:0x333344, metal:0x222233, glow:0x4400aa },
  storm_breaker:     { body: ()=>TexGen.digital(), bodyColor:0x4477bb, helmetColor:0x112244, vestColor:0x223355, trim:0x335577, metal:0x446688 },
  legend_zapper:     { body: ()=>TexGen.neonSolid('#331100','#ffaa00'), bodyColor:0xffaa00, helmetColor:0x884400, vestColor:0x221100, trim:0xcc8800, metal:0xaa6600, glow:0xffaa00 },
  neon_striker:      { body: ()=>TexGen.neonSolid('#220022','#ff00ff'), bodyColor:0xff00ff, helmetColor:0x880088, vestColor:0x110011, trim:0xcc00cc, metal:0x993399, glow:0xff00ff },
  viper_elite:       { body: ()=>TexGen.digital(), bodyColor:0x228822, helmetColor:0x004400, vestColor:0x112211, trim:0x336633, metal:0x224422 },
  arctic_ghost:      { body: ()=>TexGen.solid('#ddeeff',true), bodyColor:0xcceeff, helmetColor:0x8899aa, vestColor:0xbbddee, trim:0x99aabb, metal:0xaabbcc },
  cyber_samurai:     { body: ()=>TexGen.solid('#1a1a33',true), bodyColor:0x333366, helmetColor:0x111133, vestColor:0x222244, trim:0x4444aa, metal:0x3333aa, glow:0x0055ff },
  golden_knight:     { body: ()=>TexGen.metal('#aa8800'), bodyColor:0xffcc00, helmetColor:0x996600, vestColor:0x886600, trim:0xddaa00, metal:0xffdd44 },
  void_walker:       { body: ()=>TexGen.solid('#050005',true), bodyColor:0x110022, helmetColor:0x000011, vestColor:0x080010, trim:0x220033, metal:0x110022, glow:0x550088 },
  diamond_operative: { body: ()=>TexGen.neonSolid('#55ccee','#99eeff'), bodyColor:0x99eeff, helmetColor:0x4499bb, vestColor:0x77bbdd, trim:0x55aacc, metal:0x66bbdd, glow:0x44ffff },
  omega_prime:       { body: ()=>TexGen.neonSolid('#330011','#ff0055'), bodyColor:0xff0055, helmetColor:0x880022, vestColor:0x1a0008, trim:0xcc0033, metal:0x990033, glow:0xff0055 }
};

// ── Material helper ────────────────────────────────────────────
function mkMat(opts={}) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    roughness: opts.rough ?? 0.7,
    metalness: opts.metal ?? 0.1,
    map: opts.map ?? null,
    normalMap: opts.normalMap ?? null,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
  return m;
}

// ── Character Builder ──────────────────────────────────────────
function buildCharacter(skinId, isLocal=false) {
  const sk = SKINS[skinId] || SKINS.default;
  const bodyTex = typeof sk.body === 'function' ? sk.body() : sk.body();
  const g = new THREE.Group();

  const mBody  = mkMat({ color:sk.bodyColor, map:bodyTex, rough:0.85, metal:0.05 });
  const mVest  = mkMat({ color:sk.vestColor, rough:0.9, metal:0.0, map:TexGen.solid('#'+sk.vestColor.toString(16).padStart(6,'0'),true) });
  const mHelm  = mkMat({ color:sk.helmetColor, rough:0.6, metal:0.15 });
  const mMetal = mkMat({ color:sk.metal, map:TexGen.metal(), rough:0.3, metal:0.8 });
  const mDark  = mkMat({ color:0x111111, rough:0.9, metal:0.0 });
  const mBlack = mkMat({ color:0x080808, rough:0.95, metal:0.0 });
  const mGlass = mkMat({ color:0x223344, rough:0.1, metal:0.6, emissive:sk.glow??0x112233, emissiveIntensity:sk.glow?0.6:0.1 });
  const mLens  = mkMat({ color:sk.glow??0x44aaff, rough:0.05, metal:0.0, emissive:sk.glow??0x2255aa, emissiveIntensity:sk.glow?1.2:0.4 });
  const mTan   = mkMat({ color:0xc8a882, rough:0.8, metal:0.0 });
  const mBoot  = mkMat({ color:0x1a1008, rough:0.9, metal:0.05 });
  const mKnee  = mkMat({ color:0x222222, rough:0.7, metal:0.1 });
  const mPouch = mkMat({ color:sk.vestColor-0x111111, rough:0.95, metal:0.0 });

  function mesh(geo, mat, px=0,py=0,pz=0, rx=0,ry=0,rz=0, name='') {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px,py,pz); m.rotation.set(rx,ry,rz);
    if (name) m.name = name;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const B = (w,h,d) => new THREE.BoxGeometry(w,h,d);
  const C = (rt,rb,h,s=12) => new THREE.CylinderGeometry(rt,rb,h,s);
  const S = (r,sw,sh) => new THREE.SphereGeometry(r,sw,sh);

  // ── TORSO ──
  const torso = new THREE.Group(); torso.name='torso';
  // Core body
  torso.add(mesh(B(0.68,0.88,0.34), mBody, 0,0,0,0,0,0,'body'));
  // Tactical vest (MOLLE)
  torso.add(mesh(B(0.72,0.80,0.38), mVest, 0,0.02,0));
  // Chest pouches row 1
  for (let i=-1;i<=1;i++) torso.add(mesh(B(0.12,0.11,0.06), mPouch, i*0.16, 0.18, 0.20));
  // Chest pouches row 2
  for (let i=-0.5;i<=0.5;i+=1) torso.add(mesh(B(0.14,0.09,0.06), mPouch, i*0.22, 0.04, 0.20));
  // Side pouches
  torso.add(mesh(B(0.08,0.16,0.1), mPouch, -0.4, 0.0, 0.0));
  torso.add(mesh(B(0.08,0.16,0.1), mPouch,  0.4, 0.0, 0.0));
  // Shoulder pads
  torso.add(mesh(B(0.18,0.1,0.32), mVest, -0.38,0.46,0));
  torso.add(mesh(B(0.18,0.1,0.32), mVest,  0.38,0.46,0));
  // Collar
  torso.add(mesh(B(0.52,0.1,0.3), mBody, 0,0.49,0));
  // Radio on left shoulder
  torso.add(mesh(B(0.06,0.1,0.04), mBlack, -0.34,0.50,0.1));
  // Belt
  torso.add(mesh(B(0.70,0.06,0.36), mDark, 0,-0.44,0));
  // Holster on right hip
  torso.add(mesh(B(0.07,0.14,0.06), mDark, 0.35,-0.44,0.12));
  torso.position.y = 0.92; g.add(torso);

  // ── HEAD ──
  const head = new THREE.Group(); head.name='head';
  // Skull
  head.add(mesh(S(0.26,10,8), mTan, 0,0,0,0,0,0,'head'));
  // Balaclava (lower face cover)
  head.add(mesh(B(0.44,0.28,0.46), mBody, 0,-0.1,0));
  // Jaw
  head.add(mesh(B(0.38,0.1,0.4), mBody, 0,-0.22,0));
  // MICH Helmet
  const helm = new THREE.Group();
  helm.add(mesh(S(0.29,12,8), mHelm, 0,0.02,0));
  helm.add(mesh(B(0.62,0.08,0.56), mHelm, 0,-0.14,-0.02)); // brim
  helm.add(mesh(B(0.3,0.05,0.04), mHelm, 0,0.1,0.28));     // NVG rail
  helm.add(mesh(B(0.06,0.04,0.06), mMetal, 0,0.14,0.3));   // NVG mount
  helm.add(mesh(B(0.04,0.04,0.02), mMetal, 0.12,0.3,-0.04)); // IR strobe
  helm.add(mesh(B(0.58,0.06,0.04), mHelm, 0,-0.05,-0.3));  // chin strap base
  helm.position.y=0.2; head.add(helm);
  // Tactical goggles
  const gogL = new THREE.Group();
  gogL.add(mesh(B(0.14,0.1,0.06), mDark, 0,0,0));
  gogL.add(mesh(B(0.12,0.08,0.02), mGlass, 0,0,0.04));
  gogL.add(mesh(S(0.05,8,6), mLens, 0,0,0.04));
  gogL.position.set(-0.12,0.05,0.28); head.add(gogL);
  const gogR = gogL.clone(); gogR.position.set(0.12,0.05,0.28); head.add(gogR);
  // Strap between goggles
  head.add(mesh(B(0.08,0.06,0.04), mDark, 0,0.04,0.30));
  // Ear pro left
  head.add(mesh(C(0.06,0.07,0.06,8), mBlack, -0.29,0,0, 0,0,Math.PI/2));
  // Ear pro right
  head.add(mesh(C(0.06,0.07,0.06,8), mBlack,  0.29,0,0, 0,0,Math.PI/2));
  // Boom mic
  const mic = new THREE.Group();
  mic.add(mesh(C(0.012,0.012,0.18,6), mBlack, 0,0,0, 0,0,Math.PI/2));
  mic.add(mesh(S(0.025,6,6), mBlack, 0.1,0,0));
  mic.position.set(-0.29,-0.04,-0.08); mic.rotation.z=-0.4; head.add(mic);
  head.position.y=1.61; g.add(head);

  // ── ARMS ──
  function buildArm(side) {
    const sx = side==='L'?-1:1;
    const arm = new THREE.Group(); arm.name='arm'+side;
    // Upper arm
    arm.add(mesh(C(0.1,0.09,0.34,8), mBody, 0,0.17,0));
    // Elbow pad
    arm.add(mesh(B(0.18,0.1,0.18), mKnee, 0,-0.02,0));
    // Forearm
    arm.add(mesh(C(0.085,0.075,0.30,8), mBody, 0,-0.21,0));
    // Glove
    arm.add(mesh(B(0.17,0.1,0.14), mDark, 0,-0.37,0));
    // Fingers (4 small boxes)
    for (let f=0;f<4;f++) {
      arm.add(mesh(B(0.03,0.08,0.03), mDark, -0.06+f*0.04,-0.44,0.04));
    }
    // Thumb
    arm.add(mesh(B(0.04,0.05,0.03), mDark, sx*0.07,-0.4,0.04));
    arm.position.set(sx*0.45,0.95,0);
    return arm;
  }
  g.add(buildArm('L'), buildArm('R'));

  // ── LEGS ──
  function buildLeg(side) {
    const sx = side==='L'?-1:1;
    const leg = new THREE.Group(); leg.name='leg'+side;
    // Thigh
    leg.add(mesh(C(0.135,0.12,0.40,8), mBody, 0,0.2,0));
    // Thigh pocket
    leg.add(mesh(B(0.16,0.14,0.09), mPouch, sx*0.12,0.16,0.06));
    // Knee pad
    leg.add(mesh(B(0.22,0.12,0.18), mKnee, 0,-0.02,0.06));
    // Shin
    leg.add(mesh(C(0.11,0.085,0.38,8), mBody, 0,-0.3,0));
    // Gaiter (cuff at ankle)
    leg.add(mesh(B(0.24,0.06,0.22), mDark, 0,-0.52,0));
    // Boot
    leg.add(mesh(B(0.22,0.14,0.34), mBoot, 0,-0.64,0.04, 'boot'+side));
    // Boot toe cap
    leg.add(mesh(B(0.20,0.1,0.08), mMetal, 0,-0.62,0.2));
    // Boot sole
    leg.add(mesh(B(0.24,0.04,0.38), mBlack, 0,-0.72,0.04));
    // Laces
    for (let l=0;l<3;l++) leg.add(mesh(B(0.18,0.015,0.015), mDark, 0,-0.58+l*0.04,0.18));
    leg.position.set(sx*0.2,0.35,0);
    return leg;
  }
  g.add(buildLeg('L'), buildLeg('R'));

  // ── GLOW LIGHT (neon skins) ──
  if (sk.glow) {
    const pl = new THREE.PointLight(sk.glow, 1.5, 3);
    pl.userData.isNeon = true; pl.userData.neonPhase = Math.random()*Math.PI*2;
    pl.position.y = 1.0; g.add(pl);
  }

  // ── Name label (remote only) ──
  if (!isLocal) {
    g.userData.nameLabel = createNameLabel('');
    g.add(g.userData.nameLabel);
  }

  return g;
}

// ── Weapon Builders ───────────────────────────────────────────
function buildWeapon(weaponId) {
  const builders = {
    assault_rifle: buildAR, shotgun: buildShotgun, sniper: buildSniper,
    smg: buildSMG, pistol: buildPistol, rocket_launcher: buildRPG
  };
  return (builders[weaponId] || buildAR)();
}

function buildAR() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mSteel  = mkMat({ color:0x333333, map:TexGen.metal(), rough:0.25, metal:0.9 });
  const mDark   = mkMat({ color:0x1a1a1a, rough:0.85, metal:0.05 });
  const mPoly   = mkMat({ color:0x222222, rough:0.9, metal:0.0 });
  const mAlum   = mkMat({ color:0x4a4a4a, map:TexGen.metal('#555'), rough:0.3, metal:0.8 });
  const mLens   = mkMat({ color:0x882200, rough:0.05, emissive:0xff3300, emissiveIntensity:0.8 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Lower receiver
  g.add(m(B(0.46,0.12,0.08), mPoly, 0,0,0));
  // Upper receiver
  g.add(m(B(0.44,0.1,0.07), mAlum, 0,0.11,0));
  // Charging handle
  g.add(m(B(0.05,0.04,0.04), mDark, -0.16,0.14,0));
  // Dust cover
  g.add(m(B(0.14,0.025,0.05), mAlum, 0.06,0.07,0));
  // Barrel (tapered)
  g.add(m(C(0.018,0.022,0.52,8), mSteel, 0.48,0.11,0, 0,0,Math.PI/2));
  // Gas tube
  g.add(m(C(0.008,0.008,0.36,6), mSteel, 0.30,0.18,0, 0,0,Math.PI/2));
  // M-LOK handguard
  g.add(m(B(0.34,0.09,0.09), mAlum, 0.22,0.11,0));
  // Rail slots on handguard (3 pairs)
  for (let i=0;i<3;i++) g.add(m(B(0.06,0.012,0.09), mDark, 0.08+i*0.1,0.155,0));
  // Pistol grip
  g.add(m(B(0.055,0.16,0.08), mPoly, -0.14,-0.11,0, 0.3,0,0));
  // Trigger guard
  g.add(m(B(0.1,0.04,0.06), mPoly, -0.04,-0.08,0));
  // Trigger
  g.add(m(B(0.015,0.055,0.015), mSteel, -0.04,-0.09,0, 0.3,0,0));
  // STANAG mag
  g.add(m(B(0.06,0.18,0.07), mPoly, -0.02,-0.2,0, -0.1,0,0));
  // Mag lip detail
  g.add(m(B(0.055,0.015,0.065), mAlum, -0.02,-0.11,0));
  // Buffer tube
  g.add(m(C(0.025,0.025,0.22,8), mAlum, -0.3,0.13,0, 0,0,Math.PI/2));
  // CTR Stock body
  g.add(m(B(0.19,0.1,0.07), mPoly, -0.47,0.1,0));
  // Stock cheek riser
  g.add(m(B(0.16,0.04,0.06), mPoly, -0.46,0.16,0));
  // Rear iron sight
  g.add(m(B(0.04,0.05,0.02), mDark, -0.18,0.17,0));
  // Front iron sight post
  g.add(m(B(0.008,0.045,0.02), mDark, 0.38,0.17,0));
  // Muzzle device (A2 flash hider)
  g.add(m(C(0.022,0.018,0.055,6), mSteel, 0.755,0.11,0, 0,0,Math.PI/2));
  g.add(m(B(0.05,0.032,0.032), mSteel, 0.755,0.11,0)); // prongs cross
  // Aimpoint red dot
  const rdot = new THREE.Group();
  rdot.add(m(B(0.075,0.06,0.06), mDark, 0,0,0));  // body
  rdot.add(m(B(0.078,0.014,0.064), mAlum, 0,0.04,0)); // mount base
  rdot.add(m(C(0.022,0.022,0.06,8), mDark, 0,0,0, 0,0,Math.PI/2)); // tube
  rdot.add(m(new THREE.CircleGeometry(0.018,12), mLens, 0.032,0,0, 0,Math.PI/2,0)); // front lens
  rdot.position.set(0.06,0.19,0); g.add(rdot);

  return g;
}

function buildShotgun() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mWood  = mkMat({ color:0x5c3317, rough:0.95, metal:0.0 });
  const mSteel = mkMat({ color:0x333333, map:TexGen.metal(), rough:0.25, metal:0.9 });
  const mDark  = mkMat({ color:0x1a1a1a, rough:0.85, metal:0.1 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Receiver
  g.add(m(B(0.38,0.1,0.1), mSteel, 0,0,0));
  // Long barrel
  g.add(m(C(0.022,0.026,0.58,8), mSteel, 0.48,0.04,0, 0,0,Math.PI/2));
  // Heat shield with perforations
  for (let i=0;i<6;i++) {
    g.add(m(B(0.04,0.014,0.1), mDark, 0.15+i*0.06,0.07,0));
  }
  // Magazine tube
  g.add(m(C(0.018,0.018,0.52,8), mSteel, 0.4,0.0,-0.05, 0,0,Math.PI/2));
  // Tube cap
  g.add(m(C(0.022,0.022,0.02,8), mSteel, 0.66,0.0,-0.05));
  // Pump forend
  g.add(m(B(0.2,0.09,0.1), mWood, 0.3,-0.01,0));
  // Pump grooves
  for (let i=0;i<4;i++) g.add(m(B(0.015,0.092,0.1), mDark, 0.225+i*0.05,-0.01,0));
  // Wood stock
  g.add(m(B(0.32,0.1,0.08), mWood, -0.35,-0.01,0));
  // Stock toe
  g.add(m(B(0.06,0.14,0.08), mWood, -0.5,0.01,0));
  // Grip
  g.add(m(B(0.06,0.14,0.08), mWood, -0.12,-0.1,0, 0.25,0,0));
  // Trigger guard
  g.add(m(B(0.1,0.035,0.07), mSteel, -0.04,-0.08,0));
  // Trigger
  g.add(m(B(0.012,0.05,0.012), mSteel, -0.04,-0.09,0, 0.3,0,0));
  // Shell port
  g.add(m(B(0.08,0.025,0.1), mDark, 0.05,0.052,0));
  // Bead sight
  g.add(m(new THREE.SphereGeometry(0.012,6,6), mSteel, 0.64,0.068,0));
  // Muzzle
  g.add(m(C(0.03,0.022,0.03,8), mSteel, 0.775,0.04,0, 0,0,Math.PI/2));

  return g;
}

function buildSniper() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mSteel = mkMat({ color:0x2a2a2a, map:TexGen.metal('#333'), rough:0.2, metal:0.95 });
  const mPoly  = mkMat({ color:0x1c1c1c, rough:0.9, metal:0.0 });
  const mAlum  = mkMat({ color:0x555555, map:TexGen.metal('#555'), rough:0.3, metal:0.8 });
  const mLens  = mkMat({ color:0x001122, rough:0.05, emissive:0x004466, emissiveIntensity:0.4 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Heavy receiver
  g.add(m(B(0.52,0.13,0.1), mAlum, 0,0,0));
  // Fluted barrel (alternating thick/thin)
  g.add(m(C(0.018,0.024,0.78,8), mSteel, 0.65,0.04,0, 0,0,Math.PI/2));
  for (let i=0;i<6;i++) g.add(m(C(0.026,0.026,0.04,8), mSteel, 0.28+i*0.1,0.04,0, 0,0,Math.PI/2));
  // Muzzle brake
  g.add(m(C(0.034,0.03,0.06,8), mSteel, 1.06,0.04,0, 0,0,Math.PI/2));
  g.add(m(B(0.055,0.05,0.04), mSteel, 1.06,0.04,0)); // ports cross
  // Deployed bipod legs
  const bpL=new THREE.Group(), bpR=new THREE.Group();
  bpL.add(m(C(0.008,0.008,0.28,6), mSteel, 0,0,0, 0.4,0,0));
  bpL.add(m(C(0.01,0.01,0.04,6), mAlum, 0,-0.14,0.12)); // foot
  bpR.add(m(C(0.008,0.008,0.28,6), mSteel, 0,0,0, 0.4,0,0));
  bpR.add(m(C(0.01,0.01,0.04,6), mAlum, 0,-0.14,0.12));
  bpL.position.set(0.24,-0.07,-0.06); bpR.position.set(0.24,-0.07,0.06);
  g.add(bpL, bpR);
  // Pistol grip
  g.add(m(B(0.055,0.18,0.09), mPoly, -0.14,-0.14,0, 0.22,0,0));
  // Trigger guard
  g.add(m(B(0.1,0.04,0.07), mSteel, -0.04,-0.1,0));
  // Heavy stock
  g.add(m(B(0.32,0.1,0.09), mPoly, -0.42,0,0));
  // Cheek piece
  g.add(m(B(0.22,0.065,0.08), mPoly, -0.36,0.09,0));
  // Adjustable butt pad
  g.add(m(B(0.055,0.16,0.09), mPoly, -0.58,0.02,0));
  // Detach box mag
  g.add(m(B(0.065,0.18,0.08), mPoly, -0.05,-0.21,0, -0.05,0,0));
  // Large scope (34mm)
  const scope = new THREE.Group();
  scope.add(m(C(0.036,0.036,0.42,12), mAlum, 0,0,0, 0,0,Math.PI/2)); // main tube
  scope.add(m(C(0.055,0.036,0.04,12), mAlum, -0.21,0,0, 0,0,Math.PI/2)); // ocular bell
  scope.add(m(C(0.055,0.036,0.04,12), mAlum,  0.21,0,0, 0,0,Math.PI/2)); // objective bell
  scope.add(m(C(0.06,0.06,0.1,12),   mAlum, -0.22,0,0, 0,0,Math.PI/2));  // ocular housing
  scope.add(m(C(0.065,0.065,0.1,12), mAlum,  0.23,0,0, 0,0,Math.PI/2));  // objective housing
  scope.add(new THREE.Mesh(new THREE.CircleGeometry(0.058,12), mLens)); // objective lens
  const cl=new THREE.Mesh(new THREE.CircleGeometry(0.054,12), mLens); cl.position.x=-0.27; scope.add(cl);
  // Elevation turret
  scope.add(m(C(0.025,0.025,0.05,8), mAlum, 0.02,0.04,0));
  // Windage turret
  scope.add(m(C(0.025,0.025,0.05,8), mAlum, 0.02,0,0.04, 0,0,Math.PI/2));
  // Scope rings
  scope.add(m(B(0.04,0.06,0.08), mAlum, -0.08,0.04,0));
  scope.add(m(B(0.04,0.06,0.08), mAlum,  0.08,0.04,0));
  scope.position.set(0.08,0.115,0); g.add(scope);
  // Bolt handle
  g.add(m(C(0.012,0.012,0.12,6), mAlum, 0.14,-0.01,0.06, 0,0,0.5));
  g.add(m(new THREE.SphereGeometry(0.02,8,8), mAlum, 0.16,-0.04,0.12)); // bolt knob

  return g;
}

function buildSMG() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mSteel = mkMat({ color:0x2e2e2e, map:TexGen.metal(), rough:0.25, metal:0.9 });
  const mPoly  = mkMat({ color:0x1a1a1a, rough:0.9, metal:0.0 });
  const mAlum  = mkMat({ color:0x3a3a3a, rough:0.35, metal:0.8 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Compact receiver
  g.add(m(B(0.34,0.1,0.08), mAlum, 0,0,0));
  // Short barrel
  g.add(m(C(0.015,0.018,0.22,8), mSteel, 0.28,0.04,0, 0,0,Math.PI/2));
  // Suppressor
  g.add(m(C(0.032,0.032,0.18,10), mAlum, 0.48,0.04,0, 0,0,Math.PI/2));
  g.add(m(C(0.034,0.034,0.02,10), mSteel, 0.38,0.04,0, 0,0,Math.PI/2)); // mount ring
  // M-LOK handguard
  g.add(m(B(0.24,0.08,0.08), mAlum, 0.14,0.04,0));
  for (let i=0;i<3;i++) g.add(m(B(0.04,0.01,0.08), mPoly, 0.04+i*0.08,0.085,0));
  // Vertical foregrip
  g.add(m(B(0.04,0.14,0.05), mPoly, 0.2,-0.1,0, 0.1,0,0));
  // Pistol grip
  g.add(m(B(0.055,0.15,0.08), mPoly, -0.12,-0.12,0, 0.2,0,0));
  // Trigger guard
  g.add(m(B(0.09,0.035,0.07), mAlum, -0.03,-0.09,0));
  // Straight magazine
  g.add(m(B(0.055,0.26,0.06), mPoly, -0.03,-0.24,0));
  // Folding stock (deployed)
  g.add(m(B(0.02,0.09,0.07), mAlum, -0.22,0.04,0, 0,-0.15,0));
  g.add(m(B(0.18,0.025,0.07), mAlum, -0.32,0.04,0));
  g.add(m(B(0.02,0.09,0.07), mAlum, -0.42,0.04,0, 0,0.15,0));
  // Charging handle
  g.add(m(B(0.05,0.035,0.03), mSteel, 0.1,0.055,0));

  return g;
}

function buildPistol() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mSteel = mkMat({ color:0x333333, map:TexGen.metal(), rough:0.2, metal:0.95 });
  const mPoly  = mkMat({ color:0x1e1e1e, rough:0.9, metal:0.0 });
  const mAlum  = mkMat({ color:0x444444, rough:0.35, metal:0.85 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Polymer frame
  g.add(m(B(0.26,0.1,0.065), mPoly, 0,0,0));
  // Grip with stippling texture
  g.add(m(B(0.08,0.18,0.065), mPoly, -0.1,-0.12,0, 0.08,0,0));
  // Grip stipple detail
  for (let y=0;y<3;y++) for (let i=0;i<3;i++) {
    g.add(m(B(0.01,0.01,0.065), pPolyDark=mkMat({color:0x101010,rough:1}), -0.125+i*0.025, -0.08-y*0.04,0));
  }
  // Metal slide
  g.add(m(B(0.26,0.1,0.065), mAlum, 0,0.1,0));
  // Slide serrations (rear)
  for (let i=0;i<5;i++) g.add(m(B(0.008,0.1,0.065), mSteel, -0.1+i*0.016,0.1,0));
  // Barrel peeking from slide
  g.add(m(C(0.014,0.014,0.04,8), mSteel, 0.135,0.1,0, 0,0,Math.PI/2));
  // Barrel full
  g.add(m(C(0.012,0.012,0.24,8), mSteel, 0.12,0.1,0, 0,0,Math.PI/2));
  // Front sight
  g.add(m(B(0.01,0.03,0.065), mSteel, 0.11,0.155,0));
  // Rear sight
  g.add(m(B(0.04,0.028,0.065), mSteel, -0.1,0.155,0));
  // Trigger guard
  g.add(m(B(0.09,0.03,0.065), mPoly, 0.04,-0.065,0));
  // Trigger
  g.add(m(B(0.01,0.04,0.01), mSteel, 0.04,-0.07,0, 0.25,0,0));
  // Flush magazine
  g.add(m(B(0.055,0.14,0.055), mPoly, -0.1,-0.15,0));
  // Mag basepad
  g.add(m(B(0.06,0.015,0.06), mAlum, -0.1,-0.225,0));
  // Hammer
  g.add(m(B(0.02,0.025,0.02), mSteel, -0.12,0.135,0, -0.3,0,0));
  // Rail (under frame)
  g.add(m(B(0.12,0.015,0.065), mAlum, 0.06,-0.05,0));

  return g;
}

function buildRPG() {
  const g = new THREE.Group(); g.name='weapon_group';
  const mOD    = mkMat({ color:0x3a4a2a, rough:0.9, metal:0.05 });
  const mSteel = mkMat({ color:0x2a2a2a, map:TexGen.metal(), rough:0.3, metal:0.8 });
  const mDark  = mkMat({ color:0x111111, rough:0.85, metal:0.1 });
  const mWar   = mkMat({ color:0x885500, rough:0.7, metal:0.3 });
  function m(geo,mat,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    const x=new THREE.Mesh(geo,mat); x.position.set(px,py,pz); x.rotation.set(rx,ry,rz); x.castShadow=true; return x;
  }
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const C=(rt,rb,h,s=10)=>new THREE.CylinderGeometry(rt,rb,h,s);

  // Main launch tube (tapered)
  g.add(m(C(0.055,0.065,0.96,12), mOD, 0,0,0, 0,0,Math.PI/2));
  // Front grip area reinforcement
  g.add(m(C(0.072,0.072,0.12,12), mOD, 0.14,0,0, 0,0,Math.PI/2));
  // Rear venturi nozzle (flares out)
  g.add(m(C(0.055,0.1,0.2,12), mSteel, -0.58,0,0, 0,0,Math.PI/2));
  g.add(m(C(0.1,0.12,0.04,12), mSteel, -0.69,0,0, 0,0,Math.PI/2));
  // Front grip
  g.add(m(B(0.05,0.2,0.08), mOD, 0.2,-0.14,0, 0.1,0,0));
  g.add(m(B(0.05,0.06,0.1), mOD, 0.2,-0.23,0));  // grip base
  // Pistol grip
  g.add(m(B(0.055,0.18,0.08), mDark, 0,-0.14,0, 0.18,0,0));
  // Trigger guard
  g.add(m(B(0.09,0.035,0.07), mSteel, 0.04,-0.12,0));
  // Trigger
  g.add(m(B(0.012,0.05,0.012), mSteel, 0.04,-0.13,0, 0.28,0,0));
  // Optical sight (PSO-1 style)
  const sgt = new THREE.Group();
  sgt.add(m(C(0.025,0.025,0.2,8), mDark, 0,0,0, 0,0,Math.PI/2));
  sgt.add(m(C(0.038,0.025,0.025,8), mDark, -0.11,0,0, 0,0,Math.PI/2)); // eyepiece
  sgt.add(m(C(0.038,0.025,0.025,8), mDark,  0.11,0,0, 0,0,Math.PI/2)); // objective
  sgt.add(m(B(0.04,0.05,0.05), mDark, 0,0.04,0)); // elev knob
  sgt.position.set(0.02,0.1,0); g.add(sgt);
  // Shoulder rest
  g.add(m(B(0.2,0.08,0.1), mOD, -0.28,0.12,0));
  // Carrying handle
  g.add(m(B(0.28,0.015,0.015), mSteel, 0,0.1,0.05));
  g.add(m(C(0.01,0.01,0.06,6), mSteel, -0.14,0.075,0.05));
  g.add(m(C(0.01,0.01,0.06,6), mSteel,  0.14,0.075,0.05));
  // Warhead (PG-7VL)
  g.add(m(C(0.05,0.04,0.14,10), mWar, 0.62,0,0, 0,0,Math.PI/2));    // warhead body
  g.add(m(C(0.04,0.005,0.22,10), mWar, 0.8,0,0, 0,0,Math.PI/2));   // spike
  g.add(m(C(0.056,0.056,0.04,10), mSteel, 0.54,0,0, 0,0,Math.PI/2)); // booster ring
  // Stabilizing fins (4x)
  for (let i=0;i<4;i++) {
    const fin = m(B(0.06,0.1,0.008), mSteel, 0.36,0,0);
    fin.rotation.set(0, i*Math.PI/2, 0); g.add(fin);
  }

  return g;
}

// ── Name Label ────────────────────────────────────────────────
function createNameLabel(username) {
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(0,0,0,0.6)';
  if (ctx.roundRect) ctx.roundRect(0,0,256,64,8); else ctx.rect(0,0,256,64);
  ctx.fill();
  ctx.fillStyle='#FFFFFF'; ctx.font='bold 28px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(username,128,32);
  const texture=new THREE.CanvasTexture(canvas);
  const geo=new THREE.PlaneGeometry(2,0.5);
  const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false});
  const label=new THREE.Mesh(geo,mat);
  label.position.y=2.4; label.name='nameLabel'; label.userData.isLabel=true;
  return label;
}

function updateNameLabel(label, username, team) {
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=team==='red'?'rgba(180,0,0,0.75)':team==='blue'?'rgba(0,0,180,0.75)':'rgba(0,0,0,0.75)';
  if (ctx.roundRect) ctx.roundRect(0,0,256,64,8); else ctx.rect(0,0,256,64);
  ctx.fill();
  ctx.fillStyle='#FFFFFF'; ctx.font='bold 28px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(username,128,32);
  label.material.map=new THREE.CanvasTexture(canvas);
  label.material.map.needsUpdate=true;
}

// ════════════════════════════════════════════════════════════════
// Player Controller
// ════════════════════════════════════════════════════════════════
const PlayerController = (() => {
  // Local player state
  let localPlayer = {
    object: null,
    fpArms: null,
    fpWeaponGroup: null,
    camera: null,
    velocity: new THREE.Vector3(),
    onGround: false,
    health: 100,
    maxHealth: 100,
    armor: 0,
    weapon: 'assault_rifle',
    ammo: { current: 30, reserve: 90 },
    isAlive: true,
    yaw: 0,
    pitch: 0,
    isReloading: false,
    isADS: false,
    kills: 0,
    isSprinting: false,
    id: null
  };

  const remotePlayers = {};
  const keys = {};
  const mouse = { x: 0, y: 0, locked: false };
  let sensitivity = 0.002;
  let invertY = false;
  let fov = 90;

  const GRAVITY = -22;
  const JUMP_FORCE = 9;
  const MOVE_SPEED = 8;
  const SPRINT_SPEED = 13;

  const raycaster = new THREE.Raycaster();

  // ── Head bob state ──
  let bobTime = 0;
  let bobActive = false;
  const BOB_FREQ = 8;
  const BOB_AMP  = 0.022;

  // ── Recoil / ADS state ──
  let recoilPitch = 0;
  let recoilFade  = 0;
  let adsProgress = 0; // 0=hip, 1=ADS
  const ADS_SPEED = 8;
  const HIP_FOV   = 90;
  const ADS_FOV   = 55;

  // ── FP Weapon animation state ──
  let fpSwayTime = 0;
  let reloadAnimAngle = 0;
  let isReloadAnim = false;

  function buildFPArms(skinId) {
    const sk = SKINS[skinId] || SKINS.default;
    const armGroup = new THREE.Group(); armGroup.name='fp_arms';

    const mBody = mkMat({ color:sk.bodyColor, rough:0.85, metal:0.05 });
    const mGlove= mkMat({ color:0x111111, rough:0.9, metal:0.0 });

    function sleeve(side) {
      const s = new THREE.Group();
      const sx = side==='L'?-1:1;
      // Forearm sleeve
      s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.065,0.32,8), mBody));
      // Glove
      const gl = new THREE.Group();
      gl.add(new THREE.Mesh(new THREE.BoxGeometry(0.13,0.08,0.11), mGlove));
      for (let f=0;f<4;f++) {
        const fg=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.06,0.025), mGlove);
        fg.position.set(-0.045+f*0.03, -0.07, 0.04); gl.add(fg);
      }
      gl.position.y=-0.22; s.add(gl);
      s.position.set(sx*0.2, -0.28, -0.36);
      s.rotation.x = 0.3 + sx*0.08;
      return s;
    }
    armGroup.add(sleeve('L'), sleeve('R'));
    return armGroup;
  }

  function switchFPWeapon(weaponId) {
    const cam = Engine.camera;
    const old = cam.getObjectByName('fp_weapon_group');
    if (old) cam.remove(old);

    const wg = buildWeapon(weaponId);
    wg.name = 'fp_weapon_group';

    // Scale down and position for FP view
    wg.scale.set(0.82, 0.82, 0.82);
    wg.position.set(0.18, -0.22, -0.45);
    wg.rotation.y = Math.PI;

    // Add muzzle point marker
    const muzzle = new THREE.Object3D(); muzzle.name='fp_muzzle';
    const weapon = WEAPONS_CLIENT[weaponId];
    const muzzleZ = -0.8;
    muzzle.position.set(0, 0, muzzleZ); wg.add(muzzle);

    cam.add(wg);
    localPlayer.fpWeaponGroup = wg;
  }

  function initLocal(camera, skinId) {
    localPlayer.camera = camera;
    localPlayer.object = buildCharacter(skinId || 'default', true);
    localPlayer.object.visible = false;

    Engine.scene.add(localPlayer.object);

    const fpArms = buildFPArms(skinId || 'default');
    camera.add(fpArms);
    localPlayer.fpArms = fpArms;

    switchFPWeapon('assault_rifle');
    setupInput();
    return localPlayer.object;
  }

  function attachWeaponToPlayer(playerGroup, weaponId) {
    const old = playerGroup.getObjectByName('weapon_group');
    if (old) playerGroup.remove(old);
    const wg = buildWeapon(weaponId);
    wg.position.set(0.35, 0.85, 0.3);
    wg.rotation.y = Math.PI;
    wg.scale.set(0.7, 0.7, 0.7);
    playerGroup.add(wg);
  }

  function setupInput() {
    document.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'KeyR') startReload();
      if (e.code === 'Tab') { e.preventDefault(); showScoreboard(true); }
      if (e.code === 'Escape') togglePause();
      if (e.code === 'KeyT') openChat();
      if (e.code === 'KeyQ') toggleWeaponWheel();
    });
    document.addEventListener('keyup', e => {
      keys[e.code] = false;
      if (e.code === 'Tab') showScoreboard(false);
    });

    document.addEventListener('mousemove', e => {
      if (!mouse.locked) return;
      localPlayer.yaw -= e.movementX * sensitivity;
      const pitchDelta = e.movementY * sensitivity * (invertY ? -1 : 1);
      localPlayer.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, localPlayer.pitch - pitchDelta));
    });

    document.addEventListener('mousedown', e => {
      if (e.button === 0 && mouse.locked) handleShoot();
      if (e.button === 2 && mouse.locked) setADS(true);
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 2) setADS(false);
    });

    const canvas = Engine.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (document.getElementById('game-screen').classList.contains('active')) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      mouse.locked = document.pointerLockElement === canvas;
    });
  }

  function setADS(on) {
    localPlayer.isADS = on;
    const crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.style.opacity = on ? '0' : '1';
  }

  let autoFireInterval = null;
  let isShooting = false;

  function startAutoFire() {
    if (isShooting) return;
    isShooting = true;
    handleShoot();
    const weapon = WEAPONS_CLIENT[localPlayer.weapon];
    if (weapon?.auto) autoFireInterval = setInterval(handleShoot, 60000/(weapon.fireRate||600));
  }

  function stopAutoFire() {
    isShooting = false;
    if (autoFireInterval) { clearInterval(autoFireInterval); autoFireInterval = null; }
  }

  function handleShoot() {
    if (!localPlayer.isAlive || localPlayer.isReloading) return;
    if (localPlayer.ammo.current <= 0) { startReload(); return; }

    localPlayer.ammo.current--;
    updateAmmoHUD();

    const origin = Engine.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(Engine.camera.quaternion);

    const weapon = WEAPONS_CLIENT[localPlayer.weapon];
    const spread = localPlayer.isADS ? (weapon?.spread||0.03)*0.25 : (weapon?.spread||0.03);
    dir.x += (Math.random()-0.5)*spread;
    dir.y += (Math.random()-0.5)*spread;
    dir.normalize();

    Network.sendShoot({ origin: origin.toArray(), direction: dir.toArray() });

    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(Engine.scene.children, true);

    for (const hit of hits) {
      let obj = hit.object;
      let hitPlayerId = null;
      while (obj.parent) {
        if (obj.userData.playerId) { hitPlayerId = obj.userData.playerId; break; }
        obj = obj.parent;
      }
      if (hitPlayerId && hitPlayerId !== localPlayer.id) {
        const isHeadshot = hit.object.name === 'head';
        Network.sendHit({ targetId: hitPlayerId, headshot: isHeadshot, point: hit.point.toArray() });
        Engine.spawnHitEffect(hit.point, isHeadshot ? 0xFF0000 : 0xFF8800);
        showHitMarker(isHeadshot);
        break;
      } else if (!hitPlayerId) {
        Engine.spawnHitEffect(hit.point, 0xCCCCCC);
        Engine.spawnProjectileTrail(origin, hit.point, weapon?.color||0xFFFF00);
        break;
      }
    }
    if (hits.length === 0) {
      const farPoint = origin.clone().addScaledVector(dir, 500);
      Engine.spawnProjectileTrail(origin, farPoint, 0xFFFF99);
    }

    // Muzzle flash from FP weapon muzzle point
    const fpMuzzle = Engine.camera.getObjectByName('fp_muzzle');
    if (fpMuzzle) {
      const muzzlePos = new THREE.Vector3();
      fpMuzzle.getWorldPosition(muzzlePos);
      Engine.spawnMuzzleFlash(muzzlePos, dir);
    }

    // Recoil kick
    recoilPitch += (weapon?.recoil || 0.012);
    recoilFade = 1;

    if (localPlayer.ammo.current <= 0) startReload();
  }

  function startReload() {
    if (localPlayer.isReloading) return;
    const weapon = WEAPONS_CLIENT[localPlayer.weapon];
    if (!weapon || localPlayer.ammo.reserve <= 0) return;
    if (localPlayer.ammo.current >= weapon.magSize) return;

    localPlayer.isReloading = true;
    isReloadAnim = true;
    reloadAnimAngle = 0;
    document.getElementById('reload-indicator').style.display = 'block';

    setTimeout(() => {
      const needed = weapon.magSize - localPlayer.ammo.current;
      const take = Math.min(needed, localPlayer.ammo.reserve);
      localPlayer.ammo.current += take;
      localPlayer.ammo.reserve -= take;
      localPlayer.isReloading = false;
      isReloadAnim = false;
      document.getElementById('reload-indicator').style.display = 'none';
      updateAmmoHUD();
    }, (weapon.reloadTime||2)*1000);
  }

  function update(delta) {
    if (!localPlayer.isAlive || !localPlayer.object) return;

    const obj = localPlayer.object;
    const vel = localPlayer.velocity;

    if (!localPlayer.onGround) vel.y += GRAVITY * delta;

    const speed = keys['ShiftLeft'] ? SPRINT_SPEED : MOVE_SPEED;
    localPlayer.isSprinting = keys['ShiftLeft'];
    const forward = new THREE.Vector3(-Math.sin(localPlayer.yaw), 0, -Math.cos(localPlayer.yaw));
    const right   = new THREE.Vector3( Math.cos(localPlayer.yaw), 0, -Math.sin(localPlayer.yaw));
    const moveDir = new THREE.Vector3();

    if (keys['KeyW']||keys['ArrowUp'])    moveDir.add(forward);
    if (keys['KeyS']||keys['ArrowDown'])  moveDir.sub(forward);
    if (keys['KeyA']||keys['ArrowLeft'])  moveDir.sub(right);
    if (keys['KeyD']||keys['ArrowRight']) moveDir.add(right);

    if (MobileControls.active) {
      const mj = MobileControls.getLeftJoystick();
      if (mj.x !== 0 || mj.y !== 0) {
        moveDir.add(forward.clone().multiplyScalar(-mj.y));
        moveDir.add(right.clone().multiplyScalar(mj.x));
      }
    }

    const isMoving = moveDir.length() > 0;
    if (isMoving) {
      moveDir.normalize().multiplyScalar(speed);
      vel.x = moveDir.x; vel.z = moveDir.z;
    } else {
      vel.x *= 0.8; vel.z *= 0.8;
    }

    if ((keys['Space']||MobileControls.jumpPressed) && localPlayer.onGround) {
      vel.y = JUMP_FORCE;
      localPlayer.onGround = false;
      MobileControls.jumpPressed = false;
    }

    obj.position.x += vel.x * delta;
    obj.position.y += vel.y * delta;
    obj.position.z += vel.z * delta;

    if (obj.position.y <= 0) {
      obj.position.y = 0; vel.y = 0; localPlayer.onGround = true;
    } else {
      localPlayer.onGround = false;
    }

    obj.position.x = Math.max(-98, Math.min(98, obj.position.x));
    obj.position.z = Math.max(-98, Math.min(98, obj.position.z));
    obj.rotation.y = localPlayer.yaw;

    // ── ADS lerp ──
    const adsTarget = localPlayer.isADS ? 1 : 0;
    adsProgress += (adsTarget - adsProgress) * Math.min(1, ADS_SPEED * delta);
    Engine.camera.fov = HIP_FOV + (ADS_FOV - HIP_FOV) * adsProgress;
    Engine.camera.updateProjectionMatrix();

    // FP weapon position: pull in during ADS
    const fpWg = Engine.camera.getObjectByName('fp_weapon_group');
    if (fpWg) {
      fpWg.position.x = 0.18 - adsProgress * 0.18;
      fpWg.position.y = -0.22 + adsProgress * 0.04;
      fpWg.position.z = -0.45 + adsProgress * 0.1;
    }

    // ── Head bob ──
    if (isMoving && localPlayer.onGround) {
      bobTime += delta * BOB_FREQ * (localPlayer.isSprinting ? 1.5 : 1);
      const bobY = Math.sin(bobTime) * BOB_AMP;
      const bobX = Math.cos(bobTime*0.5) * BOB_AMP * 0.5;
      if (!localPlayer.isADS) {
        Engine.camera.position.y += bobY;
        Engine.camera.position.x += bobX;
      }
    } else {
      bobTime *= 0.9;
    }

    // ── Recoil fade ──
    if (recoilFade > 0) {
      recoilPitch *= 0.82;
      recoilFade  *= 0.82;
      if (recoilFade < 0.01) { recoilFade=0; recoilPitch=0; }
    }

    // ── FP weapon sway & animations ──
    fpSwayTime += delta;
    if (fpWg) {
      // idle sway
      const swayX = Math.sin(fpSwayTime*1.2) * 0.004 * (1-adsProgress);
      const swayY = Math.cos(fpSwayTime*0.8) * 0.003 * (1-adsProgress);
      fpWg.position.x += swayX;
      fpWg.position.y += swayY;
      // recoil kick
      fpWg.position.z += recoilPitch * 0.4;
      fpWg.rotation.x = -recoilPitch * 1.5;
      // sprint tilt
      if (localPlayer.isSprinting) {
        fpWg.rotation.z = THREE.MathUtils.lerp(fpWg.rotation.z, -0.35, 0.12);
        fpWg.position.x = THREE.MathUtils.lerp(fpWg.position.x, 0.05, 0.1);
        fpWg.position.y = THREE.MathUtils.lerp(fpWg.position.y, -0.1, 0.1);
      } else {
        fpWg.rotation.z = THREE.MathUtils.lerp(fpWg.rotation.z, 0, 0.1);
      }
      // reload animation
      if (isReloadAnim) {
        reloadAnimAngle = Math.min(reloadAnimAngle + delta * 3, Math.PI * 0.8);
        fpWg.rotation.z = Math.sin(reloadAnimAngle) * 0.6;
        fpWg.position.y = -0.22 - Math.sin(reloadAnimAngle) * 0.12;
      }
    }

    // ── Camera (third-person offset) ──
    const camDist = localPlayer.isADS ? 3.5 : 5;
    const camH    = localPlayer.isADS ? 2.0 : 2.5;
    const camOffset = new THREE.Vector3(
      Math.sin(localPlayer.yaw) * camDist,
      camH,
      Math.cos(localPlayer.yaw) * camDist
    );
    const targetCamPos = obj.position.clone().add(camOffset);
    Engine.camera.position.lerp(targetCamPos, 0.15);

    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), localPlayer.pitch + recoilPitch);
    const yawQuat   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), localPlayer.yaw + Math.PI);
    Engine.camera.quaternion.copy(yawQuat.multiply(pitchQuat));

    // ── Remote player limb animation ──
    if (isMoving) {
      const t = Date.now() * 0.008;
      const armL = obj.getObjectByName('armL');
      const armR = obj.getObjectByName('armR');
      const legL = obj.getObjectByName('legL');
      const legR = obj.getObjectByName('legR');
      const spd  = localPlayer.isSprinting ? 0.8 : 0.5;
      if (legL) legL.rotation.x = Math.sin(t) * spd;
      if (legR) legR.rotation.x = Math.sin(t+Math.PI) * spd;
      if (armL) armL.rotation.x = Math.sin(t+Math.PI) * spd * 0.6;
      if (armR) armR.rotation.x = Math.sin(t) * spd * 0.6;
    }

    updateAllLabels();

    Network.sendMove({
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { y: localPlayer.yaw },
      animation: isMoving ? (localPlayer.isSprinting ? 'sprint' : 'walk') : 'idle'
    });
  }

  function updateAllLabels() {
    const cam = Engine.camera;
    for (const rp of Object.values(remotePlayers)) {
      if (rp.object) {
        rp.object.traverse(child => {
          if (child.userData.isLabel) child.lookAt(cam.position);
        });
      }
    }
  }

  function addRemotePlayer(playerInfo) {
    const { id, username, skin, position, team } = playerInfo;
    if (remotePlayers[id]) return;
    const mesh = buildCharacter(skin||'default', false);
    mesh.position.set(position.x, position.y, position.z);
    mesh.userData.playerId = id;
    mesh.traverse(child => { child.userData.playerId = id; });
    const label = mesh.userData.nameLabel || createNameLabel(username);
    updateNameLabel(label, username, team);
    attachWeaponToPlayer(mesh, 'assault_rifle');
    Engine.scene.add(mesh);
    remotePlayers[id] = { object: mesh, username, health: 100, team, isAlive: true, weapon: 'assault_rifle' };
    return mesh;
  }

  function updateRemotePlayer(id, data) {
    const rp = remotePlayers[id];
    if (!rp) return;
    const { position, rotation, animation, weapon } = data;
    const obj = rp.object;
    obj.position.lerp(new THREE.Vector3(position.x, position.y, position.z), 0.25);
    if (rotation) obj.rotation.y = rotation.y;
    const t = Date.now() * 0.008;
    if (animation === 'walk' || animation === 'sprint') {
      const spd = animation === 'sprint' ? 0.8 : 0.5;
      const legL = obj.getObjectByName('legL');
      const legR = obj.getObjectByName('legR');
      const armL = obj.getObjectByName('armL');
      const armR = obj.getObjectByName('armR');
      if (legL) legL.rotation.x = Math.sin(t) * spd;
      if (legR) legR.rotation.x = Math.sin(t+Math.PI) * spd;
      if (armL) armL.rotation.x = Math.sin(t+Math.PI) * spd * 0.6;
      if (armR) armR.rotation.x = Math.sin(t) * spd * 0.6;
    }
    if (weapon && rp.weapon !== weapon) {
      rp.weapon = weapon;
      attachWeaponToPlayer(obj, weapon);
    }
  }

  function removeRemotePlayer(id) {
    const rp = remotePlayers[id];
    if (!rp) return;
    Engine.scene.remove(rp.object);
    delete remotePlayers[id];
  }

  function damageRemotePlayer(id, damage, headshot) {
    const rp = remotePlayers[id];
    if (!rp) return;
    rp.health = Math.max(0, rp.health - damage);
    rp.object.traverse(child => {
      if (child.isMesh && !child.userData.isLabel) {
        const origColor = child.material.color ? child.material.color.getHex() : 0xffffff;
        child.material.emissive && child.material.emissive.setHex(0xff0000);
        child.material.emissiveIntensity = 0.8;
        setTimeout(() => {
          if (child.material.emissive) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }, 150);
      }
    });
    if (rp.health <= 0) killRemotePlayer(id);
  }

  function killRemotePlayer(id) {
    const rp = remotePlayers[id];
    if (!rp) return;
    rp.isAlive = false;
    const obj = rp.object;
    let t = 0;
    const fall = (delta) => {
      t += delta * 3;
      obj.rotation.z = Math.min(Math.PI/2, t);
      obj.position.y = Math.max(-0.5, obj.position.y - delta);
      if (t >= 1) {
        Engine.removeFrameCallback(fall);
        setTimeout(() => { if (rp.object) obj.visible = false; }, 2000);
      }
    };
    Engine.onFrame(fall);
  }

  function respawnRemotePlayer(id, position) {
    const rp = remotePlayers[id];
    if (!rp) return;
    rp.isAlive = true; rp.health = 100;
    rp.object.visible = true;
    rp.object.rotation.z = 0;
    rp.object.position.set(position.x, position.y, position.z);
  }

  function setLocalHealth(hp, maxHp) {
    localPlayer.health = hp; localPlayer.maxHealth = maxHp;
    const pct = hp/maxHp*100;
    const bar = document.getElementById('health-bar');
    const txt = document.getElementById('hp-text');
    if (bar) { bar.style.width=pct+'%'; bar.style.background=hp<30?'#ff2020':hp<60?'#ff8800':'#22ff44'; }
    if (txt) txt.textContent = hp;
  }

  function setLocalArmor(armor) {
    localPlayer.armor = armor;
    const bar = document.getElementById('armor-bar');
    if (bar) bar.style.width = Math.min(100, armor)+'%';
  }

  function setLocalDead(killedBy) {
    localPlayer.isAlive = false;
    const screen = document.getElementById('death-screen');
    const text   = document.getElementById('killed-by-text');
    if (screen) screen.style.display = 'flex';
    if (text) text.textContent = `Eliminated by ${killedBy}`;
    let cd = 5;
    const cdEl = document.getElementById('respawn-countdown');
    const iv = setInterval(() => {
      cd--;
      if (cdEl) cdEl.textContent = cd;
      if (cd <= 0) clearInterval(iv);
    }, 1000);
  }

  function setLocalRespawn(position) {
    localPlayer.isAlive = true; localPlayer.health = localPlayer.maxHealth;
    localPlayer.velocity.set(0,0,0);
    if (localPlayer.object) {
      localPlayer.object.position.set(position.x, position.y, position.z);
      localPlayer.object.rotation.z = 0;
    }
    setLocalHealth(localPlayer.maxHealth, localPlayer.maxHealth);
    const screen = document.getElementById('death-screen');
    if (screen) screen.style.display = 'none';
  }

  function selectWeapon(weaponId) {
    localPlayer.weapon = weaponId;
    const weapon = WEAPONS_CLIENT[weaponId];
    if (weapon) {
      localPlayer.ammo.current  = weapon.magSize;
      localPlayer.ammo.reserve  = weapon.magSize * 3;
    }
    if (localPlayer.object) attachWeaponToPlayer(localPlayer.object, weaponId);
    switchFPWeapon(weaponId);
    updateAmmoHUD();
    const el = document.getElementById('hud-weapon-name');
    if (el) el.textContent = weapon?.name || weaponId;
    Network.sendWeaponChange(weaponId);
  }

  function updateAmmoHUD() {
    const cur = document.getElementById('hud-ammo-current');
    const res = document.getElementById('hud-ammo-reserve');
    if (cur) cur.textContent = localPlayer.ammo.current;
    if (res) res.textContent = localPlayer.ammo.reserve;
  }

  function showHitMarker(isHeadshot) {
    const hm = document.getElementById('hit-marker');
    if (!hm) return;
    hm.classList.add('active');
    if (isHeadshot) hm.classList.add('headshot');
    clearTimeout(hm._timer);
    hm._timer = setTimeout(() => hm.classList.remove('active','headshot'), 200);
  }

  function setSensitivity(s) { sensitivity = s * 0.001; }
  function setInvertY(v)     { invertY = v; }
  function setFOV(v) {
    fov = v;
    Engine.camera.fov = v;
    Engine.camera.updateProjectionMatrix();
  }
  function getLocalPosition() {
    return localPlayer.object ? localPlayer.object.position : new THREE.Vector3();
  }

  return {
    initLocal, buildPlayerMesh: buildCharacter,
    addRemotePlayer, updateRemotePlayer, removeRemotePlayer,
    damageRemotePlayer, killRemotePlayer, respawnRemotePlayer,
    setLocalHealth, setLocalArmor, setLocalDead, setLocalRespawn,
    selectWeapon, updateAmmoHUD, showHitMarker,
    setSensitivity, setInvertY, setFOV,
    getLocalPosition, startAutoFire, stopAutoFire,
    handleShoot, startReload,
    update,
    get localPlayer() { return localPlayer; },
    get remotePlayers() { return remotePlayers; }
  };
})();

// ── Weapons Client Config (mirrors server) ─────────────────────
const WEAPONS_CLIENT = {
  assault_rifle:   { name:'Zap-AR',    damage:25,  headMult:2.0, fireRate:600, magSize:30, reloadTime:2.0, range:100, spread:0.03,  auto:true,  recoil:0.012, color:0x444444 },
  shotgun:         { name:'BlastShot', damage:80,  headMult:1.5, fireRate:80,  magSize:8,  reloadTime:2.5, range:30,  spread:0.15,  auto:false, recoil:0.04,  color:0x8B4513 },
  sniper:          { name:'LongReach', damage:120, headMult:3.0, fireRate:40,  magSize:5,  reloadTime:3.0, range:500, spread:0.005, auto:false, recoil:0.06,  color:0x2F4F4F },
  smg:             { name:'BuzzSaw',   damage:15,  headMult:1.8, fireRate:900, magSize:40, reloadTime:1.8, range:50,  spread:0.06,  auto:true,  recoil:0.008, color:0x333333 },
  pistol:          { name:'QuickDraw', damage:35,  headMult:2.2, fireRate:350, magSize:12, reloadTime:1.2, range:60,  spread:0.02,  auto:false, recoil:0.022, color:0x555555 },
  rocket_launcher: { name:'BoomStick', damage:200, headMult:1.0, fireRate:30,  magSize:1,  reloadTime:3.5, range:200, spread:0.01,  auto:false, recoil:0.08,  color:0x8B0000 }
};
