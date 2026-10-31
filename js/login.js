/*
 * login.js — Comportamiento de la página de ingreso.
 */
(function () {
  'use strict';
  const { $, activarValidacion, formularioValido } = UI;

  const api = new ApiSimulada(DatosDemo.crearTiendaDemo());
  const form = $('#form-login');
  const mensaje = $('#login-mensaje');
  activarValidacion(form);

  // Mostrar u ocultar la contraseña (HTML dinámico sobre el atributo type).
  $('#ver-clave').addEventListener('click', e => {
    const campo = $('#password');
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    e.currentTarget.textContent = visible ? 'Mostrar' : 'Ocultar';
    e.currentTarget.setAttribute('aria-pressed', String(!visible));
  });

  form.addEventListener('submit', e => {
    e.preventDefault();                       // se reemplaza el envío nativo por uno controlado
    mensaje.hidden = true;
    if (!formularioValido(form)) return;

    const sol = InspectorHttp.solicitudDesdeFormulario(form, null);
    const r = api.atender(sol);
    InspectorHttp.mostrar(sol, r);

    if (r.estado === 200) {
      // El token de acceso dura 15 minutos y solo vive en esta pestaña (sessionStorage).
      // La renovación viaja en una cookie HttpOnly que JavaScript no puede leer.
      sessionStorage.setItem('yd.sesion', JSON.stringify({ token: r.cuerpo.accessToken, tienda: r.cuerpo.user.businessName }));
      mensaje.textContent = 'Ingreso correcto. Abriendo el panel…';
      mensaje.className = 'mensaje ok';
      mensaje.hidden = false;
      setTimeout(() => { location.href = 'app.html'; }, 1500);
    } else {
      // El mensaje no revela si falló el usuario o la contraseña.
      mensaje.textContent = r.cuerpo.detail;
      mensaje.className = 'mensaje error';
      mensaje.hidden = false;
      $('#password').value = '';
      $('#password').focus();
    }
  });
})();
