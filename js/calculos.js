/*
 * calculos.js — Funciones puras de Your-Debts.
 *
 * Todas reciben lo que necesitan como parámetros (incluida la fecha "ahora")
 * y devuelven un valor nuevo sin modificar sus argumentos ni tocar el DOM.
 * Así se pueden probar con Node (pruebas/calculos.test.js) y reutilizar en
 * cualquier página. Replican las reglas del backend de Your-Debts v2
 * (Ledger.cs y RiskScoring.cs) para dar retroalimentación inmediata; el
 * servidor vuelve a aplicarlas porque nunca confía en el cliente.
 */
(function (global) {
  'use strict';

  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const PLAZO_POR_DEFECTO_DIAS = 30;     // Ledger.DefaultTermDays
  const UMBRAL_MEDIO = 30;               // RiskScoring.MediumThreshold
  const UMBRAL_ALTO = 60;                // RiskScoring.HighThreshold
  const TOLERANCIA_REDONDEO = 1;         // el abono puede superar el saldo en $1

  /** Formatea un número como pesos colombianos sin decimales: 55000 → "$ 55.000". */
  function formatearCOP(valor) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
  }

  /** Suma la propiedad "monto" de una lista de movimientos. */
  function sumarMontos(movimientos) {
    return movimientos.reduce((total, m) => total + m.monto, 0);
  }

  /** Saldo = Σ cargos − Σ abonos, nunca negativo (el saldo no se almacena: se calcula). */
  function calcularSaldo(cargos, abonos) {
    return Math.max(0, sumarMontos(cargos) - sumarMontos(abonos));
  }

  /** Días completos transcurridos entre dos fechas (trunca como (int)TimeSpan.TotalDays). */
  function diasEntre(desde, hasta) {
    return Math.trunc((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
  }

  /** Suma días a una fecha y devuelve una fecha nueva. */
  function sumarDias(fecha, dias) {
    return new Date(fecha.getTime() + dias * MS_POR_DIA);
  }

  /** Fecha de vencimiento: la indicada en el cargo o 30 días después de la venta. */
  function calcularVencimiento(cargo) {
    if (cargo.vencimiento) {
      const v = new Date(cargo.vencimiento);
      v.setHours(23, 59, 59, 0);
      return v;
    }
    return sumarDias(cargo.fecha, PLAZO_POR_DEFECTO_DIAS);
  }

  /** Total de un fiado de producto: cantidad × precio unitario, redondeado a centavos. */
  function totalFiado(cantidad, precioUnitario) {
    return Math.round(cantidad * precioUnitario * 100) / 100;
  }

  /**
   * Aplica los abonos a los cargos más antiguos primero (FIFO).
   * Devuelve una lista nueva con, por cada cargo, el saldo pendiente y la
   * fecha en que quedó pagado. No modifica los arreglos recibidos.
   */
  function aplicarAbonosFifo(cargos, abonos) {
    const ordenados = [...cargos].sort((a, b) => a.fecha - b.fecha);
    const pendiente = ordenados.map(c => c.monto);
    const pagadoEn = ordenados.map(() => null);
    let cursor = 0;

    for (const abono of [...abonos].sort((a, b) => a.fecha - b.fecha)) {
      let restante = abono.monto;
      while (restante > 0 && cursor < ordenados.length) {
        const aplicado = Math.min(restante, pendiente[cursor]);
        pendiente[cursor] -= aplicado;
        restante -= aplicado;
        if (pendiente[cursor] === 0) {
          // Un abono anterior al cargo no puede "pagarlo antes de existir".
          pagadoEn[cursor] = abono.fecha > ordenados[cursor].fecha ? abono.fecha : ordenados[cursor].fecha;
          cursor++;
        }
      }
    }

    return ordenados.map((c, i) => ({
      id: c.id,
      descripcion: c.descripcion,
      monto: c.monto,
      fecha: c.fecha,
      vence: calcularVencimiento(c),
      pendiente: pendiente[i],
      pagadoEn: pagadoEn[i],
    }));
  }

  /** Puntos por días de mora del cargo vencido más antiguo: 1-15/16-30/31-60/>60. */
  function puntosPorMora(dias) {
    if (dias <= 0) return 0;
    if (dias <= 15) return 10;
    if (dias <= 30) return 20;
    if (dias <= 60) return 30;
    return 40;
  }

  /** Puntos por días sin abonar teniendo saldo: >15/>30/>60. */
  function puntosPorRecencia(dias) {
    if (dias > 60) return 15;
    if (dias > 30) return 10;
    if (dias > 15) return 5;
    return 0;
  }

  /** Nivel de riesgo según el puntaje y la cantidad de cargos. */
  function nivelDeRiesgo(puntaje, cantidadCargos) {
    if (cantidadCargos === 0) return 'Sin historial';
    if (puntaje >= UMBRAL_ALTO) return 'Alto';
    if (puntaje >= UMBRAL_MEDIO) return 'Medio';
    return 'Bajo';
  }

  /**
   * Cupo sugerido = promedio mensual abonado en los últimos 90 días × multiplicador
   * (Bajo 1,5 · Medio 1,0 · Alto 0,5), redondeado a miles.
   */
  function cupoSugerido(abonos, nivel, ahora) {
    const desde = sumarDias(ahora, -90);
    const reciente = sumarMontos(abonos.filter(a => a.fecha >= desde));
    if (reciente <= 0) return nivel === 'Alto' ? 0 : null;
    const multiplicador = { Bajo: 1.5, Medio: 1.0, Alto: 0.5 }[nivel] ?? 1.0;
    return Math.round((reciente / 3) * multiplicador / 1000) * 1000;
  }

  /**
   * Modelo explicable de riesgo (0 = sin riesgo, 100 = máximo).
   * Recibe un objeto { cargos, abonos, cupo, clienteDesde, ahora } y devuelve
   * { puntaje, nivel, saldo, vencido, diasMora, factores[], cupoSugerido }.
   */
  function evaluarRiesgo({ cargos, abonos, cupo, clienteDesde, ahora }) {
    const factores = [];
    const asignados = aplicarAbonosFifo(cargos, abonos);
    const totalComprado = sumarMontos(cargos);
    const totalPagado = sumarMontos(abonos);
    const saldo = Math.max(0, totalComprado - totalPagado);

    // 1. Mora actual
    const vencidos = asignados.filter(a => a.pendiente > 0 && a.vence < ahora);
    const vencido = vencidos.reduce((t, a) => t + a.pendiente, 0);
    const diasMora = vencidos.length ? Math.max(...vencidos.map(a => diasEntre(a.vence, ahora))) : 0;
    const pMora = puntosPorMora(diasMora);
    if (pMora > 0) factores.push({ codigo: 'MORA', puntos: pMora, detalle: `${formatearCOP(vencido)} vencidos; el más antiguo con ${diasMora} días de mora` });

    // 2. Puntualidad histórica (mínimo 2 cargos pagados)
    const pagados = asignados.filter(a => a.pagadoEn !== null);
    if (pagados.length >= 2) {
      const tarde = pagados.filter(a => a.pagadoEn > a.vence).length / pagados.length;
      const pTarde = Math.round(tarde * 25);
      if (pTarde > 0) factores.push({ codigo: 'PAGOS_TARDE', puntos: pTarde, detalle: `Pagó tarde el ${Math.round(tarde * 100)} % de sus cuentas` });
    }

    // 3. Recencia del último abono
    if (saldo > 0) {
      if (abonos.length === 0) {
        const dias = diasEntre(new Date(Math.min(...cargos.map(c => c.fecha))), ahora);
        if (dias > 30) factores.push({ codigo: 'SIN_ABONOS', puntos: 15, detalle: `No ha abonado en ${dias} días` });
      } else {
        const dias = diasEntre(new Date(Math.max(...abonos.map(a => a.fecha))), ahora);
        const p = puntosPorRecencia(dias);
        if (p > 0) factores.push({ codigo: 'ABONO_ANTIGUO', puntos: p, detalle: `Su último abono fue hace ${dias} días` });
      }
    }

    // 4. Uso del cupo
    if (cupo > 0 && saldo > 0) {
      const uso = saldo / cupo;
      if (uso > 1) factores.push({ codigo: 'SOBRE_CUPO', puntos: 15, detalle: `Usa el ${Math.round(uso * 100)} % de su cupo` });
      else if (uso > 0.8) factores.push({ codigo: 'CERCA_CUPO', puntos: 8, detalle: `Usa el ${Math.round(uso * 100)} % de su cupo` });
    }

    // 5. Proporción pagada (clientes con 30 días o más)
    if (totalComprado > 0 && diasEntre(clienteDesde, ahora) >= 30) {
      const proporcion = totalPagado / totalComprado;
      if (proporcion < 0.3) factores.push({ codigo: 'PAGA_POCO', puntos: 10, detalle: `Ha pagado el ${Math.round(proporcion * 100)} % de lo comprado` });
      else if (proporcion < 0.6) factores.push({ codigo: 'PAGA_MEDIO', puntos: 5, detalle: `Ha pagado el ${Math.round(proporcion * 100)} % de lo comprado` });
    }

    const puntaje = Math.min(100, Math.max(0, factores.reduce((t, f) => t + f.puntos, 0)));
    const nivel = nivelDeRiesgo(puntaje, cargos.length);
    return { puntaje, nivel, saldo, vencido, diasMora, factores, cupoSugerido: cupoSugerido(abonos, nivel, ahora) };
  }

  /**
   * Regla de negocio del abono: monto positivo y no mayor que el saldo (+ $1 de tolerancia).
   * Devuelve un mensaje de error o null si es válido.
   */
  function validarAbono(monto, saldo) {
    if (!Number.isFinite(monto) || monto <= 0) return 'El abono debe ser mayor que cero.';
    if (monto > saldo + TOLERANCIA_REDONDEO) return `El abono (${formatearCOP(monto)}) supera el saldo pendiente (${formatearCOP(saldo)}).`;
    return null;
  }

  /**
   * Ley 2300 de 2023: contacto de cobranza de lunes a viernes 7:00–19:00 y
   * sábados 8:00–15:00; nunca domingos ni festivos. "festivos" es un arreglo
   * de cadenas "aaaa-mm-dd".
   */
  function esHoraHabilCobro(fecha, festivos = []) {
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    if (festivos.includes(iso)) return false;
    const dia = fecha.getDay(), hora = fecha.getHours();
    if (dia === 0) return false;
    if (dia === 6) return hora >= 8 && hora < 15;
    return hora >= 7 && hora < 19;
  }

  const api = {
    formatearCOP, sumarMontos, calcularSaldo, diasEntre, sumarDias, calcularVencimiento,
    totalFiado, aplicarAbonosFifo, puntosPorMora, puntosPorRecencia, nivelDeRiesgo,
    cupoSugerido, evaluarRiesgo, validarAbono, esHoraHabilCobro,
  };

  // Navegador: window.Calculos. Node (pruebas): module.exports.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Calculos = api;
})(typeof window !== 'undefined' ? window : globalThis);
