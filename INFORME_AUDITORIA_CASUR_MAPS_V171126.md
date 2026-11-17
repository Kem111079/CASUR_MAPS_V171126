# CASUR Maps · Auditoría total y propuestas de mejora

**Fecha:** 17-nov-2026 · **Versión auditada:** VF_23826 + actualización de datos V171126
**Alcance:** `index.html`, `app.js` (2,629 líneas), `styles.css`, `service-worker.js`, carpeta `data/`, módulos `historico.html` y `casur_suertes_operativo/`.
**Método:** lectura completa del código, cruce de los datos nuevos contra los anteriores y prueba de la app en un navegador móvil emulado (Pixel 7). No se probó en un teléfono real ni con GPS real.

---

## 1. Resumen ejecutivo

La app cumple bien su función central: abrir el mapa, tocar un lote y ver su ficha. La detección de lote por GPS está bien pensada (perfiles, lecturas estables, bloqueo de lote). Lo que más limita hoy su uso en campo no es lo que falta, sino tres cosas:

1. **Los datos envejecen sin que la app avise.** La edad y el "TCH última zafra" salen de una carga de agosto. Con la zafra 26/27 en curso, cada lote que se corta queda con edad y TCH incorrectos hasta la siguiente carga manual.
2. **Cada apertura descarga ~1.6 MB comprimidos (7.3 MB sin comprimir) de polígonos**, aunque no hayan cambiado. En zonas con señal débil eso es la diferencia entre abrir en 3 segundos o en 1 minuto.
3. **Lo que el técnico registra en campo vive solo en su teléfono.** Observaciones, visitas y fotos no se respaldan; si se limpia el navegador o se cambia de teléfono, se pierden.

Las 5 mejoras con mayor retorno, en orden:

| # | Mejora | Por qué primero |
|---|---|---|
| 1 | Botón **"Cómo llegar"** (abre Google Maps/Waze con el centroide del lote) | Una línea de código; resuelve la pregunta más frecuente en campo |
| 2 | **Búsqueda por nombre** de hacienda/productor con sugerencias | Hoy solo se busca por código exacto |
| 3 | **Carga offline real**: polígonos servidos desde caché y actualizados solo cuando cambia la versión | Apertura instantánea sin señal |
| 4 | **Barra inferior de 4 acciones** (GPS · Buscar · Capas · Registrar) en lugar del panel de 16 secciones | El panel mide 3,194 px de alto; 3.8 pantallas de scroll |
| 5 | **Feed de cortes de la zafra** (fecha de corte y TCH real por lote) con fecha de "datos al día" visible | Sin esto, edad y semáforo se degradan cada semana |

---

## 2. Qué se actualizó en esta entrega

### 2.1 Shape
| | Anterior | Nuevo |
|---|---|---|
| Fuente | Maestro_26-27_Actualizado.shp | Shape_Casur_FNC_171126.gpkg |
| Polígonos | 8,254 | **8,341** |
| CodLotes | 1,045 | **1,081** |
| Área total | — | 10,319.7 ha |
| Geometrías inválidas | 8 → 0 | 8 → 0 (reparadas) |
| Peso del GeoJSON | 8.5 MB | 7.35 MB |

El shape nuevo ya no trae fechas, edad, NC ni TCH por polígono. La app nunca leyó esos campos del shape (los toma de `metricas_lote.json`), así que no se pierde nada visible. Sí trae **Variedad, Zona y Finca**, que ahora se publican.

### 2.2 Aforo (Estimados_para_APP_Z2627v2.xlsx, "Versión del 12.10.2026")
| | Anterior | Nuevo |
|---|---|---|
| Suertes | 1,054 | **1,046** |
| Área | 10,028.06 ha | **9,672.13 ha** |
| Toneladas | 630,090 t | **563,373 t** (−10.6 %) |
| TCH ponderado | 62.83 | **58.25** |
| Toneladas óptimas (nuevo) | — | 600,654 t (TCH 62.10) |

- **695 suertes** cambiaron de actTCH y **151** de área.
- Se agregó a la tarjeta del lote el **TCH óptimo y toneladas óptimas** que trae el Excel nuevo.
- El Excel nuevo solo trae área, destino, tenencia, actTCH, toneladas, óptimos y clasificación. **Fecha de último corte, TCH anterior, riego, NC y zona se conservaron de la carga de agosto**; no se inventó nada.

### 2.3 Puntos que requieren su revisión

| Hallazgo | Detalle |
|---|---|
| **8 suertes salen del aforo** | 14710A, 2209B, 3313, 3316A, 3325, 3327, 3328, 902A. En el mapa muestran "Sin dato de aforo". |
| **41 CodLotes del shape sin aforo** | 23 de Michael Heally/Chatilla (155xx), 12 de El Amparo (878xx), 114A, 14710A y las 5 de Rodeo Grande de la fila anterior. Los de El Amparo y Chatilla tampoco tienen histórico. |
| **6 suertes del aforo sin polígono** | 18413A, 1921B, 337A, 606, 6301A, 99347A. No se pueden tocar en el mapa. |
| **3 suertes con TCH óptimo menor que actTCH** | 1427 (64 vs 54), 12504 (65 vs 48), 99319 (65 vs 57). Parece error de digitación. |
| **40 suertes con área 0 en el aforo** | Mayormente "Sin Caña"; 6203 tiene 19.8 ha en el shape y 0 en el aforo. |
| **26 suertes con área shape ≠ área aforo en más de 10 %** | Las mayores: 19011 (7.18 vs 1.48 ha), 12513 (15.35 vs 5.35), 1921 (6.67 vs 3.09), 19013, 5301, 337. Lista completa en `data/reporte_actualizacion.json`. |
| **17 suertes con variedad distinta** | Se tomó la del shape por ser la más reciente (ej. 1030: RB 86-7515 → CC06-783). Probables renovaciones: su fecha de corte y TCH anterior corresponden a la caña vieja. |
| **16 suertes de Nacascolo (270–283)** | El shape dice 2-Centro; el cronológico dice 1-Sur. Se mantuvo 1-Sur en el resumen de aforo. |
| **Tabla auxiliar del Excel (columnas P:Q)** | Marca "Molienda" a 41 suertes que la tabla principal marca "Sin Caña". Se usó la tabla principal. |

### 2.4 Lo que NO se actualizó
`historico.html` (Cronológico, datos del 14-jun-2026) y `casur_suertes_operativo/` (cronológico del 27-jul-2026) llevan sus datos incrustados y no se pueden regenerar desde este Excel. **Siguen mostrando el aforo anterior** (63.47 TCH global), por lo que un mismo lote puede mostrar un TCH esperado en el mapa y otro en "CASUR Suertes".

### 2.5 Herramienta nueva
`tools/actualizar_shape_y_aforo.py` repite todo este proceso con un comando y deja un reporte de validación. La próxima actualización ya no depende de un proceso manual.

---

## 3. Auditoría de lógica

### Críticos
| # | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|
| L1 | **Edad y semáforo se calculan con cortes de la zafra pasada.** Hoy 8,158 de 8,341 polígonos caen en "edad > 6 meses"; las capas de edad ya no distinguen nada. | `edadActualMetric()` usa `fecha_ultimo_corte` de la carga de agosto | Cargar semanalmente un Excel de cortes (CodLote, fecha, TCH real) y mostrar "Datos al: dd/mm" en la tarjeta |
| L2 | **El semáforo usa umbrales fijos de TCH (55 y 70)** sin considerar zona, riego ni tenencia. Un productor de secano con 54 sale "Prioridad alta" igual que un lote de riego con 54. | `agroStatusFor()` | Comparar contra el promedio de su zona/tenencia o contra su propio histórico (ya está en `produccion_historica_lote.json`) |
| L3 | **"Edad alta ≥ 12 meses" se marca como alerta**, pero la caña se cosecha normalmente a 11–13 meses. | `agroStatusFor()` | Alerta por edad solo sobre 14 meses o según programa de corte |
| L4 | **Resumen de aforo: el TCH ponderado incluye suertes sin caña y de semilla** (96 suertes con actTCH 0). Da 58.25; sobre el área que sí tiene aforo es 61.78. | `renderAforoSummary()` | Mostrar ambos o definir cuál es el oficial. El JSON ya trae los dos valores |
| L5 | **Dos fuentes de verdad desfasadas** (mapa vs. Cronológico vs. Suertes Operativo), ver 2.4 | datos incrustados en HTML de 2 MB | Que los tres módulos lean los mismos JSON de `data/` |

### Importantes
| # | Hallazgo | Propuesta |
|---|---|---|
| L6 | Capas de edad dejan un hueco: "< 3", "4 a 6", "> 6". Un lote de 3.5 meses no entra en ninguna. | Rangos continuos: 0–3, 3–6, 6–9, 9–12, > 12 |
| L7 | La capa TCH usa el TCH de la última zafra, no el aforo. No hay forma de pintar el mapa por actTCH esperado ni por brecha contra el óptimo. | Selector "Colorear por": TCH anterior · actTCH · brecha vs. óptimo · edad · variedad · destino |
| L8 | `hallazgoGetLatLngSafe()` usa una variable que no existe (`lastGpsLatLng`). Si falla el centroide, "Compartir hallazgo" se rompe. | Reemplazar por `lastGpsFix` |
| L9 | El hallazgo compartido usa el **centroide del lote**, no la posición GPS donde está parado el técnico. | Usar GPS si está activo y dentro del lote; centroide como respaldo |
| L10 | `lastGpsFix.acc` se pierde en cada lectura (se asigna antes de recrear el objeto), así que las observaciones guardan precisión 0. | Guardar `acc` dentro de `getSpeedFromPosition()` |
| L11 | El recorrido y la visita registran el lote "más cercano" aunque el técnico vaya por el camino, a 70 m. Infla los "lotes visitados". | Contar visitado solo si estuvo dentro, o a < 15 m por más de 20 s |
| L12 | El recorrido activo no se guarda; si el teléfono cierra la pestaña se pierde. La visita sí se guarda, pero en `localStorage` (límite ~5 MB). | Guardar ambos en IndexedDB |
| L13 | Las fotos se guardan a tamaño completo (3–8 MB cada una) como texto base64. | Reducir a 1600 px y JPEG 80 % antes de guardar (~300 KB) |
| L14 | El CSV de bitácora lista el nombre de la foto pero **no exporta las fotos**. | Exportar ZIP (CSV + fotos) o compartir por lote |
| L15 | El filtro de finca lista "Codfinca 3", "Codfinca 10"... sin nombre. | Mostrar "3 · El Javillo" (el shape nuevo ya trae `Finca`) |
| L16 | La rotación "Rumbo arriba" se hace girando el mapa con CSS. Leaflet no lo sabe: al arrastrar, el mapa se mueve en dirección distinta al dedo, y los toques pueden seleccionar otro lote. | Plugin `leaflet-rotate`, o dejar Norte arriba por defecto y girar solo la flecha |
| L17 | `user-scalable=no` impide agrandar texto a usuarios con vista cansada. | Quitarlo; Leaflet maneja su propio zoom |

### Mantenibilidad
- `app.js` es una cadena de parches: `bindUi` se redefine 8 veces, `cleanSelectedHtml` 3, `aforoBlockHtml` 3, `toggleProdHistInline` 2. Cualquier cambio obliga a encontrar cuál es la versión viva. **Consolidar en una sola definición por función** antes de agregar funciones nuevas.
- 28 `alert()` bloqueantes; en campo interrumpen con guantes o sol. Sustituir por avisos tipo "toast".
- 33 archivos README en la raíz con versiones mezcladas (V5.1, V19.3, V20.4, VF_23826). Mover a `docs/historial/` y dejar un solo `CHANGELOG.md`.
- Los textos de versión visibles al usuario están desactualizados ("GPS V5.1", "CASUR Maps V19.3" en el CSV).

---

## 4. Auditoría de rendimiento y offline

| # | Hallazgo | Medición | Propuesta |
|---|---|---|---|
| R1 | Los datos se piden siempre a la red (`cache:'reload'` + "network-first"). | 1.40 MB (polígonos) + 0.15 MB (aforo y métricas) comprimidos **en cada apertura** | "Cache-first" con verificación de `metadata.json` (1 KB): solo descargar si cambió la versión |
| R2 | Sin señal, la app espera el fallo de red antes de usar la caché. | Hasta 70 s de espera configurados | Servir caché de inmediato y actualizar en segundo plano |
| R3 | Leaflet se carga desde un CDN externo. Si es la primera apertura sin señal, la app no arranca. | — | Incluir Leaflet en el repositorio (150 KB) |
| R4 | Las teselas del mapa base se guardan sin límite en la misma caché. En Chrome cada respuesta de otro dominio cuenta ~7 MB contra la cuota. | Riesgo de que el navegador borre **toda** la caché, incluidos los polígonos | Caché separada para teselas con tope (ej. 500) |
| R5 | No hay forma de **pre-descargar el satélite de una zona** antes de salir. | — | Botón "Guardar esta zona para offline" |
| R6 | El GeoJSON repite por polígono datos que son del lote (finca, zona, variedad). | 7.35 MB | Dejar en el polígono solo código, tablón y área; lo demás ya está en métricas. O migrar a teselas vectoriales (PMTiles) |
| R7 | `smartStyle()` consulta 8 controles del DOM por cada uno de los 8,341 polígonos, y `updatePolygonVisualMode()` restila todo dos veces. | ~130,000 consultas por cambio de capa | Leer los controles una vez y pasar el estado |
| R8 | La caché de `historico.html` y `casur_suertes_operativo` suma 4.3 MB con datos repetidos y el logo incrustado en base64 dos veces. | — | Ver L5 |

---

## 5. Auditoría de diseño y visualización

Observado en pantalla de teléfono (412 × 839):

| # | Hallazgo | Propuesta |
|---|---|---|
| D1 | **La tarjeta del lote mide 1,120 px y solo se ven 617.** El bloque de aforo apila HHHSSS, actTCH y Toneladas en tres cajas de ancho completo; el botón "Cerrar" flota encima del contenido. | Cabecera fija (código, productor, semáforo) + fila de 4 cifras (TCH ant. · actTCH · óptimo · edad) + acciones. El resto, bajo "Ver más" |
| D2 | El dato **HHHSSS repite el CodLote** del título. | Eliminarlo y usar el espacio para TCH óptimo |
| D3 | El botón "☰ Panel" tapa el control de zoom, y hay **dos botones "Panel"** (arriba y abajo). | Uno solo, en la barra inferior |
| D4 | La leyenda ocupa ~17 % de la pantalla y explica cosas obvias. | Plegable, cerrada por defecto; que solo aparezca cuando hay una capa temática activa, explicando sus colores |
| D5 | El panel lateral tiene 16 secciones y 3,194 px de alto. Las 4 tarjetas de estado de arriba empujan "Buscar" fuera de la primera pantalla. | Ver propuesta de navegación en la sección 6 |
| D6 | 30 controles miden menos de 40 px de alto ("📍 Copiar" mide 22 px). El mínimo recomendado para dedo es 44–48 px. | Subir todos a 48 px |
| D7 | Los polígonos se colorean por finca con 10 colores al azar: no comunican nada y se confunden con las capas temáticas. | Color neutro por defecto; el color se reserva para la capa activa |
| D8 | Las etiquetas aparecen solo desde zoom 16 y una por CodLote. No se ven los tablones. | Zoom 14–15: nombre de finca · 16–17: CodLote · 18+: tablón |
| D9 | En modo normal, "TCH > 70" es verde sobre mapa con vegetación; "TCH bajo" naranja y "edad 4–6" amarillo se parecen. | Una sola rampa secuencial por variable, con leyenda |
| D10 | La vista inicial muestra todo el país (los lotes son manchas). | Abrir en la última posición vista o en el GPS |
| D11 | Mezcla de tratamientos: "CodLote", "CODLOTE", "HHHSSS", "Suerte", "Lote" para lo mismo. | Un solo término en toda la app |
| D12 | Textos de ayuda largos bajo cada sección ("La V5.1 calcula lote/borde/camino en silencio..."). Nadie los lee al sol. | Una línea, o un ícono "?" que los despliegue |
| D13 | Sin modo de alto brillo. Fondos gris claro y texto gris medio se lavan bajo el sol. | Tema "Campo": fondo blanco puro, texto negro, cifras más grandes; opcional tema oscuro para la madrugada |

---

## 6. Propuestas para hacerla más práctica en campo

### 6.1 Nueva estructura de pantalla
```
┌──────────────────────────────┐
│ 🔍 Buscar lote o productor   │  ← siempre visible
│                        [capas]│
│            MAPA              │
│                        [ ◎ ] │  ← centrar GPS
│ ┌──────────────────────────┐ │
│ │ 3801 · D. Góngora  🟢    │ │  ← tarjeta compacta (deslizar para ampliar)
│ │ 73 ant · 80 est · 90 ópt │ │
│ │ [Llegar][Registrar][Más] │ │
│ └──────────────────────────┘ │
│  Mapa   Visita   Bitácora  ⚙ │  ← barra inferior
└──────────────────────────────┘
```
- **Mapa:** todo lo de consulta.
- **Visita:** un solo botón Iniciar/Finalizar que une "Visita" y "Recorrido" (hoy son dos funciones que hacen casi lo mismo).
- **Bitácora:** lista de observaciones y fotos, con exportar.
- **⚙:** perfiles GPS, unidades, instalación, actualización de datos. Lo que se configura una vez no debe estar en el camino diario.

### 6.2 Funciones nuevas, por impacto

**Rápidas (horas a 1–2 días cada una)**
1. **"Cómo llegar"**: `https://www.google.com/maps/dir/?api=1&destination=lat,lng`.
2. **Búsqueda con sugerencias** por código, productor o finca, tolerante a tildes.
3. **Lotes recientes y favoritos** (últimos 10 consultados).
4. **Compartir ubicación del lote por WhatsApp** (enlace que abre la app en ese lote: `?lote=3801`).
5. **Mantener pantalla encendida** durante visita (Wake Lock API).
6. **Deshacer / editar / borrar** una observación individual (hoy solo se puede borrar todo).
7. **Nombre del técnico guardado una vez**, no en cada hallazgo.
8. **Vibración corta** al entrar a un lote nuevo con GPS (confirmación sin mirar la pantalla).

**Medianas (1–2 semanas)**
9. **Capas temáticas por selector único** con leyenda (L7, D9).
10. **Resumen de finca al tocar su nombre**: área, toneladas, TCH, lotes en rojo.
11. **Lista de trabajo del día**: marcar lotes a visitar, verlos numerados en el mapa y tacharlos.
12. **Paquete offline por zona** (R5).
13. **Registro por voz** de la nota de observación (dictado del teléfono).
14. **Reporte de visita en PDF con mapa del recorrido y fotos**, no solo tablas.

**Estructurales (requieren decisión)**
15. **Sincronización central** de observaciones, visitas y fotos (Google Sheets/Drive, SharePoint o una base ligera). Es lo que convierte la app de consulta en una herramienta de gestión: jefatura ve en un tablero qué se visitó y qué se encontró.
16. **Carga automática de datos** desde el Excel maestro (GitHub Action que corre el script nuevo al subir el archivo).
17. **Acceso con usuario.** Hoy el sitio es público: cualquiera con el enlace ve productores, áreas y estimados de producción.

### 6.3 Hoja de ruta sugerida
| Fase | Contenido | Resultado |
|---|---|---|
| **1 · Higiene** (1 semana) | L8, L10, L17, R1–R4, D3, D6; consolidar `app.js` | Abre rápido y sin señal; sin errores latentes |
| **2 · Tarjeta y navegación** (2 semanas) | D1–D5, 6.1, funciones rápidas 1–8 | Menos toques por tarea |
| **3 · Datos vivos** (2 semanas) | L1–L5, capas temáticas, script automatizado | Semáforo confiable durante la zafra |
| **4 · Gestión** (por definir) | Sincronización, lista de trabajo, acceso con usuario | Trazabilidad para jefatura |

---

## 7. Lo que está bien y conviene conservar
- Detección de lote con confirmación por lecturas estables y bloqueo manual: evita saltos entre lotes en caminos y esquinas.
- Edad calculada dinámicamente desde la fecha de corte (el problema es el dato, no el cálculo).
- Estilo adaptativo para satélite (halo blanco, patrones de línea además de color).
- Histórico TCH dentro de la tarjeta, sin salir del mapa.
- Tarjeta de hallazgo como imagen para WhatsApp: es el flujo real de comunicación del equipo.
- Regla explícita de "no inventar datos" (NC, cortes).
