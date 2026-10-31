/*
 * Pruebas de las funciones puras y de las clases.
 * Ejecutar con Node 18 o superior:  node pruebas/calculos.test.js
 */
'use strict';
process.env.TZ = 'America/Bogota';
const assert = require('node:assert/strict');
const C = require('../js/calculos.js');
const M = require('../js/modelos.js');
const { crearTiendaDemo } = require('../js/datos-demo.js');

const AHORA = new Date('2026-10-31T12:00:00-05:00');
const tienda = crearTiendaDemo(AHORA);
const ana = tienda.clientes.find(c => c.id === 'C-0147');
let pruebas = 0;
function prueba(nombre, fn) { fn(); pruebas++; console.log('✔', nombre); }

prueba('saldo de Ana = 170.000 − 115.000 = 55.000', () => {
  assert.equal(C.sumarMontos(ana.cargos), 170000);
  assert.equal(C.sumarMontos(ana.abonos), 115000);
  assert.equal(ana.saldo, 55000);
});

prueba('FIFO: solo el cargo K-4 queda con 30.000 pendientes y K-5 con 25.000', () => {
  const fifo = C.aplicarAbonosFifo(ana.cargos, ana.abonos);
  assert.deepEqual(fifo.map(a => a.pendiente), [0, 0, 0, 30000, 25000]);
  // K-3 se pagó después de su vencimiento (pago tardío); K-1 y K-2 a tiempo.
  assert.deepEqual(fifo.slice(0, 3).map(a => a.pagadoEn > a.vence), [false, false, true]);
});

prueba('riesgo de Ana: 20 + 8 + 5 + 8 = 41 puntos → Medio; cupo sugerido 18.000', () => {
  const r = ana.riesgo(AHORA);
  assert.equal(r.diasMora, 29);
  assert.deepEqual(r.factores.map(f => [f.codigo, f.puntos]), [['MORA', 20], ['PAGOS_TARDE', 8], ['ABONO_ANTIGUO', 5], ['CERCA_CUPO', 8]]);
  assert.equal(r.puntaje, 41);
  assert.equal(r.nivel, 'Medio');
  assert.equal(r.cupoSugerido, 18000);
});

prueba('fiado de 2 libras de arroz a $3.500 = $7.000 y supera el cupo de 60.000', () => {
  assert.equal(C.totalFiado(2, 3500), 7000);
  assert.equal(ana.superariaCupo(7000), true);          // 55.000 + 7.000 = 62.000 > 60.000
  assert.equal(ana.superariaCupo(5000), false);         // 60.000 no supera
});

prueba('validarAbono aplica la tolerancia de $1', () => {
  assert.equal(C.validarAbono(55001, 55000), null);
  assert.match(C.validarAbono(55002, 55000), /supera el saldo/);
  assert.match(C.validarAbono(0, 55000), /mayor que cero/);
});

prueba('las funciones puras no modifican sus argumentos', () => {
  const antes = JSON.stringify(ana.cargos);
  C.aplicarAbonosFifo(ana.cargos, ana.abonos);
  C.evaluarRiesgo({ cargos: ana.cargos, abonos: ana.abonos, cupo: 60000, clienteDesde: ana.desde, ahora: AHORA });
  assert.equal(JSON.stringify(ana.cargos), antes);
});

prueba('otros clientes: Jorge Bajo (0), Marta Alto (80), Luis sin historial', () => {
  const [, jorge, marta, luis] = tienda.clientes;
  assert.deepEqual([jorge.riesgo(AHORA).puntaje, jorge.riesgo(AHORA).nivel, jorge.riesgo(AHORA).cupoSugerido], [0, 'Bajo', 15000]);
  assert.deepEqual([marta.riesgo(AHORA).puntaje, marta.riesgo(AHORA).nivel, marta.riesgo(AHORA).cupoSugerido], [80, 'Alto', 0]);
  assert.equal(luis.riesgo(AHORA).nivel, 'Sin historial');
});

prueba('horario de cobranza (Ley 2300 de 2023)', () => {
  assert.equal(C.esHoraHabilCobro(new Date('2026-11-03T18:30:00-05:00')), true);   // martes 6:30 p. m.
  assert.equal(C.esHoraHabilCobro(new Date('2026-11-03T19:00:00-05:00')), false);  // martes 7:00 p. m.
  assert.equal(C.esHoraHabilCobro(new Date('2026-11-07T14:59:00-05:00')), true);   // sábado
  assert.equal(C.esHoraHabilCobro(new Date('2026-11-08T10:00:00-05:00')), false);  // domingo
  assert.equal(C.esHoraHabilCobro(new Date('2026-11-16T10:00:00-05:00'), ['2026-11-16']), false); // festivo
});

prueba('las clases rechazan datos inválidos', () => {
  assert.throws(() => new M.Abono({ monto: -5 }), /mayor que cero/);
  assert.throws(() => new M.Abono({ monto: 5000, metodo: 'Bitcoin' }), /no válido/);
  assert.throws(() => ana.agregarAbono(new M.Abono({ monto: 60000 })), /supera el saldo/);
  const arroz = tienda.productos[0];
  assert.throws(() => arroz.descontar(31), /Stock insuficiente/);
});

prueba('costo promedio ponderado al reabastecer: (30 × 2.900 + 20 × 3.100) ÷ 50 = 2.980', () => {
  const p = new M.Producto({ nombre: 'Arroz', precio: 3500, costo: 2900, stock: 30 });
  p.reabastecer(20, 3100);
  assert.equal(p.costo, 2980);
  assert.equal(p.stock, 50);
});

console.log(`\n${pruebas} pruebas superadas.`);
