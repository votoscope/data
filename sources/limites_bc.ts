/**
 * Limites des 93 circonscriptions provinciales de la Colombie-Britannique
 * (redistribution de 2023, élections de 2024 et de 2026), Elections BC via
 * DataBC (WFS EBC_ELECTORAL_DISTS_BS11_SVW, Elections BC Open Data Licence).
 * Téléchargées en WGS84, simplifiées (Visvalingam pondéré, topologie
 * conservée) et écrites en GeoJSON :
 *  - geo/circonscriptions_bc_2023.geojson : propriétés riding_code
 *    (abréviation d'Elections BC), riding_name, district_regional (district
 *    régional où réside la majorité relative des électeurs inscrits en 2024,
 *    calculé par sources/poids_bc.py).
 *
 * Run: deno run --allow-read --allow-write --allow-env --allow-sys --allow-net=openmaps.gov.bc.ca sources/limites_bc.ts
 */

import mapshaper from "mapshaper";
import { lireCsv, RACINE, USER_AGENT } from "../lib/commun.ts";

const WFS = "https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json" +
  "&srsName=EPSG:4326&typeName=pub:WHSE_ADMIN_BOUNDARIES.EBC_ELECTORAL_DISTS_BS11_SVW";
const SORTIE = new URL("geo/circonscriptions_bc_2023.geojson", RACINE);
const SIMPLIFICATION = "3%";

if (import.meta.main) {
  const r = await fetch(WFS, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`${WFS} : HTTP ${r.status}`);
  const sortie = await mapshaper.applyCommands(
    `-i in.geojson -simplify ${SIMPLIFICATION} weighted keep-shapes ` +
      `-each "riding_code=ED_ABBREVIATION, riding_name=ED_NAME" ` +
      `-filter-fields riding_code,riding_name -o format=geojson precision=0.0001 out.geojson`,
    { "in.geojson": await r.text() },
  );
  const geojson = JSON.parse(new TextDecoder().decode(sortie["out.geojson"]));
  if (geojson.features.length !== 93) throw new Error(`${geojson.features.length} circonscriptions, 93 attendues`);
  const districts = new Map(lireCsv(new URL("raw/elections_bc/districts_regionaux.csv", RACINE)).filter((l) => l.carte === "2023").map((l) => [l.ED, l.district_regional]));
  for (const f of geojson.features) {
    f.properties.district_regional = districts.get(f.properties.riding_code);
    if (!f.properties.district_regional) throw new Error(`district régional inconnu : ${f.properties.riding_code}`);
  }
  Deno.mkdirSync(new URL("geo/", RACINE), { recursive: true });
  Deno.writeTextFileSync(SORTIE, JSON.stringify(geojson));
  console.log(`${geojson.features.length} circonscriptions -> geo/circonscriptions_bc_2023.geojson`);
}
