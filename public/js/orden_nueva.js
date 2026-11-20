// public/js/orden_nueva.js — Lógica de cliente para Pantalla C.7 (Órdenes diagnósticas con detalle CUPS)
// Requisitos: HIS-F-23, HIS-F-24, HIS-NF-11, HIS-NF-08 · EDT: ORD-01, ORD-02, ORD-03, ORD-07
(function () {
  'use strict';

  // Obtener helpers de la librería común o fallback local
  const { api, mostrarMensaje, debounce } = window.HIS || {
    api: async (url, opts = {}) => {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(opts.headers || {})
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin',
        signal: opts.signal
      });
      if (res.status === 204) return null;
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error((datos.error && datos.error.mensaje) || 'Error ' + res.status);
        error.status = res.status;
        error.datos = datos.error || {};
        throw error;
      }
      return datos.data !== undefined ? datos.data : datos;
    },
    mostrarMensaje: (tipo, texto) => {
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
        return window.HIS.mostrarMensaje(tipo, texto);
      }
      const cont = document.getElementById('alertas');
      if (!cont) return (typeof alert === 'function' ? alert(texto) : undefined);
      const div = document.createElement('div');
      div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
      div.role = 'alert';
      const span = document.createElement('span');
      span.textContent = texto;
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'btn-close';
      btnClose.setAttribute('data-bs-dismiss', 'alert');
      btnClose.setAttribute('aria-label', 'Cerrar');
      div.appendChild(span);
      div.appendChild(btnClose);
      cont.replaceChildren(div);
      setTimeout(() => {
        if (div.parentNode) {
          div.classList.remove('show');
          setTimeout(() => div.remove(), 150);
        }
      }, 6000);
    },
    debounce: (fn, ms = 300) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }
  };

  function initOrdenNueva() {
    const contenedor = document.getElementById('contenedorOrdenNueva');
    if (!contenedor) return;

    const atencionId = contenedor.dataset.atencion;
    const soloLectura = contenedor.dataset.soloLectura === 'true';
    const puedeEditar = contenedor.dataset.puedeEditar === 'true';

    // Elementos del DOM
    const btnTipoLab = document.getElementById('btnTipoLaboratorio');
    const btnTipoRad = document.getElementById('btnTipoRadiologia');
    const inputBuscar = document.getElementById('buscarCups');
    const spinnerBuscar = document.getElementById('spinnerBuscarCups');
    const dropdownMenu = document.getElementById('dropdownCups');
    const listaResultados = document.getElementById('listaResultadosCups');
    const tablaProcedimientos = document.getElementById('tablaProcedimientos');
    const cuerpoTabla = document.getElementById('cuerpoTablaProcedimientos');
    const filaSinItems = document.getElementById('filaSinProcedimientos');
    const btnGuardarBorrador = document.getElementById('btnGuardarBorrador');
    const btnCancelar = document.getElementById('btnCancelarOrden');
    const btnGenerar = document.getElementById('btnGenerarOrden');
    const spinnerGenerar = document.getElementById('spinnerGenerar');
    const iconoGenerar = document.getElementById('iconoGenerar');
    const textoGenerar = document.getElementById('textoGenerar');
    const avisoBorrador = document.getElementById('avisoBorrador');

    // Modal de éxito
    const modalElement = document.getElementById('modalOrdenEmitida');
    const modalBs = modalElement && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalElement) : null;
    const codigoOrdenModal = document.getElementById('codigoOrdenModal');
    const btnImprimirModal = document.getElementById('btnImprimirOrdenModal');
    const btnCerrarModal = document.getElementById('btnCerrarModalOrden');

    // Estado local de la orden
    let tipoActual = 'LABORATORIO'; // 'LABORATORIO' | 'RADIOLOGIA'
    let items = []; // [{ cups_id, codigo, descripcion, cantidad }]
    let resultadosBusqueda = []; // Lista en memoria de la búsqueda actual
    let indiceSeleccionado = -1;

    // Clave para almacenamiento en localStorage
    function getClaveBorrador(tipo) {
      return `hiscare_orden_borrador_${atencionId}_${tipo}`;
    }

    // Guardar borrador en localStorage
    function guardarEnBorrador(mostrarFeedback = false) {
      if (!atencionId) return;
      try {
        const clave = getClaveBorrador(tipoActual);
        if (items.length > 0) {
          localStorage.setItem(clave, JSON.stringify(items));
          if (mostrarFeedback) {
            mostrarAvisoBorrador(`Borrador de ${tipoActual === 'LABORATORIO' ? 'Laboratorio' : 'Radiología'} guardado (${items.length} ítems).`);
          }
        } else {
          localStorage.removeItem(clave);
          if (mostrarFeedback) {
            mostrarAvisoBorrador('Borrador vacío descartado.');
          }
        }
      } catch (e) {
        console.warn('No se pudo guardar borrador en localStorage:', e);
      }
    }

    // Cargar borrador desde localStorage
    function cargarBorrador() {
      if (!atencionId) return;
      try {
        const clave = getClaveBorrador(tipoActual);
        const data = localStorage.getItem(clave);
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            items = parsed.map(item => ({
              cups_id: item.cups_id || item.id,
              codigo: String(item.codigo).trim(),
              descripcion: String(item.descripcion).trim(),
              cantidad: Math.max(1, Math.min(99, parseInt(item.cantidad, 10) || 1))
            }));
            renderTabla();
            mostrarAvisoBorrador(`Se recuperó borrador con ${items.length} examen(es).`);
            return;
          }
        }
      } catch (e) {
        console.warn('Error al leer borrador de localStorage:', e);
      }
      items = [];
      renderTabla();
    }

    // Limpiar borrador actual
    function descartarBorrador() {
      try {
        localStorage.removeItem(getClaveBorrador(tipoActual));
      } catch (e) { /* ignorar */ }
      items = [];
      renderTabla();
      window.HIS?.marcarFormularioLimpio?.();
      mostrarAvisoBorrador('Borrador cancelado.');
    }

    function mostrarAvisoBorrador(texto) {
      if (!avisoBorrador) return;
      avisoBorrador.textContent = texto;
      avisoBorrador.classList.remove('d-none');
      setTimeout(() => {
        avisoBorrador.classList.add('d-none');
      }, 4000);
    }

    // Cambiar tipo de orden (Laboratorio vs Radiología)
    function cambiarTipo(nuevoTipo) {
      if (nuevoTipo === tipoActual) return;

      // Guardar el borrador del tipo saliente si tiene ítems
      if (items.length > 0) {
        guardarEnBorrador(false);
      }

      tipoActual = nuevoTipo;

      // Actualizar UI de botones de tipo
      if (tipoActual === 'LABORATORIO') {
        btnTipoLab.classList.add('active', 'btn-primary');
        btnTipoLab.classList.remove('btn-outline-primary');
        btnTipoRad.classList.remove('active', 'btn-primary');
        btnTipoRad.classList.add('btn-outline-primary');
      } else {
        btnTipoRad.classList.add('active', 'btn-primary');
        btnTipoRad.classList.remove('btn-outline-primary');
        btnTipoLab.classList.remove('active', 'btn-primary');
        btnTipoLab.classList.add('btn-outline-primary');
      }

      // Cargar borrador del nuevo tipo
      cargarBorrador();
    }

    if (btnTipoLab) {
      btnTipoLab.addEventListener('click', () => cambiarTipo('LABORATORIO'));
    }
    if (btnTipoRad) {
      btnTipoRad.addEventListener('click', () => cambiarTipo('RADIOLOGIA'));
    }

    // Renderizar filas de la tabla de procedimientos
    function renderTabla() {
      if (!cuerpoTabla) return;

      cuerpoTabla.innerHTML = '';

      if (items.length === 0) {
        if (filaSinItems) {
          cuerpoTabla.appendChild(filaSinItems);
        } else {
          cuerpoTabla.innerHTML = `
            <tr id="filaSinProcedimientos">
              <td colspan="4" class="text-center text-muted py-5">
                <div class="d-flex flex-column align-items-center gap-2">
                  <svg width="36" height="36" fill="none" stroke="currentColor" class="text-secondary opacity-50" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                  <span class="fw-medium text-dark">No hay exámenes agregados en esta orden.</span>
                  <span class="small text-secondary">Utilice el buscador superior para agregar procedimientos CUPS a la orden médica.</span>
                </div>
              </td>
            </tr>
          `;
        }
        return;
      }

      items.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.dataset.cupsId = item.cups_id;
        tr.dataset.codigo = item.codigo;
        tr.className = 'fila-procedimiento';

        // Columna 1: Código CUPS
        const tdCodigo = document.createElement('td');
        tdCodigo.className = 'ps-3 font-monospace fw-bold text-dark';
        tdCodigo.textContent = item.codigo;
        tr.appendChild(tdCodigo);

        // Columna 2: Descripción
        const tdDesc = document.createElement('td');
        tdDesc.className = 'text-dark';
        tdDesc.textContent = item.descripcion;
        tr.appendChild(tdDesc);

        // Columna 3: Cantidad (Input numérico min=1 max=99)
        const tdCant = document.createElement('td');
        tdCant.className = 'text-center';
        const inputCant = document.createElement('input');
        inputCant.type = 'number';
        inputCant.className = 'form-control form-control-sm text-center mx-auto input-cantidad';
        inputCant.style.maxWidth = '85px';
        inputCant.min = '1';
        inputCant.max = '99';
        inputCant.step = '1';
        inputCant.value = String(item.cantidad || 1);
        inputCant.setAttribute('data-trace', 'C7-32');
        inputCant.setAttribute('aria-label', `Cantidad para ${item.codigo}`);
        if (soloLectura || !puedeEditar) {
          inputCant.disabled = true;
        }

        inputCant.addEventListener('change', (e) => {
          let val = parseInt(e.target.value, 10);
          if (isNaN(val) || val < 1) val = 1;
          if (val > 99) val = 99;
          e.target.value = String(val);
          item.cantidad = val;
          guardarEnBorrador(false);
          window.HIS?.marcarFormularioSucio?.();
        });

        inputCant.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          if (!isNaN(val) && val >= 1 && val <= 99) {
            item.cantidad = val;
            guardarEnBorrador(false);
          }
          window.HIS?.marcarFormularioSucio?.();
        });

        tdCant.appendChild(inputCant);
        tr.appendChild(tdCant);

        // Columna 4: Acción (Botón Eliminar)
        const tdAccion = document.createElement('td');
        tdAccion.className = 'text-end pe-3';
        const btnEliminar = document.createElement('button');
        btnEliminar.type = 'button';
        btnEliminar.className = 'btn btn-sm btn-outline-danger btn-eliminar-item';
        btnEliminar.title = `Eliminar examen ${item.codigo}`;
        btnEliminar.setAttribute('data-trace', 'C7-33');
        btnEliminar.setAttribute('aria-label', `Eliminar procedimiento ${item.codigo}`);
        btnEliminar.innerHTML = `
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        `;
        if (soloLectura || !puedeEditar) {
          btnEliminar.disabled = true;
        }

        btnEliminar.addEventListener('click', () => {
          eliminarItem(index);
        });

        tdAccion.appendChild(btnEliminar);
        tr.appendChild(tdAccion);

        cuerpoTabla.appendChild(tr);
      });
    }

    // Agregar procedimiento a la lista (HIS-NF-11: no texto libre, solo selección con cups_id)
    function agregarProcedimiento(proc) {
      if (!proc || (!proc.cups_id && !proc.id) || !proc.codigo) {
        return;
      }

      const cupsId = proc.cups_id || proc.id;
      const codigo = String(proc.codigo).trim();
      const descripcion = String(proc.descripcion || '').trim();

      // Si el CUPS ya está en la tabla, incrementa su cantidad en vez de duplicar fila
      const existente = items.find(it => it.cups_id === cupsId || it.codigo === codigo);
      if (existente) {
        existente.cantidad = Math.min(99, (existente.cantidad || 1) + 1);
        mostrarAvisoBorrador(`Se incrementó la cantidad de ${codigo} a ${existente.cantidad}.`);
      } else {
        items.push({
          cups_id: cupsId,
          codigo,
          descripcion,
          cantidad: 1
        });
        mostrarAvisoBorrador(`Se agregó ${codigo} a la orden.`);
      }

      renderTabla();
      guardarEnBorrador(false);
      window.HIS?.marcarFormularioSucio?.();
      cerrarDropdown();
      if (inputBuscar) {
        inputBuscar.value = '';
        inputBuscar.focus();
      }
    }

    // Eliminar procedimiento de la tabla
    function eliminarItem(index) {
      if (index >= 0 && index < items.length) {
        const eliminado = items.splice(index, 1)[0];
        renderTabla();
        guardarEnBorrador(false);
        window.HIS?.marcarFormularioSucio?.();
        if (eliminado) {
          mostrarAvisoBorrador(`Se retiró ${eliminado.codigo} de la orden.`);
        }
      }
    }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

    // Cerrar dropdown de resultados
    function cerrarDropdown() {
      if (dropdownMenu) {
        dropdownMenu.classList.add('d-none');
        dropdownMenu.classList.remove('show');
        dropdownMenu.style.display = 'none';
      }
      indiceSeleccionado = -1;
      resultadosBusqueda = [];
    }

    // Abrir dropdown y renderizar opciones
    function renderDropdown(resultados) {
      if (!dropdownMenu || !listaResultados) return;

      listaResultados.innerHTML = '';
      resultadosBusqueda = Array.isArray(resultados) ? resultados : [];
      indiceSeleccionado = -1;

      if (resultadosBusqueda.length === 0) {
        const txt = inputBuscar ? inputBuscar.value.trim() : '';
        listaResultados.innerHTML = `
          <div class="p-3 text-center text-muted small">
            <div class="fw-semibold text-dark mb-1">Sin coincidencias</div>
            No se encontraron procedimientos CUPS para "<strong>${escapeHtml(txt)}</strong>".
            <div class="text-secondary mt-1">Intente buscar por código (ej. 902210) o nombre (ej. Hemograma, Glucosa).</div>
          </div>
        `;
        dropdownMenu.classList.remove('d-none');
        dropdownMenu.classList.add('show');
        dropdownMenu.style.display = 'block';
        return;
      }

      resultadosBusqueda.forEach((res, idx) => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2 px-3 text-start border-0 border-bottom';
        itemBtn.dataset.index = idx;
        itemBtn.innerHTML = `
          <div class="pe-2 overflow-hidden">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-semibold me-2">${escapeHtml(res.codigo)}</span>
            <span class="text-dark fw-medium">${escapeHtml(res.descripcion)}</span>
            ${res.requiere_consentimiento ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1 small">Req. Consentimiento</span>' : ''}
          </div>
          <span class="btn btn-sm btn-outline-primary py-0 px-2 ms-2 text-nowrap d-inline-flex align-items-center gap-1">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Agregar
          </span>
        `;

        itemBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });

        itemBtn.addEventListener('click', (e) => {
          e.preventDefault();
          agregarProcedimiento(res);
        });

        listaResultados.appendChild(itemBtn);
      });

      dropdownMenu.classList.remove('d-none');
      dropdownMenu.classList.add('show');
      dropdownMenu.style.display = 'block';
    }

    let abortControllerCups = null;

    // Búsqueda en API con debounce de 300 ms (GET /api/cups/buscar?q=...)
    const buscarCupsApi = debounce(async (texto) => {
      const q = (texto || '').trim();
      if (q.length < 2) {
        if (abortControllerCups) {
          abortControllerCups.abort();
          abortControllerCups = null;
        }
        cerrarDropdown();
        return;
      }

      if (abortControllerCups) {
        abortControllerCups.abort();
      }
      abortControllerCups = new AbortController();
      const currentSignal = abortControllerCups.signal;

      if (spinnerBuscar) spinnerBuscar.classList.remove('d-none');

      try {
        const resp = await api(`/api/cups/buscar?q=${encodeURIComponent(q)}&tipo=${encodeURIComponent(tipoActual)}`, { signal: currentSignal });
        // Validar que el término de búsqueda siga vigente antes de renderizar
        if (inputBuscar && inputBuscar.value.trim() === q) {
          const lista = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.cups) ? resp.cups : (resp && Array.isArray(resp.data) ? resp.data : []));
          renderDropdown(lista);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.code === 20 || (err.message && err.message.includes('aborted'))) {
          return;
        }
        console.warn('Error al buscar procedimientos CUPS:', err);
        if (inputBuscar && inputBuscar.value.trim() === q) {
          renderDropdown([]);
        }
      } finally {
        if (abortControllerCups && abortControllerCups.signal === currentSignal) {
          if (spinnerBuscar) spinnerBuscar.classList.add('d-none');
          abortControllerCups = null;
        }
      }
    }, 300);

    if (inputBuscar && !soloLectura && puedeEditar) {
      inputBuscar.addEventListener('input', (e) => {
        window.HIS?.marcarFormularioSucio?.();
        const val = (e.target.value || '').trim();
        if (val.length < 2) {
          if (abortControllerCups) {
            abortControllerCups.abort();
            abortControllerCups = null;
          }
          cerrarDropdown();
        } else {
          buscarCupsApi(e.target.value);
        }
      });

      inputBuscar.addEventListener('focus', () => {
        const val = inputBuscar.value.trim();
        if (val.length >= 2) {
          buscarCupsApi(val);
        }
      });

      inputBuscar.addEventListener('click', () => {
        const val = inputBuscar.value.trim();
        if (val.length >= 2) {
          buscarCupsApi(val);
        }
      });

      inputBuscar.addEventListener('keydown', (e) => {
        if (!dropdownMenu || dropdownMenu.classList.contains('d-none')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            buscarCupsApi(e.target.value);
          }
          return;
        }

        const itemsDropdown = listaResultados.querySelectorAll('.list-group-item');
        if (itemsDropdown.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          indiceSeleccionado = (indiceSeleccionado + 1) % itemsDropdown.length;
          actualizarSeleccionDropdown(itemsDropdown);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          indiceSeleccionado = (indiceSeleccionado - 1 + itemsDropdown.length) % itemsDropdown.length;
          actualizarSeleccionDropdown(itemsDropdown);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (indiceSeleccionado >= 0 && indiceSeleccionado < resultadosBusqueda.length) {
            agregarProcedimiento(resultadosBusqueda[indiceSeleccionado]);
          } else if (resultadosBusqueda.length > 0) {
            agregarProcedimiento(resultadosBusqueda[0]);
          }
        } else if (e.key === 'Escape') {
          cerrarDropdown();
        }
      });
    }

    function actualizarSeleccionDropdown(itemsNodes) {
      itemsNodes.forEach((node, idx) => {
        if (idx === indiceSeleccionado) {
          node.classList.add('active', 'bg-primary', 'text-white');
          if (typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'nearest' });
          }
        } else {
          node.classList.remove('active', 'bg-primary', 'text-white');
        }
      });
    }

    // Cerrar dropdown si se hace clic fuera del contenedor
    document.addEventListener('click', (e) => {
      const contBuscador = document.getElementById('contenedorBuscadorCups');
      if (contBuscador && !contBuscador.contains(e.target)) {
        cerrarDropdown();
      }
    });

    // Botón Guardar como borrador (C7-34)
    if (btnGuardarBorrador && !soloLectura) {
      btnGuardarBorrador.addEventListener('click', () => {
        guardarEnBorrador(true);
      });
    }

    // Botón Cancelar (C7-35)
    if (btnCancelar && !soloLectura) {
      btnCancelar.addEventListener('click', async (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (items.length === 0) {
          descartarBorrador();
          return;
        }
        const confirmado = (typeof window !== 'undefined' && window.HIS && typeof window.HIS.confirmar === 'function')
          ? await window.HIS.confirmar({
              titulo: '¿Descartar exámenes?',
              texto: '¿Desea descartar y limpiar los exámenes agregados a esta orden?',
              peligroso: true,
              textoConfirmar: 'Sí, descartar',
              textoCancelar: 'Cancelar'
            })
          : (typeof confirm === 'function' ? confirm('¿Desea descartar y limpiar los exámenes agregados a esta orden?') : true);
        if (confirmado) {
          descartarBorrador();
        }
      });
    }

    // Botón Generar orden médica (C7-36)
    async function recargarOrdenesEmitidas(ordenNuevaId = null) {
      const cuerpoEmitidas = document.getElementById('cuerpoTablaOrdenesEmitidas');
      const conteoEmitidas = document.getElementById('conteoOrdenesPrevias');
      if (!cuerpoEmitidas || !atencionId) return;

      try {
        const resp = await api(`/api/atenciones/${atencionId}/ordenes`, { method: 'GET' });
        const lista = Array.isArray(resp)
          ? resp
          : (resp && Array.isArray(resp.data) ? resp.data : (resp && Array.isArray(resp.ordenes) ? resp.ordenes : []));

        if (conteoEmitidas) {
          conteoEmitidas.textContent = `${lista.length} orden${lista.length === 1 ? '' : 'es'}`;
        }

        const renderOrdenes = () => {
          if (!lista.length) {
            cuerpoEmitidas.innerHTML = `
              <tr id="filaSinOrdenesEmitidas">
                <td colspan="6" class="text-center text-muted py-4">
                  No se han emitido órdenes diagnósticas en esta atención clínica.
                </td>
              </tr>
            `;
            return;
          }

          cuerpoEmitidas.innerHTML = lista.map((o) => {
            let badgeEstado = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
            if (o.estado === 'EN_PROCESO') badgeEstado = 'bg-info-subtle text-info-emphasis border border-info-subtle';
            else if (o.estado === 'COMPLETADA') badgeEstado = 'bg-success text-white';
            else if (o.estado === 'CANCELADA') badgeEstado = 'bg-danger text-white';

            const badgeTipo = o.tipo === 'LABORATORIO'
              ? 'bg-primary-subtle text-primary border border-primary-subtle'
              : 'bg-info-subtle text-info-emphasis border border-info-subtle';
            const fechaFormateada = o.fecha_formateada || (o.fecha ? new Date(o.fecha).toLocaleString('es-CO') : '—');
            const cantItems = o.cantidad_procedimientos || o.total_items || (Array.isArray(o.items) ? o.items.length : 1);
            const esNueva = ordenNuevaId && String(o.id) === String(ordenNuevaId);

            return `
              <tr${esNueva ? ' class="his-row-updated"' : ''}>
                <td class="ps-3">
                  <span class="badge bg-light text-dark font-monospace border px-2 py-1">${escapeHtml(o.codigo)}</span>
                </td>
                <td>
                  <span class="badge ${badgeTipo} px-2 py-1">${escapeHtml(o.tipo)}</span>
                </td>
                <td class="text-secondary small">${escapeHtml(fechaFormateada)}</td>
                <td>
                  <span class="badge ${badgeEstado}">${escapeHtml(o.estado)}</span>
                </td>
                <td class="text-center font-monospace">${escapeHtml(String(cantItems))}</td>
                <td class="text-end pe-3">
                  <a href="/ordenes/${encodeURIComponent(o.id)}/imprimir"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                    </svg>
                    <span>Imprimir</span>
                  </a>
                </td>
              </tr>
            `;
          }).join('');
        };

        if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.refrescarDataTable === 'function') {
          window.HIS.refrescarDataTable('#tablaOrdenesEmitidas', renderOrdenes);
        } else {
          renderOrdenes();
        }
      } catch (err) {
        console.warn('No se pudo actualizar la tabla de órdenes emitidas:', err);
      }
    }

    if (btnGenerar && !soloLectura && puedeEditar) {
      btnGenerar.addEventListener('click', async () => {
        // Validación 1: al menos 1 ítem agregado
        if (items.length === 0) {
          mostrarMensaje('warning', 'Debe agregar al menos un procedimiento o examen CUPS a la orden médica.');
          if (inputBuscar) inputBuscar.focus();
          return;
        }

        // Validación 2: cantidades válidas entre 1 y 99
        for (const it of items) {
          const c = parseInt(it.cantidad, 10);
          if (isNaN(c) || c < 1 || c > 99) {
            mostrarMensaje('warning', `La cantidad para el procedimiento ${it.codigo} debe estar entre 1 y 99.`);
            return;
          }
        }

        // Estado visual de carga (spinner y disabled)
        btnGenerar.disabled = true;
        if (spinnerGenerar) spinnerGenerar.classList.remove('d-none');
        if (iconoGenerar) iconoGenerar.classList.add('d-none');
        if (textoGenerar) textoGenerar.textContent = 'Generando orden...';

        const payload = {
          tipo: tipoActual,
          items: items.map(it => ({
            cups_id: it.cups_id,
            cantidad: parseInt(it.cantidad, 10) || 1
          }))
        };

        try {
          const respuesta = await api(`/api/atenciones/${atencionId}/ordenes`, {
            method: 'POST',
            body: payload
          });

          // Éxito: descartar borrador local
          try {
            localStorage.removeItem(getClaveBorrador(tipoActual));
          } catch (e) { /* ignorar */ }

          // Limpiar tabla actual
          items = [];
          renderTabla();
          window.HIS?.marcarFormularioLimpio?.();

          // Código de orden generado
          const codigoGenerado = respuesta.codigo || (respuesta.orden && respuesta.orden.codigo) || 'ORD-89001';
          const ordenId = respuesta.orden_id || respuesta.id || (respuesta.orden && respuesta.orden.id) || codigoGenerado;

          // Actualizar inmediatamente la tabla inferior de órdenes emitidas
          await recargarOrdenesEmitidas(ordenId);
          window.HIS?.anunciarCambio?.(`Orden médica ${codigoGenerado} emitida y tabla de órdenes actualizada`);

          // Configurar modal de éxito
          if (codigoOrdenModal) {
            codigoOrdenModal.textContent = codigoGenerado;
          }
          if (btnImprimirModal) {
            btnImprimirModal.href = `/ordenes/${encodeURIComponent(ordenId)}/imprimir`;
          }

          // Abrir modal si está disponible
          if (modalBs) {
            modalBs.show();
          } else {
            mostrarMensaje('success', `Orden médica ${codigoGenerado} emitida exitosamente.`);
          }

          if (modalElement) {
            modalElement.addEventListener('hidden.bs.modal', () => {
              if (inputBuscar) inputBuscar.focus();
            }, { once: true });
          }

        } catch (err) {
          console.error('Error al generar la orden diagnóstica:', err);
          if (err.status === 409) {
            mostrarMensaje('danger', 'La atención se encuentra cerrada o ya fue finalizada. No es posible generar nuevas órdenes.');
          } else if (err.status === 422) {
            const detalle = (err.datos && err.datos.campos && Array.isArray(err.datos.campos))
              ? err.datos.campos.map(c => c.msg || c.mensaje).join(', ')
              : (err.message || 'Error de validación al generar la orden.');
            mostrarMensaje('danger', `Validación fallida: ${detalle}`);
          } else {
            mostrarMensaje('danger', err.message || 'Error inesperado al emitir la orden médica. Por favor intente nuevamente.');
          }
        } finally {
          btnGenerar.disabled = false;
          if (spinnerGenerar) spinnerGenerar.classList.add('d-none');
          if (iconoGenerar) iconoGenerar.classList.remove('d-none');
          if (textoGenerar) textoGenerar.textContent = 'Generar orden médica';
        }
      });
    }

    // Inicializar DataTables para historial de órdenes emitidas
    if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
      window.HIS.inicializarDataTable('#tablaOrdenesEmitidas');
    }

    // Inicializar: cargar borrador guardado para el tipo por defecto
    cargarBorrador();
  }

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrdenNueva);
  } else {
    initOrdenNueva();
  }

  // Exponer API del módulo para pruebas unitarias
  window.HISCARE_ORDEN = {
    init: initOrdenNueva
  };
})();
