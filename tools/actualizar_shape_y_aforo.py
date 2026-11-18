#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CASUR Maps · Actualizador reproducible de shape + aforo.

Uso:
  pip install geopandas pyogrio openpyxl
  python tools/actualizar_shape_y_aforo.py Shape.gpkg Estimados.xlsx --salida data

Entradas:
  - Shape (GeoPackage o .shp/.zip) con CodSuerte, Suerte, Codfinca, Tablon, Area_Ha
    y, si existen, Nombre, Finca, ZONA, Variedad.
  - Excel de estimados (primera hoja) con encabezados en cualquier fila de las primeras 10:
    Cod. Hacienda, Nombre Hacienda, Ste, Area Ha, Nombre Destino del Cultivo, Tn, HHHSSS,
    actTCH_2627, Toneladas, TCH opt, Ton Opti, Clasificacion.

Genera (en --salida):
  poligonos_casur.geojson   polígonos WGS84 ligeros con bbox por polígono
  aforo_2627.json           aforo por HHHSSS + resumen por hacienda / finca / zona
  metricas_lote.json        métricas por CodLote que consume el mapa
  metadata.json             versión, fuentes y conteos
  reporte_actualizacion.json  validaciones del cruce shape vs aforo

Regla de conservación: el Excel de estimados no trae fechas de corte, TCH anterior,
riego ni NC. Esos datos se conservan del aforo_2627.json / metricas_lote.json que ya
están en --salida. No se inventa ningún dato histórico.
"""
import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

TENENCIA = {"PR": ("Propio", "Admon. Dir."), "CA": ("Arrendamiento", "Admon. Dir."), "CV": ("Productores", "Productores")}
COLS = {
    "cod": ["cod. hacienda", "cod hacienda", "codhacienda"],
    "nombre": ["nombre hacienda"],
    "ste": ["ste", "suerte"],
    "area": ["area ha", "área ha"],
    "destino": ["nombre destino del cultivo", "destino"],
    "tn": ["tn"],
    "hhhsss": ["hhhsss"],
    "tch": ["acttch_2627", "acttch"],
    "tch_opt": ["tch opt", "tch opti", "tch optimista"],
    "clas": ["clasificacion", "clasificación"],
}
# Columnas opcionales: si el Excel no las trae (o la celda está vacía), se conserva el dato de la carga anterior.
# Toneladas y Ton Opti se calculan (TCH × área) cuando no vienen.
COLS_OPC = {
    "ton": ["toneladas"],
    "ton_opt": ["ton opti", "ton opt"],
    "fecha_cosecha": ["fecha cosecha", "fecha de cosecha", "fecha corte", "fecha de corte", "fecha_cosecha"],
    "zona": ["zona"],
    "variedad": ["variedad"],
    "riego": ["riego", "tipo de riego", "tipo riego"],
    "nc": ["nc", "numero de corte", "número de corte", "n. corte"],
    "fecha_ult_corte": ["fecha ultimo corte", "fecha último corte", "fecha_ultimo_corte"],
    "tch_ant": ["tch ultima zafra", "tch última zafra", "tch anterior", "tch_ultima_zafra"],
}


def a_iso(v):
    """Fecha de Excel -> 'AAAA-MM-DD'; texto como 'Sin coincidencia' -> ''."""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    d = parse_iso(v)
    if d is None:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
            try:
                d = datetime.strptime(str(v).strip()[:10], fmt).date()
                break
            except (TypeError, ValueError):
                pass
    return d.isoformat() if d else ""


def norm(v):
    return str(v if v is not None else "").strip()


def key(v):
    if isinstance(v, float) and v.is_integer():  # Excel puede entregar 3801.0
        v = int(v)
    return norm(v).upper()


def num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def r2(v):
    return None if v is None else round(float(v), 2)


def parse_iso(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def edad_meses(iso, hoy):
    d = parse_iso(iso)
    return None if d is None else round(max(0, (hoy - d).days) / 30.4375, 2)


# ───────────────────────── Excel ─────────────────────────
def leer_excel(path):
    import openpyxl

    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr_i, idx = None, {}
    for i, row in enumerate(rows[:10]):
        cells = [norm(c).lower() for c in row]
        if "hhhsss" in cells and any(c.startswith("acttch") for c in cells):
            hdr_i = i
            for campo, alias in COLS.items():
                # primera coincidencia: el Excel puede traer una tabla auxiliar a la derecha
                for j, c in enumerate(cells):
                    if c in alias:
                        idx[campo] = j
                        break
            for campo, alias in COLS_OPC.items():
                for j, c in enumerate(cells):
                    if c in alias:
                        idx[campo] = j
                        break
            break
    if hdr_i is None:
        raise SystemExit("No encontré la fila de encabezados (HHHSSS / actTCH_2627) en el Excel.")
    faltan = [c for c in COLS if c not in idx]
    if faltan:
        raise SystemExit("Faltan columnas en el Excel: " + ", ".join(faltan))
    version = next((norm(c) for row in rows[:hdr_i] for c in row if norm(c).lower().startswith("version")), "")
    out, dups, vacias = {}, [], 0
    for n, row in enumerate(rows[hdr_i + 1:], start=hdr_i + 2):
        g = lambda c: row[idx[c]] if c in idx and idx[c] < len(row) else None
        cod, ste = key(g("cod")), norm(g("ste"))
        if not cod or not ste:
            vacias += 1
            continue
        k = key(g("hhhsss")) or key(cod + ste)
        if k in out:
            dups.append(k)
            continue
        out[k] = {
            "hhhsss": k, "cod_hacienda": cod, "nombre_hacienda": norm(g("nombre")), "suerte": ste,
            "area_ha": num(g("area")) or 0.0, "destino": norm(g("destino")), "tn": norm(g("tn")).upper(),
            "actTCH": num(g("tch")) or 0.0, "tch_opt": num(g("tch_opt")) or 0.0,
            "clasificacion": norm(g("clas")), "_row": n,
        }
        o = out[k]
        o["toneladas"] = num(g("ton")) if num(g("ton")) is not None else o["actTCH"] * o["area_ha"]
        o["ton_opt"] = num(g("ton_opt")) if num(g("ton_opt")) is not None else o["tch_opt"] * o["area_ha"]
        if "fecha_cosecha" in idx:
            o["fecha_cosecha"] = a_iso(g("fecha_cosecha"))
        # Datos de la plantilla única: solo cuentan si la celda trae algo.
        for campo in ("zona", "variedad", "riego"):
            if norm(g(campo)):
                o["x_" + campo] = norm(g(campo))
        if norm(g("nc")):
            nc = g("nc")
            o["x_nc"] = "Planta" if norm(nc).lower().startswith("plant") else key(nc)
        if a_iso(g("fecha_ult_corte")):
            o["x_fecha_ult_corte"] = a_iso(g("fecha_ult_corte"))
        if num(g("tch_ant")) is not None:
            o["x_tch_ant"] = num(g("tch_ant"))
    return out, {"hoja": ws.title, "version": version, "duplicados": dups, "trae_fecha_cosecha": "fecha_cosecha" in idx}


# ───────────────────────── Shape ─────────────────────────
def leer_shape(path):
    import geopandas as gpd
    from shapely import make_valid, set_precision
    from shapely.geometry import MultiPolygon, Polygon

    gdf = gpd.read_file(path)
    crs = str(gdf.crs)
    invalidas = int((~gdf.is_valid).sum())

    def solo_poligonos(geom):
        if geom is None or geom.is_empty:
            return None
        if not geom.is_valid:
            geom = make_valid(geom)
        partes = [g for g in getattr(geom, "geoms", [geom]) if isinstance(g, (Polygon, MultiPolygon))]
        polys = [p for g in partes for p in getattr(g, "geoms", [g]) if not p.is_empty and p.area > 0]
        if not polys:
            return None
        return polys[0] if len(polys) == 1 else MultiPolygon(polys)

    gdf["geometry"] = gdf.geometry.apply(solo_poligonos)
    gdf = gdf[gdf.geometry.notna()].to_crs(4326)
    # 6 decimales ≈ 11 cm: suficiente para GPS de campo y mantiene el archivo ligero.
    gdf["geometry"] = gdf.geometry.apply(lambda g: solo_poligonos(set_precision(g, 1e-6)))
    gdf = gdf[gdf.geometry.notna()].reset_index(drop=True)
    return gdf, crs, invalidas


def txt(row, col):
    v = row.get(col) if col in row.index else None
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    return norm(v)


def finca_desde_nombre(nombre, suerte):
    """'El Amparo 04a' + suerte '04a' -> 'El Amparo' (respaldo cuando el shape no trae Finca)."""
    if nombre and suerte and nombre.lower().endswith(" " + suerte.lower()):
        return nombre[: -len(suerte)].strip()
    return nombre


def moda_ponderada(pares):
    acc = defaultdict(float)
    for etiqueta, peso in pares:
        if etiqueta:
            acc[etiqueta] += peso or 0.0
    return max(acc.items(), key=lambda kv: (kv[1], kv[0]))[0] if acc else ""


def es_molienda(l):
    return norm(l.get("clasificacion")).lower() == "molienda"


def es_semilla(l):
    return norm(l.get("clasificacion")).lower().startswith("semilla")


def resumen_grupo(nombre, lotes):
    """TCH ponderado = toneladas de molienda / hectáreas de molienda.
    Semilla y área fuera (sin caña, baja rentabilidad, investigación) se informan aparte y no entran al TCH."""
    mol = [l for l in lotes if es_molienda(l)]
    sem = [l for l in lotes if es_semilla(l)]
    area_total = sum(l["area_ha"] for l in lotes)
    area = sum(l["area_ha"] for l in mol)
    ton = sum(l["toneladas"] for l in mol)
    ton_opt = sum(l["ton_opt"] for l in mol)
    area_sem = sum(l["area_ha"] for l in sem)
    return {
        "key": nombre, "area_ha": r2(area), "toneladas": r2(ton),
        "tch_ponderado": r2(ton / area) if area else 0.0, "suertes": len(mol),
        "toneladas_opt": r2(ton_opt), "tch_opt_ponderado": r2(ton_opt / area) if area else 0.0,
        "area_total_ha": r2(area_total), "suertes_total": len(lotes),
        "area_semilla_ha": r2(area_sem), "area_fuera_ha": r2(area_total - area - area_sem),
        "zona_principal": moda_ponderada((l.get("zona"), l["area_ha"]) for l in lotes),
        "variedad_dominante": moda_ponderada((l.get("variedad"), l["area_ha"]) for l in lotes),
        "clasificacion_principal": moda_ponderada((l.get("clasificacion"), l["area_ha"]) for l in lotes),
        "tenencia_principal": moda_ponderada((l.get("tenencia"), l["area_ha"]) for l in lotes),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shape")
    ap.add_argument("excel")
    ap.add_argument("--salida", default="data")
    ap.add_argument("--zafra", default="2026-2027")
    ap.add_argument("--version", default="")
    args = ap.parse_args()
    out = Path(args.salida)
    hoy = date.today()
    ahora = datetime.now().isoformat(timespec="seconds")
    version = args.version or f"V{hoy:%d%m%y}_SHAPE_AFORO"

    def cargar(nombre):
        p = out / nombre
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    aforo_prev = cargar("aforo_2627.json").get("lotes", {})
    metr_prev = cargar("metricas_lote.json").get("lotes", {})
    meta_prev = cargar("metadata.json")

    excel, xinfo = leer_excel(args.excel)
    gdf, crs_orig, invalidas = leer_shape(args.shape)

    # ── GeoJSON ──
    feats, por_cod = [], defaultdict(lambda: {"area": 0.0, "n": 0, "variedad": "", "zona": "", "finca": "", "codfinca": "", "suerte": ""})
    for i, row in gdf.iterrows():
        cod = txt(row, "CodSuerte") or (txt(row, "Codfinca") + txt(row, "Suerte"))
        k = key(cod)
        prev = aforo_prev.get(k, {})
        finca = txt(row, "Finca")
        finca = finca or excel.get(k, {}).get("nombre_hacienda", "") or prev.get("nombre_hacienda", "") or finca_desde_nombre(txt(row, "Nombre"), txt(row, "Suerte"))
        # GeoJSON ligero: en el polígono solo va lo propio del polígono. Finca, zona y variedad viven en metricas_lote.json.
        props = {"CodSuerte": cod, "Tablon": txt(row, "Tablon"), "Area_Ha": round(num(row.get("Area_Ha")) or 0.0, 4)}
        props = {a: b for a, b in props.items() if b != ""}
        geom = row.geometry
        b = geom.bounds
        feats.append({"type": "Feature", "properties": props, "geometry": geom.__geo_interface__,
                      "bbox": [round(b[0], 6), round(b[1], 6), round(b[2], 6), round(b[3], 6)]})
        c = por_cod[k]
        c["area"] += props["Area_Ha"]
        c["n"] += 1
        for campo, col in (("variedad", "Variedad"), ("zona", "ZONA"), ("codfinca", "Codfinca"), ("suerte", "Suerte")):
            c[campo] = c[campo] or txt(row, col)
        c["finca"] = c["finca"] or finca
    bounds = [round(float(v), 7) for v in gdf.total_bounds]
    (out / "poligonos_casur.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ── Aforo ──
    lotes, cambios = {}, {"tch": 0, "area": 0, "variedad": [], "tch_opt_menor_act": [], "area_cero": []}
    for k, x in excel.items():
        prev = aforo_prev.get(k, {})
        sh = por_cod.get(k)
        rec = dict(prev)
        if prev:
            cambios["tch"] += abs((prev.get("actTCH") or 0) - x["actTCH"]) > 0.01
            cambios["area"] += abs((prev.get("area_ha") or 0) - x["area_ha"]) > 0.01
        tenencia, gr_tn = TENENCIA.get(x["tn"], (prev.get("tenencia", ""), prev.get("gr_tn", "")))
        if prev.get("tn") == x["tn"] and prev.get("gr_tn"):
            gr_tn = prev["gr_tn"]
        variedad = x.get("x_variedad") or (sh or {}).get("variedad") or prev.get("variedad", "")
        if prev.get("variedad") and variedad != prev["variedad"]:
            cambios["variedad"].append({"codlote": k, "antes": prev["variedad"], "ahora": variedad})
        rec.update({
            "hhhsss": k, "cod_hacienda": x["cod_hacienda"], "nombre_hacienda": x["nombre_hacienda"], "suerte": x["suerte"],
            "area_ha": r2(x["area_ha"]), "variedad": variedad, "destino": x["destino"], "tn": x["tn"],
            "hacienda": f"{x['nombre_hacienda']} (CODIGO: {x['cod_hacienda']}; TENENCIA: {x['tn']})",
            "zona": x.get("x_zona") or prev.get("zona") or (sh or {}).get("zona", ""),
            "actTCH": r2(x["actTCH"]), "toneladas": r2(x["toneladas"]), "tch_opt": r2(x["tch_opt"]), "ton_opt": r2(x["ton_opt"]),
            "clasificacion": x["clasificacion"], "tenencia": tenencia, "gr_tn": gr_tn, "_row": x["_row"],
        })
        if "fecha_cosecha" in x:  # fecha de cosecha programada para la zafra en curso
            rec["fecha_cosecha"] = x["fecha_cosecha"]
        if x.get("x_riego"):
            rec["tipo_riego"] = x["x_riego"]
        if x.get("x_nc"):
            rec.update({"nc": x["x_nc"], "nc_display": x["x_nc"], "nc_source": "plantilla"})
        if x.get("x_fecha_ult_corte"):
            rec["fecha_ult_corte"] = x["x_fecha_ult_corte"]
        if x.get("x_tch_ant") is not None:
            rec["tch_ant"] = r2(x["x_tch_ant"])
        rec["_variedad_excel"] = bool(x.get("x_variedad"))
        rec["_ult_corte_excel"] = bool(x.get("x_fecha_ult_corte"))
        rec["_tch_ant_excel"] = x.get("x_tch_ant") is not None
        if rec.get("fecha_ult_corte"):
            rec["edad"] = edad_meses(rec["fecha_ult_corte"], hoy)
        if x["actTCH"] > 0 and x["tch_opt"] < x["actTCH"]:
            cambios["tch_opt_menor_act"].append({"codlote": k, "actTCH": x["actTCH"], "tch_opt": x["tch_opt"]})
        if x["area_ha"] <= 0:
            cambios["area_cero"].append(k)
        lotes[k] = rec

    vals = list(lotes.values())
    grupos = {"hacienda": defaultdict(list), "finca": defaultdict(list), "zona": defaultdict(list)}
    for l in vals:
        grupos["hacienda"][l["nombre_hacienda"] or "Sin dato"].append(l)
        grupos["finca"][l["hacienda"]].append(l)
        grupos["zona"][l.get("zona") or "Sin zona"].append(l)
    g = resumen_grupo("global", vals)
    resumen = {"global": {k: g[k] for k in ("area_ha", "toneladas", "tch_ponderado", "suertes", "toneladas_opt", "tch_opt_ponderado",
                                           "area_total_ha", "suertes_total", "area_semilla_ha", "area_fuera_ha")}}
    for nombre, d in grupos.items():
        resumen[nombre] = sorted((resumen_grupo(k, v) for k, v in d.items()), key=lambda r: -r["toneladas"])

    shape_codes, aforo_codes = set(por_cod), set(lotes)
    sin_aforo, sin_shape = sorted(shape_codes - aforo_codes), sorted(aforo_codes - shape_codes)
    aforo = {
        "generated_at": ahora, "source": Path(args.excel).name, "sheet": xinfo["hoja"], "source_version": xinfo["version"],
        "zafra": args.zafra, "key_excel": "HHHSSS", "key_shape": "CodSuerte",
        "records_read": len(excel), "lotes_count": len(lotes), "shape_codes_count": len(shape_codes),
        "matched_codes_count": len(shape_codes & aforo_codes),
        "shape_without_aforo_count": len(sin_aforo), "aforo_without_shape_count": len(sin_shape),
        "aforo_without_shape_sample": sin_shape, "shape_without_aforo_sample": sin_aforo,
        "duplicates_count": len(xinfo["duplicados"]), "duplicates_sample": xinfo["duplicados"],
        "resumen": resumen, "lotes": lotes,
        "metadata": {
            "nc_rule": "NC se muestra solo desde la columna NC del cronológico original; no se inventan cortes.",
            "regla_conservacion": "El Excel de estimados solo actualiza área, destino, tenencia, actTCH, toneladas, TCH/Ton óptimo y clasificación. Fechas, TCH anterior, riego y NC se conservan de la carga anterior.",
            "regla_tch_ponderado": "tch_ponderado = toneladas de molienda / hectáreas de molienda (Clasificacion = Molienda). Semilla y área fuera se informan aparte.",
        },
    }
    (out / "aforo_2627.json").write_text(json.dumps(aforo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # Resumen liviano para el mapa: la app no necesita el detalle completo del aforo para abrir.
    (out / "aforo_resumen.json").write_text(json.dumps(
        {"generated_at": ahora, "zafra": args.zafra, "source": aforo["source"], "source_version": xinfo["version"],
         "regla": aforo["metadata"]["regla_tch_ponderado"], "resumen": resumen}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ── Métricas por CodLote ──
    metricas = {}
    for k in sorted(set(metr_prev) | shape_codes | aforo_codes):
        prev, a, sh = metr_prev.get(k, {}), lotes.get(k), por_cod.get(k)
        m = dict(prev)
        m["codlote"] = k
        if a:
            m.update({"hacienda_productor": a["nombre_hacienda"], "area_total_ha": a["area_ha"], "tenencia": a["tenencia"],
                      "destino": a["destino"], "suerte": a["suerte"], "zona": a.get("zona", ""),
                      "aforo_actTCH_2627": a["actTCH"], "aforo_toneladas_2627": a["toneladas"],
                      "aforo_tch_opt_2627": a["tch_opt"], "aforo_toneladas_opt_2627": a["ton_opt"],
                      "clasificacion": a["clasificacion"], "cod_finca": a["cod_hacienda"],
                      "nc": a.get("nc_display") if a.get("nc_display") not in (None, "", "—") else None,
                      "fecha_cosecha_prog": a.get("fecha_cosecha") or None})
            # Lo que la plantilla trae sobre riego, último corte y TCH anterior también alimenta la ficha del lote.
            if a.get("tipo_riego"):
                m["riego"] = a["tipo_riego"]
            if a.get("_ult_corte_excel"):
                m["fecha_ultimo_corte"] = m["fecha_base_edad"] = a["fecha_ult_corte"]
            if a.get("_tch_ant_excel"):
                m["tch_ultima_zafra"] = a["tch_ant"]
            if a.get("variedad"):
                m["variedad"] = a["variedad"]
        else:
            for campo in ("aforo_actTCH_2627", "aforo_toneladas_2627", "aforo_tch_opt_2627", "aforo_toneladas_opt_2627"):
                m.pop(campo, None)
        if sh:
            m["area_shape_total_ha"] = round(sh["area"], 4)
            m["poligonos_shape"] = sh["n"]
            if sh["variedad"] and not (a and a.get("_variedad_excel")):
                m["variedad"] = sh["variedad"]
            m.setdefault("hacienda_productor", sh["finca"])
            m["cod_finca"] = sh["codfinca"]
            m.setdefault("zona", sh["zona"])
            m.setdefault("suerte", sh["suerte"])
            m.setdefault("area_total_ha", round(sh["area"], 2))
        else:
            m["area_shape_total_ha"] = m.get("area_total_ha")
            m["poligonos_shape"] = 0
        if m.get("fecha_ultimo_corte"):
            m["edad_actual"] = edad_meses(m["fecha_ultimo_corte"], hoy)
        metricas[k] = {a_: b_ for a_, b_ in m.items() if b_ is not None and b_ != ""}
    (out / "metricas_lote.json").write_text(json.dumps({
        "generated": True, "source": f"{Path(args.excel).name} + {Path(args.shape).name}", "generated_at": ahora,
        "today_reference_for_preview": hoy.isoformat(),
        "age_rule": "dinamica_fecha_ultimo_corte_a_hoy; edad_actual es solo respaldo",
        "count": len(metricas), "lotes": metricas}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ── Metadata + reporte ──
    meta = {
        "nombre": f"CASUR Maps · {version}", "version": version,
        "fuente_shape": Path(args.shape).name, "fuente_aforo": f"{Path(args.excel).name} / {xinfo['hoja']}",
        "fuente_aforo_version": xinfo["version"],
        "fuente_operativo": meta_prev.get("fuente_operativo", ""),
        "crs_original": crs_orig, "crs_publicacion": "EPSG:4326 / WGS84",
        "poligonos": len(feats), "codlotes_shape": len(shape_codes),
        "shape_geometrias_invalidas_antes": invalidas, "shape_geometrias_invalidas_despues": 0,
        "campos_publicados": sorted({c for f in feats for c in f["properties"]}),
        "bounds_wgs84": bounds,
        "aforo_generated_at": ahora, "aforo_zafra": args.zafra, "aforo_records": len(excel), "aforo_lotes": len(lotes),
        "aforo_matched_codes_count": len(shape_codes & aforo_codes),
        "aforo_shape_without_aforo_count": len(sin_aforo), "aforo_without_shape_count": len(sin_shape),
        "nota_gps": "El GPS requiere HTTPS o localhost.",
        "nota_aforo": "actTCH y Toneladas corresponden al estimado de la zafra; no reemplazan TCH histórico.",
        "datos_al": hoy.isoformat(), "cortes_al": meta_prev.get("cortes_al", ""),
        "lotes_con_fecha_cosecha": sum(1 for l in vals if l.get("fecha_cosecha")),
        "generated_at": ahora,
    }
    (out / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    dif_area = []
    for k in sorted(shape_codes & aforo_codes):
        a_sh, a_af = por_cod[k]["area"], lotes[k]["area_ha"]
        if a_af > 0 and abs(a_sh - a_af) / a_af > 0.10:
            dif_area.append({"codlote": k, "area_shape_ha": round(a_sh, 2), "area_aforo_ha": a_af, "dif_pct": round((a_sh - a_af) / a_af * 100, 1)})
    reporte = {
        "generated_at": ahora, "version": version,
        "shape": {"archivo": Path(args.shape).name, "poligonos": len(feats), "codlotes": len(shape_codes),
                  "area_total_ha": round(sum(c["area"] for c in por_cod.values()), 2), "geometrias_invalidas_reparadas": invalidas,
                  "poligonos_previos": meta_prev.get("poligonos")},
        "aforo": {"archivo": Path(args.excel).name, "version": xinfo["version"], "suertes": len(lotes), **resumen["global"],
                  "actTCH_modificado_vs_carga_anterior": int(cambios["tch"]), "area_modificada_vs_carga_anterior": int(cambios["area"]),
                  "suertes_que_salen_del_aforo": sorted(set(aforo_prev) - aforo_codes),
                  "suertes_nuevas_en_aforo": sorted(aforo_codes - set(aforo_prev)),
                  "destino": dict(Counter(l["destino"] for l in vals)), "clasificacion": dict(Counter(l["clasificacion"] for l in vals))},
        "validaciones": {
            "shape_sin_aforo": sin_aforo, "aforo_sin_shape": sin_shape, "duplicados_excel": xinfo["duplicados"],
            "tch_opt_menor_que_actTCH": cambios["tch_opt_menor_act"], "aforo_area_cero": cambios["area_cero"],
            "molienda_sin_fecha_cosecha": sorted(l["hhhsss"] for l in vals if es_molienda(l) and not l.get("fecha_cosecha")) if xinfo["trae_fecha_cosecha"] else "El Excel no trae Fecha Cosecha",
            "fecha_cosecha_vencida": sorted(l["hhhsss"] for l in vals if l.get("fecha_cosecha") and l["fecha_cosecha"] < hoy.isoformat()),
            "variedad_actualizada_desde_shape": cambios["variedad"],
            "area_shape_vs_aforo_mayor_10pct": sorted(dif_area, key=lambda d: -abs(d["dif_pct"])),
        },
    }
    (out / "reporte_actualizacion.json").write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK · {len(feats)} polígonos · {len(shape_codes)} CodLotes en shape · {len(lotes)} suertes en aforo")
    print(f"Cruce shape-aforo: {len(shape_codes & aforo_codes)} · shape sin aforo: {len(sin_aforo)} · aforo sin shape: {len(sin_shape)}")
    print(f"Aforo molienda: {resumen['global']['area_ha']} ha · {resumen['global']['toneladas']} t · TCH pond. {resumen['global']['tch_ponderado']}")
    print("La app detecta sola los datos nuevos al cambiar generated_at en metadata.json.")


if __name__ == "__main__":
    sys.exit(main())
