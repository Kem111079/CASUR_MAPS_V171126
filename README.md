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
**Automático:** suba a `fuentes/` el shape (`.gpkg`), el Excel `Estimados*.xlsx` o el Excel `Cortes*.xlsx`. GitHub regenera `data/` y los teléfonos lo descargan solos en la siguiente apertura con señal.

**Manual:**
```bash
pip install geopandas pyogrio openpyxl
```
```bash
python tools/actualizar_shape_y_aforo.py fuentes/Shape_Casur_FNC_171126.gpkg fuentes/Estimados_para_APP_Z2627v2.xlsx --salida data
```
```bash
python tools/actualizar_cortes.py fuentes/Cortes_zafra.xlsx --salida data
```

### Excel de cortes de la zafra
Columnas: `CodLote` (o `HHHSSS`), `Fecha_Corte`, `TCH` (opcionales `Toneladas`, `Area_Ha`). Plantilla en `plantillas/plantilla_cortes_zafra.csv`. Con este archivo la edad, el TCH anterior y el estado "Cosechado" se mantienen al día durante la zafra.

## Reglas de cálculo
- **TCH ponderado** = toneladas de molienda ÷ hectáreas de molienda (`Clasificacion = Molienda`). Semilla y área fuera se informan aparte.
- **Edad** = días desde el último corte ÷ 30.4375.
- **Lote visitado** = dentro del polígono al menos 8 s, o a menos de 15 m durante 20 s.
- No se inventan datos: lo que el Excel no trae se conserva de la carga anterior o se muestra "—".

## Al cambiar código
Suba `VERSION` en `service-worker.js` y `APP_VERSION` en `js/core.js`.
