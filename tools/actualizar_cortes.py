#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CASUR Maps · Cortes de la zafra en curso (feed semanal).

Uso:
  python tools/actualizar_cortes.py fuentes/cortes_zafra.xlsx --salida data --zafra 26/27

El Excel/CSV necesita, en la primera hoja, una fila de encabezados con:
  CodLote (o HHHSSS) · Fecha_Corte · TCH        (opcionales: Toneladas, Area_Ha)
Si un lote aparece varias veces se toma el corte más reciente.

Genera data/cortes_zafra.json y actualiza metadata.json (cortes_al, generated_at).
La app usa estos cortes para la edad, el TCH de la última zafra y el semáforo.
"""
import argparse
import csv
import json
import sys
from datetime import date, datetime
from pathlib import Path

ALIAS = {
    "cod": ["codlote", "hhhsss", "cod_lote", "codsuerte", "lote"],
    "fecha": ["fecha corte real", "fecha_corte_real", "fecha_corte", "fecha corte", "f. corte", "fecha"],
    "tch": ["tch real", "tch_real", "tch"],
    "ton": ["toneladas", "ton", "tm"],
    "area": ["area_ha", "area ha", "area", "área ha"],
}


def leer(path):
    if path.suffix.lower() == ".csv":
        with open(path, newline="", encoding="utf-8-sig") as fh:
            return [list(r) for r in csv.reader(fh)]
    import openpyxl
    return [list(r) for r in openpyxl.load_workbook(path, data_only=True).worksheets[0].iter_rows(values_only=True)]


def a_fecha(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def codigo(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v or "").strip().upper()


def a_num(v):
    try:
        return round(float(str(v).replace(",", "")), 2)
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archivo")
    ap.add_argument("--salida", default="data")
    ap.add_argument("--zafra", default="26/27")
    args = ap.parse_args()
    out = Path(args.salida)
    rows = leer(Path(args.archivo))
    hdr, idx = None, {}
    for i, row in enumerate(rows[:15]):
        cells = [str(c or "").strip().lower() for c in row]
        # se respeta el orden de preferencia de los alias (primero los nombres de la plantilla)
        found = {k: next((cells.index(a) for a in al if a in cells), None) for k, al in ALIAS.items()}
        if found["cod"] is not None and found["fecha"] is not None:
            hdr, idx = i, found
            break
    if hdr is None:
        raise SystemExit("No encontré encabezados CodLote/HHHSSS y Fecha_Corte.")
    lotes, invalidas = {}, []
    for n, row in enumerate(rows[hdr + 1:], start=hdr + 2):
        get = lambda k: row[idx[k]] if idx[k] is not None and idx[k] < len(row) else None
        cod = codigo(get("cod"))
        if not cod:
            continue
        if get("fecha") in (None, ""):
            continue  # lote aún sin cortar
        f = a_fecha(get("fecha"))
        if not f or f > date.today():
            invalidas.append(f"fila {n}: {cod}")
            continue
        tch, ton, area = a_num(get("tch")), a_num(get("ton")), a_num(get("area"))
        if tch is None and ton and area:
            tch = round(ton / area, 2)
        rec = {"fecha_corte": f.isoformat()}
        if tch is not None:
            rec["tch"] = tch
        if ton is not None:
            rec["toneladas"] = ton
        if cod not in lotes or rec["fecha_corte"] > lotes[cod]["fecha_corte"]:
            lotes[cod] = rec
    ahora = datetime.now().isoformat(timespec="seconds")
    cortes_al = max((l["fecha_corte"] for l in lotes.values()), default="")
    (out / "cortes_zafra.json").write_text(json.dumps(
        {"generated_at": ahora, "source": Path(args.archivo).name, "zafra": args.zafra, "cortes_al": cortes_al,
         "count": len(lotes), "lotes": lotes}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    mp = out / "metadata.json"
    meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {}
    meta.update({"cortes_al": cortes_al, "cortes_lotes": len(lotes), "generated_at": ahora, "datos_al": date.today().isoformat()})
    mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK · {len(lotes)} lotes con corte en zafra {args.zafra} · cortes al {cortes_al or '—'}")
    if invalidas:
        print(f"Filas ignoradas por fecha inválida o futura ({len(invalidas)}): " + "; ".join(invalidas[:15]))


if __name__ == "__main__":
    sys.exit(main())
