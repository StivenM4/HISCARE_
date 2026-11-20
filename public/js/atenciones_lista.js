// public/js/atenciones_lista.js — Cambio dinámico de pestañas en listado de atenciones sin recargar la página
(function () {
  'use strict';

  const escaparHtml = (str) => {
    if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.escaparHtml === 'function') {
      return window.HIS.escaparHtml(str);
    }
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  function construirFilasHtml(atenciones) {
    if (!Array.isArray(atenciones) || atenciones.length === 0) {
      return `
        <tr>
          <td colspan="7" class="text-center text-muted py-5">
            <div class="mb-2">
              <svg width="32" height="32" fill="currentColor" class="text-secondary opacity-50" viewBox="0 0 16 16">
                <path d="M9.5 0a.5.5 0 0 1 .5.5.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5V2a.5.5 0 0 1-.5.5h-5A.5.5 0 0 1 5 2v-.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5.5.5 0 0 1 .5-.5z"/>
                <path d="M3 2.5a.5.5 0 0 1 .5-.5H4a1.5 1.5 0 0 0 1.4-1H6a.5.5 0 0 1 0 1h-.5a.5.5 0 0 0-.5.5V3h6v-.5a.5.5 0 0 0-.5-.5H10a.5.5 0 0 1 0-1h.6a1.5 1.5 0 0 0 1.4 1h.5a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5z"/>
              </svg>
            </div>
            No se encontraron atenciones clínicas registradas.
          </td>
        </tr>
      `;
    }

    return atenciones.map((a) => {
      const idEnc = encodeURIComponent(a.id || '');
      const fechaTexto = escaparHtml(a.fecha_formateada || a.hora || '');
      const pacienteNombre = escaparHtml(a.paciente_nombre || '');
      const docTexto = escaparHtml(a.documento || '');
      const edadTexto = a.edad != null ? ` · ${escaparHtml(a.edad)} años` : '';
      const sexoTexto = a.sexo ? ` · ${escaparHtml(a.sexo)}` : '';
      const epsTexto = escaparHtml(a.eps || 'Sin EPS');
      const medicoTexto = escaparHtml(a.medico_nombre || '');
      const motivoRaw = a.motivo_consulta || '';
      const motivoAttr = escaparHtml(motivoRaw);
      const motivoHtml = motivoRaw
        ? escaparHtml(motivoRaw)
        : '<em class="text-muted">Sin motivo registrado</em>';

      const esAbierta = a.estado === 'ABIERTA';
      const badgeEstado = esAbierta
        ? '<span class="badge rounded-pill badge-estado-en-sala">ABIERTA</span>'
        : '<span class="badge rounded-pill badge-estado-atendida">CERRADA</span>';
      const btnAccion = esAbierta
        ? `<a href="/atenciones/${idEnc}/consulta" class="btn btn-sm btn-primary fw-semibold px-3">Atender</a>`
        : `<a href="/atenciones/${idEnc}/consulta" class="btn btn-sm btn-outline-secondary px-3">Ver atención</a>`;

      return `
        <tr>
          <td class="ps-4 py-3 text-nowrap">
            <div class="fw-semibold text-dark">${fechaTexto}</div>
          </td>
          <td class="py-3">
            <div class="fw-bold text-dark">${pacienteNombre}</div>
            <div class="small text-muted">${docTexto}${edadTexto}${sexoTexto}</div>
          </td>
          <td class="py-3 text-nowrap">
            <span class="badge bg-light text-dark border">${epsTexto}</span>
          </td>
          <td class="py-3 text-nowrap">
            <div class="small fw-semibold text-secondary">${medicoTexto}</div>
          </td>
          <td class="py-3" style="max-width: 250px;">
            <div class="text-truncate small text-secondary" title="${motivoAttr}">${motivoHtml}</div>
          </td>
          <td class="py-3 text-nowrap">${badgeEstado}</td>
          <td class="pe-4 py-3 text-end text-nowrap">${btnAccion}</td>
        </tr>
      `;
    }).join('');
  }

  function initAtencionesLista() {
    const tabla = document.getElementById('tablaAtenciones');
    const navTabs = document.getElementById('tabsFiltroAtenciones') ||
      document.querySelector('main .nav.nav-pills') ||
      (typeof document.querySelectorAll === 'function'
        ? Array.from(document.querySelectorAll('.nav.nav-pills') || []).find((el) => {
            if (el.classList && el.classList.contains('sidebar-menu')) return false;
            const navLinks = typeof el.querySelectorAll === 'function' ? Array.from(el.querySelectorAll('a.nav-link') || []) : [];
            return navLinks.some((a) => {
              const href = typeof a.getAttribute === 'function' ? (a.getAttribute('href') || '') : '';
              return href.includes('todos=') || (a.dataset && a.dataset.todos !== undefined);
            });
          })
        : null);
    if (!tabla || !navTabs) return;

    const links = Array.from(navTabs.querySelectorAll('a.nav-link'));
    if (!links.length) return;

    links.forEach((link) => {
      link.addEventListener('click', async (e) => {
        const href = link.getAttribute('href') || '';
        if (!href.startsWith('/atenciones')) return;

        e.preventDefault();
        const esTodos = href.includes('todos=true') || link.dataset.todos === 'true';
        const urlAjax = `/atenciones?todos=${esTodos ? 'true' : 'false'}&formato=json`;

        try {
          let datos;
          if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.api === 'function') {
            datos = await window.HIS.api(urlAjax, { method: 'GET' });
          } else {
            const res = await fetch(urlAjax, {
              headers: { Accept: 'application/json' },
              credentials: 'same-origin',
            });
            if (!res.ok) throw new Error('Error ' + res.status);
            const json = await res.json();
            datos = json && json.data !== undefined ? json.data : json;
          }

          const lista = Array.isArray(datos)
            ? datos
            : (datos && Array.isArray(datos.atenciones) ? datos.atenciones : (datos && Array.isArray(datos.filas) ? datos.filas : []));

          const renderFn = () => {
            const tbody = tabla.querySelector('tbody');
            if (tbody) {
              tbody.innerHTML = construirFilasHtml(lista);
            }
          };

          if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.refrescarDataTable === 'function') {
            window.HIS.refrescarDataTable('#tablaAtenciones', renderFn);
          } else {
            renderFn();
          }

          links.forEach((l) => {
            const esActivo = l === link;
            l.classList.toggle('active', esActivo);
            l.classList.toggle('bg-white', !esActivo);
            l.classList.toggle('border', !esActivo);
          });

          if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', esTodos ? '/atenciones?todos=true' : '/atenciones');
          }

          const etiquetaFiltro = esTodos ? 'Todas las atenciones' : 'Mis atenciones';
          window.HIS?.anunciarCambio?.(`Mostrando ${lista.length} atenciones en ${etiquetaFiltro}.`);
        } catch (err) {
          if (typeof window !== 'undefined' && window.location) {
            window.location.href = href;
          }
        }
      });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAtencionesLista);
    } else {
      initAtencionesLista();
    }
  }
})();
