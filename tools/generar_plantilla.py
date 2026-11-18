#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CASUR Maps · Genera la plantilla única de datos, rellena con lo que la app tiene publicado.

Uso:
  python tools/generar_plantilla.py --datos data --salida fuentes/Plantilla_CASUR_Maps.xlsx

La plantilla tiene una fila por lote. Se edita en Excel y se sube a la carpeta fuentes/ del
repositorio; GitHub procesa el archivo y los teléfonos reciben los datos nuevos.
"""
import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# (encabezado, ancho, grupo, explicación)
COLUMNAS = [
    ("HHHSSS", 11, "id", "Código del lote. Es la llave: debe coincidir con el código del mapa (Cod. Hacienda + Ste). No repetir."),
    ("Cod. Hacienda", 9, "id", "Código de la hacienda o productor."),
    ("Nombre Hacienda", 30, "id", "Nombre de la hacienda o productor, tal como debe verse en la app."),
    ("Ste", 7, "id", "Suerte (por ejemplo 01, 01A)."),
    ("Zona", 15, "id", "Zona del lote. Se usa en el resumen por zona y en la capa Zona."),
    ("Area Ha", 9, "aforo", "Hectáreas del lote para el aforo."),
    ("Nombre Destino del Cultivo", 16, "aforo", "Molienda, Semilla AS, Semilla, Sin Caña, Baja Prod, Investigacion."),
    ("Tn", 6, "aforo", "Tenencia: PR = propio, CA = arrendamiento, CV = productores."),
    ("Clasificacion", 16, "aforo", "Solo 'Molienda' entra al TCH ponderado. El resto se informa aparte."),
    ("Variedad", 14, "aforo", "Variedad sembrada. Si se deja vacía se usa la del mapa."),
    ("Riego", 12, "aforo", "Tipo de riego."),
    ("NC", 8, "aforo", "Número de corte: 'Planta' o un número (2, 3, 4…). De aquí sale la capa Plantillas y socas."),
    ("actTCH_2627", 11, "aforo", "TCH estimado de la zafra. Las toneladas se calculan solas (TCH × hectáreas)."),
    ("TCH opt", 9, "aforo", "TCH optimista."),
    ("Fecha Cosecha", 13, "programa", "Fecha programada de corte (dd/mm/aaaa). Alimenta la etiqueta de corte y la capa Semana de corte."),
    ("Propuesta de Renovacion", 13, "programa", "SI o No. Alimenta la capa y el resumen de renovación."),
    ("Fecha Ultimo Corte", 13, "historia", "Fecha del último corte de la zafra anterior. De aquí sale la edad."),
    ("TCH Ultima Zafra", 11, "historia", "TCH de la zafra anterior. Se muestra como 'TCH anterior'."),
    ("Fecha Corte Real", 13, "real", "Llenar cuando el lote se corte en la zafra en curso. Marca el lote como cosechado y apaga la alerta de fecha vencida."),
    ("TCH Real", 9, "real", "TCH obtenido en ese corte. Pasa a ser el 'TCH anterior' del lote."),
]
COLOR = {"id": "1F3A5F", "aforo": "0B7F3A", "programa": "005BAA", "historia": "6B7280", "real": "B45309"}
GRUPO_TXT = {"id": "Identificación", "aforo": "Aforo / estimado", "programa": "Programa de zafra", "historia": "Zafra anterior", "real": "Cortes reales (zafra en curso)"}


def a_fecha(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def nc_valor(v):
    if v in (None, "", "—"):
        return None
    s = str(v).strip()
    if s.lower().startswith("plant"):
        return "Planta"
    try:
        return int(float(s))
    except ValueError:
        return s


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", default="data")
    ap.add_argument("--salida", default="fuentes/Plantilla_CASUR_Maps.xlsx")
    args = ap.parse_args()
    d = Path(args.datos)
    cargar = lambda n: json.loads((d / n).read_text(encoding="utf-8")) if (d / n).exists() else {}
    aforo, metr = cargar("aforo_2627.json").get("lotes", {}), cargar("metricas_lote.json").get("lotes", {})
    renov, cortes = cargar("renovacion.json").get("lotes", {}), cargar("cortes_zafra.json").get("lotes", {})

    wb = Workbook()
    ws = wb.active
    ws.title = "Lotes"
    borde = Border(bottom=Side(style="thin", color="D1D5DB"))
    for j, (titulo, ancho, grupo, _) in enumerate(COLUMNAS, start=1):
        c = ws.cell(row=1, column=j, value=titulo)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=COLOR[grupo])
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = ancho
    ws.row_dimensions[1].height = 42

    def orden(k):
        a = aforo[k]
        cod = a.get("cod_hacienda", "")
        return (int(cod) if str(cod).isdigit() else 10**9, str(cod), str(a.get("suerte", "")))

    for i, k in enumerate(sorted(aforo, key=orden), start=2):
        a, m, r, ct = aforo[k], metr.get(k, {}), renov.get(k, {}), cortes.get(k, {})
        nc = nc_valor(a.get("nc_display"))
        g = r.get("gr_corte")  # el grupo de corte más reciente manda si no coincide con el NC guardado
        if g:
            actual = "Planta" if nc == "Planta" else f"Corte {nc}" if isinstance(nc, int) and nc <= 5 else "Mayor a 5" if isinstance(nc, int) else ""
            if actual != g:
                nc = "Planta" if g == "Planta" else int(g.replace("Corte ", "")) if g.startswith("Corte") else 6
        fila = [
            k, a.get("cod_hacienda", ""), a.get("nombre_hacienda", ""), a.get("suerte", ""), a.get("zona", ""),
            a.get("area_ha"), a.get("destino", ""), a.get("tn", ""), a.get("clasificacion", ""),
            m.get("variedad") or a.get("variedad", ""), a.get("tipo_riego") or m.get("riego", ""), nc,
            a.get("actTCH"), a.get("tch_opt"), a_fecha(a.get("fecha_cosecha")),
            "SI" if r.get("renovar") is True else "No" if r.get("renovar") is False else None,
            a_fecha(m.get("fecha_ultimo_corte") or a.get("fecha_ult_corte")), m.get("tch_ultima_zafra", a.get("tch_ant")),
            a_fecha(ct.get("fecha_corte")), ct.get("tch"),
        ]
        for j, v in enumerate(fila, start=1):
            c = ws.cell(row=i, column=j, value=v if v != "" else None)
            c.border = borde
            if isinstance(v, date):
                c.number_format = "dd/mm/yyyy"
            if j in (1, 2, 4):
                c.number_format = "@"  # códigos como texto
            if j == 1:
                c.font = Font(bold=True)
    n = ws.max_row
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNAS))}{n}"

    def lista(col, opciones):
        dv = DataValidation(type="list", formula1='"' + ",".join(opciones) + '"', allow_blank=True, showErrorMessage=True,
                            errorTitle="Valor no válido", error="Elija un valor de la lista.")
        ws.add_data_validation(dv)
        dv.add(f"{col}2:{col}{n + 500}")

    letra = {t: get_column_letter(j) for j, (t, *_r) in enumerate(COLUMNAS, start=1)}
    lista(letra["Zona"], sorted({a.get("zona") for a in aforo.values() if a.get("zona")}))
    lista(letra["Nombre Destino del Cultivo"], ["Molienda", "Semilla AS", "Semilla", "Sin Caña", "Baja Prod", "Investigacion"])
    lista(letra["Tn"], ["PR", "CA", "CV"])
    lista(letra["Clasificacion"], ["Molienda", "Semilla", "Sin Caña", "Baja rentabilidad", "Investigacion"])
    lista(letra["Propuesta de Renovacion"], ["SI", "No"])
    riegos = sorted({(a.get("tipo_riego") or "") for a in aforo.values()} - {""})
    if riegos:
        lista(letra["Riego"], riegos)
    for col in ("Fecha Cosecha", "Fecha Ultimo Corte", "Fecha Corte Real"):
        dv = DataValidation(type="date", operator="greaterThan", formula1="42005", allow_blank=True, showErrorMessage=True,
                            errorTitle="Fecha no válida", error="Escriba una fecha como 11/12/2026.")
        ws.add_data_validation(dv)
        dv.add(f"{letra[col]}2:{letra[col]}{n + 500}")
        for i in range(n + 1, n + 501):
            ws.cell(row=i, column=COLUMNAS.index(next(c for c in COLUMNAS if c[0] == col)) + 1).number_format = "dd/mm/yyyy"

    ins = wb.create_sheet("Instrucciones")
    ins.column_dimensions["A"].width = 28
    ins.column_dimensions["B"].width = 22
    ins.column_dimensions["C"].width = 100
    filas = [
        ("CASUR Maps · Plantilla única de datos", "", ""),
        ("", "", ""),
        ("Cómo se usa", "", ""),
        ("1.", "", "Edite solo la hoja 'Lotes'. Una fila por lote. No cambie los encabezados ni el orden de las hojas."),
        ("2.", "", "Guarde el archivo con el mismo nombre: Plantilla_CASUR_Maps.xlsx"),
        ("3.", "", "En GitHub abra la carpeta 'fuentes' del repositorio → Add file → Upload files → arrastre el archivo → Commit changes."),
        ("4.", "", "En 2 a 3 minutos los datos quedan publicados. Los teléfonos los descargan solos al abrir la app con señal (aviso 'Datos nuevos listos')."),
        ("5.", "", "Si algo no se actualiza, revise la pestaña 'Actions' del repositorio: una marca roja indica que el archivo tiene un error y no se publicó nada."),
        ("", "", ""),
        ("Reglas", "", ""),
        ("Celdas vacías", "", "En Zona, Variedad, Riego, NC, Fecha Ultimo Corte y TCH Ultima Zafra, una celda vacía conserva el dato que la app ya tenía. No se inventa nada."),
        ("Lotes nuevos", "", "Agregue una fila al final. El código (HHHSSS) debe existir en el mapa para que el lote se pueda tocar."),
        ("Lotes que salen", "", "Borre la fila completa. El lote queda en el mapa como 'Sin aforo'."),
        ("Toneladas", "", "No se escriben: la app calcula TCH × hectáreas."),
        ("TCH ponderado", "", "Toneladas de molienda ÷ hectáreas de molienda (Clasificacion = Molienda)."),
        ("Fechas", "", "Formato dd/mm/aaaa. Una fecha de cosecha anterior a hoy, sin 'Fecha Corte Real', se marca como vencida en la app."),
        ("", "", ""),
        ("Columna", "Grupo", "Qué es y para qué sirve"),
    ] + [(t, GRUPO_TXT[g], txt) for t, _a, g, txt in COLUMNAS]
    for i, (a, b, c) in enumerate(filas, start=1):
        ins.cell(row=i, column=1, value=a)
        ins.cell(row=i, column=2, value=b)
        ins.cell(row=i, column=3, value=c).alignment = Alignment(wrap_text=True, vertical="top")
    ins["A1"].font = Font(bold=True, size=15, color="0B7F3A")
    for r in (3, 10):
        ins.cell(row=r, column=1).font = Font(bold=True, size=12)
    cab = 18
    for j in (1, 2, 3):
        c = ins.cell(row=cab, column=j)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3A5F")
    for i, (_t, _a, g, _x) in enumerate(COLUMNAS, start=cab + 1):
        ins.cell(row=i, column=1).font = Font(bold=True)
        ins.cell(row=i, column=2).font = Font(color=COLOR[g], bold=True)
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    wb.save(args.salida)
    print(f"OK · {n - 1} lotes · {args.salida}")


if __name__ == "__main__":
    sys.exit(main())
