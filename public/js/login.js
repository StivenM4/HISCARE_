/**
 * public/js/login.js
 * Funcionalidad interactiva y validación accesible para inicio de sesión HISCARE (Pantalla C.1)
 */

/**
 * Alterna la visibilidad de un campo de contraseña.
 * @param {string} id - ID del input de contraseña
 */
function togglePasswordVisibility(id) {
  var input = document.getElementById(id);
  if (!input) return;

  var isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  var btn = document.getElementById('btnTogglePassword') ||
            document.querySelector('[data-trace="C1-7-btn"]') ||
            (input.parentElement ? input.parentElement.querySelector('button') : null);

  if (btn) {
    var label = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
  }
}

// Exponer en el objeto global (window)
window.togglePasswordVisibility = togglePasswordVisibility;

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('formLogin') || document.getElementById('formSesionExpirada');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var submitBtn = document.getElementById('btnIngresar') || document.getElementById('btnIniciarRecuperar');
  var errorAlert = document.getElementById('loginError');
  var errorAlertText = document.getElementById('loginErrorText');
  var liveRegion = document.getElementById('loginLiveRegion');
  var toggleBtn = document.getElementById('btnTogglePassword') || document.querySelector('[data-trace="C1-7-btn"]');
  var capsLockBadge = document.getElementById('capsLockIndicator');

  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var submitOriginalHtml = submitBtn ? submitBtn.innerHTML : 'Ingresar';

  /* ========================================================================
     1. FONDO INTERACTIVO (CANVAS CLÍNICO + SPOTLIGHT + CONTROL DE PAUSA)
     ======================================================================== */
  (function initInteractiveBackground() {
    var bgEl = document.getElementById('hiscareLoginBg');
    var canvas = document.getElementById('hiscareClinicalCanvas');
    var ambientBtn = document.getElementById('btnToggleAmbient');
    var ambientText = document.getElementById('ambientToggleText');

    var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var prefersReduced = motionQuery ? motionQuery.matches : false;
    var userPaused = false;
    var rafId = null;
    var pointerRaf = null;

    var pointer = { x: -9999, y: -9999, active: false };
    var nodes = [];
    var width = 0;
    var height = 0;
    var dpr = 1;

    var palette = [
      'rgba(96, 165, 250, 0.55)',  // Cobalt
      'rgba(34, 211, 238, 0.50)',  // Surgical Cyan
      'rgba(52, 211, 153, 0.42)'   // Clinical Emerald
    ];

    function initNodes() {
      nodes = [];
      if (!width || !height) return;
      var count = Math.min(44, Math.max(18, Math.floor((width * height) / 34000)));
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.5) * 0.34,
          r: 1.4 + Math.random() * 1.9,
          color: palette[i % palette.length]
        });
      }
    }

    function resizeCanvas() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      initNodes();
      drawFrame(false);
    }

    function drawFrame(advance) {
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      var maxDist = 145;
      var i;
      var j;

      if (advance) {
        for (i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          n.x += n.vx;
          n.y += n.vy;

          if (pointer.active) {
            var dxp = n.x - pointer.x;
            var dyp = n.y - pointer.y;
            var distP = Math.hypot(dxp, dyp);
            if (distP > 0 && distP < 130) {
              var force = (130 - distP) / 130;
              n.x += (dxp / distP) * force * 0.65;
              n.y += (dyp / distP) * force * 0.65;
            }
          }

          if (n.x < -20) n.x = width + 20;
          if (n.x > width + 20) n.x = -20;
          if (n.y < -20) n.y = height + 20;
          if (n.y > height + 20) n.y = -20;
        }
      }

      // Conexiones de red clínica
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            var alpha = (1 - dist / maxDist) * 0.17;
            ctx.strokeStyle = 'rgba(56, 189, 248, ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodos clínicos
      for (i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop() {
      if (prefersReduced || userPaused || document.hidden) {
        rafId = null;
        return;
      }
      drawFrame(true);
      rafId = window.requestAnimationFrame(loop);
    }

    function startLoop() {
      if (prefersReduced || userPaused || document.hidden || rafId !== null) return;
      rafId = window.requestAnimationFrame(loop);
    }

    function stopLoop() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    if (canvas) {
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      startLoop();
    }

    if (bgEl && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) {
        if (prefersReduced || userPaused) return;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.active = true;

        if (pointerRaf === null) {
          pointerRaf = window.requestAnimationFrame(function () {
            bgEl.style.setProperty('--pointer-x', pointer.x + 'px');
            bgEl.style.setProperty('--pointer-y', pointer.y + 'px');
            pointerRaf = null;
          });
        }
      }, { passive: true });

      window.addEventListener('pointerleave', function () {
        pointer.active = false;
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    });

    if (motionQuery && typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', function (e) {
        prefersReduced = e.matches;
        if (prefersReduced) {
          stopLoop();
          drawFrame(false);
        } else {
          startLoop();
        }
      });
    }

    if (ambientBtn) {
      ambientBtn.addEventListener('click', function () {
        userPaused = !userPaused;
        document.body.classList.toggle('ambient-paused', userPaused);
        if (ambientText) {
          ambientText.textContent = userPaused ? 'Reanudar fondo' : 'Pausar fondo';
        }
        ambientBtn.setAttribute('aria-label', userPaused ? 'Reanudar animación de fondo' : 'Pausar animación de fondo');
        if (userPaused) {
          stopLoop();
        } else {
          startLoop();
        }
      });
    }
  })();

  if (!form) return;

  /* ========================================================================
     2. BOTÓN MOSTRAR / OCULTAR CONTRASEÑA
     ======================================================================== */
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      togglePasswordVisibility('password');
      if (passwordInput) {
        passwordInput.focus();
      }
    });
  }

  /* ========================================================================
     3. DETECTOR DE BLOQ MAYÚS (CAPSLOCK)
     ======================================================================== */
  function actualizarCapsLock(e) {
    if (!capsLockBadge) return;
    if (e && typeof e.getModifierState === 'function') {
      var activo = e.getModifierState('CapsLock');
      capsLockBadge.classList.toggle('d-none', !activo);
    }
  }

  if (passwordInput && capsLockBadge) {
    passwordInput.addEventListener('keydown', actualizarCapsLock);
    passwordInput.addEventListener('keyup', actualizarCapsLock);
    passwordInput.addEventListener('focus', actualizarCapsLock);
    passwordInput.addEventListener('blur', function () {
      capsLockBadge.classList.add('d-none');
    });
  }

  /* ========================================================================
     4. UTILIDADES DE ERRORES, ARIA Y VALIDACIÓN POST-INTERACCIÓN
     ======================================================================== */
  var fieldState = new WeakMap();
  var announceTimer = null;

  function announcePolite(msg) {
    if (!liveRegion) return;
    clearTimeout(announceTimer);
    liveRegion.textContent = '';
    announceTimer = setTimeout(function () {
      liveRegion.textContent = msg;
    }, 500);
  }

  function linkError(input, shown) {
    var errorId = input ? input.dataset.error : '';
    if (!errorId) return;
    var ids = (input.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(function (id) { return id && id !== errorId; });
    if (shown) ids.push(errorId);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  function obtenerMensajeCampo(input) {
    if (!input) return '';
    var val = input.value;
    if (input === emailInput) {
      var trimmed = val.trim();
      if (!trimmed) return 'Por favor ingrese su correo institucional.';
      if (!emailRegex.test(trimmed)) return 'Por favor ingrese una dirección de correo institucional válida.';
      return '';
    }
    if (input === passwordInput) {
      if (!val) return 'Por favor ingrese su contraseña.';
      if (val.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      return '';
    }
    return '';
  }

  function aplicarEstadoCampo(input, mostrarErrorVisual, anunciar) {
    if (!input) return true;
    var wrap = input.closest('.login-input-wrap');
    var feedbackEl = input.dataset.error ? document.getElementById(input.dataset.error) : null;
    var feedbackTextEl = feedbackEl ? feedbackEl.querySelector('span:last-child') : null;
    var mensajeError = obtenerMensajeCampo(input);
    var esValido = mensajeError === '';

    if (esValido) {
      input.setAttribute('aria-invalid', 'false');
      linkError(input, false);
      if (wrap) {
        wrap.classList.remove('is-field-invalid');
        wrap.classList.toggle('is-field-valid', input.value.trim().length > 0);
      }
      if (feedbackEl) {
        feedbackEl.classList.remove('is-visible');
      }
    } else {
      if (wrap) {
        wrap.classList.remove('is-field-valid');
      }
      if (mostrarErrorVisual) {
        input.setAttribute('aria-invalid', 'true');
        linkError(input, true);
        if (wrap) wrap.classList.add('is-field-invalid');
        if (feedbackTextEl) feedbackTextEl.textContent = mensajeError;
        if (feedbackEl) feedbackEl.classList.add('is-visible');
        if (anunciar) {
          var label = input.labels && input.labels[0] ? input.labels[0].textContent.trim() + ': ' : '';
          announcePolite(label + mensajeError);
        }
      }
    }

    return esValido;
  }

  function registrarValidacionCampo(input) {
    if (!input) return;

    input.addEventListener('input', function () {
      var state = fieldState.get(input) || { interacted: false, blurred: false };
      state.interacted = true;
      fieldState.set(input, state);

      ocultarError();
      var mensaje = obtenerMensajeCampo(input);
      if (mensaje === '') {
        aplicarEstadoCampo(input, false, false);
      } else if (state.blurred) {
        aplicarEstadoCampo(input, true, false);
      }
    });

    input.addEventListener('blur', function () {
      var state = fieldState.get(input) || { interacted: false, blurred: false };
      state.blurred = true;
      fieldState.set(input, state);

      if (state.interacted || input.value.trim().length > 0) {
        aplicarEstadoCampo(input, true, true);
      }
    });
  }

  registrarValidacionCampo(emailInput);
  registrarValidacionCampo(passwordInput);

  function mostrarError(mensaje) {
    if (errorAlert) {
      if (errorAlertText) {
        errorAlertText.textContent = mensaje;
      } else {
        errorAlert.textContent = mensaje;
      }
      errorAlert.classList.remove('d-none');
      errorAlert.focus();
    } else if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      window.Swal.fire({
        icon: 'error',
        title: 'Acceso Denegado',
        text: mensaje,
        confirmButtonText: 'Aceptar',
        buttonsStyling: false,
        customClass: {
          popup: 'hiscare-swal-modal',
          confirmButton: 'btn btn-primary px-4'
        }
      });
    } else if (typeof alert === 'function') {
      alert(mensaje);
    }
  }

  function ocultarError() {
    if (errorAlert) {
      errorAlert.classList.add('d-none');
    }
  }

  /* ========================================================================
     5. ENVÍO DEL FORMULARIO Y RESTAURACIÓN DE BFCACHE
     ======================================================================== */
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitOriginalHtml;
    }
  });

  form.addEventListener('submit', function (e) {
    ocultarError();

    var emailMsg = obtenerMensajeCampo(emailInput);
    var passwordMsg = obtenerMensajeCampo(passwordInput);

    if (emailInput) {
      fieldState.set(emailInput, { interacted: true, blurred: true });
      aplicarEstadoCampo(emailInput, true, false);
    }
    if (passwordInput) {
      fieldState.set(passwordInput, { interacted: true, blurred: true });
      aplicarEstadoCampo(passwordInput, true, false);
    }

    if (emailMsg) {
      e.preventDefault();
      mostrarError(emailMsg);
      if (emailInput) emailInput.focus();
      return;
    }

    if (passwordMsg) {
      e.preventDefault();
      mostrarError(passwordMsg);
      if (passwordInput) passwordInput.focus();
      return;
    }

    // Estado de envío exitoso: evitar envíos accidentales múltiples
    if (submitBtn) {
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span>Ingresando...</span>';
      // Deshabilitar en el siguiente ciclo de eventos para permitir que el formulario envíe
      setTimeout(function () {
        submitBtn.disabled = true;
      }, 0);
    }
  });
});
