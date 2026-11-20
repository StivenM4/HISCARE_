// public/js/consulta.js — C.4: guardar motivo y registrar signos vitales
(function () {
  const { api, mostrarMensaje, limpiarBorrador } = window.HIS || {};
  const cont = document.getElementById('consulta');
  if (!cont) return;

  const atencionId = cont.dataset.atencion;
  const form = document.getElementById('formSignos');
  const motivo = document.getElementById('motivo');
  const imcPrevio = document.getElementById('imcPrevio');

  function escaparHtml(str) {
    if (window.HIS && typeof window.HIS.escaparHtml === 'function') {
      return window.HIS.escaparHtml(str);
    }
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderizarTablaSignos(tomas, nuevaTomaId) {
    const tablaSignos = document.getElementById('tablaSignos');
    const tbody = document.getElementById('tomas') || (tablaSignos ? tablaSignos.querySelector('tbody') : null);
    if (!tbody) return;

    if (!Array.isArray(tomas) || tomas.length === 0) {
      tbody.innerHTML = '<tr id="filaSinTomas"><td colspan="9" class="text-muted py-2">Sin signos vitales registrados</td></tr>';
      return;
    }

    tbody.innerHTML = tomas.map((t, idx) => {
      const esNueva = (nuevaTomaId && t.id && String(t.id) === String(nuevaTomaId)) || (!nuevaTomaId && idx === 0);
      const ta = (t.presion_sistolica != null && t.presion_diastolica != null)
        ? `${escaparHtml(t.presion_sistolica)}/${escaparHtml(t.presion_diastolica)}`
        : (t.ta_texto ? escaparHtml(t.ta_texto) : '-');
      return `<tr${esNueva ? ' class="his-row-updated"' : ''}>
        <td>${escaparHtml(t.hora || t.hora_formateada || '--:--')}</td>
        <td>${ta}</td>
        <td>${t.frecuencia_cardiaca != null ? escaparHtml(t.frecuencia_cardiaca) : '-'}</td>
        <td>${t.frecuencia_respiratoria != null ? escaparHtml(t.frecuencia_respiratoria) : '-'}</td>
        <td>${t.temperatura_celsius != null ? escaparHtml(t.temperatura_celsius) : '-'}</td>
        <td>${t.saturacion_oxigeno != null ? escaparHtml(t.saturacion_oxigeno) : '-'}</td>
        <td>${t.peso_kg != null ? escaparHtml(t.peso_kg) : '-'}</td>
        <td>${t.talla_cm != null ? escaparHtml(t.talla_cm) : '-'}</td>
        <td><span class="badge bg-light text-primary border">${t.imc != null ? escaparHtml(t.imc) : '-'}</span></td>
      </tr>`;
    }).join('');
  }

  // Vista previa del IMC; el valor definitivo lo calcula la base de datos (columna generada)
  if (form) {
    form.addEventListener('input', () => {
      const p = parseFloat(form.peso_kg.value), t = parseFloat(form.talla_cm.value) / 100;
      if (imcPrevio) imcPrevio.value = p && t ? (p / (t * t)).toFixed(1) : '';
    });
  }

  const btn = document.getElementById('btnGuardarMotivo');
  if (btn && motivo) {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/atenciones/${atencionId}`, { method: 'PUT', body: { motivo_consulta: motivo.value } });
        if (limpiarBorrador) limpiarBorrador(motivo);
        window.HIS?.marcarFormularioLimpio?.();
        window.HIS?.anunciarCambio?.('Motivo de consulta guardado');
        mostrarMensaje('success', 'Motivo de consulta guardado.');
      } catch (err) {
        mostrarMensaje('danger', err.message);
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }   // mismos rangos que el CHECK
      const datos = Object.fromEntries(new FormData(form));
      const btnSubmit = form.querySelector('button[type="submit"]');
      if (btnSubmit) btnSubmit.disabled = true;

      try {
        const res = await api(`/api/atenciones/${atencionId}/signos`, { method: 'POST', body: datos });
        const imc = res && res.imc ? res.imc : null;
        mostrarMensaje('success', 'Signos registrados' + (imc ? ` · IMC ${imc}` : ''));

        const signosResp = await api(`/api/atenciones/${atencionId}/signos`, { method: 'GET' });
        const tomas = Array.isArray(signosResp)
          ? signosResp
          : (signosResp && Array.isArray(signosResp.data) ? signosResp.data : []);
        renderizarTablaSignos(tomas, res && res.id ? res.id : null);

        form.reset();
        if (imcPrevio) imcPrevio.value = '';
        window.HIS?.marcarFormularioLimpio?.(form);
        window.HIS?.anunciarCambio?.('Signos vitales registrados y tabla actualizada');
      } catch (err) {
        mostrarMensaje('danger', err.message);
      } finally {
        if (btnSubmit) btnSubmit.disabled = false;
      }
    });
  }
})();
