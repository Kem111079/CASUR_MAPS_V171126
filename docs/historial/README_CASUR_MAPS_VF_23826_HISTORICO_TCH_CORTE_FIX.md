# CASUR Maps VF_23826 · Histórico TCH + Corte FIX

Corrección quirúrgica sobre `CASUR_MAPS_VF_23826_SHAPE26_AFORO2627_OPERATIVO`.

## Cambios
- Agrega `data/produccion_historica_lote.json` generado desde el histórico integrado (`window.APP_DATA.lotCompact`).
- Agrega botón **Ver producción histórica** al tocar un polígono.
- La vista se abre dentro de CASUR Maps, sin depender del histórico completo.
- El gráfico muestra únicamente la evolución de **TCH** por zafra.
- La tabla muestra **Zafra, TCH, Número de corte, Área y Toneladas**.
- El botón anterior de Histórico en la tarjeta principal se sustituye por esta vista rápida para evitar el flujo que mostraba código JS roto.
- Mantiene shape 26, aforo 26/27, CASUR Suertes Operativo, GPS, medición, hallazgos y paneles.

## Instalación
Subir todo el contenido interno de la carpeta al repositorio GitHub Pages y limpiar caché/reinstalar la PWA.
