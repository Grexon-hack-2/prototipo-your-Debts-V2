/*
 * api-simulada.js — Sustituto en memoria de la API REST de Your-Debts.
 *
 * En este módulo no se programa el servidor; esta clase reproduce el contrato
 * de la API real (rutas, códigos de estado, encabezados y formato JSON) para
 * que el prototipo funcione sin backend. Igual que el servidor real, vuelve a
 * validar todo lo que recibe: la validación del navegador es una ayuda para el
 * usuario, no un control de seguridad. En el módulo siguiente se reemplaza por
 * llamadas a https://api.yourdebts.co.
 */
(function (global) {
  'use strict';

  const C = global.Calculos;
  const M = global.Modelos;

  /** Respuesta HTTP simplificada. */
  function respuesta(estado, texto, cuerpo = null, extra = {}) {
    const encabezados = {
      'Date': new Date().toUTCString(),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      ...extra,
    };
    if (cuerpo !== null) {
      const json = JSON.stringify(cuerpo);
      encabezados['Content-Type'] = estado >= 400 ? 'application/problem+json; charset=utf-8' : 'application/json; charset=utf-8';
      encabezados['Content-Length'] = String(new TextEncoder().encode(json).length);
    }
    return { estado, texto, encabezados, cuerpo };
  }

  /** Cuerpo de error en formato Problem Details (RFC 9457), como ApiExceptionHandler. */
  function problema(estado, titulo, detalle, errores) {
    const textos = { 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests' };
    const cuerpo = { type: `https://tools.ietf.org/html/rfc9110#section-15.5.${estado - 399}`, title: titulo, status: estado, detail: detalle };
    if (errores) cuerpo.errors = errores;
    return respuesta(estado, textos[estado], cuerpo);
  }

  class ApiSimulada {
    constructor(datos) {
      this.datos = datos;
      this.sesiones = new Map();          // token de acceso → usuario
      this.intentosFallidos = 0;          // AuthService.MaxFailedLogins = 5
      this.bloqueadoHasta = null;         // AuthService.LockoutDuration = 15 min
      this.version = 1;                   // cambia cuando cambia el catálogo (ETag)
    }

    /** Punto de entrada: recibe { metodo, ruta, encabezados, cuerpo } y devuelve una respuesta. */
    atender(sol) {
      const [ruta, consulta = ''] = sol.ruta.split('?');
      const params = new URLSearchParams(consulta);
      const publico = ruta === '/api/auth/login' || ruta === '/api/portal';
      const usuario = this.usuarioDe(sol.encabezados);
      if (!publico && !usuario) return problema(401, 'No autorizado', 'Inicie sesión de nuevo.');

      try {
        if (sol.metodo === 'POST' && ruta === '/api/auth/login') return this.login(sol.cuerpo);
        if (sol.metodo === 'GET' && ruta === '/api/customers') return this.listarClientes(params);
        if (sol.metodo === 'GET' && /^\/api\/customers\/[^/]+$/.test(ruta)) return this.detalleCliente(ruta.split('/')[3]);
        if (sol.metodo === 'POST' && ruta === '/api/charges') return this.crearCargo(sol.cuerpo);
        if (sol.metodo === 'POST' && ruta === '/api/payments') return this.crearAbono(sol.cuerpo);
        if ((sol.metodo === 'GET' || sol.metodo === 'HEAD') && ruta === '/api/products') return this.catalogo(sol);
        if (sol.metodo === 'POST' && /^\/api\/products\/[^/]+\/restock$/.test(ruta)) return this.reabastecer(ruta.split('/')[3], sol.cuerpo);
        if (sol.metodo === 'GET' && ruta === '/api/portal') return this.portal(sol.encabezados['X-Portal-Token']);
        return problema(404, 'No encontrado', `No existe ${sol.metodo} ${ruta}.`);
      } catch (e) {
        return problema(400, 'Solicitud no válida', e.message);
      }
    }

    usuarioDe(encabezados) {
      const auth = encabezados['Authorization'] || '';
      return auth.startsWith('Bearer ') ? this.sesiones.get(auth.slice(7)) : null;
    }

    login({ userName, password }) {
      if (this.bloqueadoHasta && this.bloqueadoHasta > Date.now()) return problema(401, 'No autorizado', 'Cuenta bloqueada temporalmente por intentos fallidos.');
      // Credenciales de demostración; el servidor real compara un hash PBKDF2.
      if (userName !== 'tienda017' || password !== 'Fiado-2026') {
        if (++this.intentosFallidos >= 5) { this.bloqueadoHasta = Date.now() + 15 * 60 * 1000; this.intentosFallidos = 0; }
        return problema(401, 'No autorizado', 'Usuario o contraseña incorrectos.');
      }
      this.intentosFallidos = 0;
      const token = 'eyJhbGciOiJIUzI1NiJ9.' + M.nuevoId().replace(/-/g, '');
      this.sesiones.set(token, { userName, tienda: this.datos.tienda.id });
      return respuesta(200, 'OK', {
        accessToken: token,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshToken: '(se entrega en cookie HttpOnly)',
        user: { userName, businessName: this.datos.tienda.nombre },
      }, { 'Set-Cookie': 'yd_refresh=…; Path=/api/auth; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict' });
    }

    listarClientes(params) {
      const q = (params.get('search') || '').trim().toLowerCase();
      const conSaldo = params.get('withBalance') === 'true';
      const lista = this.datos.clientes
        .filter(c => !q || c.nombre.toLowerCase().includes(q) || (c.telefono || '').includes(q))
        .filter(c => !conSaldo || c.saldo > 0)
        .map(c => ({ id: c.id, name: c.nombre, phone: c.telefono, balance: c.saldo, creditLimit: c.cupo, riskLevel: c.riesgo().nivel }));
      return respuesta(200, 'OK', lista, { 'Cache-Control': 'private, no-cache', 'Vary': 'Authorization' });
    }

    /** GET /api/customers/{id} — estado de cuenta con la aplicación FIFO y el riesgo. */
    detalleCliente(id) {
      const c = this.datos.clientes.find(x => x.id === id);
      if (!c) return problema(404, 'No encontrado', 'Cliente no encontrado.');
      const r = c.riesgo();
      const pendientes = C.aplicarAbonosFifo(c.cargos, c.abonos).filter(a => a.pendiente > 0)
        .map(a => ({ id: a.id, description: a.descripcion, amount: a.monto, occurredAt: a.fecha.toISOString(), dueAt: a.vence.toISOString(), outstanding: a.pendiente }));
      return respuesta(200, 'OK', {
        id: c.id, name: c.nombre, phone: c.telefono, creditLimit: c.cupo, balance: c.saldo,
        portalUrl: `portal.html#t=${c.tokenPortal}`,
        risk: { score: r.puntaje, level: r.nivel, overdue: r.vencido, maxDaysOverdue: r.diasMora, suggestedCreditLimit: r.cupoSugerido, factors: r.factores },
        pending: pendientes,
      }, { 'Cache-Control': 'private, no-store' });
    }

    /** POST /api/charges — repite en el servidor todas las validaciones del formulario. */
    crearCargo(b) {
      const existente = this.buscarMovimiento(b.id);
      if (existente) return respuesta(200, 'OK', existente);    // reenvío idempotente: no duplica
      const cliente = this.cliente(b.customerId);
      let cargo;
      if (b.productId) {
        const producto = this.producto(b.productId);
        const cantidad = Number(b.quantity);
        if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero.');
        if (cantidad > producto.stock) throw new Error(`Stock insuficiente de ${producto.nombre}: hay ${producto.stock}.`);
        const monto = C.totalFiado(cantidad, producto.precio);    // el precio lo pone el servidor, no el formulario
        cargo = new M.Cargo({ id: b.id, descripcion: b.description || `${cantidad} × ${producto.nombre}`, monto, productoId: producto.id, cantidad, precioUnitario: producto.precio, vencimiento: b.dueDate || null });
      } else {
        const monto = Number(b.amount);
        if (!(monto > 0)) throw new Error('Indica el monto del cargo.');
        cargo = new M.Cargo({ id: b.id, descripcion: b.description, monto, vencimiento: b.dueDate || null });
      }
      if (cliente.superariaCupo(cargo.monto) && b.overLimitConfirmed !== true) {
        throw new Error(`El fiado deja el saldo en ${C.formatearCOP(cliente.saldo + cargo.monto)} y supera el cupo de ${C.formatearCOP(cliente.cupo)}. Confirme para continuar.`);
      }
      // Todo o nada: solo después de pasar todas las reglas se descuenta el stock y se guarda el cargo.
      if (cargo.productoId) this.producto(cargo.productoId).descontar(cargo.cantidad);
      cliente.agregarCargo(cargo);
      return respuesta(201, 'Created', { id: cargo.id, customerId: cliente.id, description: cargo.descripcion, amount: cargo.monto, occurredAt: cargo.fecha.toISOString(), dueDate: cargo.vencimiento, balanceAfter: cliente.saldo },
        { 'Location': `/api/charges/${cargo.id}` });
    }

    crearAbono(b) {
      const existente = this.buscarMovimiento(b.id);
      if (existente) return respuesta(200, 'OK', existente);
      const cliente = this.cliente(b.customerId);
      const abono = new M.Abono({ id: b.id, monto: Number(b.amount), metodo: b.method, nota: b.note || null });
      cliente.agregarAbono(abono);                                  // aplica validarAbono() otra vez
      return respuesta(201, 'Created', { id: abono.id, customerId: cliente.id, amount: abono.monto, method: abono.metodo, balanceAfter: cliente.saldo, receipt: { kind: 'Receipt', status: b.sendReceipt ? 'Manual' : 'Skipped' } },
        { 'Location': `/api/payments/${abono.id}` });
    }

    /** GET y HEAD comparten encabezados; HEAD no devuelve cuerpo. */
    catalogo(sol) {
      const etag = `"catalogo-v${this.version}"`;
      if (sol.encabezados['If-None-Match'] === etag) return respuesta(304, 'Not Modified', null, { 'ETag': etag, 'Cache-Control': 'private, no-cache' });
      const lista = this.datos.productos.map(p => ({ id: p.id, name: p.nombre, unitPrice: p.precio, stock: p.stock, lowStock: p.stockBajo }));
      const r = respuesta(200, 'OK', lista, { 'ETag': etag, 'Cache-Control': 'private, no-cache', 'Vary': 'Authorization' });
      if (sol.metodo === 'HEAD') r.cuerpo = null;                   // misma longitud declarada, sin cuerpo
      return r;
    }

    reabastecer(id, b) {
      const producto = this.producto(id);
      const factura = b.invoice;
      if (factura && !['image/jpeg', 'image/png'].includes(factura.type)) throw new Error('La factura debe ser JPEG o PNG.');
      if (factura && factura.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB.');
      producto.reabastecer(Number(b.quantity), Number(b.unitCost));
      this.version++;                                               // invalida el ETag del catálogo
      return respuesta(200, 'OK', { id: producto.id, stock: producto.stock, unitCost: producto.costo });
    }

    /** El token viaja en un encabezado, no en la URL, para que no quede en registros ni historial. */
    portal(token) {
      const cliente = this.datos.clientes.find(c => c.tokenPortal === token);
      if (!cliente) return problema(404, 'No encontrado', 'El enlace no es válido o expiró.');
      return respuesta(200, 'OK', { businessName: this.datos.tienda.nombre, ...cliente.vistaPortal() });
    }

    cliente(id) {
      const c = this.datos.clientes.find(x => x.id === id);
      if (!c) throw new Error('Cliente no encontrado.');
      return c;
    }

    producto(id) {
      const p = this.datos.productos.find(x => x.id === id);
      if (!p) throw new Error('Producto no encontrado.');
      return p;
    }

    buscarMovimiento(id) {
      if (!id) return null;
      for (const c of this.datos.clientes) {
        const m = [...c.cargos, ...c.abonos].find(x => x.id === id);
        if (m) return { id: m.id, customerId: c.id, amount: m.monto, balanceAfter: c.saldo, duplicate: true };
      }
      return null;
    }
  }

  global.ApiSimulada = ApiSimulada;
})(window);
