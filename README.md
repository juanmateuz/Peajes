# Ruta y peajes Colombia

Planificador de viajes por carretera en Colombia: rutas alternativas, peajes en el camino, costo de combustible y total del viaje.

**Página:** https://juanmateuz.github.io/Peajes/

## Funciones
- Rutas con prioridad **más rápida / más corta / más barata** y búsqueda automática de corredores alternativos.
- Elegir ruta tocando su burbuja en el mapa; parada intermedia ("Pasar por") y menú al mantener presionado.
- Peajes detectados sobre la ruta (incluye peajes que se pasan dos veces) con tarifas Cat. I verificadas.
- Mis vehículos (categoría, km/galón, precio), solo ida o ida y vuelta, resumen totalizado.
- Tipo de vía por colores (troncal, principal, secundaria, calle, destapada).
- **Tus rutas**: aprende los viajes que inicias (o guardas con ⭐), sin duplicar los repetidos, y los ofrece como acceso rápido seleccionando tu ruta habitual. Solo se guardan en el navegador.
- Paradas múltiples (hasta 4) con alternativas por tramo; puntos arrastrables.
- Ubicación en vivo opcional, seguir el carro, modo rumbo, giro del mapa y recálculo si te sales de la ruta.

## Estructura
```
index.html            Estructura de la página
css/app.css           Estilos
js/app.js             Lógica de la aplicación
vendor/leaflet/       Leaflet 1.9.4 (licencia BSD-2, ver LICENSE)
tests/regression.js   Pruebas de regresión (Playwright, servicios simulados)
```

## Servicios externos (gratuitos, uso razonable)
| Uso | Servicio |
|---|---|
| Peajes (ubicación) | Tablero público de Supertransporte (ArcGIS) |
| Tarifas oficiales ANI | datos.gov.co — "Tráfico Vehicular ANI" (8yi9-t44c): última tarifa vigente por peaje y categoría |
| Tarifas INVÍAS | datos.gov.co — "Peajes" INVÍAS (68qj-5xux), si trae columnas de tarifa; Resolución INVÍAS 0062 de 15-ene-2026 como referencia |
| Rutas | OSRM (servidor demo público) |
| Búsqueda / autocompletado | Photon (komoot) |
| Nombre de lugares | Nominatim (solo consultas puntuales; su política prohíbe autocompletado) |
| Tipo de vía | Valhalla (FOSSGIS) |
| Mapa | Esri World Street Map, respaldo OpenStreetMap |
| Giro del mapa | leaflet-rotate 0.5.2 (GPL-3.0), cargado desde unpkg con verificación de integridad (SRI) |

Si un servicio falla, la función correspondiente se desactiva sin romper el resto.

## Mantenimiento de tarifas
Prioridad de fuentes: **oficial (datos.gov.co)** → verificada en prensa si es más reciente (constante `VERIF`, solo Cat. I) → tablero de Supertransporte → estimado.
Las tarifas oficiales se descargan solas (caché de 3 días; botón *Actualizar tarifas oficiales* en Info).
Las tarifas verificadas en prensa están en `js/app.js`, constante `VERIF` (nombre normalizado, valor Cat. I, fecha y fuente). Actualizarlas cada vez que cambien (normalmente en enero). Los peajes sin tarifa verificada se estiman en $17.500 (configurable en la página).

## Pruebas
```
npm i playwright leaflet-rotate
node tests/regression.js
```

## Aviso
Los valores son estimados. Confirma tarifas con el concesionario, la ANI o el INVÍAS. No uses la página mientras conduces.
