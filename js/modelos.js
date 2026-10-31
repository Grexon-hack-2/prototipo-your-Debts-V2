/*
 * modelos.js — Clases que modelan las entidades del caso.
 *
 * Cada clase valida sus invariantes en el constructor (un objeto inválido no
 * llega a existir) y delega los cálculos en las funciones puras de calculos.js.
 */
(function (global) {
  'use strict';

  const C = (typeof module !== 'undefined' && module.exports) ? require('./calculos.js') : global.Calculos;

  /** Genera un identificador UUID en el cliente; permite reenviar sin duplicar (idempotencia). */
  function nuevoId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  class Producto {
    constructor({ id = nuevoId(), nombre, precio, costo = 0, stock = 0, stockMinimo = 0 }) {
      if (!nombre || !nombre.trim()) throw new Error('El producto necesita un nombre.');
      if (precio < 0 || costo < 0 || stock < 0) throw new Error('Precio, costo y stock no pueden ser negativos.');
      Object.assign(this, { id, nombre: nombre.trim(), precio, costo, stock, stockMinimo });
    }

    /** Utilidad por unidad (igual que Product.UnitProfit del backend). */
    get utilidadUnitaria() { return this.precio - this.costo; }

    get stockBajo() { return this.stock <= this.stockMinimo; }

    /** Descuenta inventario por una venta fiada; falla si no alcanza. */
    descontar(cantidad) {
      if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que cero.');
      if (cantidad > this.stock) throw new Error(`Stock insuficiente de ${this.nombre}: hay ${this.stock}.`);
      this.stock -= cantidad;
    }

    /** Entrada de inventario con costo promedio ponderado. */
    reabastecer(cantidad, costoUnitario) {
      if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que cero.');
      const total = this.stock + cantidad;
      if (this.stock > 0) this.costo = Math.round(((this.stock * this.costo) + (cantidad * costoUnitario)) / total * 100) / 100;
      else this.costo = costoUnitario;
      this.stock = total;
    }
  }

  class Movimiento {
    constructor({ id = nuevoId(), monto, fecha = new Date() }) {
      if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.');
      this.id = id;
      this.monto = monto;
      this.fecha = fecha instanceof Date ? fecha : new Date(fecha);
    }
  }

  /** Un fiado. Hereda id, monto y fecha de Movimiento. */
  class Cargo extends Movimiento {
    constructor({ descripcion, productoId = null, cantidad = null, precioUnitario = null, vencimiento = null, ...resto }) {
      super(resto);
      if (!descripcion || !descripcion.trim()) throw new Error('Indica la descripción del fiado.');
      Object.assign(this, { descripcion: descripcion.trim(), productoId, cantidad, precioUnitario, vencimiento });
    }
    get tipo() { return 'cargo'; }
    get vence() { return C.calcularVencimiento(this); }
  }

  /** Un abono. */
  class Abono extends Movimiento {
    static METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Otro'];

    constructor({ metodo = 'Efectivo', nota = null, ...resto }) {
      super(resto);
      if (!Abono.METODOS.includes(metodo)) throw new Error('Método de pago no válido.');
      Object.assign(this, { metodo, nota });
    }
    get tipo() { return 'abono'; }
  }

  class Cliente {
    constructor({ id = nuevoId(), nombre, telefono = null, cupo = null, desde = new Date(), tokenPortal = nuevoId(), autorizaWhatsApp = true }) {
      if (!nombre || nombre.trim().length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.');
      Object.assign(this, { id, nombre: nombre.trim(), telefono, cupo, desde: new Date(desde), tokenPortal, autorizaWhatsApp });
      this.cargos = [];
      this.abonos = [];
    }

    get saldo() { return C.calcularSaldo(this.cargos, this.abonos); }

    /** Movimientos en orden cronológico inverso, para el estado de cuenta. */
    get movimientos() {
      return [...this.cargos, ...this.abonos].sort((a, b) => b.fecha - a.fecha);
    }

    /** ¿Este nuevo fiado dejaría al cliente por encima de su cupo? */
    superariaCupo(montoNuevo) {
      return this.cupo != null && this.cupo > 0 && this.saldo + montoNuevo > this.cupo;
    }

    agregarCargo(cargo) { this.cargos.push(cargo); }

    /** Registra un abono aplicando la misma regla que el servidor. */
    agregarAbono(abono) {
      const error = C.validarAbono(abono.monto, this.saldo);
      if (error) throw new Error(error);
      this.abonos.push(abono);
    }

    riesgo(ahora = new Date()) {
      return C.evaluarRiesgo({ cargos: this.cargos, abonos: this.abonos, cupo: this.cupo, clienteDesde: this.desde, ahora });
    }

    /** Dato que el cliente ve en el portal: sin puntaje ni notas internas. */
    vistaPortal() {
      return { nombre: this.nombre, saldo: this.saldo, movimientos: this.movimientos.map(m => ({ tipo: m.tipo, descripcion: m.descripcion ?? `Abono (${m.metodo})`, monto: m.monto, fecha: m.fecha })) };
    }
  }

  const api = { nuevoId, Producto, Movimiento, Cargo, Abono, Cliente };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Modelos = api;
})(typeof window !== 'undefined' ? window : globalThis);
