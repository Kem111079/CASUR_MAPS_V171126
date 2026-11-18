# Cambios

## V181126J · 18-nov-2026
- **Corrección:** la capa Propuesta de renovación (y Plantillas y socas) salía "Sin dato" en teléfonos que habían descargado los datos con una versión anterior de la app. Ahora la app completa los archivos que falten en su copia local.
- Los datos nuevos se aplican solos al abrir; "Descargar datos de nuevo" vuelve a bajar todo lo publicado.
- **Ajustes** pasa a su propia pestaña (preferencias, datos, plantilla, actualización). **Resumen** queda solo con el aforo, la renovación y el tablero.

## V181126I · 18-nov-2026
- La app se actualiza sola al abrir cuando hay versión nueva (si no hay nada a medio hacer); si llega más tarde, avisa con un botón.
- Revisa si hay versión nueva cada vez que vuelve a primer plano.
- Botón "Actualizar la app" en Resumen → Datos, que fuerza la descarga de la versión publicada sin tocar registros, fotos ni visitas.

## V181126H · 18-nov-2026
- **Plantilla única de datos** `fuentes/Plantilla_CASUR_Maps.xlsx`: una fila por lote con aforo, fecha de cosecha, número de corte, renovación, zafra anterior y cortes reales. Reemplaza a los tres Excel sueltos.
- Las herramientas leen la plantilla; toneladas y grupo de corte se calculan solos.
- En Resumen → Datos: botones para descargar la plantilla y subirla a GitHub.
- El grupo de corte ahora cubre también los lotes fuera de molienda (97 más).

## V181126G · 18-nov-2026
- **Resumen de renovación** en la pestaña Resumen: lotes, área y TCH estimado por zona, con promedio y máximo histórico.
- **Delta esperado** = TCH estimado de las plantillas de la misma zona − TCH estimado del lote. **Delta techo** = máximo histórico del lote − TCH estimado. Ambos en t/ha y en toneladas.
- Al tocar una zona se listan sus lotes a renovar, ordenados por las toneladas que se ganarían.
- La tarjeta del lote muestra promedio y máximo histórico y, si se propone renovar, sus dos deltas.

## V181126F · 18-nov-2026
- Datos de renovación (`fuentes/datos_renovacion.xlsx`): 949 lotes con grupo de corte y propuesta de renovación; 222 lotes a renovar (2,408.87 ha).
- Capa **Propuesta de renovación**: Renovar / No renovar.
- Capa **Plantillas y socas**: plantilla y socas agrupadas por corte (2, 3, 4, 5 y más de 5).
- Tarjeta: etiqueta "Renovar", grupo de corte y propuesta; el resumen de finca indica cuántos lotes se renuevan.
- `tools/actualizar_renovacion.py` y paso en la acción de GitHub.

## V181126E · 18-nov-2026
- El tablero del día ya no se abre solo al iniciar la app; queda en Resumen → Tablero de hoy (se puede reactivar en Ajustes).
- Número de corte en las etiquetas del mapa (C6 = corte 6, PL = plantía), en el título de la tarjeta y en la imagen del hallazgo. Se puede ocultar en Capas.

## V181126D · 18-nov-2026
- **Giro del mapa más suave.** Nuevo ajuste "Giro del mapa": Suave (por defecto), Normal o Sin giro. En Suave el mapa gira solo a más de 6 km/h sostenidos, con el rumbo del tramo recorrido (13 m), ante cambios de 12° o más, como máximo cada 2 s y con un movimiento de 1 s. Quieto o caminando despacio no gira.
- El mapa se recentra al avanzar 4 m o más, con desplazamiento suave, en lugar de en cada lectura.
- Mini gráfico de la tarjeta: muestra el valor de la primera y la última zafra.

## V181126C · 18-nov-2026
**Diseño**
- Iconos de línea propios en lugar de emojis (se ven igual en todos los teléfonos).
- Transiciones suaves en tarjeta, hojas, pestañas y avisos; realce breve del lote al seleccionarlo.
- Tarjeta más limpia: "Lote / Tablón" pasa a un control pequeño junto al título; estado y fecha de corte en una sola línea.
- Pantalla de carga y pestaña Resumen con la marca CASUR.

**Visualización**
- Mini gráfico del TCH de las últimas zafras en la tarjeta.
- Al seleccionar un lote, el resto del mapa se atenúa.
- Leyenda interactiva: tocar una clase la resalta en el mapa.
- Progreso de la visita sobre el mapa (lotes de la lista visitados, tiempo y distancia).

**Práctica**
- Tema automático (oscuro de 7 p. m. a 5:30 a. m.) y tamaño de letra ajustable.
- Deslizar un registro: derecha lo resuelve, izquierda lo borra.
- Acciones principales fijas abajo en Bitácora y Visita; el botón de capas baja a la esquina inferior izquierda.

**Interactiva**
- Toque largo sobre un lote: menú rápido (registrar, lista del día, llegar, ficha, favorito, tablón).
- Tablero del día al abrir: pendientes, lotes por visitar, cortes de la semana y fechas vencidas.
- Confirmación animada al guardar.

## V181126B · 18-nov-2026
**Hallazgos georreferenciados**
- Un hallazgo solo se guarda con GPS: precisión de 30 m o mejor y el técnico dentro del lote o a menos de 50 m. Aplica también al registro rápido. El formulario muestra el estado del GPS en vivo.
- En severidad alta la foto es obligatoria.
- Al compartir se envía solo la imagen, sin texto ni enlaces. Los registros antiguos sin GPS no se comparten.
- La imagen muestra cada foto completa y centrada, sin recorte; lleva la coordenada, la precisión y la hora.

**Mapa**
- Hallazgos pendientes como puntos de color en la coordenada donde se registraron.
- Botón de vista de alrededores (aleja a unos 2 km y vuelve con otro toque).
- "Llegar" sale de la fila principal de la tarjeta y pasa al buscador, la lista del día, los lotes de una finca y los pendientes (al punto exacto). Queda también dentro de "Más".
- El seguimiento del GPS respeta el zoom elegido.

**Lote y visita**
- Historial de visitas del lote y días desde la última.
- Fotos del lote por fecha y comparación de dos fechas.
- Cierre de visita con resumen e imagen para enviar por WhatsApp.

## V181126 · 18-nov-2026
**Datos**
- El Excel de estimados trae `Fecha Cosecha`: 949 lotes con fecha programada (11-dic-2026 a 15-abr-2027).

**Cosecha programada**
- Tarjeta del lote: fecha de corte, días que faltan y semana calendario. Si la fecha ya pasó y no hay corte cargado, alerta de actualización.
- Al abrir, aviso con el número de lotes con fecha vencida.
- Nueva capa **Semana de corte**: resalta las dos próximas semanas calendario con corte programado y las fechas vencidas; esos lotes llevan la fecha en la etiqueta.

**Bitácora**
- "＋ Nuevo registro" desde la pestaña, sin pasar por el mapa: propone el lote del GPS o permite buscarlo.
- Registro rápido de un toque por categoría; nota y foto quedan opcionales.
- Pendientes: los registros de severidad media o alta quedan abiertos hasta marcarlos resueltos. Contador en la barra inferior y filtros Pendientes / Todos / Resueltos. El CSV incluye el estado.

**Corrección**
- Al buscar o abrir un lote con el GPS en seguimiento, el mapa ya no vuelve solo a la posición del GPS.

**Visita**
- Planificar la lista del día: buscar una finca y agregar todos sus lotes, solo los de prioridad alta o los de corte próximo; o agregar lote por lote.

## V171126D · 17-nov-2026
- Resumen de aforo: buscador de finca, productor o código de lote, con sus totales y acceso directo.
- Se retiran las notas explicativas del resumen (fórmula del TCH y conteo de suertes).
- Al abrir sin estar instalada, la app invita a instalarse.

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
