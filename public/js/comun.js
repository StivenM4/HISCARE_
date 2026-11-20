// public/js/comun.js — utilidades compartidas por todas las vistas de HISCARE
(function () {
  'use strict';

  // Helper para leer token CSRF desde el meta tag inyectado en el layout
  function obtenerCsrfToken() {
    return (typeof document !== 'undefined' && document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')) || '';
  }

  // Verifica si una cabecera ya incluye X-CSRF-Token
  function tieneCsrfHeader(headers) {
    if (!headers) return false;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.has('x-csrf-token') || headers.has('X-CSRF-Token');
    }
    if (Array.isArray(headers)) {
      return headers.some(([k]) => k && k.toLowerCase() === 'x-csrf-token');
    }
    if (typeof headers === 'object') {
      return Object.keys(headers).some(k => k.toLowerCase() === 'x-csrf-token');
    }
    return false;
  }

  // Comprueba si una URL es de mismo origen o ruta relativa
  function esMismoOrigen(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('//')) return false;
    if (url.startsWith('/')) return true;
    try {
      const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost';
      const u = new URL(url, origin);
      return u.origin === origin;
    } catch (e) {
      return false;
    }
  }

  // Envoltura transparente de fetch para adjuntar X-CSRF-Token a peticiones mutadoras de mismo origen
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const fetchOriginal = window.fetch;
    window.fetch = function (input, init = {}) {
      try {
        const token = obtenerCsrfToken();
        if (token) {
          let urlStr = '';
          if (typeof input === 'string') {
            urlStr = input;
          } else if (typeof URL !== 'undefined' && input instanceof URL) {
            urlStr = input.href;
          } else if (input && typeof input.url === 'string') {
            urlStr = input.url;
          }

          const metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          const esMutador = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);

          if (esMutador && esMismoOrigen(urlStr)) {
            const tieneEnInput = Boolean(input && input.headers && tieneCsrfHeader(input.headers));
            const tieneEnInit = Boolean(init && init.headers && tieneCsrfHeader(init.headers));

            if (!tieneEnInput && !tieneEnInit) {
              if (init && init.headers) {
                if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                  init.headers.set('X-CSRF-Token', token);
                } else if (Array.isArray(init.headers)) {
                  init.headers.push(['X-CSRF-Token', token]);
                } else if (typeof init.headers === 'object') {
                  init.headers['X-CSRF-Token'] = token;
                }
              } else if (input && input instanceof Request) {
                try {
                  input.headers.set('X-CSRF-Token', token);
                } catch (e) {
                  init = init || {};
                  const h = new Headers(input.headers);
                  h.set('X-CSRF-Token', token);
                  init.headers = h;
                }
              } else {
                init = init || {};
                init.headers = { 'X-CSRF-Token': token };
              }
            }
          }
        }
      } catch (err) {
        // En caso de error inesperado, permitir que fetch proceda normalmente
      }
      return fetchOriginal.call(this, input, init);
    };
  }

  // Intercepción global de submit para inyectar input _csrf si falta en formularios POST
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('submit', function (e) {
      const form = e.target;
      if (!form || form.nodeName !== 'FORM') return;
      const metodo = (form.getAttribute('method') || '').toLowerCase();
      if (metodo === 'post') {
        const token = obtenerCsrfToken();
        if (token && !form.querySelector('input[name="_csrf"]')) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = '_csrf';
          input.value = token;
          form.appendChild(input);
        }
      }
    }, true);
  }

  // Llamada a la API con manejo uniforme de sesión expirada, permisos y errores de negocio
  async function api(url, opciones = {}) {
    const token = obtenerCsrfToken();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { 'X-CSRF-Token': token } : {}),
      ...(opciones.headers || {})
    };

    const res = await fetch(url, {
      method: opciones.method || 'GET',
      headers,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      credentials: 'same-origin',
      signal: opciones.signal,
    });

    const datos = await res.json().catch(() => ({}));

    if (res.status === 401) {                    // C.27: guardar borradores y pedir reingreso
      guardarBorradores();
      if (typeof location !== 'undefined') {
        location.href = '/auth/sesion-expirada?next=' + encodeURIComponent(location.pathname + location.search);
      }
      throw new Error('SESION_EXPIRADA');
    }

    if (!res.ok) {
      const error = new Error((datos.error && datos.error.mensaje) || 'Error ' + res.status);
      error.status = res.status;
      error.datos = datos.error || {};
      throw error;
    }

    return datos.data !== undefined ? datos.data : datos;
  }

  // =========================================================================
  // ESCAPE HTML Y SWEETALERT2: MODALES, TOASTS Y CONFIRMACIONES CLÍNICAS
  // =========================================================================

  function escaparHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function anunciarCambio(mensaje, prioridad = 'polite') {
    if (mensaje == null) return;
    const texto = String(mensaje).trim();
    if (!texto) return;

    try {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
      const esAsertivo = prioridad === 'assertive' || prioridad === 'error' || prioridad === 'danger';
      const region = document.getElementById(esAsertivo ? 'hiscareLiveAssertive' : 'hiscareLivePolite');
      if (!region) return;

      if (region._hisLiveTimer && typeof clearTimeout === 'function') {
        clearTimeout(region._hisLiveTimer);
      }
      region.textContent = '';

      const asignar = () => {
        region.textContent = texto;
      };
      if (typeof setTimeout === 'function') {
        region._hisLiveTimer = setTimeout(asignar, 25);
      } else {
        asignar();
      }
    } catch (e) {
      // Fallo silencioso en entornos sin DOM completo
    }
  }

  function formatearEstadoCita(estado) {
    if (!estado) return '';
    const mapa = {
      EN_SALA: 'En sala de espera',
      NO_ASISTIO: 'No asistió'
    };
    return mapa[estado] || String(estado);
  }

  function mostrarMensaje(tipo, texto) {
    const cont = (typeof document !== 'undefined' && typeof document.getElementById === 'function')
      ? document.getElementById('alertas')
      : null;
    const claseAlerta = (tipo === 'error' || tipo === 'danger') ? 'danger' : (tipo === 'warning' ? 'warning' : (tipo === 'success' ? 'success' : 'info'));
    const prioridadLive = (tipo === 'error' || tipo === 'danger' || tipo === 'warning') ? 'assertive' : 'polite';

    anunciarCambio(texto, prioridadLive);

    // Render en DOM #alertas si existe (mantiene accesibilidad ARIA intacta con nodos seguros)
    if (cont) {
      const tieneLiveGlobal = Boolean(
        document.getElementById('hiscareLiveAssertive') || document.getElementById('hiscareLivePolite')
      );
      const div = document.createElement('div');
      div.className = `alert alert-${claseAlerta} alert-dismissible fade show shadow-sm`;
      if (!tieneLiveGlobal) {
        div.role = 'alert';
      }

      const span = document.createElement('span');
      span.textContent = texto;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-close';
      btn.setAttribute('data-bs-dismiss', 'alert');
      btn.setAttribute('aria-label', 'Cerrar');

      div.appendChild(span);
      div.appendChild(btn);

      cont.replaceChildren(div);
      setTimeout(() => {
        if (div.parentNode) {
          div.classList.remove('show');
          setTimeout(() => div.remove(), 150);
        }
      }, 6000);
    }

    // Limpieza defensiva tras destruir un modal de SweetAlert2 si no hay modales Bootstrap abiertos
    const limpiarResiduosSwal = () => {
      if (typeof document === 'undefined') return;
      if (!document.querySelector('.modal.show')) {
        document.documentElement.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
        document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
        if (!document.body.classList.contains('modal-open')) {
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }
    };

    // Si SweetAlert2 está disponible en la ventana
    if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      if (tipo === 'success' || tipo === 'info') {
        window.Swal.fire({
          toast: true,
          position: 'top-end',
          icon: tipo === 'success' ? 'success' : 'info',
          titleText: texto,
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true,
          customClass: { popup: 'hiscare-toast-popup' },
          didDestroy: limpiarResiduosSwal
        });
      } else {
        const iconoSwal = (tipo === 'danger' || tipo === 'error') ? 'error' : 'warning';
        window.Swal.fire({
          icon: iconoSwal,
          titleText: iconoSwal === 'error' ? 'Atención Clínica' : 'Advertencia',
          text: texto,
          heightAuto: false,
          confirmButtonText: 'Aceptar',
          buttonsStyling: false,
          customClass: {
            popup: 'hiscare-swal-modal',
            confirmButton: 'btn btn-primary px-4'
          },
          didDestroy: limpiarResiduosSwal
        });
      }
      return;
    }

    // Fallback cuando no existe contenedor #alertas ni SweetAlert2
    if (!cont && typeof alert === 'function') {
      return alert(texto);
    }
  }

  function toast(tipo, texto, duracion = 3500) {
    if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      const icon = (tipo === 'danger' || tipo === 'error') ? 'error' : (tipo === 'warning' ? 'warning' : (tipo === 'success' ? 'success' : 'info'));
      const prioridadLive = (tipo === 'error' || tipo === 'danger' || tipo === 'warning') ? 'assertive' : 'polite';
      anunciarCambio(texto, prioridadLive);
      return window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icon,
        titleText: texto,
        showConfirmButton: false,
        timer: duracion,
        timerProgressBar: true,
        customClass: { popup: 'hiscare-toast-popup' }
      });
    }
    return mostrarMensaje(tipo, texto);
  }

  function alerta(titulo, texto, icono = 'info') {
    if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      const icon = (icono === 'danger' || icono === 'error') ? 'error' : (icono === 'warning' ? 'warning' : icono);
      const prioridadLive = (icono === 'error' || icono === 'danger' || icono === 'warning') ? 'assertive' : 'polite';
      anunciarCambio(`${titulo ? titulo + ': ' : ''}${texto || ''}`, prioridadLive);
      return window.Swal.fire({
        titleText: titulo,
        text: texto,
        icon: icon,
        heightAuto: false,
        confirmButtonText: 'Entendido',
        buttonsStyling: false,
        customClass: {
          popup: 'hiscare-swal-modal',
          confirmButton: 'btn btn-primary px-4'
        }
      });
    }
    return mostrarMensaje(icono, `${titulo ? titulo + ': ' : ''}${texto}`);
  }

  function confirmar(opciones) {
    const opts = typeof opciones === 'string' ? { texto: opciones } : (opciones || {});
    const titulo = opts.titulo || '¿Está seguro de continuar?';
    const texto = opts.texto || '';
    const html = opts.html || undefined;
    const icono = opts.icono || (opts.peligroso ? 'warning' : 'question');
    const textoConfirmar = opts.textoConfirmar || (opts.peligroso ? 'Sí, continuar' : 'Aceptar');
    const textoCancelar = opts.textoCancelar || 'Cancelar';
    const peligroso = Boolean(opts.peligroso);

    if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      const swalOpts = {
        titleText: titulo,
        icon: icono,
        showCancelButton: true,
        focusCancel: true,
        reverseButtons: true,
        buttonsStyling: false,
        confirmButtonText: textoConfirmar,
        cancelButtonText: textoCancelar,
        customClass: {
          popup: 'hiscare-swal-modal',
          confirmButton: peligroso ? 'btn btn-danger px-3 me-2' : 'btn btn-primary px-3 me-2',
          cancelButton: 'btn btn-outline-secondary px-3'
        }
      };
      if (html) {
        swalOpts.html = html;
      } else {
        swalOpts.text = texto;
      }
      return window.Swal.fire(swalOpts).then(res => Boolean(res && res.isConfirmed));
    }

    const mensajeFallback = opts.texto || opts.titulo || '¿Desea continuar?';
    const resp = typeof confirm === 'function' ? confirm(mensajeFallback) : true;
    return Promise.resolve(Boolean(resp));
  }

  // =========================================================================
  // SELECT2: INICIALIZACIÓN Y SINCRONIZACIÓN REACTIVA
  // =========================================================================

  function inicializarSelect2(contenedor) {
    if (typeof window === 'undefined' || typeof window.jQuery === 'undefined' || !window.jQuery.fn || !window.jQuery.fn.select2) {
      return;
    }

    const $ = window.jQuery;
    let targetEl = document;
    if (contenedor) {
      targetEl = typeof contenedor === 'string' ? document.querySelector(contenedor) : contenedor;
    }
    if (!targetEl) return;

    let selects = [];
    if (targetEl.nodeName === 'SELECT') {
      selects = [targetEl];
    } else if (typeof targetEl.querySelectorAll === 'function') {
      selects = Array.from(targetEl.querySelectorAll('select'));
    }

    selects.forEach((el) => {
      // Excluir elementos no elegibles para Select2
      if (el.hasAttribute('data-no-select2')) return;
      if (el.closest('.dt-container, .dataTables_wrapper, .swal2-container, [data-no-select2]')) return;

      const $el = $(el);
      const esSmall = el.classList.contains('form-select-sm') || el.classList.contains('select2--small');
      const $modal = $el.closest('.modal');
      const dropdownParent = $modal.length ? $modal : undefined;

      const opcionesConfig = {
        theme: 'bootstrap-5',
        language: 'es',
        width: '100%',
        minimumResultsForSearch: 0,
        dropdownParent: dropdownParent,
        selectionCssClass: esSmall ? 'select2--small' : undefined,
        dropdownCssClass: esSmall ? 'select2--small' : undefined
      };

      // Si ya está inicializado, no duplicar
      if ($el.data('select2')) {
        return;
      }

      $el.select2(opcionesConfig);

      // Puente de eventos: select2 -> change nativo
      $el.off('select2:select.hisSync select2:clear.hisSync').on('select2:select.hisSync select2:clear.hisSync', function () {
        if (el._hisSelect2Sync) return;
        el._hisSelect2Sync = true;
        try {
          const ev = new Event('change', { bubbles: true });
          el.dispatchEvent(ev);
        } catch (err) {
        } finally {
          el._hisSelect2Sync = false;
        }
      });

      // Puente de eventos: change nativo -> select2
      $el.off('change.hisSync').on('change.hisSync', function () {
        if (el._hisSelect2Sync) return;
        el._hisSelect2Sync = true;
        try {
          $el.trigger('change.select2');
        } catch (err) {
        } finally {
          el._hisSelect2Sync = false;
        }
      });

      // MutationObserver para observar cambios dinámicos en las <option> o disabled
      if (!el._hisSelect2Observer && typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => {
          if ($el.data('select2')) {
            el._hisSelect2Sync = true;
            try {
              $el.trigger('change.select2');
            } catch (e) {
            } finally {
              el._hisSelect2Sync = false;
            }
          }
        });
        obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
        el._hisSelect2Observer = obs;
      }

      // Reinicialización al abrir modal si está encapsulado
      if ($modal.length && !$modal.data('his-select2-bound')) {
        $modal.data('his-select2-bound', true);
        $modal.on('shown.bs.modal', function () {
          $modal.find('select:not([data-no-select2])').each(function () {
            const $s = $(this);
            if ($s.data('select2')) {
              try {
                $s.select2('destroy');
              } catch (e) {}
              $s.select2({
                theme: 'bootstrap-5',
                language: 'es',
                width: '100%',
                minimumResultsForSearch: 0,
                dropdownParent: $modal
              });
            }
          });
        });
      }
    });
  }

  // =========================================================================
  // DATATABLES: MOTOR CLINICO EN ESPAÑOL Y GESTION DE CICLO DE VIDA
  // =========================================================================

  const IDIOMA_DATATABLES_ES = {
    processing: 'Procesando registros...',
    search: 'Buscar:',
    lengthMenu: 'Mostrar _MENU_ registros',
    info: 'Mostrando _START_ a _END_ de _TOTAL_ registros',
    infoEmpty: 'Mostrando 0 a 0 de 0 registros',
    infoFiltered: '(filtrado de _MAX_ registros en total)',
    loadingRecords: 'Cargando registros hospitalarios...',
    zeroRecords: 'No se encontraron registros coincidentes',
    emptyTable: 'No hay datos disponibles en esta tabla clínica',
    paginate: {
      first: 'Primero',
      previous: 'Anterior',
      next: 'Siguiente',
      last: 'Último'
    },
    aria: {
      sortAscending: ': activar para ordenar columna de forma ascendente',
      sortDescending: ': activar para ordenar columna de forma descendente'
    }
  };

  const TABLAS_EXCLUIDAS_DATATABLES = [
    'tablaMatrizPermisos',
    'tablaSignos',
    'tablaAnalitos',
    'tablaExamenes',
    'tablaProcedimientos',
    'tablaDiagnosticos',
    'tablaAdendas',
    'tablaContactos',
    'tablaMovimientos',
    'tablaFranjasHorarias',
    'tablaProfesionalesEspecialidad'
  ];

  function inicializarDataTable(tabla, opts = {}) {
    if (typeof window === 'undefined' || typeof window.jQuery === 'undefined') return null;
    const $ = window.jQuery;
    if (!$.fn || !$.fn.DataTable) return null;

    const el = typeof tabla === 'string' ? document.querySelector(tabla) : tabla;
    if (!el || el.nodeName !== 'TABLE') return null;

    // Verificar exclusiones de Categoría B
    if (el.id && TABLAS_EXCLUIDAS_DATATABLES.includes(el.id)) return null;
    if (el.closest('.no-datatable') || el.hasAttribute('data-no-datatable')) return null;

    // Limpiar fila placeholder con colspan si es la única fila en tbody
    const tbody = el.querySelector('tbody');
    if (tbody) {
      const filas = tbody.querySelectorAll('tr');
      if (filas.length === 1 && filas[0].querySelector('td[colspan]')) {
        filas[0].remove();
      }
    }

    // Desactivar ordenamiento en columnas de acciones (evita solapamiento con .dt-column-order en th.text-end)
    const ths = typeof el.querySelectorAll === 'function' ? el.querySelectorAll('thead th') : [];
    const indicesNoOrdenables = [];
    if (ths && typeof ths.forEach === 'function') {
      ths.forEach((th, idx) => {
        const texto = (th.textContent || '').trim().toLowerCase();
        const esColumnaAccion = texto === 'acciones' || texto === 'acción' || texto === 'accion' || texto === 'quitar';
        const tieneAttr = typeof th.getAttribute === 'function' && th.getAttribute('data-orderable') === 'false';
        if (esColumnaAccion && !tieneAttr && typeof th.setAttribute === 'function') {
          th.setAttribute('data-orderable', 'false');
        }
        if (esColumnaAccion || tieneAttr) {
          indicesNoOrdenables.push(idx);
        }
      });
    }

    // Opciones base accesibles y hospitalarias
    const configDefecto = {
      language: IDIOMA_DATATABLES_ES,
      responsive: true,
      pageLength: 10,
      lengthMenu: [5, 10, 25, 50],
      autoWidth: false,
      order: []
    };

    const configFinal = Object.assign({}, configDefecto, opts);
    if (indicesNoOrdenables.length > 0) {
      const prevDefs = Array.isArray(configFinal.columnDefs) ? configFinal.columnDefs : [];
      configFinal.columnDefs = prevDefs.concat([{ targets: indicesNoOrdenables, orderable: false }]);
    }

    // Destruir instancia previa si existe
    destruirDataTable(el);

    try {
      const dtInstance = $(el).DataTable(configFinal);
      el._hisDataTable = dtInstance;
      return dtInstance;
    } catch (err) {
      return null;
    }
  }

  function destruirDataTable(tabla) {
    if (typeof window === 'undefined' || typeof window.jQuery === 'undefined') return;
    const $ = window.jQuery;
    const el = typeof tabla === 'string' ? document.querySelector(tabla) : tabla;
    if (!el) return;

    try {
      if (el._hisDataTable && typeof el._hisDataTable.destroy === 'function') {
        el._hisDataTable.destroy();
        el._hisDataTable = null;
      } else if ($.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(el)) {
        $(el).DataTable().destroy();
      }
    } catch (e) {
      // Ignorar errores durante la destrucción
    }
  }

  function refrescarDataTable(tabla, fnRender, opts = {}) {
    destruirDataTable(tabla);
    if (typeof fnRender === 'function') {
      fnRender();
    }
    return inicializarDataTable(tabla, opts);
  }

  // Utilidad debounce para búsquedas e interacciones
  const debounce = (fn, ms = 300) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  // Formateador de tiempo relativo en español (ej. "hace 5 minutos")
  function tiempoRelativo(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    const ahora = Date.now();
    const diffSeg = Math.floor((ahora - d.getTime()) / 1000);

    if (diffSeg < 0) return 'en el futuro';
    if (diffSeg < 30) return 'hace un momento';
    if (diffSeg < 60) return `hace ${diffSeg} segundos`;

    const diffMin = Math.floor(diffSeg / 60);
    if (diffMin < 60) return `hace ${diffMin} minuto${diffMin === 1 ? '' : 's'}`;

    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `hace ${diffHoras} hora${diffHoras === 1 ? '' : 's'}`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 30) return `hace ${diffDias} día${diffDias === 1 ? '' : 's'}`;

    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) return `hace ${diffMeses} mes${diffMeses === 1 ? '' : 'es'}`;

    const diffAnios = Math.floor(diffDias / 365);
    return `hace ${diffAnios} año${diffAnios === 1 ? '' : 's'}`;
  }

  // HIS-E-06: los campos con data-borrador se guardan localmente y se recuperan al volver
  const clave = (el) => {
    const path = typeof location !== 'undefined' ? location.pathname : '';
    return 'hiscare:borrador:' + path + ':' + (el.dataset ? el.dataset.borrador : el.getAttribute('data-borrador'));
  };

  let silenciarDeteccionSucio = false;
  let proteccionSalidaConfigurada = false;
  const formulariosSucios = new Set();

  function leerValorControl(el) {
    if (!el) return '';
    const tipo = (el.type || '').toLowerCase();
    if (tipo === 'checkbox' || tipo === 'radio') {
      return el.checked ? '1' : '0';
    }
    if (el.nodeName === 'SELECT' && el.multiple && el.options) {
      return Array.from(el.options).filter((o) => o.selected).map((o) => o.value).join(',');
    }
    return el.value != null ? String(el.value) : '';
  }

  function obtenerValorPorDefecto(el) {
    if (!el) return '';
    const tipo = (el.type || '').toLowerCase();
    if (tipo === 'checkbox' || tipo === 'radio') {
      return el.defaultChecked ? '1' : '0';
    }
    if (el.nodeName === 'SELECT' && el.options) {
      const opts = Array.from(el.options);
      if (el.multiple) {
        return opts.filter((o) => o.defaultSelected).map((o) => o.value).join(',');
      }
      const def = opts.find((o) => o.defaultSelected) || opts[0];
      return def ? String(def.value) : '';
    }
    return el.defaultValue != null ? String(el.defaultValue) : '';
  }

  function obtenerValorInicial(el) {
    if (!el) return '';
    if (el._hisValorInicial !== undefined) return el._hisValorInicial;
    return obtenerValorPorDefecto(el);
  }

  function esElementoExcluidoProteccion(el) {
    if (!el) return true;
    if (el.id === 'buscarGlobal') return true;
    if (typeof el.hasAttribute === 'function' && el.hasAttribute('data-sin-confirmacion')) return true;
    if (typeof el.closest === 'function' && el.closest('.dt-container, .dataTables_wrapper, .swal2-container, [data-sin-confirmacion]')) {
      return true;
    }
    return false;
  }

  function esControlNoRastreable(el) {
    if (!el || esElementoExcluidoProteccion(el)) return true;
    const tipo = (el.type || '').toLowerCase();
    if (tipo === 'hidden' || tipo === 'submit' || tipo === 'button' || tipo === 'reset' || tipo === 'image') return true;
    if (el.disabled || el.readOnly) return true;
    return false;
  }

  function esFormularioRastreable(form) {
    if (!form || form.nodeName !== 'FORM') return false;
    if (typeof form.hasAttribute === 'function' && form.hasAttribute('data-sin-confirmacion')) return false;
    if (form.id === 'formFiltroFechaDashboard' || form.id === 'formFiltrosOrdenes') return false;
    const metodoAttr = typeof form.getAttribute === 'function' ? form.getAttribute('method') : null;
    if (metodoAttr && metodoAttr.trim().toLowerCase() === 'get') return false;
    const action = (typeof form.getAttribute === 'function' ? (form.getAttribute('action') || '') : (form.action || '')).trim();
    if (action.includes('/auth/logout')) return false;
    if (typeof form.closest === 'function' && form.closest('.dt-container, .dataTables_wrapper, .swal2-container, [data-sin-confirmacion]')) {
      return false;
    }
    return true;
  }

  function obtenerControlesFormulario(form) {
    if (!form) return [];
    if (typeof form.querySelectorAll === 'function') {
      const lista = Array.from(form.querySelectorAll('input, textarea, select'));
      if (lista.length > 0) return lista;
    }
    if (form.elements) {
      return Array.from(form.elements);
    }
    return [];
  }

  function capturarEstadoInicialFormulario(form) {
    obtenerControlesFormulario(form).forEach((ctrl) => {
      if (!esControlNoRastreable(ctrl)) {
        ctrl._hisValorInicial = leerValorControl(ctrl);
      }
    });
  }

  function capturarEstadoInicialTodos() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('form').forEach((form) => {
      if (esFormularioRastreable(form)) {
        capturarEstadoInicialFormulario(form);
      }
    });
    document.querySelectorAll('[data-borrador]').forEach((el) => {
      if (!esControlNoRastreable(el)) {
        el._hisValorInicial = leerValorControl(el);
      }
    });
  }

  function resolverObjetivoFormulario(form) {
    if (!form) return null;
    if (typeof form === 'string' && typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      return document.querySelector(form);
    }
    return form;
  }

  function marcarFormularioSucio(form) {
    const objetivo = resolverObjetivoFormulario(form);
    if (objetivo && typeof objetivo === 'object') {
      objetivo._hisSucioManual = true;
      formulariosSucios.add(objetivo);
    } else {
      formulariosSucios.add('__global__');
    }
  }

  function marcarFormularioLimpio(form) {
    if (form !== undefined && form !== null) {
      const objetivo = resolverObjetivoFormulario(form);
      if (objetivo && typeof objetivo === 'object') {
        objetivo._hisSucioManual = false;
        formulariosSucios.delete(objetivo);
        if (objetivo.nodeName === 'FORM') {
          obtenerControlesFormulario(objetivo).forEach((ctrl) => {
            formulariosSucios.delete(ctrl);
            if (!esControlNoRastreable(ctrl)) {
              ctrl._hisValorInicial = leerValorControl(ctrl);
            }
          });
        } else if (!esControlNoRastreable(objetivo)) {
          objetivo._hisValorInicial = leerValorControl(objetivo);
        }
      }
      return;
    }

    formulariosSucios.forEach((item) => {
      if (item && typeof item === 'object') {
        item._hisSucioManual = false;
      }
    });
    formulariosSucios.clear();
    capturarEstadoInicialTodos();
  }

  function tieneCambiosSinGuardar() {
    return formulariosSucios.size > 0;
  }

  function controlModificado(el) {
    return leerValorControl(el) !== obtenerValorInicial(el);
  }

  function manejarCambioControlProteccion(el) {
    if (silenciarDeteccionSucio || !el || esControlNoRastreable(el)) return;
    const esBorrador = Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-borrador'));
    const form = el.form || (typeof el.closest === 'function' ? el.closest('form') : null);

    if (form && esFormularioRastreable(form)) {
      const controles = obtenerControlesFormulario(form);
      const algunoModificado = controles.length > 0
        ? controles.some((ctrl) => !esControlNoRastreable(ctrl) && controlModificado(ctrl))
        : controlModificado(el);
      if (algunoModificado) {
        formulariosSucios.add(form);
      } else if (!form._hisSucioManual) {
        formulariosSucios.delete(form);
      }
      return;
    }

    if (esBorrador) {
      if (controlModificado(el)) {
        formulariosSucios.add(el);
      } else if (!el._hisSucioManual) {
        formulariosSucios.delete(el);
      }
    }
  }

  function configurarProteccionSalida() {
    capturarEstadoInicialTodos();
    if (proteccionSalidaConfigurada) return;
    proteccionSalidaConfigurada = true;

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('focusin', (e) => {
        const el = e && e.target;
        if (!el || esControlNoRastreable(el) || el._hisValorInicial !== undefined) return;
        const form = el.form || (typeof el.closest === 'function' ? el.closest('form') : null);
        const esBorrador = Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-borrador'));
        if (esBorrador || (form && esFormularioRastreable(form))) {
          el._hisValorInicial = leerValorControl(el);
        }
      });

      document.addEventListener('input', (e) => {
        if (e && e.target) manejarCambioControlProteccion(e.target);
      });

      document.addEventListener('change', (e) => {
        if (e && e.target) manejarCambioControlProteccion(e.target);
      });

      document.addEventListener('reset', (e) => {
        const form = e && e.target;
        if (form && form.nodeName === 'FORM') {
          const limpiar = () => marcarFormularioLimpio(form);
          if (typeof setTimeout === 'function') setTimeout(limpiar, 0);
          else limpiar();
        }
      });

      document.addEventListener('click', (e) => {
        if (!e || e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0)) return;
        const target = e.target;
        const enlace = target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
        if (!enlace || typeof enlace.getAttribute !== 'function') return;

        const href = (enlace.getAttribute('href') || '').trim();
        if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
        if (enlace.getAttribute('target') === '_blank' || (typeof enlace.hasAttribute === 'function' && enlace.hasAttribute('download'))) return;
        if (typeof enlace.hasAttribute === 'function' && (enlace.hasAttribute('data-bs-toggle') || enlace.hasAttribute('data-sin-confirmacion'))) return;
        if (typeof enlace.closest === 'function' && enlace.closest('[data-sin-confirmacion], .swal2-container')) return;
        if (!tieneCambiosSinGuardar()) return;

        e.preventDefault();
        confirmar({
          titulo: 'Cambios sin guardar',
          texto: 'Tiene datos sin guardar. ¿Está seguro de que desea salir de esta página?',
          icono: 'warning',
          textoConfirmar: 'Salir sin guardar',
          textoCancelar: 'Seguir editando',
          peligroso: true
        }).then((confirmado) => {
          if (confirmado) {
            marcarFormularioLimpio();
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = href;
            }
          }
        });
      });
    }

    const manejarSubmitNativo = (e) => {
      if (e && !e.defaultPrevented && e.target && e.target.nodeName === 'FORM') {
        marcarFormularioLimpio(e.target);
      }
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('submit', manejarSubmitNativo, false);
      window.addEventListener('beforeunload', (e) => {
        if (tieneCambiosSinGuardar()) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    } else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('submit', manejarSubmitNativo, false);
    }
  }

  function guardarBorradores() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('[data-borrador]').forEach((el) => {
      try {
        if (el.value && el.value.trim().length > 0) {
          localStorage.setItem(clave(el), el.value);
        } else {
          localStorage.removeItem(clave(el));
        }
      } catch (e) { /* sin almacenamiento disponible */ }
    });
  }

  function recuperarBorradores() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    let algunRecuperado = false;
    silenciarDeteccionSucio = true;
    try {
      document.querySelectorAll('[data-borrador]').forEach((el) => {
        try {
          const v = localStorage.getItem(clave(el));
          if (v && !el.disabled && v !== el.value) {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof window !== 'undefined' && typeof window.jQuery !== 'undefined') {
              try {
                const $el = window.jQuery(el);
                if ($el.data('select2')) {
                  $el.trigger('change.select2');
                }
              } catch (e) {}
            }
            algunRecuperado = true;
          }
        } catch (e) { /* sin almacenamiento disponible */ }
      });
    } finally {
      silenciarDeteccionSucio = false;
    }
    if (algunRecuperado) {
      mostrarMensaje('info', 'Se recuperó su borrador.');
    }
  }

  function limpiarBorrador(el) {
    try {
      localStorage.removeItem(clave(el));
    } catch (e) { /* nada */ }
  }

  function limpiarTodosBorradores() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('[data-borrador]').forEach((el) => {
      limpiarBorrador(el);
    });
  }

  // Auto-guardado ante eventos input y change en campos con data-borrador
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('input', (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-borrador')) {
        try {
          if (e.target.value && e.target.value.trim().length > 0) {
            localStorage.setItem(clave(e.target), e.target.value);
          } else {
            localStorage.removeItem(clave(e.target));
          }
        } catch (err) { /* almacenamiento no disponible */ }
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-borrador')) {
        try {
          if (e.target.value && e.target.value.trim().length > 0) {
            localStorage.setItem(clave(e.target), e.target.value);
          } else {
            localStorage.removeItem(clave(e.target));
          }
        } catch (err) { /* almacenamiento no disponible */ }
      }
    });
  }

  // Campana: conteo de notificaciones no leídas cada 30 s (C.2 [2.12], C.11)
  let ultimoConteoNotif = null;
  async function actualizarConteo() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    try {
      const d = await api('/api/notificaciones/no-leidas/conteo');
      const b = document.getElementById('notifCount');
      if (b && d) {
        const conteo = typeof d.conteo !== 'undefined' ? Number(d.conteo) : 0;
        const conteoPrevio = ultimoConteoNotif !== null
          ? ultimoConteoNotif
          : (b.hidden ? 0 : (parseInt(b.textContent, 10) || 0));
        b.textContent = conteo > 99 ? '99+' : conteo;
        b.hidden = conteo <= 0;
        if (conteo > conteoPrevio) {
          const nuevas = conteo - conteoPrevio;
          anunciarCambio(
            nuevas === 1
              ? `Tienes 1 notificación nueva sin leer. Total sin leer: ${conteo}.`
              : `Tienes ${nuevas} notificaciones nuevas sin leer. Total sin leer: ${conteo}.`,
            'polite'
          );
        }
        ultimoConteoNotif = conteo;
      }
    } catch (e) {
      // Si la ruta aún no está montada o falla temporalmente, no interrumpir la navegación
    }
  }

  // Inicialización global en DOMContentLoaded
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    configurarProteccionSalida();
    document.addEventListener('DOMContentLoaded', () => {
      recuperarBorradores();
      configurarProteccionSalida();
      if (document.getElementById('notifCount') || document.getElementById('btnCampana')) {
        const gestionadoPorNotificaciones = Boolean(
          (typeof window !== 'undefined' && window.HIS && window.HIS.notificaciones) ||
          document.querySelector('script[src*="notificaciones.js"]')
        );
        if (!gestionadoPorNotificaciones) {
          actualizarConteo();
          setInterval(actualizarConteo, 30000);
        }
      }

      // Alertas flash del servidor renderizadas en _alertas.ejs: toast discreto
      if (typeof window !== 'undefined' && typeof window.Swal !== 'undefined') {
        const errAlert = document.querySelector('#alertas .alert-danger');
        const infoAlert = document.querySelector('#alertas .alert-info');
        const okAlert = document.querySelector('#alertas .alert-success');
        if (errAlert) {
          const t = errAlert.querySelector('div')?.textContent?.trim() || errAlert.textContent?.trim();
          if (t) toast('error', t, 5000);
        } else if (okAlert) {
          const t = okAlert.querySelector('div')?.textContent?.trim() || okAlert.textContent?.trim();
          if (t) toast('success', t, 4000);
        } else if (infoAlert) {
          const t = infoAlert.querySelector('div')?.textContent?.trim() || infoAlert.textContent?.trim();
          if (t) toast('info', t, 4000);
        }
      }

      // Auto-inicializar Select2 en todos los selects de la página
      inicializarSelect2(document);

      // Auto-inicializar DataTables en tablas SSR completas
      const tablasAutoCompletas = [
        '#tablaAtenciones',
        '#tablaCitasDashboard'
      ];
      tablasAutoCompletas.forEach((sel) => {
        const t = document.querySelector(sel);
        if (t) inicializarDataTable(t);
      });
    });
  }

  if (typeof setInterval === 'function') {
    setInterval(guardarBorradores, 30000);
  }

  // Exposición en el espacio de nombres global HIS y compatibilidad HISCARE
  const API_GLOBAL = {
    obtenerCsrfToken,
    escaparHtml,
    escapeHtml: escaparHtml,
    api,
    anunciarCambio,
    formatearEstadoCita,
    mostrarMensaje,
    toast,
    alerta,
    confirmar,
    inicializarSelect2,
    inicializarDataTable,
    destruirDataTable,
    refrescarDataTable,
    debounce,
    tiempoRelativo,
    limpiarBorrador,
    limpiarTodosBorradores,
    guardarBorradores,
    recuperarBorradores,
    actualizarConteo,
    marcarFormularioSucio,
    marcarFormularioLimpio,
    tieneCambiosSinGuardar,
    configurarProteccionSalida
  };

  if (typeof window !== 'undefined') {
    window.HIS = API_GLOBAL;
    window.HISCARE = API_GLOBAL;
  }
})();