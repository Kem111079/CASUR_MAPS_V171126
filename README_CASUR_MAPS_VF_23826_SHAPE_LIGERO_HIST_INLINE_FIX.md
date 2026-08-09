# CASUR Maps VF_23826 · Shape ligero + histórico inline fix

Corrección enfocada en el bloqueo de carga en `Cargando shape 26 actualizado`.

## Cambios
- `poligonos_casur.geojson` fue optimizado de ~14.6 MB a un archivo más liviano.
- Se conservaron campos críticos para búsqueda, GPS, tooltip, tarjeta, aforo y NC.
- Se agregaron `bbox` precalculados para no consumir tiempo al inicio.
- Se reforzó la limpieza de service workers y cachés antiguos.
- Los archivos `data/` se cargan network-first para evitar JSON viejo o corrupto.
- Se mantiene el gráfico TCH inline dentro de la tarjeta.
- No se toca el shape conceptual ni el aforo; solo se optimiza el archivo publicado para móvil.

## Prueba recomendada
1. Subir contenido interno de la carpeta a GitHub Pages.
2. Abrir una vez; si la app muestra “Actualizando versión local CASUR Maps...”, dejar que recargue.
3. Si el teléfono conserva PWA anterior, quitar de pantalla de inicio y reinstalar.
