# CASUR Maps

Mapa de lotes cañeros para trabajo de campo (PWA). Departamento de Negocios de Caña · CASUR.

## Estructura
| Ruta | Contenido |
|---|---|
| `index.html`, `styles.css`, `js/` | Aplicación (`core` datos y caché · `map` mapa y tarjeta · `gps` GPS y visita · `field` registros y pestañas) |
| `service-worker.js` | Funcionamiento sin señal |
| `data/` | Datos que lee la app (se generan, no se editan a mano) |
| `fuentes/` | Shape y Excel de origen |
| `tools/` | Scripts que convierten `fuentes/` en `data/` |
| `casur_suertes_operativo/` | Módulo CASUR Suertes (cronológico y fichas) |
| `docs/historial/` | Notas y código de versiones anteriores |

## Actualizar datos
Todo lo que depende de Excel está en **una sola plantilla**: `fuentes/Plantilla_CASUR_Maps.xlsx` (una fila por lote).

1. Descargue la plantilla (en la app: Resumen → Datos → *Descargar plantilla*; o desde la carpeta `fuentes/`).
2. Edítela en Excel. La hoja *Instrucciones* explica cada columna.
3. Súbala a `fuentes/` con el mismo nombre: en GitHub, carpeta `fuentes` → *Add file* → *Upload files* → *Commit changes*.
4. En 2 a 3 minutos GitHub regenera `data/` y los teléfonos descargan los datos al abrir la app con señal.

Si el archivo tiene un error, la pestaña **Actions** muestra una marca roja y no se publica nada.

| Grupo de columnas | Alimenta |
|---|---|
| Identificación (código, hacienda, zona) | Búsqueda, fichas, resumen por zona |
| Aforo (área, destino, tenencia, clasificación, variedad, riego, NC, TCH estimado y optimista) | Tarjeta, resumen de aforo, capas |
| Programa (fecha de cosecha, propuesta de renovación) | Etiqueta de corte, capa Semana de corte, renovación |
| Zafra anterior (fecha de último corte, TCH) | Edad y "TCH anterior" |
| Cortes reales (fecha y TCH del corte en curso) | Marca el lote como cosechado y apaga la alerta de fecha vencida |

El **shape** (polígonos) se actualiza aparte: suba el `.gpkg` nuevo a `fuentes/` y borre el anterior.

**Manual (sin GitHub Actions):**
```bash
pip install geopandas pyogrio openpyxl
```
```bash
python tools/actualizar_shape_y_aforo.py fuentes/Shape_Casur_FNC_171126.gpkg fuentes/Plantilla_CASUR_Maps.xlsx --salida data
```
```bash
python tools/actualizar_cortes.py fuentes/Plantilla_CASUR_Maps.xlsx --salida data
```
```bash
python tools/actualizar_renovacion.py fuentes/Plantilla_CASUR_Maps.xlsx --salida data
```
Para volver a generar la plantilla a partir de lo publicado:
```bash
python tools/generar_plantilla.py --datos data --salida fuentes/Plantilla_CASUR_Maps.xlsx
```

## Reglas de cálculo
- **TCH ponderado** = toneladas de molienda ÷ hectáreas de molienda (`Clasificacion = Molienda`). Semilla y área fuera se informan aparte.
- **Edad** = días desde el último corte ÷ 30.4375.
- **Lote visitado** = dentro del polígono al menos 8 s, o a menos de 15 m durante 20 s.
- No se inventan datos: lo que el Excel no trae se conserva de la carga anterior o se muestra "—".

## Al cambiar código
Suba `VERSION` en `service-worker.js` y `APP_VERSION` en `js/core.js`.
