/*
 * portal.js — Consulta pública del estado de cuenta.
 *
 * El enlace tiene la forma portal.html#t=<token>. El fragmento (#...) nunca
 * se envía al servidor en la línea de solicitud, ni queda en los registros
 * de acceso; el script lo lee y lo manda en un encabezado.
 */
(function () {
  'use strict';
  const { $, crear, fechaCorta } = UI;
  const { formatearCOP } = Calculos;

  const api = new ApiSimulada(DatosDemo.crearTiendaDemo());
  const token = new URLSearchParams(location.hash.slice(1)).get('t');

  // Quita el token de la barra de direcciones para que no quede a la vista ni en capturas.
  history.replaceState(null, '', location.pathname);

  const sol = {
    metodo: 'GET', ruta: '/api/portal',
    encabezados: { 'Host': 'api.yourdebts.co', 'Accept': 'application/json', 'X-Portal-Token': token || '' },
    cuerpo: null,
  };
  const r = api.atender(sol);
  InspectorHttp.mostrar(sol, r);
  $('#portal-cargando').hidden = true;

  if (r.estado !== 200) {
    $('#portal-error').textContent = 'El enlace no es válido o ya expiró. Pida uno nuevo en la tienda.';
    $('#portal-error').hidden = false;
    return;
  }

  const cuenta = r.cuerpo;
  $('#portal-tienda').textContent = cuenta.businessName;
  $('#portal-cliente').textContent = cuenta.nombre.split(' ')[0];
  $('#portal-saldo').textContent = cuenta.saldo > 0 ? formatearCOP(cuenta.saldo) : '¡A paz y salvo!';

  // Generación de contenido: un elemento de lista por movimiento.
  $('#portal-movimientos').replaceChildren(...cuenta.movimientos.map(m => {
    const li = crear('li', '', m.tipo);
    li.append(
      crear('span', fechaCorta(new Date(m.fecha)), 'fecha'),
      crear('span', m.descripcion, 'descripcion'),
      crear('span', (m.tipo === 'abono' ? '− ' : '+ ') + formatearCOP(m.monto), 'monto'));
    return li;
  }));
  $('#portal-cuenta').hidden = false;
})();
