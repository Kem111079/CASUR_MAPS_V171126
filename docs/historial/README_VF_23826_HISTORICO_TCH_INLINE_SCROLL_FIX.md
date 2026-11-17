# CASUR Maps VF_23826 · Histórico TCH Inline Scroll FIX

Corrección quirúrgica para que el botón **Mostrar histórico TCH** despliegue el gráfico dentro de la misma tarjeta del polígono.

## Correcciones
- El gráfico ya no depende de página externa ni modal.
- El contenedor se renderiza directamente debajo del botón.
- La tarjeta inferior ahora permite scroll interno para que el gráfico no quede oculto por `max-height`.
- Se fuerza despliegue visible del bloque `.prod-hist-inline`.
- Se hace scroll automático hacia el gráfico al presionar el botón.
- Se mantiene la regla: no inventar NC; si no hay NC real, se muestra vacío/—; Planta solo cuando corresponde.

## Prueba
1. Seleccionar un polígono.
2. Tocar **Mostrar histórico TCH**.
3. El gráfico debe aparecer debajo del botón, dentro de la tarjeta.
