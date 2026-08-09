# CASUR Maps VF_23826_SHAPE26_AFORO2627_OPERATIVO

Versión generada con enfoque quirúrgico sobre `CASUR_MAPS_VF_22_6.zip`.

## Integraciones realizadas

1. **Shape 26 actualizado**
   - Fuente: `shape_26(1).zip / Maestro_26-27_Actualizado.shp`
   - CRS original: `EPSG:32616`
   - Publicación: EPSG:4326 / WGS84
   - Polígonos: 8,254
   - Geometrías inválidas reparadas: 8 antes / 0 después

2. **Aforo 26/27 integrado**
   - Fuente: `aforo_2627.xlsx`, hoja `Cronologico`
   - Llave Excel: `HHHSSS`
   - Llave shape: `CodSuerte`
   - Registros leídos: 1,054
   - Lotes de aforo: 1,054
   - Cruces shape-aforo: 1,045
   - Shape sin aforo: 0
   - Aforo sin shape: 9

3. **Tooltip/tarjeta del polígono**
   - Se agregó bloque `Aforo Zafra 2026-2027` con HHHSSS, actTCH y Toneladas.

4. **Resumen ponderado**
   - Nueva sección `Resumen Aforo 26/27` con vistas por Hacienda, Finca/Productor y Zona.
   - Cálculo: `TCH ponderado = Toneladas / Área Ha`.

5. **CASUR Suertes Operativo**
   - Integrado como módulo interno en `/casur_suertes_operativo/`.
   - Acceso desde la tarjeta del lote con parámetro `?hhhsss=...`.

6. **Rumbo arriba por defecto**
   - El modo de orientación inicia en `Rumbo arriba`.

## Archivos modificados
- `data/poligonos_casur.geojson`
- `data/aforo_2627.json`
- `data/metricas_lote.json`
- `data/metadata.json`
- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`
- `casur_suertes_operativo/`

## Recomendación de despliegue
Subir el contenido interno de esta carpeta a la raíz del repositorio GitHub Pages y borrar caché/reinstalar la PWA en celulares.
