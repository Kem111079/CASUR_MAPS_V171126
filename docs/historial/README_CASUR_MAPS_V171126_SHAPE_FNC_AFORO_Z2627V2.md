# CASUR Maps V171126 · Shape FNC 17-nov-2026 + Estimados Z26/27 v2

## Datos actualizados
- **Shape:** `Shape_Casur_FNC_171126.gpkg` → 8,341 polígonos, 1,081 CodLotes, 8 geometrías reparadas.
- **Aforo:** `Estimados_para_APP_Z2627v2.xlsx` (Versión del 12.10.2026) → 1,046 suertes, 9,672.13 ha, 563,372.76 t, TCH ponderado 58.25.
- Fecha de último corte, TCH anterior, riego y NC se conservan de la carga anterior (el Excel nuevo no los trae).
- Validaciones del cruce: `data/reporte_actualizacion.json`.

## Cambios en la app
- Tarjeta del lote: se muestra TCH óptimo y toneladas óptimas del aforo.
- Lotes nuevos sin TCH ni fecha de corte muestran "Sin dato histórico" en lugar de "Lectura normal".
- Nueva versión de datos y de caché para que los teléfonos descarguen los archivos nuevos.

## Cómo repetir la actualización
```bash
pip install geopandas pyogrio openpyxl
```
```bash
python tools/actualizar_shape_y_aforo.py Shape.gpkg Estimados.xlsx --salida data
```
Luego suba `DATA_VERSION` en `app.js`, el `?v=` de `app.js` en `index.html` y `CACHE_NAME` en `service-worker.js`.

## No incluido
`historico.html` y `casur_suertes_operativo/` llevan datos incrustados de junio/julio 2026 y no se regeneran con este Excel.

Informe de auditoría: `INFORME_AUDITORIA_CASUR_MAPS_V171126.md`.
