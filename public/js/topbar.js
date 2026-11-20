// public/js/topbar.js — buscador global con debounce, dropdown y navegación móvil
document.addEventListener('DOMContentLoaded', () => {
  // 1. Control del menú lateral (Sidebar Drawer en móvil y colapsable en desktop >= 992px)
  const btnToggle = document.getElementById('btnToggleSidebar');
  const btnCerrar = document.getElementById('btnCerrarSidebar');
  const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');

  // Restaurar estado guardado en desktop
  try {
    if (window.innerWidth >= 992 && sessionStorage.getItem('hiscare_sidebar_collapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
      if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
    }
  } catch (e) {}

  function alternarSidebarDesktop() {
    const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
    try {
      sessionStorage.setItem('hiscare_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    } catch (e) {}
    if (btnToggle) btnToggle.setAttribute('aria-expanded', !isCollapsed ? 'true' : 'false');
  }

  function colapsarSidebarDesktop() {
    document.body.classList.add('sidebar-collapsed');
    try {
      sessionStorage.setItem('hiscare_sidebar_collapsed', 'true');
    } catch (e) {}
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
  }

  function abrirSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('sidebar-open');
    if (backdrop) backdrop.classList.add('show');
    document.body.classList.add('sidebar-active');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'true');
  }

  function cerrarSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.remove('show');
    document.body.classList.remove('sidebar-active');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
  }

  if (btnToggle && sidebar) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth >= 992) {
        alternarSidebarDesktop();
      } else {
        if (sidebar.classList.contains('sidebar-open')) {
          cerrarSidebar();
        } else {
          abrirSidebar();
        }
      }
    });
  }

  if (btnCerrar) {
    btnCerrar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth >= 992) {
        colapsarSidebarDesktop();
      } else {
        cerrarSidebar();
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', cerrarSidebar);
  }

  if (sidebar) {
    // Cerrar el drawer en móvil al hacer clic en cualquier enlace del menú
    sidebar.querySelectorAll('.sidebar-link').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 992) {
          cerrarSidebar();
        }
      });
    });
  }

  // Cerrar al presionar la tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('sidebar-open')) {
      cerrarSidebar();
    }
  });

  // Cerrar automáticamente si la pantalla se redimensiona a escritorio (>= 992px)
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 992 && sidebar && sidebar.classList.contains('sidebar-open')) {
      cerrarSidebar();
    }
  });

  // 1.5 Control de cambio de tema (Claro / Oscuro)
  const THEME_STORAGE_KEY = 'hiscare-theme';
  const btnToggleTheme = document.getElementById('btnToggleTheme');

  function obtenerTemaActual() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
  }

  function sincronizarBotonTema(theme) {
    if (!btnToggleTheme) return;
    const esOscuro = theme === 'dark';
    const iconMoon = btnToggleTheme.querySelector('[data-theme-icon="moon"]');
    const iconSun = btnToggleTheme.querySelector('[data-theme-icon="sun"]');
    const titulo = esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

    if (iconMoon) iconMoon.classList.toggle('d-none', esOscuro);
    if (iconSun) iconSun.classList.toggle('d-none', !esOscuro);
    btnToggleTheme.setAttribute('aria-label', 'Modo oscuro');
    btnToggleTheme.setAttribute('aria-pressed', esOscuro ? 'true' : 'false');
    btnToggleTheme.setAttribute('title', titulo);
  }

  function aplicarTema(theme, persistir = true) {
    const temaNormalizado = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', temaNormalizado);
    if (persistir) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, temaNormalizado);
      } catch (e) {}
    }
    sincronizarBotonTema(temaNormalizado);
  }

  sincronizarBotonTema(obtenerTemaActual());

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const nextTheme = obtenerTemaActual() === 'dark' ? 'light' : 'dark';
      aplicarTema(nextTheme, true);
    });
  }

  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) {
      aplicarTema(e.newValue === 'dark' ? 'dark' : 'light', false);
    }
  });

  // 2. Buscador global con debounce, dropdown y navegación
  const inputBuscar = document.getElementById('buscarGlobal');
  const dropdown = document.getElementById('buscarDropdown');
  const contenedorResultados = document.getElementById('buscarResultados');

  if (!inputBuscar || !dropdown || !contenedorResultados) return;

  function escaparHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function cerrarDropdown() {
    dropdown.classList.add('d-none');
    contenedorResultados.innerHTML = '';
  }

  function mostrarCargando() {
    dropdown.classList.remove('d-none');
    contenedorResultados.innerHTML = `
      <div class="text-center py-3 text-muted">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
          <span class="visually-hidden">Buscando...</span>
        </div>
        <span class="small">Buscando pacientes y órdenes...</span>
      </div>
    `;
  }

  function renderizarResultados(datos, query) {
    const pacientes = Array.isArray(datos.pacientes) ? datos.pacientes : [];
    const ordenes = Array.isArray(datos.ordenes) ? datos.ordenes : [];

    if (pacientes.length === 0 && ordenes.length === 0) {
      contenedorResultados.innerHTML = `
        <div class="p-3 text-center text-muted small">
          No se encontraron resultados para «<strong>${escaparHtml(query)}</strong>».
        </div>
      `;
      dropdown.classList.remove('d-none');
      return;
    }

    let html = '';

    // Sección de Pacientes
    if (pacientes.length > 0) {
      html += `
        <div class="dropdown-header text-uppercase small fw-bold text-primary px-3 pt-2 pb-1 d-flex align-items-center gap-1">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          Pacientes (${pacientes.length})
        </div>
      `;
      pacientes.forEach((p) => {
        const doc = escaparHtml(p.documento || p.numero_documento || '');
        const nom = escaparHtml(p.nombre || `${p.nombres || ''} ${p.apellidos || ''}`.trim());
        const id = encodeURIComponent(p.id);
        html += `
          <a href="/pacientes/${id}" class="dropdown-item py-2 px-3 search-result-item d-flex flex-column">
            <span class="fw-semibold text-dark">${nom}</span>
            <small class="text-muted">Doc: ${doc}</small>
          </a>
        `;
      });
    }

    // Separador si ambos tienen elementos
    if (pacientes.length > 0 && ordenes.length > 0) {
      html += `<hr class="dropdown-divider my-1">`;
    }

    // Sección de Órdenes
    if (ordenes.length > 0) {
      html += `
        <div class="dropdown-header text-uppercase small fw-bold text-primary px-3 pt-2 pb-1 d-flex align-items-center gap-1">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Órdenes (${ordenes.length})
        </div>
      `;
      ordenes.forEach((o) => {
        const cod = escaparHtml(o.codigo || '');
        const est = escaparHtml(o.estado || '');
        html += `
          <a href="/ordenes?codigo=${encodeURIComponent(o.codigo || '')}" class="dropdown-item py-2 px-3 search-result-item d-flex justify-content-between align-items-center">
            <span class="fw-semibold text-dark">${cod}</span>
            <span class="badge bg-light text-secondary border small">${est}</span>
          </a>
        `;
      });
    }

    contenedorResultados.innerHTML = html;
    dropdown.classList.remove('d-none');
  }

  let abortController = null;

  async function realizarBusqueda() {
    const q = inputBuscar.value.trim();
    if (q.length < 3) {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      cerrarDropdown();
      return;
    }

    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    const currentSignal = abortController.signal;

    mostrarCargando();

    try {
      const resp = await window.HIS.api('/api/busqueda?q=' + encodeURIComponent(q), { signal: currentSignal });
      // Validar que el término de búsqueda siga exactamente vigente antes de renderizar resultados
      if (inputBuscar.value.trim() === q && q.length >= 3) {
        renderizarResultados(resp || {}, q);
      } else if (inputBuscar.value.trim().length < 3) {
        cerrarDropdown();
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 20 || (err.message && err.message.includes('aborted'))) {
        return;
      }
      if (inputBuscar.value.trim() === q) {
        contenedorResultados.innerHTML = `
          <div class="p-3 text-center text-muted small">
            No se pudieron consultar los resultados en este momento.
          </div>
        `;
        dropdown.classList.remove('d-none');
      }
    } finally {
      if (abortController && abortController.signal === currentSignal) {
        abortController = null;
      }
    }
  }

  // Búsqueda con debounce de 300 ms
  const buscarDebounced = window.HIS.debounce(realizarBusqueda, 300);

  inputBuscar.addEventListener('input', () => {
    const q = inputBuscar.value.trim();
    if (q.length < 3) {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      cerrarDropdown();
    } else {
      buscarDebounced();
    }
  });

  inputBuscar.addEventListener('focus', () => {
    if (inputBuscar.value.trim().length >= 3 && contenedorResultados.children.length > 0) {
      dropdown.classList.remove('d-none');
    }
  });

  // Cerrar al pulsar Escape
  inputBuscar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarDropdown();
      inputBuscar.blur();
    }
  });

  // Cerrar al hacer clic fuera del componente buscador
  document.addEventListener('click', (e) => {
    const wrapper = inputBuscar.closest('.search-global-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      cerrarDropdown();
    }
  });
});
