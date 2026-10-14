/**
 * Limites des 343 circonscriptions fédérales (ordonnance de représentation
 * de 2023), Élections Canada, Licence du gouvernement ouvert – Canada.
 * Le fichier de formes est téléchargé dans raw/elections_canada/, puis
 * reprojeté en WGS84, simplifié (Visvalingam pondéré, topologie conservée)
 * et écrit en GeoJSON :
 *  - geo/circonscriptions_federales_2023.geojson : propriétés riding_code
 *    (numéro à cinq chiffres), riding_name (nom anglais), nom_fr.
 *
 * Run: deno run --allow-read --allow-write --allow-env --allow-sys --allow-net=www.elections.ca sources/limites_federales.ts
 */

import { unzipSync } from "fflate";
import mapshaper from "mapshaper";
import { RACINE, USER_AGENT } from "../lib/commun.ts";

const URL_SHP = "https://www.elections.ca/res/cir/mapsCorner/edb/FederalElectoralDistricts_SHP.zip";
const RAW = new URL("raw/elections_canada/", RACINE);
const SORTIE = new URL("geo/circonscriptions_federales_2023.geojson", RACINE);
// Part des sommets conservés : moins de 1 Mo pour le pays, lisible à
// l'échelle d'une région métropolitaine.
const SIMPLIFICATION = "3%";

if (import.meta.main) {
  const r = await fetch(URL_SHP, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`${URL_SHP} : HTTP ${r.status}`);
  const zip = new Uint8Array(await r.arrayBuffer());
  Deno.mkdirSync(RAW, { recursive: true });
  Deno.writeFileSync(new URL("FederalElectoralDistricts_SHP.zip", RAW), zip);

  // mapshaper lit .prj et .cpg comme du texte, les autres en binaire.
  const entree: Record<string, Uint8Array | string> = {};
  for (const [nom, contenu] of Object.entries(unzipSync(zip))) {
    const m = /ED_CF\.(shp|dbf|prj|cpg|shx)$/.exec(nom);
    if (m) entree[`ED_CF.${m[1]}`] = m[1] === "prj" || m[1] === "cpg" ? new TextDecoder().decode(contenu) : contenu;
  }
  if (!entree["ED_CF.shp"]) throw new Error("ED_CF.shp absent de l'archive");

  const sortie = await mapshaper.applyCommands(
    `-i ED_CF.shp -proj wgs84 -simplify ${SIMPLIFICATION} weighted keep-shapes ` +
      `-each "riding_code=String(ED_CF_NUM), riding_name=ED_NAMEE, nom_fr=CF_NOMF" ` +
      `-filter-fields riding_code,riding_name,nom_fr -o format=geojson precision=0.0001 out.geojson`,
    entree,
  );
  const geojson = JSON.parse(new TextDecoder().decode(sortie["out.geojson"]));
  if (geojson.features.length !== 343) throw new Error(`${geojson.features.length} circonscriptions, 343 attendues`);
  Deno.mkdirSync(new URL("geo/", RACINE), { recursive: true });
  Deno.writeTextFileSync(SORTIE, JSON.stringify(geojson));
  console.log(`${geojson.features.length} circonscriptions -> geo/circonscriptions_federales_2023.geojson`);
}
