/*
 * ui.js — Utilidades de interfaz reutilizables por todas las páginas.
 */
(function (global) {
  'use strict';

  /** Atajo de querySelector. */
  const $ = (selector, raiz = document) => raiz.querySelector(selector);

  /** Mensaje en español según la restricción que falla (API de validación de restricciones). */
  function mensajeDeValidacion(control) {
    const v = control.validity;
    if (v.valid) return '';
    if (v.customError) return control.validationMessage;   // reglas de negocio primero
    if (v.valueMissing) return 'Este campo es obligatorio.';
    if (v.typeMismatch) return 'El formato no es válido.';
    if (v.patternMismatch) return control.dataset.mensajePatron || 'Hay caracteres no permitidos.';
    if (v.tooShort) return `Escriba al menos ${control.minLength} caracteres.`;
    if (v.tooLong) return `Escriba máximo ${control.maxLength} caracteres.`;
    if (v.rangeUnderflow) return `El valor mínimo es ${control.min}.`;
    if (v.rangeOverflow) return `El valor máximo es ${control.max}.`;
    if (v.stepMismatch) return `Use múltiplos de ${control.step}.`;
    if (v.badInput) return 'Escriba un número válido.';
    return 'Revise este campo.';
  }

  /** Muestra u oculta el error de un control y actualiza aria-invalid. Devuelve true si es válido. */
  function validarCampo(control) {
    const mensaje = mensajeDeValidacion(control);
    const destino = document.getElementById(control.id + '-error');
    if (destino) destino.textContent = mensaje;
    control.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    return !mensaje;
  }

  /**
   * Activa la validación inmediata: el navegador conserva las restricciones del HTML
   * (required, min, max, pattern...), pero los mensajes los muestra el script junto al campo.
   */
  function activarValidacion(form) {
    form.noValidate = true;
    form.addEventListener('blur', e => { if (e.target.willValidate) validarCampo(e.target); }, true);
    form.addEventListener('input', e => {
      if (e.target.getAttribute('aria-invalid') === 'true') validarCampo(e.target);
    });
  }

  /** Valida todos los controles; enfoca el primero con error. */
  function formularioValido(form) {
    let primero = null;
    for (const c of form.elements) {
      if (c.willValidate && !validarCampo(c) && !primero) primero = c;
    }
    if (primero) primero.focus();
    return !primero;
  }

  /** Crea un elemento con texto (textContent, nunca innerHTML, para no interpretar HTML del usuario). */
  function crear(etiqueta, texto = '', clase = '') {
    const el = document.createElement(etiqueta);
    if (texto) el.textContent = texto;
    if (clase) el.className = clase;
    return el;
  }

  let temporizador = null;
  /** Mensaje temporal en la parte inferior de la pantalla. */
  function notificar(texto, tipo = 'ok') {
    const caja = $('#notificacion');
    if (!caja) return;
    caja.textContent = texto;
    caja.dataset.tipo = tipo;
    caja.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { caja.hidden = true; }, 4000);
  }

  /** Fecha corta en formato colombiano. */
  function fechaCorta(fecha) {
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(fecha);
  }

  /** Retrasa una función hasta que el usuario deja de escribir. */
  function retrasar(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  global.UI = { $, mensajeDeValidacion, validarCampo, activarValidacion, formularioValido, crear, notificar, fechaCorta, retrasar };
})(window);
