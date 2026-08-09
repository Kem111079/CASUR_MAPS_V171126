# CASUR Maps VF 23826 · Histórico TCH Corte FIX V2

Corrección sobre la primera versión.

## Qué corrige
- Se agrega una página liviana `produccion_historica.html` para mostrar producción histórica por CodLote sin depender del histórico completo.
- Los enlaces de `Histórico` ahora apuntan a la vista segura de producción histórica cuando corresponde.
- `historico.html?modulo=historico&codlote=...` redirige automáticamente a `produccion_historica.html`.
- Se conserva la vista interna/modal desde el polígono con gráfico de evolución TCH y tabla de número de corte.
- Se actualiza versión de caché y querystring para evitar service worker viejo.

## Vista esperada
- Al tocar un polígono: botón `Ver producción histórica`.
- Gráfico: solo evolución del TCH.
- Tabla: Zafra, TCH, Número de corte, Área y Toneladas.

## Prueba rápida
Abrir: `produccion_historica.html?codlote=1004`
