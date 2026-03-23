// ════════════════════════════════════════════════════════════════
// ZapZone Game Engine — Three.js 3D Renderer
// ════════════════════════════════════════════════════════════════

const Engine = (() => {
  let renderer, scene, camera, clock;
  let animationId = null;
  let frameCallbacks = [];
  let isRunning = false;
  let quality = 'medium';
  let shadowsEnabled = true;

  const QUALITY_SETTINGS = {
    low:    { pixelRatio: 0.5, shadows: false, antialias: false, fogDensity: 0.008 },
    medium: { pixelRatio: 1.0, shadows: true,  antialias: true,  fogDensity: 0.005 },
    high:   { pixelRatio: 1.5, shadows: true,  antialias: true,  fogDensity: 0.003 },
    ultra:  { pixelRatio: 2.0, shadows: true,  antialias: true,  fogDensity: 0.002 }
  };

  function init(canvas) {
    clock = new THREE.Clock();
    const qs = QUALITY_SETTINGS[quality];

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: qs.antialias,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qs.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = qs.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, qs.fogDensity);

    camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3, -5);

    setupLighting();
    window.addEventListener('resize', onResize);
  }

  function setupLighting() {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    // Atmospheric fill lights
    const fill1 = new THREE.PointLight(0x0066ff, 0.8, 200);
    fill1.position.set(-60, 30, -60);
    scene.add(fill1);

    const fill2 = new THREE.PointLight(0xff3300, 0.5, 180);
    fill2.position.set(60, 20, 60);
    scene.add(fill2);

    const fill3 = new THREE.PointLight(0x00ff88, 0.4, 150);
    fill3.position.set(0, 25, -80);
    scene.add(fill3);

    // Hemisphere light for sky/ground color
    const hemi = new THREE.HemisphereLight(0x334466, 0x221100, 0.4);
    scene.add(hemi);
  }

  function buildMap(mapId) {
    // Clear old map objects
    const toRemove = [];
    scene.traverse(obj => { if (obj.userData.isMap) toRemove.push(obj); });
    toRemove.forEach(obj => scene.remove(obj));

    const mapGroup = new THREE.Group();
    mapGroup.userData.isMap = true;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(400, 400, 60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d4a1e,
      roughness: 0.9,
      metalness: 0.0
    });
    // Add subtle height variation
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), z = posAttr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      if (dist > 150) posAttr.setY(i, (dist - 150) * 0.2);
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    mapGroup.add(ground);

    // Asphalt paths
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 });
    const addPath = (x, z, w, d) => {
      const g = new THREE.BoxGeometry(w, 0.1, d);
      const m = new THREE.Mesh(g, pathMat);
      m.position.set(x, 0.05, z);
      m.receiveShadow = true;
      mapGroup.add(m);
    };
    addPath(0, 0, 200, 12);
    addPath(0, 0, 12, 200);
    addPath(60, 60, 100, 8);
    addPath(-60, -60, 8, 100);

    // Buildings
    const buildingConfigs = [
      { x: -50, z: -50, w: 18, h: 20, d: 18, color: 0x334455 },
      { x: 50, z: -50, w: 14, h: 30, d: 14, color: 0x445566 },
      { x: -50, z: 50, w: 22, h: 15, d: 16, color: 0x3d4444 },
      { x: 50, z: 50, w: 16, h: 25, d: 20, color: 0x554433 },
      { x: 0, z: -70, w: 20, h: 10, d: 14, color: 0x443355 },
      { x: -80, z: 0, w: 12, h: 35, d: 12, color: 0x334455 },
      { x: 80, z: 0, w: 18, h: 22, d: 18, color: 0x445544 },
      { x: 0, z: 80, w: 25, h: 12, d: 20, color: 0x554444 },
      { x: -30, z: -80, w: 10, h: 18, d: 10, color: 0x334466 },
      { x: 30, z: 80, w: 14, h: 28, d: 10, color: 0x443322 },
      { x: -70, z: 60, w: 16, h: 20, d: 12, color: 0x445533 },
      { x: 70, z: -60, w: 12, h: 16, d: 16, color: 0x554422 }
    ];

    buildingConfigs.forEach(cfg => addBuilding(mapGroup, cfg));

    // Crates / cover objects
    const cratePositions = [
      [10, 0, 10], [-10, 0, 10], [10, 0, -10], [-10, 0, -10],
      [25, 0, 0], [-25, 0, 0], [0, 0, 25], [0, 0, -25],
      [35, 0, 35], [-35, 0, 35], [35, 0, -35], [-35, 0, -35],
      [15, 0, 40], [-15, 0, 40], [15, 0, -40], [-15, 0, -40],
      [40, 0, 15], [40, 0, -15], [-40, 0, 15], [-40, 0, -15]
    ];
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
    cratePositions.forEach(([x, , z]) => {
      const size = 1.5 + Math.random() * 0.5;
      const geo = new THREE.BoxGeometry(size, size, size);
      const m = new THREE.Mesh(geo, crateMat);
      m.position.set(x, size / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.isCover = true;
      mapGroup.add(m);
    });

    // Walls / barriers
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });
    const addWall = (x, z, rx, w, h) => {
      const g = new THREE.BoxGeometry(w, h, 0.6);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = rx;
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.isCover = true;
      mapGroup.add(m);
    };
    addWall(20, 0, 0, 8, 2); addWall(-20, 0, 0, 8, 2);
    addWall(0, 20, Math.PI / 2, 8, 2); addWall(0, -20, Math.PI / 2, 8, 2);
    addWall(35, 15, Math.PI / 6, 6, 1.8); addWall(-35, -15, Math.PI / 6, 6, 1.8);

    // Neon light strips on buildings
    const neonColors = [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFF4400];
    buildingConfigs.slice(0, 6).forEach((cfg, i) => {
      const neonGeo = new THREE.BoxGeometry(cfg.w + 0.2, 0.3, 0.2);
      const neonMat = new THREE.MeshStandardMaterial({
        color: neonColors[i % neonColors.length],
        emissive: neonColors[i % neonColors.length],
        emissiveIntensity: 2
      });
      const neon = new THREE.Mesh(neonGeo, neonMat);
      neon.position.set(cfg.x, cfg.h + 0.5, cfg.z);
      mapGroup.add(neon);

      // Add point light at neon strip
      const light = new THREE.PointLight(neonColors[i % neonColors.length], 1.5, 30);
      light.position.set(cfg.x, cfg.h + 1, cfg.z);
      mapGroup.add(light);
    });

    // Skybox / sky dome
    const skyGeo = new THREE.SphereGeometry(450, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x0d1b2e,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    mapGroup.add(sky);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 400 + Math.random() * 40;
      starVerts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8 });
    mapGroup.add(new THREE.Points(starGeo, starMat));

    // Map boundary walls (invisible collision)
    const boundaryMat = new THREE.MeshBasicMaterial({ visible: false });
    const walls = [
      [0, 10, -100, 200, 20, 2],
      [0, 10, 100, 200, 20, 2],
      [-100, 10, 0, 2, 20, 200],
      [100, 10, 0, 2, 20, 200]
    ];
    walls.forEach(([x, y, z, w, h, d]) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, boundaryMat);
      m.position.set(x, y, z);
      m.userData.isBoundary = true;
      mapGroup.add(m);
    });

    scene.add(mapGroup);
    return mapGroup;
  }

  function addBuilding(group, { x, z, w, h, d, color }) {
    // Main building body
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.1
    });
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isBuilding = true;
    group.add(mesh);

    // Windows
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x88CCFF,
      emissive: 0x224488,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1,
      metalness: 0.5
    });
    const floors = Math.floor(h / 4);
    const winW = 1.2, winH = 1.5;
    for (let fl = 0; fl < floors; fl++) {
      const fy = fl * 4 + 2;
      // Front/back windows
      for (let wi = -Math.floor(w / 6); wi <= Math.floor(w / 6); wi++) {
        if (Math.random() > 0.2) {
          const wGeo = new THREE.PlaneGeometry(winW, winH);
          const wMeshF = new THREE.Mesh(wGeo, windowMat);
          wMeshF.position.set(x + wi * 4, h / 2 - h + fy, z + d / 2 + 0.1);
          group.add(wMeshF);
          const wMeshB = new THREE.Mesh(wGeo, windowMat);
          wMeshB.position.set(x + wi * 4, h / 2 - h + fy, z - d / 2 - 0.1);
          wMeshB.rotation.y = Math.PI;
          group.add(wMeshB);
        }
      }
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    animate();
  }

  function stop() {
    isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
  }

  function animate() {
    if (!isRunning) return;
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    frameCallbacks.forEach(cb => cb(delta, elapsed));
    renderer.render(scene, camera);
  }

  function onFrame(cb) { frameCallbacks.push(cb); }
  function removeFrameCallback(cb) { frameCallbacks = frameCallbacks.filter(f => f !== cb); }

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function setQuality(q) {
    quality = q;
    const qs = QUALITY_SETTINGS[q];
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qs.pixelRatio));
    renderer.shadowMap.enabled = qs.shadows;
    if (scene.fog) scene.fog.density = qs.fogDensity;
  }

  function createParticleSystem(config) {
    const { count = 50, color = 0xFF4400, speed = 5, lifetime = 1.0, size = 0.15 } = config;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed,
        (Math.random() - 0.5) * speed
      ));
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1 });
    const particles = new THREE.Points(geo, mat);
    particles.userData = { velocities, lifetime, elapsed: 0, alive: true };
    return particles;
  }

  function updateParticles(particles, delta) {
    if (!particles.userData.alive) return;
    particles.userData.elapsed += delta;
    const t = particles.userData.elapsed / particles.userData.lifetime;
    if (t >= 1) { particles.userData.alive = false; return; }
    particles.material.opacity = 1 - t;
    const positions = particles.geometry.attributes.position.array;
    particles.userData.velocities.forEach((v, i) => {
      positions[i * 3] += v.x * delta;
      positions[i * 3 + 1] += (v.y - 9.8 * particles.userData.elapsed) * delta;
      positions[i * 3 + 2] += v.z * delta;
    });
    particles.geometry.attributes.position.needsUpdate = true;
  }

  function spawnHitEffect(position, color = 0xFF4400) {
    const ps = createParticleSystem({ count: 30, color, speed: 6, lifetime: 0.5, size: 0.1 });
    ps.position.copy(position);
    scene.add(ps);
    const cleanup = (delta) => {
      updateParticles(ps, delta);
      if (!ps.userData.alive) {
        scene.remove(ps);
        removeFrameCallback(cleanup);
      }
    };
    onFrame(cleanup);
  }

  function spawnMuzzleFlash(position, direction) {
    const geo = new THREE.SphereGeometry(0.15, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFDD44, transparent: true, opacity: 1 });
    const flash = new THREE.Mesh(geo, mat);
    flash.position.copy(position);
    flash.position.addScaledVector(direction, 1.5);
    scene.add(flash);
    let t = 0;
    const fade = (delta) => {
      t += delta * 20;
      flash.material.opacity = Math.max(0, 1 - t);
      flash.scale.setScalar(1 + t * 2);
      if (t >= 1) {
        scene.remove(flash);
        removeFrameCallback(fade);
      }
    };
    onFrame(fade);
  }

  function spawnExplosion(position) {
    spawnHitEffect(position, 0xFF6600);
    const light = new THREE.PointLight(0xFF4400, 10, 20);
    light.position.copy(position);
    scene.add(light);
    let t = 0;
    const fade = (delta) => {
      t += delta * 5;
      light.intensity = Math.max(0, 10 * (1 - t));
      if (t >= 1) { scene.remove(light); removeFrameCallback(fade); }
    };
    onFrame(fade);
  }

  function spawnProjectileTrail(start, end, color = 0xFFFF00) {
    const points = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    let t = 0;
    const fade = (delta) => {
      t += delta * 10;
      line.material.opacity = Math.max(0, 0.8 - t);
      if (t >= 0.8) { scene.remove(line); removeFrameCallback(fade); }
    };
    onFrame(fade);
  }

  return {
    init, start, stop, buildMap, onFrame, removeFrameCallback,
    spawnHitEffect, spawnMuzzleFlash, spawnExplosion, spawnProjectileTrail,
    setQuality,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; }
  };
})();
