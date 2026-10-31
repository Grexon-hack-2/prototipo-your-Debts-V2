# Your-Debts · Prototipo web del lado del cliente

Anexo de código del proyecto *Aplicación de la arquitectura web, HTTP/HTTPS, formularios y scripting del lado del cliente* (Electiva Profesional II).

Prototipo en HTML, CSS y JavaScript sin bibliotecas ni compilación. Reproduce el contrato de la API REST de Your-Debts v2 con un servidor simulado en memoria (`js/api-simulada.js`), que se reemplazará por la API real en el módulo siguiente.

## Prototipo publicado

**https://grexon-hack-2.github.io/prototipo-your-Debts-V2/**

- Usuario: `tienda017`
- Contraseña: `Fiado-2026`

Son credenciales de demostración: no hay servidor real ni datos de personas reales.

## Cómo abrirlo en local

1. Abra `index.html` en Chrome, Edge o Firefox (doble clic; no requiere servidor).
2. Ingrese con usuario `tienda017` y contraseña `Fiado-2026`.
3. En el panel, busque "ana", abra la cuenta y registre un fiado o un abono. El panel derecho muestra cada solicitud y respuesta HTTP.

Para ejecutar las pruebas de los cálculos (Node 18 o superior):

```
node pruebas/calculos.test.js
```

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Formulario de ingreso (POST) |
| `app.html` | Panel: búsqueda (GET), estado de cuenta, fiado (POST), abono (POST), inventario (HEAD y POST multipart) |
| `portal.html` | Consulta del cliente con enlace secreto en el fragmento `#t=` |
| `css/estilos.css` | Presentación |
| `js/calculos.js` | Funciones puras: saldo, FIFO, vencimiento, riesgo, cupo sugerido, validación de abono, horario de cobranza |
| `js/modelos.js` | Clases `Producto`, `Movimiento`, `Cargo`, `Abono`, `Cliente` |
| `js/datos-demo.js` | Datos ficticios de la tienda T-017 |
| `js/api-simulada.js` | Servidor simulado: rutas, códigos de estado, encabezados y validación del lado del servidor |
| `js/inspector-http.js` | Construcción y visualización de los mensajes HTTP |
| `js/ui.js` | Validación accesible, notificaciones y utilidades del DOM |
| `js/login.js`, `js/app.js`, `js/portal.js` | Comportamiento de cada página |
| `pruebas/calculos.test.js` | Diez pruebas con los datos del caso |

## Límites conocidos

- Cada página crea su propio servidor simulado, así que los movimientos registrados en el panel no aparecen en el portal. La persistencia llega con la base de datos.
- El token de acceso se guarda en `sessionStorage` para pasar del ingreso al panel; en la aplicación real vive solo en memoria.
