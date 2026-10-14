"""
Poids de transposition des sections de vote de 2017 (carte de 2015, 87
circonscriptions, utilisées en 2017 et en 2020) vers les circonscriptions de
la carte de 2023 (93 circonscriptions, élections de 2024 et de 2026).

Interpolation pondérée par les électeurs : chaque section de 2024 porte ses
électeurs inscrits à l'élection de 2024, répartis uniformément sur sa
surface. Le poids d'une section de 2017 vers une circonscription de 2023 est
la somme, sur les sections de 2024 de cette circonscription, des électeurs
de la partie de la section de 2024 qui recoupe la section de 2017, divisée
par le total sur toutes les circonscriptions. Une section de 2017 sans
électeurs dans le recoupement est répartie selon la surface. Les sections
sans polygone (établissements, sections non territoriales) prennent les
circonscriptions des sections de 2024 que leur associe la table de
conversion d'Elections BC, pondérées par leurs électeurs.

Sources (Elections BC Open Data Licence, DataBC), téléchargées par
sources/elections_bc.ts dans raw/elections_bc/ : polygones des sections de
2017 (edvas02232017.zip) et de 2024 (WFS EBC_VOTING_AREAS_BS11_POLY_SVW),
électeurs inscrits par section, table de conversion 2017 vers 2024.

Sorties :
 - raw/elections_bc/poids_va2017_ced2023.csv (EDVA_CODE, ED_2023, poids) ;
 - raw/elections_bc/districts_regionaux.csv (carte, ED, district_regional) :
   district régional (DataBC, ABMS_REGIONAL_DISTRICTS_SP) où réside la
   majorité relative des électeurs inscrits de la circonscription (carte de
   2023 : électeurs de 2024 ; carte de 2015 : électeurs de 2020, sur les
   sections de 2017).

Run: python sources/poids_bc.py
"""

from pathlib import Path

import warnings

import geopandas as gpd
import openpyxl
import pandas as pd

RAW = Path(__file__).resolve().parent.parent / "raw" / "elections_bc"


def inscrits(evenement: str) -> pd.Series:
    r = pd.read_csv(RAW / "registered.csv", encoding="cp1252", encoding_errors="replace")
    r.columns = [c.lstrip("﻿").lstrip("ï»¿") for c in r.columns]
    r = r[r.EVENT_NAME == evenement]
    return r.groupby("EDVA_CODE").REGISTERED_VOTERS.sum()


va17 = gpd.read_file(next((RAW / "va2017").glob("*.shp"))).to_crs(3005)[["EDVA_CODE", "geometry"]]
va24 = gpd.read_file(RAW / "va2024.geojson").to_crs(3005)[["EDVA_CODE", "ED_ABBREVIATION", "geometry"]]
va17["geometry"] = va17.geometry.make_valid()
va24["geometry"] = va24.geometry.make_valid()
va24["aire24"] = va24.geometry.area
va24["electeurs"] = va24.EDVA_CODE.map(inscrits("2024 General Election")).fillna(0)

morceaux = gpd.overlay(va17, va24, how="intersection", keep_geom_type=True)
morceaux["aire"] = morceaux.geometry.area
morceaux["electeurs"] = morceaux.electeurs * morceaux.aire / morceaux.aire24
par_ced = morceaux.groupby(["EDVA_CODE_1", "ED_ABBREVIATION"])[["electeurs", "aire"]].sum().reset_index()
par_ced.columns = ["EDVA_CODE", "ED_2023", "electeurs", "aire"]


def normaliser(g: pd.DataFrame) -> pd.DataFrame:
    col = "electeurs" if g.electeurs.sum() > 0 else "aire"
    return g.assign(poids=g[col] / g[col].sum())[["EDVA_CODE", "ED_2023", "poids"]]


poids = pd.concat(normaliser(g) for _, g in par_ced.groupby("EDVA_CODE"))

# Sections sans polygone : table de conversion d'Elections BC.
classeur = openpyxl.load_workbook(RAW / "edva_2017_2024.xlsx", read_only=True)
conversion = {}
for ligne in list(classeur["Province"].iter_rows(values_only=True))[1:]:
    if ligne[0]:
        conversion[ligne[0]] = [c for c in ligne[1:] if c]
ced24 = va24.set_index("EDVA_CODE").ED_ABBREVIATION.to_dict()
electeurs24 = va24.set_index("EDVA_CODE").electeurs.to_dict()
inscrits24 = inscrits("2024 General Election")
supplement = []
for code, cibles in conversion.items():
    if code in set(poids.EDVA_CODE) or not cibles:
        continue
    lignes = pd.DataFrame({
        "EDVA_CODE": code,
        "ED_2023": [ced24.get(c, c[:3]) for c in cibles],
        "electeurs": [electeurs24.get(c, inscrits24.get(c, 0)) for c in cibles],
        "aire": 1.0,
    }).groupby(["EDVA_CODE", "ED_2023"], as_index=False).sum()
    supplement.append(normaliser(lignes))
poids = pd.concat([poids, *supplement]).sort_values(["EDVA_CODE", "ED_2023"])
poids = poids[poids.poids > 1e-6]
poids.to_csv(RAW / "poids_va2017_ced2023.csv", index=False, float_format="%.6f")
print(f"{poids.EDVA_CODE.nunique()} sections de 2017, {poids.ED_2023.nunique()} circonscriptions de 2023, "
      f"{len(supplement)} sections sans polygone ; sections partagées : {(poids.groupby('EDVA_CODE').size() > 1).sum()}")

# District régional de chaque circonscription : majorité relative des électeurs inscrits.
districts = gpd.read_file(RAW / "rd.geojson").to_crs(3005)[["ADMIN_AREA_NAME", "geometry"]]
districts["geometry"] = districts.geometry.make_valid()


def district_regional(sections: gpd.GeoDataFrame, carte: str) -> pd.DataFrame:
    s = sections.assign(aire0=sections.geometry.area)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        x = gpd.overlay(s, districts, how="intersection", keep_geom_type=True)
    x["electeurs"] = x.electeurs * x.geometry.area / x.aire0
    x = x.groupby(["ED", "ADMIN_AREA_NAME"]).electeurs.sum().reset_index()
    x = x.sort_values("electeurs").groupby("ED").tail(1).sort_values("ED")
    return x.assign(carte=carte).rename(columns={"ADMIN_AREA_NAME": "district_regional"})[["carte", "ED", "district_regional"]]


s23 = va24.rename(columns={"ED_ABBREVIATION": "ED"})[["ED", "electeurs", "geometry"]]
s15 = va17.assign(ED=va17.EDVA_CODE.str[:3], electeurs=va17.EDVA_CODE.map(inscrits("2020 General Election")).fillna(0))[["ED", "electeurs", "geometry"]]
rd = pd.concat([district_regional(s15, "2015"), district_regional(s23, "2023")])
rd.to_csv(RAW / "districts_regionaux.csv", index=False)
print(f"{len(rd)} circonscriptions rattachées à un district régional (cartes de 2015 et de 2023)")
