# Cambios

## V271126Q · 27-nov-2026 · N.º de corte agrupado
- En Análisis y su Excel, los cortes del 6.º en adelante se agrupan en **«+5 cortes»** (como en la capa Plantillas y socas): Plantilla, Corte 2, 3, 4, 5 y +5 cortes.

## V271126P · 27-nov-2026 · Análisis: tenencia, n.º de corte y administración
- Nuevas agrupaciones en Análisis: **Tenencia** (Propio, Arrendamiento, Productores), **N.º de corte** (Plantilla, corte 2 a 10 y 11 o más) y **Administración** (Administración directa frente a Productores).
- Nueva opción de zona **«Administración directa (sin Productores)»**: todo el análisis solo con 1-Sur, 2-Centro y 3-Norte.
- El Excel del análisis pasa a 6 hojas e incluye el bloque de Administración directa en cada una.

## V271126O · 27-nov-2026 · Análisis del aforo
- Nueva pestaña **Análisis** en Resumen: aforo ponderado por **variedad, riego o mes de cosecha**, para el **global o cada zona**. Por grupo: lotes, ha, toneladas, TCH 26/27 (barra), marca de 25/26 y Δ en los mismos lotes.
- Tocar un grupo abre sus lotes, con «Ver en el mapa» (resaltados) y Excel.
- **Excel del análisis:** una hoja por dimensión con el global y cada zona en bloques, subtotales, % del área y Δ.
- Los totales cuadran exactamente con el aforo oficial (toneladas de molienda / ha de molienda, incluido el lote de molienda sin estimado). El ranking por zona de Fincas ahora usa la misma regla (1-Sur 71.1).

## V271126N · 27-nov-2026 · Exportaciones en Excel
- Las exportaciones pasan de CSV a **Excel (.xlsx)** con formato: título y fecha de generación, encabezado en azul CASUR, filas alternas, filtros, encabezado fijo al desplazar, anchos de columna, números con miles y decimales, fechas reales y fila de totales.
- **Bitácora:** hoja «Registros» (con enlace al mapa) y hoja «Por finca» (pendientes, alta, media, informativos, resueltos, días abiertos). El ZIP con fotos incluye el Excel.
- **Lista de lotes** (Ver en el mapa / leyenda): variedad, riego, corte, TCH 25/26, estimado, Δ, toneladas, cosecha y semáforo; totales con TCH ponderado.
- **Ruta de visita:** hora, lote, finca y coordenadas.

## V271126M · 27-nov-2026 · Ajustes del Modo vuelo tras la primera prueba
- **Imagen del recorrido con contexto:** se dibujan los lotes de alrededor en gris; los recorridos o sobrevolados en azul y los «a la vista» en celeste, con su código.
- **Lotes a la vista:** además de los que el recorrido cruza por dentro, se cuentan los lotes a 100 m o menos del recorrido (también en vuelos ya guardados).
- **Recorrido en tierra:** si la altura nunca pasa de 30 m, el resumen y la imagen dicen «Recorrido en tierra» y no muestran «Altura máx. 0 m».
- «Ver ruta» resalta también los lotes a la vista.

## V271126L · 27-nov-2026 · Modo vuelo: grabación y marcas desde el aire
- **Grabación del vuelo:** al activar el Modo vuelo se graba el recorrido con altura y velocidad, y los lotes sobrevolados. Si la app se cierra, el vuelo se retoma al abrirla (con la misma altura de referencia). Los saltos imposibles del GPS no entran a la ruta.
- **«Aterrizar»** cierra el vuelo con un resumen: duración, distancia, lotes y hectáreas sobrevolados por finca, altura máxima y promedio, y las marcas. Imagen del vuelo para compartir y «Ver ruta» en el mapa.
- **Vuelos** en la pestaña Visita: resumen, ruta y borrar.
- **Marcar** (botón dorado del panel): deja en la Bitácora un «Seguimiento · Media» del lote de abajo con la posición del helicóptero, altura y velocidad; luego se le agrega nota o foto. Tocando un lote en el mapa, la tarjeta ofrece «Marcar desde el aire» para lotes vistos a distancia.

## V271126K · 27-nov-2026 · Modo vuelo (helicóptero), primera entrega
- **Modo vuelo** desde Capas y herramientas. La app lo sugiere sola a más de 80 km/h si además sube más de 60 m (o a más de 120 km/h).
- **Panel de vuelo:** altura aproximada sobre el punto de despegue (altitud GPS), velocidad, rumbo y el lote que está debajo con finca, TCH estimado, número de corte y color del semáforo. Sin confirmación de 8 s ni tarjetas que tapen el mapa.
- **Mapa:** se aleja según la velocidad (16 → 14) y la altura, gira con el rumbo y deja la posición en el tercio inferior para ver lo que viene. En vuelo se aceptan velocidades de hasta 350 km/h.
- **Preparar vuelo:** guarda el mapa base de toda la zona de lotes hasta acercamiento 14 (unos 1,200 cuadros) para volar sin señal. Los lotes ya están siempre en el teléfono.
- En vuelo la pantalla queda encendida y no vibra.

## V271126J · 27-nov-2026 · Administración de datos con PIN
- «Administración de datos» (plantilla de Excel, subida, archivos y volver a descargar) queda oculta tras un PIN de 6 dígitos. En el código solo se guarda una huella del PIN, no el número.
- Al acertar, queda desbloqueada 30 días en ese equipo; «Bloquear administración» la cierra antes. Tras 5 intentos fallidos se bloquea 5 minutos.

## V271126I · 27-nov-2026 · «Sin dato» separado en todas las capas
- Los lotes sin valor se separan en **Fuera de molienda** (gris liso; con su desglose: Semilla, Sin caña, Baja rent., Invest.) y la falta de dato propia de cada capa (gris rayado): Sin aforo, Sin fecha de corte, Sin grupo de corte, Sin propuesta, Sin fecha programada.
- Los % de la leyenda se calculan solo sobre las clases con color (en TCH, sobre el área de molienda): suman 100 %. Las filas grises muestran lotes y ha.
- La lista de una fila gris muestra lotes, área y desglose (sin toneladas ni TCH) y ordena por clasificación.

## V271126H · 27-nov-2026 · Resumen con textos mínimos
- Se quitan la frase de Panorama y las notas explicativas de Zafra, Fincas y Renovación (cómo se calcula, qué significa cada columna). Las definiciones quedan solo al dejar el dedo sobre el encabezado de cada tabla.
- Títulos cortos: «TCH 26/27 vs 25/26», «TCH por zona» con leyenda mínima, «Δ vs plantillas», «Δ vs máx. histórico».
- Lotes a validar en una línea: «20 a validar · +8,600 t · sin ellos +21.6 t/ha · Ver».

## V271126G · 27-nov-2026 · Resumen por bloques
- **Resumen en 4 pestañas internas:** Panorama · Zafra · Fincas · Renovación. Cada una muestra solo su bloque y la app recuerda la última.
- **Panorama** cabe en una pantalla: frase ejecutiva, 4 cifras clave (toneladas, TCH 26/27 frente a 25/26, área y % cosechado) y los accesos «Ver en el mapa».
- **Zafra:** avance de cosecha, hectáreas por mes, próximas semanas y Tablero de hoy. **Fincas:** TCH frente a 25/26, ranking por zona y finca, búsqueda y la tabla del aforo plegada.
- En tableta horizontal, Panorama queda fijo a la izquierda y la pestaña elegida a la derecha.

## V271126F · 27-nov-2026 · Fase 2, entrega 5: Ajustes claros y modo finca
- **Ajustes en tarjetas y sin términos técnicos:** Estado de la app (datos, fechas de corte, versión), Mis preferencias, Ubicación y recorridos. Lo de quien actualiza los datos (plantilla, archivos, espacio, volver a descargar) queda plegado en «Administración de datos».
- **Novedades:** al actualizarse la app aparece «CASUR Maps se actualizó · Novedades», con la lista de cambios en lenguaje sencillo. También desde Ajustes.
- **Modo finca:** al ver una finca en el mapa, sus lotes quedan resaltados en dorado y arriba aparece su resumen (lotes, ha, TCH); tocarlo abre la ficha y la ✕ quita el resaltado.

## V271126E · 27-nov-2026 · Fase 2, entrega 4: campo
- **Visita:** el aviso del mapa dice «Grabando» con un punto rojo que late, para saber con certeza que se está grabando la ruta.
- **Cierre de visita:** cumplimiento de la lista del día (porcentaje, barra y lotes que faltaron).
- **Bitácora:** búsqueda por lote, finca o nota, filtro por severidad y por categoría, con el número de registros que cumplen y «Quitar filtros».
- **Medición:** botón «Compartir» que genera una imagen con la figura sobre los lotes y el resultado (ha, mz, perímetro o distancia), lista para WhatsApp.

## V271126D · 27-nov-2026 · Fase 2, entrega 3: tableta y etiquetas sin cortes
- **Tableta horizontal:** la navegación pasa a una barra lateral (más alto para el mapa) y Resumen se ve en dos columnas: «Cómo vamos» a la izquierda y el aforo y la renovación a la derecha.
- **Etiquetas sin cortes:** se mide el ancho real de cada texto y no se dibujan etiquetas cortadas en el borde ni tapadas por el buscador, los avisos, la leyenda, la tarjeta o los botones. Funciona también con el mapa girado.
- El nombre de la finca va dentro de su lote más grande, no en el centro del recuadro (que podía caer fuera de la finca).
- Las etiquetas se recolocan cuando se abre o cierra la tarjeta, se pliega la leyenda o aparece un aviso.

## V271126C · 27-nov-2026 · Fase 2, entrega 2: tarjeta ejecutiva y cambio de capa rápido
- **Semáforo del lote** (Bien / Atención / Crítico) que junta el TCH estimado 26/27, su cambio frente a 25/26, la fecha de corte y los datos a validar, con el motivo principal a la vista. En «Más» se ven todos los motivos.
- **Franja ejecutiva** en la tarjeta: toneladas estimadas, diferencia en t/ha frente a 25/26 y días que faltan para el corte.
- **Cambio de capa en la leyenda:** fila de botones con todas las capas (un toque) y botón ⇄ en la píldora para volver a la capa anterior. Cada cambio ofrece «Deshacer».

## V271126B · 27-nov-2026 · Fase 2, entrega 1: resumen ejecutivo
- **Cómo vamos** al inicio de Resumen: frase ejecutiva, TCH estimado 26/27 frente a 25/26 en los mismos lotes, avance de zafra (cosechado y programado por mes) y lotes de las próximas 2 semanas de corte.
- **Ranking:** TCH por zona con la marca de 25/26 y la diferencia; 5 fincas con mayor y 5 con menor TCH. Se marcan las que tienen datos a validar.
- **Ver en el mapa:** Lotes TCH < 40, Corte de la próxima semana, Lotes a renovar y Lotes con fecha vencida de corte, cada uno con su número de lotes. Cada botón pone la capa, filtra, encuadra en el mapa y ofrece «Ver lista».
- **Lista de la clase filtrada** (también desde la leyenda): lotes, área, toneladas y TCH, encuadrar en el mapa y exportar a CSV.

## V271126A · 27-nov-2026 · Fase 1 de la auditoría (uso gerencial)
- **Capas:** la hoja se cierra sola al elegir una capa o un mapa base, con un aviso «Deshacer». Los interruptores no la cierran.
- **Leyenda:** se pliega sola a los 30 s o al primer arrastre o zoom, y queda como una píldora con el nombre de la capa; un toque la abre. Con un filtro de clase no se pliega sola y la píldora lo muestra con una ✕ para quitarlo. Filas con número de lotes, hectáreas y %.
- **Colores por categoría** (zona, riego, variedad, destino) con una paleta fija y legible; «Sin dato» siempre en gris. Nombres con tilde (Aspersión, Investigación…).
- **Vista general:** los lotes se dibujan según el nivel de zoom; de lejos ya no se ve una mancha negra.
- **Salidas naturales:** el botón Atrás de Android cierra la hoja, la tarjeta o la pestaña, y pide un segundo toque antes de salir. Tocar el mapa vacío cierra la tarjeta. El hallazgo a medio escribir queda como borrador.
- **Letra grande** sin desbordes; indicadores del Resumen que caben y cifras con un formato único. Resumen muestra las 10 fincas principales, con «Ver las 100».
- **Avisos** abajo, que se pueden cerrar y no tapan botones. La actualización no se aplica con un hallazgo a medio escribir.
- **Visita:** exige GPS, descarta saltos y lecturas imprecisas, y pide confirmación para finalizar, con opción de deshacer.
- **Bitácora:** sin registros duplicados por doble toque, lote de destino a la vista, «Deshacer» al borrar, y exportación CSV con hora local.
- **Datos coherentes:** histórico completo, un solo promedio, TCH estimados dudosos marcados como «Dato a validar» y nombres de lotes únicos.
- **Pantallas pequeñas (iPhone SE):** la acción «Registrar hallazgo» queda siempre a la vista, y los botones flotantes no se montan sobre el buscador.

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
