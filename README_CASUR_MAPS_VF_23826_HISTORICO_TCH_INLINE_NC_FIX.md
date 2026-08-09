# CASUR Maps VF_23826 · Histórico TCH Inline + NC FIX

Corrección quirúrgica solicitada.

## Cambios
- El botón **Mostrar histórico TCH** ya no abre otra página.
- El gráfico se despliega dentro de la misma tarjeta del polígono.
- El gráfico muestra solo evolución de TCH por zafra, estilo tarjeta móvil.
- Se eliminó la tabla visible de histórico para evitar mostrar número de corte incorrecto.
- Se corrigió la lógica de NC: no se inventa corte.
- `NC` se toma de la columna NC de `aforo_2627.xlsx`.
- Si corresponde a `Planta` / `PLANTILLA`, se muestra Planta.
- Si no hay dato explícito, se muestra `—`.

## Archivos tocados
- `app.js`
- `styles.css`
- `data/aforo_2627.json`
- `data/produccion_historica_lote.json`
- `data/metadata.json`
- `service-worker.js`
- `index.html`

## No se tocó
- Shape 26.
- GPS.
- Medición.
- Hallazgos.
- CASUR Suertes Operativo.
- Resumen ponderado.
