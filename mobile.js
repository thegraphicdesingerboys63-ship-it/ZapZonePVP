// ════════════════════════════════════════════════════════════════
// Mobile Controls — Touch Joysticks + Buttons
// ════════════════════════════════════════════════════════════════

const MobileControls = (() => {
  let active = false;
  let leftJoystick = { x: 0, y: 0, active: false, id: null };
  let rightJoystick = { x: 0, y: 0, active: false, id: null, prevX: 0, prevY: 0 };
  let jumpPressed = false;
  let fireHeld = false;
  let fireInterval = null;

  const JOYSTICK_RADIUS = 50;

  function init() {
    const isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    active = isMobile;

    if (!isMobile) return;
    setupTouchControls();
    document.getElementById('mobile-controls').style.display = 'flex';
  }

  function setupTouchControls() {
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });

    // Fire button
    const fireBtn = document.getElementById('mobile-fire');
    if (fireBtn) {
      fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        fireHeld = true;
        PlayerController.handleShoot();
        fireInterval = setInterval(() => {
          if (fireHeld) PlayerController.handleShoot();
        }, 100);
      });
      fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        fireHeld = false;
        if (fireInterval) { clearInterval(fireInterval); fireInterval = null; }
      });
    }

    // Jump button
    const jumpBtn = document.getElementById('mobile-jump');
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        jumpPressed = true;
      });
      jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        jumpPressed = false;
      });
    }

    // Reload button
    const reloadBtn = document.getElementById('mobile-reload');
    if (reloadBtn) {
      reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        PlayerController.startReload();
      });
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen?.classList.contains('active')) return;

    Array.from(e.changedTouches).forEach(touch => {
      const x = touch.clientX, y = touch.clientY;
      const screenW = window.innerWidth;

      if (x < screenW * 0.45) {
        // Left side - movement joystick
        if (!leftJoystick.active) {
          leftJoystick.active = true;
          leftJoystick.id = touch.identifier;
          leftJoystick.startX = x;
          leftJoystick.startY = y;
          updateLeftJoystickVisual(x, y, 0, 0);
        }
      } else if (x > screenW * 0.55) {
        // Right side - camera joystick
        if (!rightJoystick.active) {
          rightJoystick.active = true;
          rightJoystick.id = touch.identifier;
          rightJoystick.startX = x;
          rightJoystick.startY = y;
          rightJoystick.prevX = x;
          rightJoystick.prevY = y;
        }
      }
    });
  }

  function onTouchMove(e) {
    e.preventDefault();
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen?.classList.contains('active')) return;

    Array.from(e.changedTouches).forEach(touch => {
      if (touch.identifier === leftJoystick.id && leftJoystick.active) {
        const dx = touch.clientX - leftJoystick.startX;
        const dy = touch.clientY - leftJoystick.startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const clamped = Math.min(dist, JOYSTICK_RADIUS);
        const angle = Math.atan2(dy, dx);
        leftJoystick.x = (clamped / JOYSTICK_RADIUS) * Math.cos(angle);
        leftJoystick.y = (clamped / JOYSTICK_RADIUS) * Math.sin(angle);
        updateLeftJoystickVisual(leftJoystick.startX, leftJoystick.startY,
          Math.cos(angle) * clamped, Math.sin(angle) * clamped);
      }

      if (touch.identifier === rightJoystick.id && rightJoystick.active) {
        const dx = touch.clientX - rightJoystick.prevX;
        const dy = touch.clientY - rightJoystick.prevY;
        rightJoystick.prevX = touch.clientX;
        rightJoystick.prevY = touch.clientY;

        // Apply camera rotation
        PlayerController.localPlayer.yaw -= dx * 0.003;
        const pitchDelta = dy * 0.003;
        PlayerController.localPlayer.pitch = Math.max(-Math.PI/2.5,
          Math.min(Math.PI/2.5, PlayerController.localPlayer.pitch - pitchDelta));
      }
    });
  }

  function onTouchEnd(e) {
    Array.from(e.changedTouches).forEach(touch => {
      if (touch.identifier === leftJoystick.id) {
        leftJoystick = { x: 0, y: 0, active: false, id: null };
        resetLeftJoystickVisual();
      }
      if (touch.identifier === rightJoystick.id) {
        rightJoystick.active = false;
        rightJoystick.id = null;
        rightJoystick.x = 0;
        rightJoystick.y = 0;
      }
    });
  }

  function updateLeftJoystickVisual(baseX, baseY, offsetX, offsetY) {
    const knob = document.getElementById('left-knob');
    const joystick = document.getElementById('left-joystick');
    if (!knob || !joystick) return;
    joystick.style.left = (baseX - 40) + 'px';
    joystick.style.top = (baseY - 40) + 'px';
    knob.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  function resetLeftJoystickVisual() {
    const knob = document.getElementById('left-knob');
    if (knob) knob.style.transform = 'translate(0,0)';
  }

  function getLeftJoystick() { return { x: leftJoystick.x, y: leftJoystick.y }; }
  function getRightJoystick() { return { x: rightJoystick.x, y: rightJoystick.y }; }

  return {
    init,
    getLeftJoystick, getRightJoystick,
    get active() { return active; },
    get jumpPressed() { return jumpPressed; },
    set jumpPressed(v) { jumpPressed = v; }
  };
})();
