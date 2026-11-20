// public/js/atencion_consulta.js — C.4: guardar motivo y registrar signos vitales
(function () {
  const { api, mostrarMensaje, limpiarBorrador } = window.HIS || {};
  const cont = document.getElementById('consulta');
  if (!cont) return;

  const atencionId = cont.dataset.atencion;
  const esSoloLectura = cont.dataset.soloLectura === 'true';
  const form = document.getElementById('formSignos');
  const motivo = document.getElementById('motivo');
  const btnGuardarTop = document.getElementById('btnGuardarMotivo') || document.getElementById('btnGuardarMotivoTop');
  const imcPrevio = document.getElementById('imcPrevio');

  // Limpiar estado de validación al tipear en motivo
  if (motivo) {
    motivo.addEventListener('input', () => {
      if (motivo.value.trim().length >= 5) {
        motivo.classList.remove('is-invalid');
      }
    });
  }

  // Cálculo en vivo del IMC en vista previa
  function recalcularImc() {
    if (!form || !imcPrevio) return;
    const peso = parseFloat(form.peso_kg ? form.peso_kg.value : '');
    const talla = parseFloat(form.talla_cm ? form.talla_cm.value : '');

    if (peso > 0 && talla > 0) {
      const metros = talla / 100.0;
      const imc = (peso / (metros * metros)).toFixed(1);
      imcPrevio.value = imc;
    } else {
      imcPrevio.value = '';
    }
  }

  if (form) {
    if (form.peso_kg) form.peso_kg.addEventListener('input', recalcularImc);
    if (form.talla_cm) form.talla_cm.addEventListener('input', recalcularImc);
  }

  // Clasificación y cálculo en vivo de Triage (I a V - Res. 5596/2015 MinSalud Colombia)
  const triageMeta = {
    1: { clase: 'badge-triage-1', label: 'Triage I · Reanimación' },
    2: { clase: 'badge-triage-2', label: 'Triage II · Emergencia' },
    3: { clase: 'badge-triage-3', label: 'Triage III · Urgencia' },
    4: { clase: 'badge-triage-4', label: 'Triage IV · Prioritario' },
    5: { clase: 'badge-triage-5', label: 'Triage V · Consulta Externa' }
  };

  function calcularNivelTriage({ pas, pad, fc, fr, temp, spo2 }) {
    // Triage I — Reanimación / Riesgo vital inminente
    if (
      (spo2 !== null && spo2 > 0 && spo2 < 85) ||
      (fc !== null && (fc < 40 || fc > 150)) ||
      (fr !== null && (fr < 8 || fr > 35)) ||
      (pas !== null && (pas < 70 || pas >= 220)) ||
      (temp !== null && (temp < 32 || temp >= 41))
    ) {
      return 1;
    }

    // Triage II — Emergencia
    if (
      (spo2 !== null && spo2 >= 85 && spo2 < 90) ||
      (fc !== null && ((fc >= 40 && fc < 50) || (fc > 120 && fc <= 150))) ||
      (fr !== null && ((fr >= 8 && fr <= 10) || (fr >= 28 && fr <= 35))) ||
      (pas !== null && ((pas >= 70 && pas < 90) || pas >= 180)) ||
      (pad !== null && pad >= 120) ||
      (temp !== null && (temp < 35 || temp >= 39.5))
    ) {
      return 2;
    }

    // Triage III — Urgencia
    if (
      (spo2 !== null && spo2 >= 90 && spo2 < 95) ||
      (fc !== null && ((fc >= 50 && fc < 60) || (fc > 100 && fc <= 120))) ||
      (fr !== null && fr >= 22 && fr < 28) ||
      (pas !== null && pas >= 140 && pas < 180) ||
      (pad !== null && pad >= 90 && pad < 120) ||
      (temp !== null && temp >= 38.0 && temp < 39.5)
    ) {
      return 3;
    }

    // Triage IV — Prioritario
    if (
      (fc !== null && fc > 90 && fc <= 100) ||
      (fr !== null && fr > 20 && fr < 22) ||
      (pas !== null && pas >= 130 && pas < 140) ||
      (pad !== null && pad >= 85 && pad < 90) ||
      (temp !== null && temp >= 37.5 && temp < 38.0)
    ) {
      return 4;
    }

    // Triage V — Consulta Externa / Parámetros estables
    return 5;
  }

  function aplicarTriageABadge(el, nivel) {
    if (!el) return;
    const meta = triageMeta[nivel] || triageMeta[5];
    el.classList.remove(
      'badge-triage-1', 'badge-triage-I',
      'badge-triage-2', 'badge-triage-II',
      'badge-triage-3', 'badge-triage-III',
      'badge-triage-4', 'badge-triage-IV',
      'badge-triage-5', 'badge-triage-V',
      'badge-triage-pendiente'
    );
    el.classList.add('badge', 'badge-triage', meta.clase);
    el.title = `Clasificación de Triage: ${meta.label}`;
    el.setAttribute('aria-label', `Clasificación de Triage: ${meta.label}`);
    el.innerHTML = `
      <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7"/>
      </svg>
      <span>${meta.label}</span>
    `;
  }

  function recalcularTriage() {
    if (!form) return;
    const leer = (campo) => {
      const el = form[campo] || document.getElementById(campo);
      if (!el || el.value.trim() === '') return null;
      const v = parseFloat(el.value);
      return isNaN(v) ? null : v;
    };

    const pas = leer('presion_sistolica');
    const pad = leer('presion_diastolica');
    const fc = leer('frecuencia_cardiaca');
    const fr = leer('frecuencia_respiratoria');
    const temp = leer('temperatura_celsius');
    const spo2 = leer('saturacion_oxigeno');

    const haySignos = (pas !== null || pad !== null || fc !== null || fr !== null || temp !== null || spo2 !== null);
    if (!haySignos) return;

    const nivel = calcularNivelTriage({ pas, pad, fc, fr, temp, spo2 });
    const badgePrevio = document.getElementById('triagePrevioBadge');
    const bannerTriage = document.getElementById('bannerTriage');

    aplicarTriageABadge(badgePrevio, nivel);
    aplicarTriageABadge(bannerTriage, nivel);
  }

  // Registrar listeners para recalcular Triage en vivo
  const camposTriage = [
    'presion_sistolica',
    'presion_diastolica',
    'frecuencia_cardiaca',
    'frecuencia_respiratoria',
    'temperatura_celsius',
    'saturacion_oxigeno'
  ];
  camposTriage.forEach((campo) => {
    const el = document.getElementById(campo) || (form && form[campo]);
    if (el) {
      el.addEventListener('input', recalcularTriage);
    }
  });

  // Ejecución inicial por si hay valores precargados
  recalcularTriage();

  // Guardado definitivo del motivo de consulta
  if (btnGuardarTop && motivo && !esSoloLectura) {
    btnGuardarTop.addEventListener('click', async () => {
      const texto = motivo.value.trim();
      if (texto.length < 5) {
        motivo.classList.add('is-invalid');
        if (mostrarMensaje) {
          mostrarMensaje('warning', 'Por favor ingrese un motivo de consulta válido (mínimo 5 caracteres).');
        }
        motivo.focus();
        return;
      }
      motivo.classList.remove('is-invalid');
      const htmlOriginal = btnGuardarTop.innerHTML;
      btnGuardarTop.disabled = true;
      btnGuardarTop.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Guardando…';
      try {
        await api(`/api/atenciones/${atencionId}`, {
          method: 'PUT',
          body: { motivo_consulta: texto },
        });
        if (limpiarBorrador) limpiarBorrador(motivo);
        window.HIS?.marcarFormularioLimpio?.();
        window.HIS?.anunciarCambio?.('Motivo de consulta guardado');
        mostrarMensaje('success', 'Motivo de consulta guardado exitosamente.');
      } catch (err) {
        mostrarMensaje('danger', err.message || 'No se pudo guardar el motivo de consulta.');
      } finally {
        btnGuardarTop.disabled = false;
        btnGuardarTop.innerHTML = htmlOriginal;
      }
    });
  }

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

  // Envío del registro de signos vitales
  if (form && !esSoloLectura) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const datos = {};
      let algunDiligenciado = false;

      for (const [key, value] of formData.entries()) {
        const valTrim = String(value).trim();
        if (valTrim !== '') {
          const num = Number(valTrim);
          if (!Number.isNaN(num)) {
            datos[key] = num;
            algunDiligenciado = true;
          }
        }
      }

      if (!algunDiligenciado) {
        mostrarMensaje('warning', 'Debe diligenciar al menos un signo vital antes de registrar.');
        return;
      }

      const btnSubmit = form.querySelector('button[type="submit"]');
      if (btnSubmit) btnSubmit.disabled = true;

      try {
        const res = await api(`/api/atenciones/${atencionId}/signos`, {
          method: 'POST',
          body: datos,
        });

        const imcDevuelto = res && res.imc ? ` · IMC calculado: ${res.imc}` : '';
        mostrarMensaje('success', `Signos vitales registrados correctamente${imcDevuelto}.`);

        const signosResp = await api(`/api/atenciones/${atencionId}/signos`, { method: 'GET' });
        const tomas = Array.isArray(signosResp)
          ? signosResp
          : (signosResp && Array.isArray(signosResp.data) ? signosResp.data : []);
        renderizarTablaSignos(tomas, res && res.id ? res.id : null);

        form.reset();
        if (imcPrevio) imcPrevio.value = '';
        window.HIS?.marcarFormularioLimpio?.(form);
        if (btnSubmit) btnSubmit.disabled = false;
        window.HIS?.anunciarCambio?.('Signos vitales registrados y tabla actualizada');
      } catch (err) {
        mostrarMensaje('danger', err.message || 'Error al registrar los signos vitales.');
        if (btnSubmit) btnSubmit.disabled = false;
      }
    });
  }
})();
