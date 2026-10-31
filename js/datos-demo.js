/*
 * datos-demo.js — Datos de demostración (ficticios) de la tienda T-017.
 *
 * Las fechas se expresan en días antes de "hoy" para que el estado de cuenta
 * y el puntaje de riesgo den siempre los mismos resultados que el documento,
 * que usa como fecha de referencia el 31 de octubre de 2026.
 */
(function (global) {
  'use strict';

  const M = (typeof module !== 'undefined' && module.exports) ? require('./modelos.js') : global.Modelos;

  /** Fecha de hace n días a las 12:00. */
  function haceDias(n, ahora) {
    const f = new Date(ahora);
    f.setHours(12, 0, 0, 0);
    f.setDate(f.getDate() - n);
    return f;
  }

  function crearTiendaDemo(ahora = new Date()) {
    const d = n => haceDias(n, ahora);

    const productos = [
      new M.Producto({ id: 'P-001', nombre: 'Arroz (libra)', precio: 3500, costo: 2900, stock: 30, stockMinimo: 10 }),
      new M.Producto({ id: 'P-002', nombre: 'Aceite vegetal 1 L', precio: 12900, costo: 10800, stock: 12, stockMinimo: 4 }),
      new M.Producto({ id: 'P-003', nombre: 'Huevos AA (unidad)', precio: 650, costo: 520, stock: 90, stockMinimo: 30 }),
      new M.Producto({ id: 'P-004', nombre: 'Panela (libra)', precio: 3200, costo: 2600, stock: 6, stockMinimo: 8 }),
      new M.Producto({ id: 'P-005', nombre: 'Leche 1 L', precio: 4800, costo: 4000, stock: 24, stockMinimo: 10 }),
      new M.Producto({ id: 'P-006', nombre: 'Café molido 250 g', precio: 9800, costo: 8100, stock: 15, stockMinimo: 5 }),
    ];

    // Cliente del ejemplo de verificación numérica (Tabla de cálculo del documento).
    const ana = new M.Cliente({ id: 'C-0147', nombre: 'Ana Lucía Restrepo', telefono: '+573001234567', cupo: 60000, desde: d(152), tokenPortal: 'demo-portal-ana-7f3c9a' });
    ana.cargos.push(
      new M.Cargo({ id: 'K-1', descripcion: 'Mercado semanal', monto: 20000, fecha: d(143) }),
      new M.Cargo({ id: 'K-2', descripcion: 'Mercado quincena', monto: 40000, fecha: d(118) }),
      new M.Cargo({ id: 'K-3', descripcion: 'Granos y aseo', monto: 35000, fecha: d(82) }),
      new M.Cargo({ id: 'K-4', descripcion: 'Mercado del mes', monto: 50000, fecha: d(59) }),
      new M.Cargo({ id: 'K-5', descripcion: 'Leche y huevos', monto: 25000, fecha: d(11) }),
    );
    ana.abonos.push(
      new M.Abono({ id: 'A-1', monto: 20000, fecha: d(128), metodo: 'Efectivo' }),
      new M.Abono({ id: 'A-2', monto: 40000, fecha: d(91), metodo: 'Nequi' }),
      new M.Abono({ id: 'A-3', monto: 35000, fecha: d(41), metodo: 'Efectivo' }),
      new M.Abono({ id: 'A-4', monto: 20000, fecha: d(21), metodo: 'Daviplata' }),
    );

    const jorge = new M.Cliente({ id: 'C-0152', nombre: 'Jorge Iván Cardona', telefono: '+573104567890', cupo: 80000, desde: d(200), tokenPortal: 'demo-portal-jorge-2b81d0' });
    jorge.cargos.push(
      new M.Cargo({ id: 'K-6', descripcion: 'Mercado', monto: 30000, fecha: d(40) }),
      new M.Cargo({ id: 'K-7', descripcion: 'Aceite y arroz', monto: 18000, fecha: d(9) }),
    );
    jorge.abonos.push(new M.Abono({ id: 'A-5', monto: 30000, fecha: d(12), metodo: 'Transferencia' }));

    const marta = new M.Cliente({ id: 'C-0163', nombre: 'Marta Elena Ospina', telefono: '+573205550101', cupo: 40000, desde: d(180), tokenPortal: 'demo-portal-marta-c41e77' });
    marta.cargos.push(
      new M.Cargo({ id: 'K-8', descripcion: 'Mercado', monto: 30000, fecha: d(120) }),
      new M.Cargo({ id: 'K-9', descripcion: 'Granos', monto: 22000, fecha: d(100) }),
    );
    marta.abonos.push(new M.Abono({ id: 'A-6', monto: 8000, fecha: d(95), metodo: 'Efectivo' }));

    const luis = new M.Cliente({ id: 'C-0171', nombre: 'Luis Fernando Mejía', telefono: null, cupo: null, desde: d(3), tokenPortal: 'demo-portal-luis-90aa12' });

    return { tienda: { id: 'T-017', nombre: 'Tienda La Esquina de Bello' }, productos, clientes: [ana, jorge, marta, luis] };
  }

  const api = { haceDias, crearTiendaDemo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DatosDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
