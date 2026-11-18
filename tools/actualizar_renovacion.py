#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CASUR Maps · Grupo de corte y propuesta de renovación por lote.

Uso:
  python tools/actualizar_renovacion.py fuentes/datos_renovacion.xlsx --salida data

El Excel necesita, en la primera hoja, una fila de encabezados con:
  Código de lote (o HHHSSS / CodLote) · GrCorte · Propuesta de Renovacion (SI / No)

Genera data/renovacion.json y actualiza metadata.json. La app lo usa en las capas
"Propuesta de renovación" y "Plantillas y socas".
"""
import argparse
import json
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

ALIAS = {
    "cod": ["codigo de lote", "codlote", "cod lote", "hhhsss", "lote"],
    "grupo": ["grcorte", "gr corte", "grupo de corte", "grupo corte"],
    "renovar": ["propuesta de renovacion", "renovacion", "renovar"],
}
GRUPOS = ["Planta", "Corte 2", "Corte 3", "Corte 4", "Corte 5", "Mayor a 5"]


def plano(v):
    s = unicodedata.normalize("NFD", str(v or "")).encode("ascii", "ignore").decode()
    return " ".join(s.strip().lower().split())


def codigo(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v or "").strip().upper()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archivo")
    ap.add_argument("--salida", default="data")
    args = ap.parse_args()
    out = Path(args.salida)
    import openpyxl
    rows = [list(r) for r in openpyxl.load_workbook(args.archivo, data_only=True).worksheets[0].iter_rows(values_only=True)]
    hdr, idx = None, {}
    for i, row in enumerate(rows[:15]):
        cells = [plano(c) for c in row]
        found = {k: next((j for j, c in enumerate(cells) if c in al), None) for k, al in ALIAS.items()}
        if found["cod"] is not None and (found["grupo"] is not None or found["renovar"] is not None):
            hdr, idx = i, found
            break
    if hdr is None:
        raise SystemExit("No encontré encabezados Código de lote / GrCorte / Propuesta de Renovacion.")
    canon = {plano(g): g for g in GRUPOS}
    lotes, raros, dups = {}, [], []
    for n, row in enumerate(rows[hdr + 1:], start=hdr + 2):
        get = lambda k: row[idx[k]] if idx[k] is not None and idx[k] < len(row) else None
        cod = codigo(get("cod"))
        if not cod:
            continue
        if cod in lotes:
            dups.append(cod)
            continue
        g = plano(get("grupo"))
        grupo = canon.get(g, "Planta" if g.startswith("plant") else "")
        if g and not grupo:
            raros.append(f"fila {n}: {cod} = {get('grupo')}")
        r = plano(get("renovar"))
        rec = {}
        if grupo:
            rec["gr_corte"] = grupo
        if r in ("si", "s", "x", "1", "true"):
            rec["renovar"] = True
        elif r in ("no", "n", "0", "false"):
            rec["renovar"] = False
        if rec:
            lotes[cod] = rec
    ahora = datetime.now().isoformat(timespec="seconds")
    mp = out / "metricas_lote.json"
    M = json.loads(mp.read_text(encoding="utf-8")).get("lotes", {}) if mp.exists() else {}

    def grupo_de_nc(nc):
        if not nc:
            return ""
        if str(nc).lower().startswith("planta"):
            return "Planta"
        try:
            n = int(nc)
        except ValueError:
            return ""
        return f"Corte {n}" if n <= 5 else "Mayor a 5"

    distintos = [{"codlote": c, "nc_cronologico": M[c].get("nc"), "gr_corte": v["gr_corte"]}
                 for c, v in lotes.items() if c in M and v.get("gr_corte") and grupo_de_nc(M[c].get("nc")) not in ("", v["gr_corte"])]
    area = lambda cond: round(sum(float(M.get(c, {}).get("area_total_ha") or 0) for c, v in lotes.items() if cond(v)), 2)
    resumen = {
        "lotes": len(lotes), "a_renovar": sum(1 for v in lotes.values() if v.get("renovar")), "area_a_renovar_ha": area(lambda v: v.get("renovar")),
        "por_grupo": {g: {"lotes": sum(1 for v in lotes.values() if v.get("gr_corte") == g),
                          "a_renovar": sum(1 for v in lotes.values() if v.get("gr_corte") == g and v.get("renovar")),
                          "area_ha": area(lambda v, g=g: v.get("gr_corte") == g)} for g in GRUPOS},
    }
    (out / "renovacion.json").write_text(json.dumps(
        {"generated_at": ahora, "source": Path(args.archivo).name, "grupos": GRUPOS, "resumen": resumen,
         "validaciones": {"sin_lote_en_metricas": sorted(c for c in lotes if c not in M), "grupo_no_reconocido": raros,
                          "duplicados": dups, "nc_distinto_al_grupo": distintos},
         "lotes": lotes}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    metap = out / "metadata.json"
    meta = json.loads(metap.read_text(encoding="utf-8")) if metap.exists() else {}
    meta.update({"fuente_renovacion": Path(args.archivo).name, "renovacion_lotes": len(lotes), "generated_at": ahora, "datos_al": date.today().isoformat()})
    metap.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK · {len(lotes)} lotes · a renovar {resumen['a_renovar']} ({resumen['area_a_renovar_ha']} ha)")
    for g in GRUPOS:
        x = resumen["por_grupo"][g]
        print(f"   {g:10s} {x['lotes']:4d} lotes · {x['area_ha']:9.2f} ha · a renovar {x['a_renovar']}")
    if distintos:
        print("NC del cronológico distinto al grupo de corte:", distintos[:10])
    if raros:
        print("Grupos no reconocidos:", raros[:10])


if __name__ == "__main__":
    sys.exit(main())
