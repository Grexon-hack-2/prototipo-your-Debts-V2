/*
 * app.js — Panel de la tienda: búsqueda, estado de cuenta, fiados, abonos e inventario.
 *
 * Toda la información se obtiene "del servidor" (ApiSimulada) mediante
 * solicitudes con método, ruta, encabezados y cuerpo; la página solo pinta
 * las respuestas JSON. Así, en el módulo siguiente basta con cambiar
 * api.atender(sol) por fetch() hacia la API real.
 */
(function () {
  'use strict';
  const { $, activarValidacion, formularioValido, validarCampo, crear, notificar, fechaCorta, retrasar } = UI;
  const { formatearCOP, totalFiado, sumarDias } = Calculos;

  // ── Sesión ────────────────────────────────────────────────────────────────
  const sesion = JSON.parse(sessionStorage.getItem('yd.sesion') || 'null');
  if (!sesion) { location.replace('index.html'); return; }

  const api = new ApiSimulada(DatosDemo.crearTiendaDemo());
  api.sesiones.set(sesion.token, { userName: 'tienda017' });       // la sesión que abrió login.js

  /** Estado de la página: lo último que respondió el servidor. */
  const estado = { clientes: new Map(), productos: new Map(), cuenta: null, etagCatalogo: null };

  /** Envía una solicitud, la muestra en el inspector y devuelve la respuesta. */
  function enviar(metodo, ruta, cuerpo = null, extra = {}) {
    const encabezados = { 'Host': 'api.yourdebts.co', 'Accept': 'application/json', 'Authorization': 'Bearer ' + sesion.token, ...extra };
    if (cuerpo) encabezados['Content-Type'] = 'application/json; charset=utf-8';
    const sol = { metodo, ruta, encabezados, cuerpo };
    return despachar(sol);
  }

  function despachar(sol) {
    const r = api.atender(sol);
    InspectorHttp.mostrar(sol, r);
    if (r.estado === 401) { sessionStorage.removeItem('yd.sesion'); location.replace('index.html'); }
    return r;
  }

  $('#nombre-tienda').textContent = sesion.tienda;
  $('#salir').addEventListener('click', () => { sessionStorage.removeItem('yd.sesion'); location.replace('index.html'); });

  // ── Búsqueda de clientes (GET) ────────────────────────────────────────────
  const formBuscar = $('#form-buscar');

  /** Lee los criterios de la URL de la página (?search=...&withBalance=true). */
  function criteriosDeLaUrl() {
    const p = new URLSearchParams(location.search);
    return { search: p.get('search') || '', withBalance: p.get('withBalance') === 'true' };
  }

  function pintarClientes({ search, withBalance }) {
    formBuscar.search.value = search;
    formBuscar.withBalance.checked = withBalance;
    const consulta = new URLSearchParams();
    if (search) consulta.set('search', search);
    if (withBalance) consulta.set('withBalance', 'true');
    const r = enviar('GET', '/api/customers' + (consulta.toString() ? '?' + consulta : ''));
    if (r.estado !== 200) return;

    const cuerpoTabla = $('#tabla-clientes tbody');
    cuerpoTabla.replaceChildren();                                   // borra las filas anteriores
    const plantilla = $('#tpl-fila-cliente');
    estado.clientes.clear();
    for (const c of r.cuerpo) {
      estado.clientes.set(c.id, c);
      const fila = plantilla.content.cloneNode(true);
      fila.querySelector('[data-campo="nombre"]').textContent = c.name;
      fila.querySelector('[data-campo="saldo"]').textContent = formatearCOP(c.balance);
      const insignia = fila.querySelector('[data-campo="riesgo"]');
      insignia.textContent = c.riskLevel;
      insignia.dataset.nivel = c.riskLevel;
      fila.querySelector('[data-accion="abrir"]').dataset.id = c.id;
      cuerpoTabla.append(fila);
    }
    const total = r.cuerpo.reduce((t, c) => t + c.balance, 0);
    $('#resumen-busqueda').textContent = `${r.cuerpo.length} cliente(s) · cartera ${formatearCOP(total)}`;
    llenarSelectClientes();
  }

  // Con JavaScript, el envío GET actualiza la URL sin recargar (la búsqueda sigue siendo enlazable).
  formBuscar.addEventListener('submit', e => {
    e.preventDefault();
    const datos = new FormData(formBuscar);
    const consulta = new URLSearchParams();
    if (datos.get('search')) consulta.set('search', datos.get('search').trim());
    if (datos.get('withBalance')) consulta.set('withBalance', 'true');
    history.pushState(null, '', '?' + consulta);
    pintarClientes(criteriosDeLaUrl());
  });
  formBuscar.search.addEventListener('input', retrasar(() => formBuscar.requestSubmit(), 300));
  formBuscar.withBalance.addEventListener('change', () => formBuscar.requestSubmit());
  window.addEventListener('popstate', () => pintarClientes(criteriosDeLaUrl()));

  // Delegación de eventos: un solo manejador para todos los botones "Ver cuenta".
  $('#tabla-clientes').addEventListener('click', e => {
    const boton = e.target.closest('[data-accion="abrir"]');
    if (boton) abrirCuenta(boton.dataset.id);
  });

  // ── Estado de cuenta ──────────────────────────────────────────────────────
  function abrirCuenta(id, desplazar = true) {
    const r = enviar('GET', `/api/customers/${encodeURIComponent(id)}`);
    if (r.estado !== 200) return;
    const c = r.cuerpo;
    estado.cuenta = c;

    $('#t-cuenta').textContent = c.name;
    $('#cuenta-saldo').textContent = formatearCOP(c.balance);
    $('#cuenta-cupo').textContent = c.creditLimit ? formatearCOP(c.creditLimit) : 'Sin cupo';
    const uso = c.creditLimit ? Math.min(1, c.balance / c.creditLimit) : 0;
    $('#cuenta-uso').value = uso;
    $('#cuenta-uso').textContent = Math.round(uso * 100) + ' %';
    $('#cuenta-riesgo').textContent = `${c.risk.level} (${c.risk.score}/100)`;
    $('#cuenta-riesgo').dataset.nivel = c.risk.level;
    $('#cuenta-cupo-sugerido').textContent = c.risk.suggestedCreditLimit != null ? `Cupo sugerido: ${formatearCOP(c.risk.suggestedCreditLimit)}` : '';

    const lista = $('#cuenta-factores ul');
    lista.replaceChildren(...(c.risk.factors.length
      ? c.risk.factors.map(f => crear('li', `${f.detalle} (+${f.puntos})`))
      : [crear('li', 'Sin factores de riesgo.')]));

    const cuerpo = $('#tabla-fifo tbody');
    cuerpo.replaceChildren();
    const hoy = new Date();
    for (const p of c.pending) {
      const fila = crear('tr');
      const vence = new Date(p.dueAt);
      fila.append(
        crear('td', fechaCorta(new Date(p.occurredAt))), crear('td', p.description),
        crear('td', formatearCOP(p.amount), 'num'), crear('td', fechaCorta(vence), vence < hoy ? 'vencido' : ''),
        crear('td', formatearCOP(p.outstanding), 'num'));
      cuerpo.append(fila);
    }
    if (!c.pending.length) {
      const celda = crear('td', 'Cuenta a paz y salvo.');
      celda.colSpan = 5;
      const fila = crear('tr');
      fila.append(celda);
      cuerpo.append(fila);
    }

    $('#enlace-portal').href = c.portalUrl;
    $('#cuenta').hidden = false;
    if (desplazar) $('#cuenta').scrollIntoView({ behavior: 'smooth' });
  }

  // Botones "Registrar fiado" y "Registrar abono": muestran la sección y preseleccionan el cliente.
  document.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    const destino = b.dataset.ir;
    $('#' + destino).hidden = false;
    $(`#${destino}-cliente`).value = estado.cuenta.id;
    $(`#${destino}-cliente`).dispatchEvent(new Event('change'));
    $('#' + destino).scrollIntoView({ behavior: 'smooth' });
    $(`#${destino}-cliente`).focus();
  }));

  function llenarSelectClientes() {
    for (const sel of [$('#fiado-cliente'), $('#abono-cliente')]) {
      const elegido = sel.value;
      sel.replaceChildren(new Option('Seleccione…', ''));
      for (const c of api.datos.clientes) sel.append(new Option(c.nombre, c.id));
      sel.value = elegido;
    }
  }

  // ── Inventario: GET, HEAD y POST multipart ───────────────────────────────
  function pintarProductos() {
    const r = enviar('GET', '/api/products');
    if (r.estado !== 200) return;
    estado.etagCatalogo = r.encabezados['ETag'];
    estado.productos = new Map(r.cuerpo.map(p => [p.id, p]));
    const cuerpo = $('#tabla-productos tbody');
    cuerpo.replaceChildren(...r.cuerpo.map(p => {
      const fila = crear('tr', '', p.lowStock ? 'stock-bajo' : '');
      fila.append(crear('td', p.name), crear('td', formatearCOP(p.unitPrice), 'num'), crear('td', p.lowStock ? `${p.stock} (bajo)` : String(p.stock), 'num'));
      return fila;
    }));
    for (const sel of [$('#fiado-producto'), $('#compra-producto')]) {
      const elegido = sel.value;
      sel.replaceChildren(new Option('Seleccione…', ''), ...r.cuerpo.map(p => new Option(`${p.name} — ${formatearCOP(p.unitPrice)}`, p.id)));
      sel.value = elegido;
    }
    actualizarTotalFiado();
  }

  // HEAD: pregunta por los encabezados (ETag) sin descargar el catálogo.
  $('#verificar-catalogo').addEventListener('click', () => {
    const r = enviar('HEAD', '/api/products');
    if (r.encabezados['ETag'] === estado.etagCatalogo) notificar('El catálogo no ha cambiado; no hace falta descargarlo.', 'info');
    else { notificar('El catálogo cambió; se descarga de nuevo.', 'info'); pintarProductos(); }
  });

  const formCompra = $('#form-compra');
  activarValidacion(formCompra);
  $('#compra-factura').addEventListener('change', e => {
    const archivo = e.target.files[0];
    let error = '';
    if (archivo && !['image/jpeg', 'image/png'].includes(archivo.type)) error = 'La factura debe ser una imagen JPEG o PNG.';
    else if (archivo && archivo.size > 5 * 1024 * 1024) error = 'La imagen supera 5 MB.';
    e.target.setCustomValidity(error);
    validarCampo(e.target);
  });
  formCompra.addEventListener('submit', e => {
    e.preventDefault();
    if (!formularioValido(formCompra)) return;
    const sol = InspectorHttp.solicitudDesdeFormulario(formCompra, sesion.token);
    const id = sol.cuerpo.productId;
    delete sol.cuerpo.productId;                                     // el producto va en la ruta
    sol.ruta = `/api/products/${encodeURIComponent(id)}/restock`;
    const r = despachar(sol);
    if (r.estado === 200) { notificar('Compra registrada.'); formCompra.reset(); pintarProductos(); InspectorHttp.mostrar(sol, r); }
    else notificar(r.cuerpo.detail, 'error');
  });

  // ── Formulario de fiado ──────────────────────────────────────────────────
  const formFiado = $('#form-fiado');
  activarValidacion(formFiado);

  // Rango de la fecha de pago: desde hoy hasta 90 días.
  const aIso = f => f.toISOString().slice(0, 10);
  $('#fiado-vence').min = aIso(new Date());
  $('#fiado-vence').max = aIso(sumarDias(new Date(), 90));

  /** Muestra un bloque y habilita sus controles; el otro se oculta y deshabilita (no se envía ni se valida). */
  function alternarTipo() {
    const tipo = formFiado.tipo.value;
    for (const [bloque, visible] of [['#bloque-producto', tipo === 'producto'], ['#bloque-libre', tipo === 'libre']]) {
      $(bloque).hidden = !visible;
      $(bloque).querySelectorAll('input, select').forEach(c => { c.disabled = !visible; });
    }
    actualizarTotalFiado();
  }
  formFiado.querySelectorAll('[name="tipo"]').forEach(r => r.addEventListener('change', alternarTipo));

  /** Calcula el total en vivo y avisa si el fiado supera el cupo. */
  function actualizarTotalFiado() {
    let total = 0;
    if (formFiado.tipo.value === 'producto') {
      const p = estado.productos.get($('#fiado-producto').value);
      const cantidad = Number($('#fiado-cantidad').value) || 0;
      $('#fiado-producto-ayuda').textContent = p ? `Precio ${formatearCOP(p.unitPrice)} · disponibles ${p.stock}` : '';
      if (p) $('#fiado-cantidad').max = p.stock;
      total = p ? totalFiado(cantidad, p.unitPrice) : 0;
    } else {
      total = Number($('#fiado-monto').value) || 0;
    }
    $('#fiado-total').textContent = total ? `Total del fiado: ${formatearCOP(total)}` : '';

    const cliente = api.datos.clientes.find(c => c.id === $('#fiado-cliente').value);
    const supera = cliente && total > 0 && cliente.superariaCupo(total);
    $('#bloque-sobrecupo').hidden = !supera;
    $('#fiado-sobrecupo').required = supera;
    const aviso = $('#fiado-aviso');
    aviso.hidden = !supera;
    if (supera) aviso.textContent = `Con este fiado el saldo queda en ${formatearCOP(cliente.saldo + total)} y supera el cupo de ${formatearCOP(cliente.cupo)}.`;
  }
  formFiado.addEventListener('input', actualizarTotalFiado);
  formFiado.addEventListener('change', actualizarTotalFiado);
  formFiado.addEventListener('reset', () => setTimeout(alternarTipo));

  formFiado.addEventListener('submit', e => {
    e.preventDefault();
    if (!formularioValido(formFiado)) return;
    // El identificador se crea una vez por fiado: si el envío se repite, el servidor no lo duplica.
    const campoId = formFiado.elements.namedItem('id');
    if (!campoId.value) campoId.value = Modelos.nuevoId();
    const sol = InspectorHttp.solicitudDesdeFormulario(formFiado, sesion.token);
    delete sol.cuerpo.tipo;                                          // solo controla la interfaz
    const r = despachar(sol);
    if (r.estado === 201 || r.estado === 200) {
      notificar(`Fiado guardado. Nuevo saldo: ${formatearCOP(r.cuerpo.balanceAfter)}.`);
      const cliente = formFiado.customerId.value;
      formFiado.reset();
      formFiado.elements.namedItem('id').value = '';
      refrescar(cliente);
      InspectorHttp.mostrar(sol, r);                                 // el inspector conserva el POST
    } else {
      $('#fiado-aviso').textContent = r.cuerpo.detail;
      $('#fiado-aviso').hidden = false;
    }
  });

  // ── Formulario de abono ──────────────────────────────────────────────────
  const formAbono = $('#form-abono');
  activarValidacion(formAbono);

  $('#abono-cliente').addEventListener('change', () => {
    const c = api.datos.clientes.find(x => x.id === $('#abono-cliente').value);
    const monto = $('#abono-monto');
    if (!c) { $('#abono-monto-ayuda').textContent = ''; return; }
    monto.max = c.saldo + 1;                                         // misma tolerancia que el servidor
    $('#abono-monto-ayuda').textContent = `Saldo pendiente: ${formatearCOP(c.saldo)}`;
    vistaPreviaAbono();
  });

  /** Muestra qué cargos quedarían pagados con el abono escrito (aplicación FIFO). */
  function vistaPreviaAbono() {
    const c = api.datos.clientes.find(x => x.id === $('#abono-cliente').value);
    const monto = Number($('#abono-monto').value) || 0;
    const salida = $('#abono-vista-previa');
    if (!c || monto <= 0) { salida.textContent = ''; return; }
    const error = Calculos.validarAbono(monto, c.saldo);
    $('#abono-monto').setCustomValidity(error || '');
    if (error) { salida.textContent = ''; validarCampo($('#abono-monto')); return; }
    const simulado = Calculos.aplicarAbonosFifo(c.cargos, [...c.abonos, { monto, fecha: new Date() }]);
    const cubiertos = simulado.filter(a => a.pendiente === 0 && a.pagadoEn && a.pagadoEn > sumarDias(new Date(), -1)).map(a => a.descripcion);
    salida.textContent = `Saldo después del abono: ${formatearCOP(Math.max(0, c.saldo - monto))}` +
      (cubiertos.length ? ` · Quedan pagados: ${cubiertos.join(', ')}` : '');
  }
  $('#abono-monto').addEventListener('input', vistaPreviaAbono);
  $('#abono-nota').addEventListener('input', e => { $('#abono-nota-contador').textContent = `${e.target.value.length} / 200`; });

  formAbono.addEventListener('submit', e => {
    e.preventDefault();
    vistaPreviaAbono();
    if (!formularioValido(formAbono)) return;
    const campoId = formAbono.elements.namedItem('id');
    if (!campoId.value) campoId.value = Modelos.nuevoId();
    const sol = InspectorHttp.solicitudDesdeFormulario(formAbono, sesion.token);
    const r = despachar(sol);
    if (r.estado === 201 || r.estado === 200) {
      notificar(r.cuerpo.balanceAfter > 0 ? `Abono guardado. Saldo: ${formatearCOP(r.cuerpo.balanceAfter)}.` : '¡Cuenta a paz y salvo!');
      const cliente = formAbono.customerId.value;
      formAbono.reset();
      formAbono.elements.namedItem('id').value = '';
      $('#abono-nota-contador').textContent = '0 / 200';
      $('#abono-vista-previa').textContent = '';
      refrescar(cliente);
      InspectorHttp.mostrar(sol, r);
    } else {
      $('#abono-monto').setCustomValidity(r.cuerpo.detail);
      validarCampo($('#abono-monto'));
    }
  });

  /** Vuelve a pedir los datos que cambiaron después de una escritura. */
  function refrescar(clienteId) {
    pintarProductos();
    pintarClientes(criteriosDeLaUrl());
    if (clienteId) abrirCuenta(clienteId, false);
  }

  // ── Arranque ─────────────────────────────────────────────────────────────
  pintarProductos();
  pintarClientes(criteriosDeLaUrl());
  alternarTipo();
})();
