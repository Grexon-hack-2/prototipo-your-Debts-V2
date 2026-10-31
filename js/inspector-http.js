/*
 * inspector-http.js — Construye y muestra el mensaje HTTP de cada operación.
 *
 * Sirve para ver, en la propia página, la línea de solicitud, los encabezados,
 * el cuerpo y la respuesta, igual que en la pestaña Red de las herramientas de
 * desarrollo del navegador.
 */
(function (global) {
  'use strict';

  const HOST = 'api.yourdebts.co';

  /** Convierte un FormData en objeto plano; los números y booleanos se convierten según el control. */
  function formularioAObjeto(form) {
    const datos = {};
    for (const control of form.elements) {
      if (!control.name || control.disabled) continue;
      if ((control.type === 'radio' || control.type === 'checkbox') && !control.checked) {
        if (control.type === 'checkbox' && control.value === 'true') datos[control.name] = false;
        continue;
      }
      if (control.type === 'file') { datos[control.name] = control.files[0] || null; continue; }
      if (control.value === '') continue;
      if (control.type === 'number') datos[control.name] = Number(control.value);
      else if (control.type === 'checkbox' && control.value === 'true') datos[control.name] = true;
      else datos[control.name] = control.value;
    }
    return datos;
  }

  /**
   * Arma la solicitud que corresponde al formulario según sus atributos
   * method, action y enctype. Con GET los datos van en la URL; con POST van
   * en el cuerpo (JSON, o multipart si el formulario adjunta archivos).
   */
  function solicitudDesdeFormulario(form, tokenAcceso) {
    const metodo = (form.getAttribute('method') || 'get').toUpperCase();
    const ruta = new URL(form.getAttribute('action'), 'https://' + HOST).pathname;
    const datos = formularioAObjeto(form);
    const encabezados = { 'Host': HOST, 'Accept': 'application/json' };
    if (tokenAcceso) encabezados['Authorization'] = 'Bearer ' + tokenAcceso;

    if (metodo === 'GET') {
      const consulta = new URLSearchParams(Object.entries(datos).map(([k, v]) => [k, String(v)])).toString();
      return { metodo, ruta: consulta ? `${ruta}?${consulta}` : ruta, encabezados, cuerpo: null };
    }
    if (form.enctype === 'multipart/form-data') {
      encabezados['Content-Type'] = 'multipart/form-data; boundary=----yd7MA4YWxkTrZu0gW';
    } else {
      encabezados['Content-Type'] = 'application/json; charset=utf-8';
    }
    return { metodo, ruta, encabezados, cuerpo: datos };
  }

  /** Texto del cuerpo tal como viajaría. */
  function serializarCuerpo(sol) {
    if (sol.cuerpo === null) return '';
    const tipo = sol.encabezados['Content-Type'] || '';
    if (tipo.startsWith('multipart/form-data')) {
      const limite = '------yd7MA4YWxkTrZu0gW';
      const partes = Object.entries(sol.cuerpo).map(([k, v]) => {
        if (v && typeof v === 'object' && 'size' in v) {
          return `${limite}\r\nContent-Disposition: form-data; name="${k}"; filename="${v.name}"\r\nContent-Type: ${v.type}\r\n\r\n‹${v.size.toLocaleString('es-CO')} bytes binarios›`;
        }
        return `${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`;
      });
      return partes.join('\r\n') + `\r\n${limite}--`;
    }
    const copia = { ...sol.cuerpo };
    if ('password' in copia) copia.password = '••••••••';           // nunca se muestra la contraseña
    return JSON.stringify(copia, null, 2);
  }

  /** Mensaje completo de solicitud: línea de solicitud, encabezados, línea vacía y cuerpo. */
  function textoSolicitud(sol) {
    const cuerpo = serializarCuerpo(sol);
    const enc = { ...sol.encabezados };
    if (enc['Authorization']) enc['Authorization'] = enc['Authorization'].slice(0, 30) + '…';
    if (cuerpo && !enc['Content-Type'].startsWith('multipart')) enc['Content-Length'] = String(new TextEncoder().encode(JSON.stringify(sol.cuerpo)).length);
    const lineas = [`${sol.metodo} ${sol.ruta} HTTP/2`, ...Object.entries(enc).map(([k, v]) => `${k}: ${v}`)];
    return lineas.join('\n') + '\n\n' + cuerpo;
  }

  /** Mensaje completo de respuesta: línea de estado, encabezados y cuerpo. */
  function textoRespuesta(r) {
    const lineas = [`HTTP/2 ${r.estado} ${r.texto}`, ...Object.entries(r.encabezados).map(([k, v]) => `${k}: ${v}`)];
    return lineas.join('\n') + '\n\n' + (r.cuerpo ? JSON.stringify(r.cuerpo, null, 2) : '');
  }

  /** Muestra la solicitud y la respuesta en el panel del inspector. */
  function mostrar(sol, r) {
    const panel = document.querySelector('#inspector');
    if (!panel) return;
    panel.querySelector('[data-http="solicitud"]').textContent = textoSolicitud(sol);
    panel.querySelector('[data-http="respuesta"]').textContent = textoRespuesta(r);
    const estado = panel.querySelector('[data-http="estado"]');
    estado.textContent = `${sol.metodo} ${sol.ruta.split('?')[0]} → ${r.estado} ${r.texto}`;
    estado.dataset.tipo = r.estado < 300 ? 'ok' : r.estado < 400 ? 'info' : 'error';
  }

  global.InspectorHttp = { formularioAObjeto, solicitudDesdeFormulario, serializarCuerpo, textoSolicitud, textoRespuesta, mostrar };
})(window);
