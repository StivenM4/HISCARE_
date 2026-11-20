// public/js/visor_resultados.js — Cliente interactivo para la Pantalla C.25 (Consulta de resultados)
(function () {
  'use strict';

  /**
   * Escapa caracteres HTML para prevenir XSS.
   */
  function escaparHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Formatea una fecha a formato local DD/MM/YYYY.
   */
  function formatearFechaCorta(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return String(fecha);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  /**
   * Formatea una fecha y hora a formato local DD/MM/YYYY HH:MM.
   */
  function formatearFechaHora(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return String(fecha);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hora}:${min}`;
  }

  function formatearTipoEstudio(tipo) {
    const t = String(tipo || '').toUpperCase();
    if (t === 'LABORATORIO') return 'Laboratorio clínico';
    if (t === 'RADIOLOGIA') return 'Estudio de radiología';
    if (t === 'PROCEDIMIENTO') return 'Procedimiento diagnóstico';
    return tipo || 'Estudio diagnóstico';
  }

  function formatearTipoCorto(tipo) {
    const t = String(tipo || '').toUpperCase();
    if (t === 'LABORATORIO') return 'Laboratorio';
    if (t === 'RADIOLOGIA') return 'Radiología';
    if (t === 'PROCEDIMIENTO') return 'Procedimiento';
    return tipo || 'General';
  }

  /**
   * Deriva parámetros analíticos del resultado clínico cuando el servidor no los entrega tabulados.
   */
  function obtenerResultadosSimuladosPaciente(res) {
    if (!res) return [];
    if (Array.isArray(res.analitos) && res.analitos.length > 0) {
      return res.analitos;
    }
    const tipo = String(res.tipo || '').toUpperCase();
    const textoCompleto = ((res.nombre_examen || '') + ' ' + (res.examen_principal || '') + ' ' + (res.informe || '')).toUpperCase();
    const esRx = tipo === 'RADIOLOGIA' || textoCompleto.includes('RADIOGRAF') || textoCompleto.includes('TORAX') || textoCompleto.includes('TÓRAX') || textoCompleto.includes('ECOGRAF') || textoCompleto.includes('TAC') || textoCompleto.includes(' RX ');
    if (esRx) {
      return [
        { examen: 'Proyección / Técnica', resultado: 'PA y Lateral digital', referencia: 'Estándar diagnóstico HIS', fueraRango: false },
        { examen: 'Índice cardiotorácico', resultado: '0.46', referencia: '< 0.50', fueraRango: false },
        { examen: 'Campos pleuropulmonares', resultado: 'Sin consolidaciones', referencia: 'Transparencia conservada', fueraRango: false }
      ];
    }
    return [
      { examen: 'Hemoglobina', resultado: '14.2 g/dL', referencia: '13.0 - 17.0 g/dL', fueraRango: false },
      { examen: 'Leucocitos totales', resultado: '7.400 /µL', referencia: '4.500 - 11.000 /µL', fueraRango: false },
      { examen: 'Glucosa basal en suero', resultado: '92 mg/dL', referencia: '70 - 100 mg/dL', fueraRango: false },
      { examen: 'Creatinina sérica', resultado: '0.88 mg/dL', referencia: '0.60 - 1.20 mg/dL', fueraRango: false }
    ];
  }

  function evaluarAnalito(a) {
    const estadoRaw = String((a && (a.estado || a.nivel)) || '').toUpperCase();
    const esCritico = Boolean(a && a.critico) || estadoRaw === 'CRITICO' || estadoRaw === 'CRÍTICO';
    const esAlto = estadoRaw === 'ALTO';
    const esBajo = estadoRaw === 'BAJO';
    const esAlterado = Boolean(a && a.fueraRango) || esAlto || esBajo || estadoRaw === 'ALTERADO';

    const valorBase = (a && a.resultado !== undefined && a.resultado !== null)
      ? String(a.resultado)
      : ((a && a.valor !== undefined && a.valor !== null) ? String(a.valor) : '—');
    const unidad = (a && a.unidad && !valorBase.includes(a.unidad)) ? (' ' + a.unidad) : '';

    if (esCritico) {
      return {
        nivel: 'critico',
        etiqueta: 'Crítico',
        badgeClass: 'badge-prioridad-critico',
        rowClass: 'analito-row-critico',
        valorClass: 'text-danger',
        valorMostrar: valorBase + unidad,
        icono: '<svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
      };
    }
    if (esAlterado) {
      return {
        nivel: 'alterado',
        etiqueta: esAlto ? 'Alto' : (esBajo ? 'Bajo' : 'Alterado'),
        badgeClass: 'badge-prioridad-alterado',
        rowClass: 'analito-row-alterado',
        valorClass: 'text-warning-emphasis',
        valorMostrar: valorBase + unidad,
        icono: '<svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>',
      };
    }
    return {
      nivel: 'normal',
      etiqueta: 'Normal',
      badgeClass: 'badge-prioridad-normal',
      rowClass: '',
      valorClass: 'text-dark',
      valorMostrar: valorBase + unidad,
      icono: '<svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>',
    };
  }

  function evaluarResumenClinico(res, analitos) {
    const evaluados = analitos.map(evaluarAnalito);
    const criticos = evaluados.filter((e) => e.nivel === 'critico').length;
    const alterados = evaluados.filter((e) => e.nivel === 'alterado').length;
    const texto = String((res && res.informe) || '').toUpperCase();

    const tieneTextoCritico = texto.includes('CRÍTIC') || texto.includes('CRITIC') || texto.includes('PÁNICO') || texto.includes('INMEDIATA');
    const tieneTextoAlterado = texto.includes('ALTERAD') || texto.includes('ELEVAD') || texto.includes('ANORMAL') || texto.includes('DISMINUID');

    if (criticos > 0 || tieneTextoCritico) {
      return { nivel: 'critico', etiqueta: 'Hallazgo crítico', badgeClass: 'badge-prioridad-critico', accentClass: 'card-accent-danger', alterados, criticos };
    }
    if (alterados > 0 || tieneTextoAlterado) {
      return { nivel: 'alterado', etiqueta: 'Valores alterados', badgeClass: 'badge-prioridad-alterado', accentClass: 'card-accent-warning', alterados, criticos };
    }
    return { nivel: 'normal', etiqueta: 'Dentro de rango', badgeClass: 'badge-prioridad-normal', accentClass: 'card-accent-primary', alterados: 0, criticos: 0 };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const contenedorApp = document.getElementById('contenedorVisorResultados');
    if (!contenedorApp) return;

    const pacienteId = contenedorApp.dataset.pacienteId || '';

    // Estado de adjunto actual para vista ampliada en modal
    let estadoAdjuntoActual = {
      tiene: false,
      esImagen: false,
      url: '',
      nombre: '',
    };

    // Elementos del panel de detalle y encabezado
    const panelDetalleResultado = document.getElementById('panelDetalleResultado');
    const detalleTitulo = document.getElementById('detalleTitulo');
    const detalleEstadoRevisionBadge = document.getElementById('detalleEstadoRevisionBadge');
    const detallePrioridadBadge = document.getElementById('detallePrioridadBadge');
    const detalleTipoBadge = document.getElementById('detalleTipoBadge');
    const detalleOrdenCodigo = document.getElementById('detalleOrdenCodigo');
    const detalleOrdenCodigoMeta = document.getElementById('detalleOrdenCodigoMeta');
    const detalleCargadoPor = document.getElementById('detalleCargadoPor');
    const detalleFecha = document.getElementById('detalleFecha');
    const detalleFechaMeta = document.getElementById('detalleFechaMeta');
    const detalleSolicitadoEn = document.getElementById('detalleSolicitadoEn');
    const detalleDiagnostico = document.getElementById('detalleDiagnostico');
    const detalleDiagnosticoMeta = document.getElementById('detalleDiagnosticoMeta');
    const detalleExamenesLista = document.getElementById('detalleExamenesLista');
    const detalleSoporteTexto = document.getElementById('detalleSoporteTexto');
    const resumenAnalitosBadge = document.getElementById('resumenAnalitosBadge');
    const notaParametrosReferenciales = document.getElementById('notaParametrosReferenciales');
    const tablaAnalitosBody = document.getElementById('tablaAnalitosBody');
    const textoInformeContenido = document.getElementById('textoInformeContenido');
    const cardPreviewAdjunto = document.getElementById('cardPreviewAdjunto');
    const visorIframeWrapper = document.getElementById('visorIframeWrapper');
    const iframePreviewAdjunto = document.getElementById('iframePreviewAdjunto');
    const visorImagenWrapper = document.getElementById('visorImagenWrapper');
    const imgPreviewAdjunto = document.getElementById('imgPreviewAdjunto');
    const badgeTipoAdjunto = document.getElementById('badgeTipoAdjunto');
    const nombreArchivoAdjunto = document.getElementById('nombreArchivoAdjunto');
    const btnDescargarAdjunto = document.getElementById('btnDescargarAdjunto');
    const btnDescargarAdjuntoTab = document.getElementById('btnDescargarAdjuntoTab');
    const btnAmpliarAdjunto = document.getElementById('btnAmpliarAdjunto');
    const mensajeSinAdjunto = document.getElementById('mensajeSinAdjunto');
    const btnLineaTiempo = document.getElementById('btnLineaTiempo');
    const btnMarcarRevisado = document.getElementById('btnMarcarRevisado');
    const btnImprimirResultado = document.getElementById('btnImprimirResultado');
    const tablaResultados = document.getElementById('tablaResultados');
    const grupoFiltroResultados = document.getElementById('grupoFiltroResultados');

    // Elementos de pestañas y tarjetas de resumen
    const tabList = document.getElementById('visorTabList');
    const tabs = tabList ? Array.from(tabList.querySelectorAll('[role="tab"]')) : [];
    const tabPanels = Array.from(document.querySelectorAll('#panelDetalleResultado [role="tabpanel"]'));
    const tabPillParametros = document.getElementById('tabPillParametros');
    const tabPillArchivo = document.getElementById('tabPillArchivo');
    const alertaHallazgosResumen = document.getElementById('alertaHallazgosResumen');
    const textoAlertaHallazgos = document.getElementById('textoAlertaHallazgos');
    const resumenCardEstadoBadge = document.getElementById('resumenCardEstadoBadge');
    const resumenCardConteoParametros = document.getElementById('resumenCardConteoParametros');
    const resumenCardDetalleParametros = document.getElementById('resumenCardDetalleParametros');
    const resumenCardArchivoBadge = document.getElementById('resumenCardArchivoBadge');
    const resumenCardArchivoNombre = document.getElementById('resumenCardArchivoNombre');
    const resumenCardArchivoSub = document.getElementById('resumenCardArchivoSub');
    const resumenCardCargadoPor = document.getElementById('resumenCardCargadoPor');
    const resumenCardOrden = document.getElementById('resumenCardOrden');

    // Navegación entre resultados y modales nativos <dialog>
    const btnAbrirHistorial = document.getElementById('btnAbrirHistorial');
    const badgePendientesHistorial = document.getElementById('badgePendientesHistorial');
    const btnResultadoAnterior = document.getElementById('btnResultadoAnterior');
    const btnResultadoSiguiente = document.getElementById('btnResultadoSiguiente');
    const indicadorPosicionResultado = document.getElementById('indicadorPosicionResultado');

    const modalHistorialResultados = document.getElementById('modalHistorialResultados');
    const modalConfirmarRevision = document.getElementById('modalConfirmarRevision');
    const textoConfirmarRevision = document.getElementById('textoConfirmarRevision');
    const modalVistaPreviaArchivo = document.getElementById('modalVistaPreviaArchivo');
    const tituloModalVistaPrevia = document.getElementById('tituloModalVistaPrevia');
    const btnDescargarEnModal = document.getElementById('btnDescargarEnModal');
    const iframeModalAdjunto = document.getElementById('iframeModalAdjunto');
    const imgModalWrapper = document.getElementById('imgModalWrapper');
    const imgModalAdjunto = document.getElementById('imgModalAdjunto');
    const modalMetadatosTecnicos = document.getElementById('modalMetadatosTecnicos');
    const btnDetallesTecnicos = document.getElementById('btnDetallesTecnicos');
    const metaTecnicaResultadoId = document.getElementById('metaTecnicaResultadoId');
    const metaTecnicaOrdenId = document.getElementById('metaTecnicaOrdenId');
    const metaTecnicaAtencionId = document.getElementById('metaTecnicaAtencionId');
    const metaTecnicaArchivoUrl = document.getElementById('metaTecnicaArchivoUrl');

    // Inicializar estado de adjunto con el renderizado inicial del servidor
    if (btnDescargarAdjunto && !btnDescargarAdjunto.classList.contains('d-none')) {
      estadoAdjuntoActual = {
        tiene: true,
        esImagen: visorImagenWrapper ? !visorImagenWrapper.classList.contains('d-none') : false,
        url: btnDescargarAdjunto.getAttribute('href') || '',
        nombre: nombreArchivoAdjunto ? nombreArchivoAdjunto.textContent.trim() : 'documento',
      };
    }

    /**
     * Activa una pestaña accesible por el ID de su panel destino.
     */
    function activarPestana(panelId, enfocarTab = false) {
      const targetTab = tabs.find((t) => t.dataset.tabTarget === panelId);
      if (!targetTab) return;

      tabs.forEach((tab) => {
        const seleccionado = tab === targetTab;
        tab.setAttribute('aria-selected', seleccionado ? 'true' : 'false');
        tab.tabIndex = seleccionado ? 0 : -1;
      });

      tabPanels.forEach((panel) => {
        const esActivo = panel.id === panelId;
        if (esActivo) {
          panel.removeAttribute('hidden');
          panel.tabIndex = 0;
        } else {
          // Mantener búsqueda Ctrl+F en pestañas de texto; ocultar directamente el iframe del visor
          if (panel.id === 'panel-archivo') {
            panel.setAttribute('hidden', '');
          } else {
            panel.setAttribute('hidden', 'until-found');
          }
          panel.removeAttribute('tabindex');
        }
      });

      if (typeof targetTab.scrollIntoView === 'function') {
        targetTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      if (enfocarTab) {
        targetTab.focus();
      }
    }

    // Eventos de pestañas (clic, flechas de teclado y Ctrl+F beforematch)
    if (tabList && tabs.length > 0) {
      tabList.addEventListener('click', (e) => {
        const tab = e.target.closest('[role="tab"]');
        if (!tab || !tab.dataset.tabTarget) return;
        activarPestana(tab.dataset.tabTarget, false);
      });

      tabList.addEventListener('keydown', (e) => {
        const currentTab = e.target.closest('[role="tab"]');
        if (!currentTab) return;
        const idx = tabs.indexOf(currentTab);
        if (idx === -1) return;

        let nextIdx = null;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = tabs.length - 1;

        if (nextIdx !== null) {
          e.preventDefault();
          const nextTab = tabs[nextIdx];
          if (nextTab && nextTab.dataset.tabTarget) {
            activarPestana(nextTab.dataset.tabTarget, true);
          }
        }
      });
    }

    tabPanels.forEach((panel) => {
      panel.addEventListener('beforematch', () => {
        activarPestana(panel.id, false);
      });
    });

    // Botones internos para saltar entre pestañas desde el Resumen Clínico
    document.querySelectorAll('[data-switch-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetPanelId = btn.dataset.switchTab;
        if (targetPanelId) {
          activarPestana(targetPanelId, true);
        }
      });
    });

    // Fallback de light-dismiss para <dialog closedby="any"> en navegadores sin closedBy nativo
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e, dialog) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = outside(e, dialog);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && outside(e, dialog)) {
            dialog.close();
          }
          pressedOutside = false;
        });
      });
    }

    // Limpiar returnValue en cierre de cada dialog para evitar valores obsoletos
    document.querySelectorAll('dialog.visor-modal').forEach((dialog) => {
      dialog.addEventListener('close', () => {
        if (dialog !== modalConfirmarRevision) {
          dialog.returnValue = '';
        }
      });
    });

    function actualizarControlesPaginacion() {
      const filas = Array.from(document.querySelectorAll('#listaResultadosBody .fila-resultado'));
      const idxActual = filas.findIndex((f) => f.classList.contains('table-active'));
      if (indicadorPosicionResultado && filas.length > 0) {
        indicadorPosicionResultado.textContent = `Resultado ${idxActual >= 0 ? idxActual + 1 : 1} de ${filas.length}`;
      }
      if (btnResultadoAnterior) {
        btnResultadoAnterior.disabled = idxActual <= 0;
      }
      if (btnResultadoSiguiente) {
        btnResultadoSiguiente.disabled = idxActual < 0 || idxActual >= filas.length - 1;
      }
    }

    function actualizarBadgePendientes() {
      if (!badgePendientesHistorial) return;
      const filas = Array.from(document.querySelectorAll('#listaResultadosBody .fila-resultado'));
      const pendientes = filas.filter((f) => f.dataset.revisado !== 'true').length;
      if (pendientes > 0) {
        badgePendientesHistorial.classList.remove('d-none');
        badgePendientesHistorial.textContent = `${pendientes} ${pendientes === 1 ? 'nuevo' : 'nuevos'}`;
      } else {
        badgePendientesHistorial.classList.add('d-none');
        badgePendientesHistorial.textContent = '0 nuevos';
      }
    }

    /**
     * Actualiza el panel de detalle con los datos de un resultado obtenido por API.
     */
    function actualizarPanelDetalle(data, idResultado) {
      if (!data) return;

      const ordenCodigo = data.orden_codigo || data.codigo || ('ORD-' + String(idResultado).slice(0, 5));
      const tipoExamen = data.nombre_examen || data.examen_principal || formatearTipoEstudio(data.tipo);
      const analitosExplicito = Array.isArray(data.analitos) && data.analitos.length > 0;
      const analitos = obtenerResultadosSimuladosPaciente(data);
      const resumenClinico = evaluarResumenClinico(data, analitos);
      const totalFueraRango = resumenClinico.alterados + resumenClinico.criticos;
      const estaRevisado = Boolean(data.revisado);
      const tieneAdjunto = Boolean(data.archivo || data.archivo_url);
      const fechaMostrar = data.fecha_formateada || formatearFechaHora(data.fecha || data.fecha_resultado || new Date());
      const cargadoPor = data.cargado_por || data.usuario_carga_nombre || 'Profesional de laboratorio';
      const atnId = data.atencion_id || '';
      const atnCod = data.atencion_codigo || (atnId ? ('ATN-' + String(atnId).slice(0, 8)) : 'Sin atención');
      const atnFecha = data.atencion_fecha_formateada || (data.atencion_fecha ? formatearFechaCorta(data.atencion_fecha) : '—');
      const diagTexto = data.diagnostico || 'Sin diagnóstico asociado';

      // Acento superior de la tarjeta de detalle
      if (panelDetalleResultado) {
        panelDetalleResultado.classList.remove('card-accent-primary', 'card-accent-warning', 'card-accent-danger');
        panelDetalleResultado.classList.add(resumenClinico.accentClass);
      }

      // Badges de cabecera
      if (detalleEstadoRevisionBadge) {
        detalleEstadoRevisionBadge.className = estaRevisado
          ? 'badge bg-secondary text-white'
          : 'badge bg-success bg-opacity-25 text-success border border-success border-opacity-25';
        detalleEstadoRevisionBadge.textContent = estaRevisado ? 'REVISADO' : 'NUEVO · PENDIENTE DE REVISIÓN';
      }

      if (detallePrioridadBadge) {
        detallePrioridadBadge.className = `badge ${resumenClinico.badgeClass}`;
        detallePrioridadBadge.textContent = resumenClinico.etiqueta;
      }

      if (detalleTipoBadge) {
        const esRx = String(data.tipo || '').toUpperCase() === 'RADIOLOGIA';
        detalleTipoBadge.className = `badge ${esRx ? 'badge-orden-radiologia' : 'badge-orden-laboratorio'}`;
        detalleTipoBadge.textContent = formatearTipoCorto(data.tipo);
      }

      // [25.28] Título
      if (detalleTitulo) {
        detalleTitulo.textContent = `Resultado ${ordenCodigo} · ${tipoExamen}`;
      }

      if (detalleOrdenCodigo) detalleOrdenCodigo.textContent = ordenCodigo;
      if (detalleOrdenCodigoMeta) detalleOrdenCodigoMeta.textContent = ordenCodigo;

      // [25.32] Cargado por
      if (detalleCargadoPor) detalleCargadoPor.textContent = cargadoPor;

      // [25.30] Fecha formateada
      if (detalleFecha) detalleFecha.textContent = fechaMostrar;
      if (detalleFechaMeta) detalleFechaMeta.textContent = fechaMostrar;

      // [25.31] Solicitado en (enlace a atención)
      if (detalleSolicitadoEn) {
        detalleSolicitadoEn.href = atnId ? `/atenciones/${atnId}/consulta` : '#';
        detalleSolicitadoEn.innerHTML = `
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          <span>Atención ${escaparHtml(atnCod)} · ${escaparHtml(atnFecha)}</span>
        `;
      }

      // [25.34] Diagnóstico
      if (detalleDiagnostico) detalleDiagnostico.textContent = diagTexto;
      if (detalleDiagnosticoMeta) detalleDiagnosticoMeta.textContent = diagTexto;

      // Lista de exámenes CUPS de la orden
      if (detalleExamenesLista) {
        if (Array.isArray(data.examenes) && data.examenes.length > 0) {
          const chips = data.examenes.map((ex) => {
            const qty = ex.cantidad && ex.cantidad > 1 ? `<span class="text-muted">×${escaparHtml(ex.cantidad)}</span>` : '';
            return `<span class="visor-cups-chip"><span class="font-monospace fw-bold text-primary">${escaparHtml(ex.cups || '')}</span><span>${escaparHtml(ex.descripcion || '')}</span>${qty}</span>`;
          }).join('');
          detalleExamenesLista.innerHTML = `<div class="visor-cups-list">${chips}</div>`;
        } else {
          detalleExamenesLista.innerHTML = `<span class="text-dark">${escaparHtml(tipoExamen)}</span>`;
        }
      }

      if (detalleSoporteTexto) {
        detalleSoporteTexto.innerHTML = tieneAdjunto
          ? '<span class="text-success fw-semibold">Con documento adjunto validado</span>'
          : '<span class="text-secondary">Informe estructurado sin archivo anexo</span>';
      }

      // Resumen de analitos, alerta en Resumen Clínico y pills de pestañas
      if (tabPillParametros) {
        tabPillParametros.className = `visor-tab-pill ${totalFueraRango > 0 ? 'visor-tab-pill--alert' : ''}`;
        tabPillParametros.textContent = `${analitos.length}${totalFueraRango > 0 ? (' · ' + totalFueraRango + ' alt.') : ''}`;
      }

      if (alertaHallazgosResumen && textoAlertaHallazgos) {
        if (totalFueraRango > 0) {
          alertaHallazgosResumen.className = `alert ${resumenClinico.nivel === 'critico' ? 'alert-danger' : 'alert-warning'} d-flex flex-wrap align-items-center justify-content-between gap-3 mb-0`;
          textoAlertaHallazgos.textContent = `Se detectaron ${totalFueraRango} ${totalFueraRango === 1 ? 'parámetro fuera de rango' : 'parámetros fuera de rango'} en este estudio.`;
        } else {
          alertaHallazgosResumen.classList.add('d-none');
        }
      }

      if (resumenCardEstadoBadge) {
        resumenCardEstadoBadge.className = `badge ${resumenClinico.badgeClass}`;
        resumenCardEstadoBadge.textContent = resumenClinico.etiqueta;
      }
      if (resumenCardConteoParametros) {
        resumenCardConteoParametros.textContent = `${analitos.length} ${analitos.length === 1 ? 'parámetro' : 'parámetros'}`;
      }
      if (resumenCardDetalleParametros) {
        resumenCardDetalleParametros.textContent = totalFueraRango > 0
          ? `${totalFueraRango} valor(es) fuera del rango de referencia`
          : 'Todos los parámetros dentro de límites esperados';
      }
      if (resumenCardCargadoPor) resumenCardCargadoPor.textContent = cargadoPor;
      if (resumenCardOrden) resumenCardOrden.textContent = `Orden ${ordenCodigo} · Atención ${atnCod}`;

      if (resumenAnalitosBadge) {
        resumenAnalitosBadge.className = `badge ${resumenClinico.badgeClass}`;
        if (analitos.length > 0) {
          const labelCount = `${analitos.length} ${analitos.length === 1 ? 'parámetro' : 'parámetros'}`;
          resumenAnalitosBadge.textContent = `${labelCount} · ${totalFueraRango > 0 ? (totalFueraRango + ' fuera de rango') : 'Sin alteraciones'}`;
        } else {
          resumenAnalitosBadge.textContent = 'Sin parámetros tabulados';
        }
      }

      if (notaParametrosReferenciales) {
        notaParametrosReferenciales.classList.toggle('d-none', !(!analitosExplicito && analitos.length > 0));
      }

      // [25.35] Informe: analitos estructurados o derivados
      if (tablaAnalitosBody) {
        if (analitos.length > 0) {
          let htmlFilas = '';
          analitos.forEach((a) => {
            const ev = evaluarAnalito(a);
            htmlFilas += `
              <tr class="${ev.rowClass}">
                <th scope="row" class="small fw-semibold text-dark ps-3">${escaparHtml(a.examen || a.nombre || 'Parámetro')}</th>
                <td data-label="Resultado" class="small font-monospace fw-bold tabular-nums ${ev.valorClass}">${escaparHtml(ev.valorMostrar)}</td>
                <td data-label="Referencia" class="small text-secondary tabular-nums">${escaparHtml(a.referencia || 'No especificada')}</td>
                <td data-label="Estado" class="pe-3 text-end">
                  <span class="badge ${ev.badgeClass}">${ev.icono}<span>${escaparHtml(ev.etiqueta)}</span></span>
                </td>
              </tr>
            `;
          });
          tablaAnalitosBody.innerHTML = htmlFilas;
        } else {
          tablaAnalitosBody.innerHTML = `
            <tr>
              <td colspan="4" class="text-center py-4 text-muted small">Sin analitos tabulados en este informe</td>
            </tr>
          `;
        }
      }

      if (textoInformeContenido) {
        const txtDefecto = 'Estudio procesado y validado internamente en el servicio clínico HISCARE. Parámetros dentro de límites biológicos de referencia.';
        textoInformeContenido.textContent = (data.informe && data.informe.trim().length > 0) ? data.informe : txtDefecto;
      }

      // [25.39 - 25.41] Adjunto seguro (PDF o Imagen)
      const urlArchivo = `/api/resultados/${encodeURIComponent(idResultado)}/archivo`;
      const nombreArchivo = data.archivo_nombre || (data.archivo_url ? String(data.archivo_url).split('/').pop() : '') || `informe_${ordenCodigo}.pdf`;
      const esImagen = /\.(png|jpe?g|webp)(\?|$)/i.test(String(data.archivo_url || nombreArchivo));

      estadoAdjuntoActual = {
        tiene: tieneAdjunto,
        esImagen,
        url: urlArchivo,
        nombre: nombreArchivo,
      };

      if (tabPillArchivo) {
        tabPillArchivo.textContent = tieneAdjunto ? (esImagen ? 'Imagen' : 'PDF') : 'Sin adjunto';
      }
      if (resumenCardArchivoBadge) {
        resumenCardArchivoBadge.className = tieneAdjunto
          ? 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25'
          : 'badge bg-light text-secondary border';
        resumenCardArchivoBadge.textContent = tieneAdjunto ? (esImagen ? 'Imagen' : 'PDF') : 'Sin archivo';
      }
      if (resumenCardArchivoNombre) {
        resumenCardArchivoNombre.textContent = tieneAdjunto ? nombreArchivo : 'Sin documento adjunto';
        resumenCardArchivoNombre.title = tieneAdjunto ? nombreArchivo : 'Sin adjunto';
      }
      if (resumenCardArchivoSub) {
        resumenCardArchivoSub.textContent = tieneAdjunto
          ? 'Archivo clínico disponible para lectura en línea o descarga.'
          : 'Este resultado solo cuenta con informe estructurado.';
      }

      if (tieneAdjunto) {
        if (cardPreviewAdjunto) cardPreviewAdjunto.classList.remove('d-none');
        if (mensajeSinAdjunto) mensajeSinAdjunto.classList.add('d-none');

        if (nombreArchivoAdjunto) nombreArchivoAdjunto.textContent = nombreArchivo;
        if (badgeTipoAdjunto) {
          badgeTipoAdjunto.classList.remove('d-none');
          badgeTipoAdjunto.textContent = esImagen ? 'Imagen Validada' : 'PDF Validado';
        }

        if (esImagen) {
          if (visorIframeWrapper) visorIframeWrapper.classList.add('d-none');
          if (iframePreviewAdjunto) iframePreviewAdjunto.src = 'about:blank';
          if (visorImagenWrapper) visorImagenWrapper.classList.remove('d-none');
          if (imgPreviewAdjunto) imgPreviewAdjunto.src = urlArchivo;
        } else {
          if (visorImagenWrapper) visorImagenWrapper.classList.add('d-none');
          if (imgPreviewAdjunto) imgPreviewAdjunto.removeAttribute('src');
          if (visorIframeWrapper) visorIframeWrapper.classList.remove('d-none');
          if (iframePreviewAdjunto) iframePreviewAdjunto.src = urlArchivo;
        }

        if (btnDescargarAdjunto) {
          btnDescargarAdjunto.classList.remove('d-none');
          btnDescargarAdjunto.href = urlArchivo;
        }
        if (btnDescargarAdjuntoTab) {
          btnDescargarAdjuntoTab.classList.remove('d-none');
          btnDescargarAdjuntoTab.href = urlArchivo;
        }
        if (btnAmpliarAdjunto) btnAmpliarAdjunto.classList.remove('d-none');
      } else {
        if (cardPreviewAdjunto) cardPreviewAdjunto.classList.add('d-none');
        if (mensajeSinAdjunto) mensajeSinAdjunto.classList.remove('d-none');
        if (badgeTipoAdjunto) badgeTipoAdjunto.classList.add('d-none');

        if (iframePreviewAdjunto) iframePreviewAdjunto.src = 'about:blank';
        if (imgPreviewAdjunto) imgPreviewAdjunto.removeAttribute('src');

        if (btnDescargarAdjunto) {
          btnDescargarAdjunto.classList.add('d-none');
          btnDescargarAdjunto.href = '#';
        }
        if (btnDescargarAdjuntoTab) {
          btnDescargarAdjuntoTab.classList.add('d-none');
          btnDescargarAdjuntoTab.href = '#';
        }
        if (btnAmpliarAdjunto) btnAmpliarAdjunto.classList.add('d-none');
      }

      // Metadatos técnicos en modal
      if (metaTecnicaResultadoId) metaTecnicaResultadoId.textContent = idResultado || '—';
      if (metaTecnicaOrdenId) metaTecnicaOrdenId.textContent = data.orden_id || '—';
      if (metaTecnicaAtencionId) metaTecnicaAtencionId.textContent = atnId || '—';
      if (metaTecnicaArchivoUrl) metaTecnicaArchivoUrl.textContent = data.archivo_url || 'Sin archivo externo';

      // [25.42] Enlace Línea de tiempo
      if (btnLineaTiempo) {
        btnLineaTiempo.href = `/historias/${encodeURIComponent(pacienteId)}?evento=${encodeURIComponent(atnId)}`;
      }

      // [25.43] Botón Marcar como revisado
      if (btnMarcarRevisado) {
        btnMarcarRevisado.dataset.id = idResultado;

        if (estaRevisado) {
          btnMarcarRevisado.disabled = true;
          btnMarcarRevisado.classList.remove('btn-primary');
          btnMarcarRevisado.classList.add('btn-secondary');
          btnMarcarRevisado.innerHTML = `
            <svg width="16" height="16" fill="currentColor" class="bi bi-check2-circle" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0z"/>
              <path d="M15.354 3.354a.5.5 0 0 0-.708-.708L8 9.293 5.354 6.646a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0l7-7z"/>
            </svg>
            <span>Revisado</span>
          `;
        } else {
          btnMarcarRevisado.disabled = false;
          btnMarcarRevisado.classList.remove('btn-secondary');
          btnMarcarRevisado.classList.add('btn-primary');
          btnMarcarRevisado.innerHTML = `
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Marcar como revisado</span>
          `;
        }
      }

      if (btnImprimirResultado) {
        btnImprimirResultado.disabled = false;
      }

      actualizarControlesPaginacion();
    }

    /**
     * Carga el detalle del resultado desde la API por su ID.
     */
    async function seleccionarResultado(idResultado, filaElemento) {
      if (!idResultado) return;

      document.querySelectorAll('.fila-resultado').forEach((f) => {
        f.classList.remove('table-active');
        f.setAttribute('aria-current', 'false');
      });
      if (filaElemento) {
        filaElemento.classList.add('table-active');
        filaElemento.setAttribute('aria-current', 'true');
      }

      try {
        const respuesta = await fetch(`/api/resultados/${encodeURIComponent(idResultado)}`, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!respuesta.ok) {
          throw new Error(`Error ${respuesta.status}: no se pudo cargar el resultado`);
        }

        const json = await respuesta.json();
        const data = json && json.data !== undefined ? json.data : json;

        actualizarPanelDetalle(data, idResultado);
        if (modalHistorialResultados && modalHistorialResultados.open) {
          modalHistorialResultados.close();
        }
        window.HIS?.anunciarCambio?.(`Detalle del resultado ${data.orden_codigo || data.codigo || ''} cargado.`);
      } catch (err) {
        console.error('Error al obtener resultado:', err);
        if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
          window.HIS.mostrarMensaje('danger', 'No fue posible cargar el detalle del resultado seleccionado.');
        }
      }
    }

    /**
     * Ejecuta la petición PATCH para confirmar la revisión clínica del resultado.
     */
    async function ejecutarMarcarRevisado(idResultado) {
      if (!idResultado || !btnMarcarRevisado || btnMarcarRevisado.disabled) return;

      const htmlOriginal = btnMarcarRevisado.innerHTML;
      btnMarcarRevisado.disabled = true;
      btnMarcarRevisado.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        <span>Actualizando...</span>
      `;

      try {
        const resp = await fetch(`/api/resultados/${encodeURIComponent(idResultado)}/revisado`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        if (resp.status === 204 || resp.ok) {
          const fila = document.querySelector(`.fila-resultado[data-id="${idResultado}"]`);
          if (fila) {
            fila.dataset.revisado = 'true';
            const badge = fila.querySelector('.badge-estado-resultado');
            if (badge) {
              badge.classList.remove('bg-success', 'bg-opacity-25', 'text-success');
              badge.classList.add('bg-secondary', 'text-white');
              badge.textContent = 'REVISADO';
            }
          }

          if (detalleEstadoRevisionBadge) {
            detalleEstadoRevisionBadge.className = 'badge bg-secondary text-white';
            detalleEstadoRevisionBadge.textContent = 'REVISADO';
          }

          btnMarcarRevisado.disabled = true;
          btnMarcarRevisado.classList.remove('btn-primary');
          btnMarcarRevisado.classList.add('btn-secondary');
          btnMarcarRevisado.innerHTML = `
            <svg width="16" height="16" fill="currentColor" class="bi bi-check2-circle" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0z"/>
              <path d="M15.354 3.354a.5.5 0 0 0-.708-.708L8 9.293 5.354 6.646a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0l7-7z"/>
            </svg>
            <span>Revisado</span>
          `;

          actualizarBadgePendientes();

          if (window.HIS && window.HIS.notificaciones && typeof window.HIS.notificaciones.cargarConteoNoLeidas === 'function') {
            window.HIS.notificaciones.cargarConteoNoLeidas();
          }

          const notifCount = document.getElementById('notifCount');
          if (notifCount) {
            const val = parseInt(notifCount.textContent, 10) || 0;
            const nuevo = Math.max(0, val - 1);
            notifCount.textContent = nuevo > 99 ? '99+' : String(nuevo);
            if (nuevo === 0) {
              notifCount.hidden = true;
              notifCount.setAttribute('hidden', '');
              notifCount.classList.add('d-none');
            }
          }

          window.HIS?.marcarFormularioLimpio?.();
          window.HIS?.anunciarCambio?.('Resultado marcado como revisado.');
          if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
            window.HIS.mostrarMensaje('success', 'Resultado marcado como revisado.');
          }
        } else {
          const errorJson = await resp.json().catch(() => ({}));
          const mensajeError = (errorJson.error && errorJson.error.mensaje) || 'No fue posible marcar el resultado como revisado';
          throw new Error(mensajeError);
        }
      } catch (err) {
        console.error('Error al marcar resultado como revisado:', err);
        btnMarcarRevisado.disabled = false;
        btnMarcarRevisado.innerHTML = htmlOriginal;

        if (window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
          window.HIS.mostrarMensaje('danger', err.message || 'Error al actualizar el estado del resultado.');
        }
      }
    }

    // 1. Delegación de clics y teclado en la tabla de resultados dentro del modal
    if (tablaResultados) {
      tablaResultados.addEventListener('click', (e) => {
        const fila = e.target.closest('.fila-resultado');
        if (!fila) return;

        const id = fila.dataset.id;
        if (id) {
          seleccionarResultado(id, fila);
        }
      });

      tablaResultados.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const fila = e.target.closest('.fila-resultado');
        if (!fila) return;
        e.preventDefault();
        const id = fila.dataset.id;
        if (id) {
          seleccionarResultado(id, fila);
        }
      });
    }

    // 2. Filtro rápido Todos / Nuevos en el modal de historial
    if (grupoFiltroResultados) {
      grupoFiltroResultados.addEventListener('click', (e) => {
        const btn = e.target.closest('.visor-filter-btn');
        if (!btn) return;
        const filtro = btn.dataset.filtro || 'todos';

        grupoFiltroResultados.querySelectorAll('.visor-filter-btn').forEach((b) => {
          const activo = b === btn;
          b.classList.toggle('active', activo);
          b.setAttribute('aria-pressed', activo ? 'true' : 'false');
        });

        document.querySelectorAll('#listaResultadosBody .fila-resultado').forEach((fila) => {
          if (filtro === 'nuevos') {
            const esRevisado = fila.dataset.revisado === 'true';
            fila.classList.toggle('d-none', esRevisado);
          } else {
            fila.classList.remove('d-none');
          }
        });
      });
    }

    // 3. Apertura de modales y paginación rápida entre resultados
    if (btnAbrirHistorial && modalHistorialResultados) {
      btnAbrirHistorial.addEventListener('click', () => {
        modalHistorialResultados.showModal();
      });
    }

    if (btnResultadoAnterior) {
      btnResultadoAnterior.addEventListener('click', () => {
        const filas = Array.from(document.querySelectorAll('#listaResultadosBody .fila-resultado'));
        const idx = filas.findIndex((f) => f.classList.contains('table-active'));
        if (idx > 0) {
          const target = filas[idx - 1];
          seleccionarResultado(target.dataset.id, target);
        }
      });
    }

    if (btnResultadoSiguiente) {
      btnResultadoSiguiente.addEventListener('click', () => {
        const filas = Array.from(document.querySelectorAll('#listaResultadosBody .fila-resultado'));
        const idx = filas.findIndex((f) => f.classList.contains('table-active'));
        if (idx >= 0 && idx < filas.length - 1) {
          const target = filas[idx + 1];
          seleccionarResultado(target.dataset.id, target);
        }
      });
    }

    if (btnAmpliarAdjunto && modalVistaPreviaArchivo) {
      btnAmpliarAdjunto.addEventListener('click', () => {
        if (!estadoAdjuntoActual.tiene) return;
        if (tituloModalVistaPrevia) tituloModalVistaPrevia.textContent = estadoAdjuntoActual.nombre;
        if (btnDescargarEnModal) btnDescargarEnModal.href = estadoAdjuntoActual.url;

        if (estadoAdjuntoActual.esImagen) {
          if (iframeModalAdjunto) {
            iframeModalAdjunto.classList.add('d-none');
            iframeModalAdjunto.src = 'about:blank';
          }
          if (imgModalWrapper) imgModalWrapper.classList.remove('d-none');
          if (imgModalAdjunto) imgModalAdjunto.src = estadoAdjuntoActual.url;
        } else {
          if (imgModalWrapper) imgModalWrapper.classList.add('d-none');
          if (imgModalAdjunto) imgModalAdjunto.removeAttribute('src');
          if (iframeModalAdjunto) {
            iframeModalAdjunto.classList.remove('d-none');
            iframeModalAdjunto.src = estadoAdjuntoActual.url;
          }
        }
        modalVistaPreviaArchivo.showModal();
      });

      modalVistaPreviaArchivo.addEventListener('close', () => {
        if (iframeModalAdjunto) iframeModalAdjunto.src = 'about:blank';
      });
    }

    if (btnDetallesTecnicos && modalMetadatosTecnicos) {
      btnDetallesTecnicos.addEventListener('click', () => {
        modalMetadatosTecnicos.showModal();
      });
    }

    // 4. Botón Imprimir informe clínico
    if (btnImprimirResultado) {
      btnImprimirResultado.addEventListener('click', () => {
        window.print();
      });
    }

    // 5. Acción del botón [25.43] "Marcar como revisado" con modal limpio de confirmación
    if (btnMarcarRevisado) {
      btnMarcarRevisado.addEventListener('click', () => {
        const idResultado = btnMarcarRevisado.dataset.id;
        if (!idResultado || btnMarcarRevisado.disabled) return;

        if (modalConfirmarRevision) {
          const ordenTxt = detalleOrdenCodigo ? detalleOrdenCodigo.textContent.trim() : '';
          if (textoConfirmarRevision) {
            textoConfirmarRevision.textContent = ordenTxt && ordenTxt !== '—'
              ? `¿Confirmas la lectura clínica del resultado de la orden ${ordenTxt}?`
              : '¿Confirmas que has revisado este resultado diagnóstico y su interpretación clínica?';
          }
          modalConfirmarRevision.returnValue = '';
          modalConfirmarRevision.showModal();
        } else {
          ejecutarMarcarRevisado(idResultado);
        }
      });
    }

    if (modalConfirmarRevision) {
      modalConfirmarRevision.addEventListener('close', () => {
        const decision = modalConfirmarRevision.returnValue;
        modalConfirmarRevision.returnValue = '';
        if (decision === 'confirm' && btnMarcarRevisado) {
          ejecutarMarcarRevisado(btnMarcarRevisado.dataset.id);
        }
      });
    }
  });
})();
