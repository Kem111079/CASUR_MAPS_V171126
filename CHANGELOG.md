# Cambios

## V171126C · 17-nov-2026
- **Selección por tablón:** en la tarjeta, "Ver lote / Ver tablón" (también en Capas). Por tablón se resalta solo ese polígono y se muestran su código, área en ha y mz, parte del lote y centro. Lista de tablones del lote para saltar entre ellos.
- **Colores de producción (TCH estimado):** < 40 rojo · 40–55 morado (sin cambio) · 55–70 mostaza · 70–85 verde · > 85 verde oscuro.
- **Capas:** se agregan Zona y Tipo de riego; se retiran TCH última zafra y Brecha contra óptimo.
- "TCH óptimo" pasa a llamarse **TCH optimista**.
- Se retiran los enlaces a Cronológico y CASUR Suertes; se conserva el histórico TCH del lote.
- **GPS:** se activa solo al abrir, con seguimiento. **Rumbo arriba** de vuelta (por defecto): el mapa gira con el avance y los toques y el arrastre se corrigen con el ángulo. Botón de brújula para alternar con norte arriba.

## V171126B · 17-nov-2026
**Datos**
- Excel de estimados actualizado: AIDOSA 90809, 90810 y 90815 pasan de Molienda a Semilla.
- TCH ponderado sobre hectáreas de molienda: 560,673 t ÷ 9,101.68 ha = **61.60** (óptimo 65.69). Semilla 472.98 ha y fuera 97.47 ha aparte.
- GeoJSON más liviano (7.35 → 6.19 MB) y resumen de aforo separado (78 KB).

**Aplicación (reescrita)**
- Pantalla: buscador siempre visible, tarjeta compacta del lote y barra inferior Mapa · Visita · Bitácora · Resumen.
- "Llegar" abre Google Maps hacia el lote; compartir lote por WhatsApp con enlace `?lote=`.
- Búsqueda por código, productor o finca, sin tildes; recientes y favoritos.
- Resumen de finca: área, toneladas, TCH y lotes en prioridad alta.
- Colorear por TCH anterior, TCH estimado, brecha contra óptimo, edad, variedad o destino, con leyenda en hectáreas.
- Etiquetas según acercamiento: finca → lote → tablón.
- Visita y recorrido unificados; lista de trabajo del día numerada en el mapa; pantalla encendida y vibración al entrar a un lote.
- Registro único (antes "observación" y "hallazgo"): editar, borrar con deshacer, dictado por voz, dos fotos reducidas, posición GPS real.
- Exportación ZIP de bitácora con fotos; reporte de visita con mapa de la ruta y fotos.
- Sin señal: abre al instante desde la copia local y solo descarga cuando cambian los datos; Leaflet incluido; mapa base con caché propia y "Guardar esta zona".
- Temas Campo (alto contraste), Claro y Oscuro; controles de 44 px o más.

**Retirado**
- `historico.html` y `produccion_historica.html` (datos de junio duplicados). El cronológico se abre en CASUR Suertes.

## V171126 · 17-nov-2026
- Shape `Shape_Casur_FNC_171126.gpkg` (8,341 polígonos) y primer Excel de estimados Z26/27 v2.
