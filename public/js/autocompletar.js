// public/js/autocompletar.js — Componente reutilizable de autocompletado y búsqueda predictiva (C.20)
// Requisitos: HIS-NF-11, HIS-E-11 · EDT: DIA-01, DIA-02
(function (global) {
  'use strict';

  var escapeHtml = (global.HIS && global.HIS.escapeHtml) || (global.HISCARE && global.HISCARE.escapeHtml) || function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Componente Autocompletar para campos de búsqueda predictiva con soporte para:
   * - Solicitudes asíncronas con debounce (por defecto 300ms)
   * - Cancelación de peticiones previas mediante AbortController
   * - Menú desplegable flotante con posicionamiento y scroll
   * - Navegación por teclado (Flecha Abajo, Flecha Arriba, Enter, Escape)
   * - Detección de texto inválido si se presiona Enter sin elegir del catálogo
   * - Renderizado personalizable y soporte de trazabilidad data-trace
   *
   * @param {HTMLElement|string} inputElement - Elemento <input> o selector CSS
   * @param {Object} options - Configuración del autocompletador
   */
  function Autocompletar(inputElement, options) {
    if (!(this instanceof Autocompletar)) {
      return new Autocompletar(inputElement, options);
    }

    this.input = typeof inputElement === 'string'
      ? document.querySelector(inputElement)
      : inputElement;

    if (!this.input) {
      return;
    }

    this.options = Object.assign(
      {
        endpoint: '',
        minCaracteres: 2,
        debounceMs: 300,
        paramQuery: 'q',
        limpiarAlSeleccionar: true,
        dataTraceDropdown: null,
        dataTraceItem: null,
        placeholderCargando: 'Buscando...',
        placeholderVacio: 'No se encontraron coincidencias en el catálogo.',
        onSeleccionar: function () {},
        onTextoInvalido: function () {},
        renderItem: null
      },
      options || {}
    );

    this.abortController = null;
    this.debounceTimer = null;
    this.sugerencias = [];
    this.indiceActivo = -1;
    this.abierto = false;

    this._iniciarContenedor();
    this._vincularEventos();
  }

  Autocompletar.prototype._iniciarContenedor = function () {
    if (typeof document === 'undefined') {
      this.dropdown = {
        style: {},
        classList: { add: function () {}, remove: function () {} },
        setAttribute: function () {},
        innerHTML: '',
        appendChild: function () {},
        querySelectorAll: function () { return []; }
      };
      return;
    }

    // Asegurar que el contenedor padre tenga posición relativa para anclar el dropdown
    var parent = this.input.parentElement;
    if (parent && typeof window !== 'undefined' && window.getComputedStyle && window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'autocompletar-dropdown dropdown-menu w-100 shadow-sm border py-1';
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.style.position = 'absolute';
    this.dropdown.style.top = '100%';
    this.dropdown.style.left = '0';
    this.dropdown.style.right = '0';
    this.dropdown.style.zIndex = '1050';
    this.dropdown.style.maxHeight = '280px';
    this.dropdown.style.overflowY = 'auto';
    this.dropdown.style.display = 'none';

    if (this.options.dataTraceDropdown) {
      this.dropdown.setAttribute('data-trace', this.options.dataTraceDropdown);
    }

    if (parent) {
      parent.appendChild(this.dropdown);
    }
  };

  /**
   * Vincula los listeners de eventos para input, teclado, clic y desenfoque.
   */
  Autocompletar.prototype._vincularEventos = function () {
    var self = this;

    // Entrada de texto con debounce
    this._onInput = function () {
      var valor = (self.input.value || '').trim();
      clearTimeout(self.debounceTimer);

      if (valor.length < self.options.minCaracteres) {
        if (self.abortController) {
          self.abortController.abort();
          self.abortController = null;
        }
        self.sugerencias = [];
        self.cerrar();
        return;
      }

      self.debounceTimer = setTimeout(function () {
        self.buscar(valor);
      }, self.options.debounceMs);
    };
    this.input.addEventListener('input', this._onInput);

    // Navegación por teclado
    this._onKeyDown = function (e) {
      if (!self.abierto && (e.key === 'ArrowDown' || e.key === 'Down')) {
        if ((self.input.value || '').trim().length >= self.options.minCaracteres) {
          self.abrir();
          e.preventDefault();
          return;
        }
      }

      if (e.key === 'ArrowDown' || e.key === 'Down') {
        if (self.abierto && self.sugerencias.length > 0) {
          e.preventDefault();
          self.indiceActivo = (self.indiceActivo + 1) % self.sugerencias.length;
          self._actualizarFocoVisual();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        if (self.abierto && self.sugerencias.length > 0) {
          e.preventDefault();
          self.indiceActivo = (self.indiceActivo - 1 + self.sugerencias.length) % self.sugerencias.length;
          self._actualizarFocoVisual();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var textoIngresado = (self.input.value || '').trim();

        if (self.abierto && self.indiceActivo >= 0 && self.indiceActivo < self.sugerencias.length) {
          // Seleccionar elemento resaltado
          self.seleccionar(self.sugerencias[self.indiceActivo]);
        } else {
          // Si no seleccionó de la lista, disparar callback de texto inválido [20.40]
          if (textoIngresado.length > 0) {
            self.options.onTextoInvalido(textoIngresado, self.sugerencias.slice(0, 5));
          }
          self.cerrar();
        }
      } else if (e.key === 'Escape' || e.key === 'Esc') {
        self.cerrar();
      } else if (e.key === 'Tab') {
        self.cerrar();
      }
    };
    this.input.addEventListener('keydown', this._onKeyDown);

    // Cierre al hacer clic fuera
    this._onDocumentClick = function (e) {
      if (!self.input.contains(e.target) && !self.dropdown.contains(e.target)) {
        self.cerrar();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this._onDocumentClick);
    }
  };

  /**
   * Ejecuta la consulta al endpoint remoto cancelando solicitudes previas activas.
   * @param {string} consulta - Texto de búsqueda
   */
  Autocompletar.prototype.buscar = function (consulta) {
    var self = this;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    var signal = this.abortController.signal;

    // Mostrar estado de búsqueda en el dropdown
    this._renderCargando();
    this.abrir();

    var url = this.options.endpoint;
    if (typeof url === 'string') {
      var separador = url.indexOf('?') >= 0 ? '&' : '?';
      url += separador + encodeURIComponent(this.options.paramQuery) + '=' + encodeURIComponent(consulta);
    }

    var peticion = (typeof this.options.endpoint === 'function')
      ? this.options.endpoint(consulta, signal)
      : fetch(url, { signal: signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          });

    peticion
      .then(function (datos) {
        var items = [];
        if (Array.isArray(datos)) {
          items = datos;
        } else if (datos && Array.isArray(datos.data)) {
          items = datos.data;
        } else if (datos && datos.resultados && Array.isArray(datos.resultados)) {
          items = datos.resultados;
        }

        self.sugerencias = items;
        self.indiceActivo = -1;

        if (items.length > 0) {
          self._renderSugerencias(items, consulta);
          self.abrir();
        } else {
          self._renderVacio();
          self.abrir();
        }
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          // Solicitud cancelada por una nueva pulsación de tecla; no hacer nada
          return;
        }
        self.sugerencias = [];
        self.cerrar();
      });
  };

  /**
   * Renderiza el estado cargando.
   */
  Autocompletar.prototype._renderCargando = function () {
    this.dropdown.innerHTML =
      '<div class="px-3 py-2 text-muted small d-flex align-items-center gap-2">' +
      '<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span>' +
      '<span>' + escapeHtml(this.options.placeholderCargando) + '</span>' +
      '</div>';
  };

  /**
   * Renderiza el estado sin resultados.
   */
  Autocompletar.prototype._renderVacio = function () {
    this.dropdown.innerHTML =
      '<div class="px-3 py-2 text-muted small fst-italic">' +
      escapeHtml(this.options.placeholderVacio) +
      '</div>';
  };

  /**
   * Renderiza la lista de sugerencias en el menú desplegable.
   * @param {Array} items - Catálogo de resultados encontrados
   * @param {string} consulta - Término buscado para resaltado
   */
  Autocompletar.prototype._renderSugerencias = function (items, consulta) {
    var self = this;
    this.dropdown.innerHTML = '';

    items.forEach(function (item, index) {
      var itemEl = document.createElement('div');
      itemEl.className = 'dropdown-item py-2 px-3 d-flex align-items-center justify-content-between text-wrap cursor-pointer border-bottom border-light';
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('data-index', String(index));
      itemEl.style.cursor = 'pointer';

      if (self.options.dataTraceItem) {
        var traceVal = typeof self.options.dataTraceItem === 'function'
          ? self.options.dataTraceItem(item, index)
          : self.options.dataTraceItem;
        itemEl.setAttribute('data-trace', traceVal);
      }

      if (typeof self.options.renderItem === 'function') {
        var contenido = self.options.renderItem(item, consulta);
        if (typeof contenido === 'string') {
          itemEl.innerHTML = contenido;
        } else if (contenido instanceof HTMLElement) {
          itemEl.appendChild(contenido);
        }
      } else {
        // Render por defecto: Código en badge y descripción textual
        var codigoHtml = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-bold px-2 py-1 me-2">' +
          escapeHtml(item.codigo || '') +
          '</span>';
        var descHtml = '<span class="text-dark small fw-medium">' +
          escapeHtml(item.descripcion || '') +
          '</span>';
        itemEl.innerHTML = '<div class="d-flex align-items-center gap-2 flex-grow-1 text-truncate">' +
          codigoHtml + descHtml +
          '</div>';
      }

      // Eventos del mouse sobre la sugerencia
      itemEl.addEventListener('mouseenter', function () {
        self.indiceActivo = index;
        self._actualizarFocoVisual();
      });

      itemEl.addEventListener('mousedown', function (e) {
        // Prevenir blur del input antes de la selección
        e.preventDefault();
      });

      itemEl.addEventListener('click', function () {
        self.seleccionar(item);
      });

      self.dropdown.appendChild(itemEl);
    });
  };

  /**
   * Actualiza el resaltado visual del elemento activo con el teclado.
   */
  Autocompletar.prototype._actualizarFocoVisual = function () {
    var elementos = this.dropdown.querySelectorAll('.dropdown-item');
    for (var i = 0; i < elementos.length; i++) {
      if (i === this.indiceActivo) {
        elementos[i].classList.add('active', 'bg-light', 'text-dark');
        elementos[i].scrollIntoView({ block: 'nearest' });
      } else {
        elementos[i].classList.remove('active', 'bg-light', 'text-dark');
      }
    }
  };

  /**
   * Selecciona un elemento del catálogo y ejecuta el callback correspondiente.
   * @param {Object} item - Elemento elegido
   */
  Autocompletar.prototype.seleccionar = function (item) {
    if (this.options.limpiarAlSeleccionar) {
      this.input.value = '';
    } else {
      this.input.value = item.codigo ? (item.codigo + ' - ' + (item.descripcion || '')) : (item.descripcion || '');
    }

    this.cerrar();

    if (typeof this.options.onSeleccionar === 'function') {
      this.options.onSeleccionar(item);
    }
  };

  /**
   * Abre el menú desplegable.
   */
  Autocompletar.prototype.abrir = function () {
    this.dropdown.style.display = 'block';
    this.dropdown.classList.add('show');
    this.abierto = true;
  };

  /**
   * Cierra el menú desplegable y resetea el índice activo.
   */
  Autocompletar.prototype.cerrar = function () {
    this.dropdown.style.display = 'none';
    this.dropdown.classList.remove('show');
    this.indiceActivo = -1;
    this.abierto = false;
  };

  /**
   * Destruye el componente y remueve sus elementos del DOM.
   */
  Autocompletar.prototype.destruir = function () {
    if (this.input) {
      this.input.removeEventListener('input', this._onInput);
      this.input.removeEventListener('keydown', this._onKeyDown);
    }
    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.dropdown && this.dropdown.parentElement) {
      this.dropdown.parentElement.removeChild(this.dropdown);
    }
  };

  // Exposición en el entorno global (navegador) y CommonJS (Node.js)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Autocompletar;
  }
  global.Autocompletar = Autocompletar;

})(typeof window !== 'undefined' ? window : globalThis);
