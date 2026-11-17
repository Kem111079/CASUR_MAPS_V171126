# CASUR Maps VF_23826 · Carga FIX + Histórico TCH/Corte

Corrección de arranque para evitar que la app se quede en “Cargando datos CASUR Maps...”.

## Cambios técnicos
- El service worker se registra después de cargar el mapa, no antes.
- El GeoJSON y JSON de datos se cargan con `cache:no-store` y versión en querystring.
- Limpieza única de cachés viejas `casur-maps-pwa-*` desde el boot del index.
- Se evita precachear archivos grandes de `data/` durante instalación del service worker.
- Mensajes de carga más claros: shape, métricas, aforo, preparación de polígonos.

## Producción histórica
- Se agrega `produccion_historica.html` como vista liviana.
- Se agrega `data/produccion_historica_lote.json`.
- La tarjeta del polígono incluye “Ver producción histórica”.
- La vista muestra evolución TCH y número de corte.
