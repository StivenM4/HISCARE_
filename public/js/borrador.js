// public/js/borrador.js — Auto-guardado de borradores clínicos (C.4, HIS-E-06, HIS-NF-06)
(function () {
  'use strict';

  const { api } = window.HIS || {
    api: async (url, opts) => {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin',
      });
      if (res.status === 204) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error((data.error && data.error.mensaje) || 'Error ' + res.status);
        error.status = res.status;
        throw error;
      }
      return data.data !== undefined ? data.data : data;
    }
  };

  const cont = document.getElementById('consulta') || document.querySelector('[data-atencion]');
  if (!cont) return;

  const atencionId = cont.dataset.atencion;
  const soloLectura = cont.dataset.soloLectura === 'true';
  const motivo = document.querySelector('textarea[data-borrador="motivo"]');
  const indicador = document.getElementById('indicadorBorrador');
  const textoBorrador = document.getElementById('textoBorrador');

  if (!motivo || soloLectura || motivo.disabled) return;

  // 1. Inicialización desde borrador del servidor si el motivo en atención está vacío
  if (motivo.value.trim() === '') {
    const borradorServidor = motivo.dataset.borradorServidor;
    if (borradorServidor && borradorServidor.trim() !== '') {
      motivo.value = borradorServidor;
    }
  }

  let ultimoTextoGuardado = motivo.value;
  let guardando = false;

  // 2. Función de auto-guardado hacia PUT /api/atenciones/:id/borrador
  async function guardarBorradorServidor() {
    if (guardando || motivo.disabled) return;
    const textoActual = motivo.value;

    // Si no ha cambiado el contenido desde la última persistencia, omitir envío
    if (textoActual === ultimoTextoGuardado) return;

    guardando = true;
    try {
      await api(`/api/atenciones/${atencionId}/borrador`, {
        method: 'PUT',
        body: {
          seccion: 'motivo',
          contenido: { texto: textoActual }
        }
      });

      ultimoTextoGuardado = textoActual;

      // Actualizar el indicador [C4-32]
      if (indicador && textoBorrador) {
        const ahora = new Date();
        const hh = String(ahora.getHours()).padStart(2, '0');
        const mm = String(ahora.getMinutes()).padStart(2, '0');
        const hc = indicador.dataset.hc || 'HC-0000';
        textoBorrador.textContent = `ℹ Borrador guardado automáticamente a las ${hh}:${mm} · Historia clínica ${hc} abierta en esta atención`;
      }
      if (window.HIS && typeof window.HIS.anunciarCambio === 'function') {
        window.HIS.anunciarCambio('Borrador guardado automáticamente en el servidor.', 'polite');
      }
    } catch (err) {
      // Los fallos de borrador no deben interrumpir la experiencia clínica
      console.warn('Auto-guardado de borrador en servidor:', err.message);
    } finally {
      guardando = false;
    }
  }

  // 3. Debounce de 1000 ms ante tipeo del usuario
  let debounceTimeout = null;
  motivo.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(guardarBorradorServidor, 1000);
  });

  // 4. Temporizador periódico cada 30 segundos
  setInterval(guardarBorradorServidor, 30000);

  // Exponer para pruebas o disparos manuales si es necesario
  window.HISCARE_BORRADOR = {
    guardar: guardarBorradorServidor
  };
})();
