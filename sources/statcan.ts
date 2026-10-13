/**
 * Recensement de 2021 par circonscription fédérale (Statistique Canada,
 * Profil du recensement ; Licence ouverte de Statistique Canada) : cartes de
 * 2013 (98-401-X2021010) et de 2023 (98-401-X2021029), téléchargées dans
 * raw/statcan/ puis réduites à csv/recensement_circonscriptions_federales.csv.
 * Taux (C10_RATE_TOTAL) : baccalauréat ou plus chez les 25-64 ans (2024),
 * immigrants (1529), minorités visibles (1684), langue maternelle française
 * (397), identité autochtone (1403), 65 ans et plus (24), maisons
 * individuelles (42), logements dans un immeuble de cinq étages ou plus
 * (47) ; valeur (C1_COUNT_TOTAL) : revenu médian des ménages (243).
 *
 * Run: deno run --allow-read --allow-write --allow-net=www12.statcan.gc.ca sources/statcan.ts
 */

import { unzipSync } from "fflate";
import { ecrireCsv, RACINE, USER_AGENT } from "../lib/commun.ts";

const RAW = new URL("raw/statcan/", RACINE);
const PRODUITS: Record<string, string> = { "2013": "010", "2023": "029" };
const TAUX: Record<number, string> = { 2024: "bacc", 1529: "immigrants", 1684: "minorites", 397: "francais", 1403: "autochtones", 24: "age65", 42: "unifamiliale", 47: "tours" };
const VALEURS: Record<number, string> = { 243: "revenu" };
const VARIABLES = [...Object.values(TAUX), ...Object.values(VALEURS)];

const champs = (l: string): string[] => {
  const out: string[] = []; let f = "", q = false;
  for (const c of l) { if (q) { if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ",") { out.push(f); f = ""; } else f += c; }
  out.push(f); return out;
};

if (import.meta.main) {
  Deno.mkdirSync(RAW, { recursive: true });
  const lignes: Record<string, unknown>[] = [];
  for (const [carte, geo] of Object.entries(PRODUITS)) {
    const zip = new URL(`profil_${carte}.zip`, RAW);
    const url = `https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=${geo}`;
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
    Deno.writeFileSync(zip, new Uint8Array(await r.arrayBuffer()));
    const contenu = unzipSync(Deno.readFileSync(zip), { filter: (f) => /_CSV_data\.csv$/.test(f.name) });
    const texte = new TextDecoder("latin1").decode(Object.values(contenu)[0]);
    const par = new Map<string, Record<string, unknown>>();
    for (const l of texte.split(/\r?\n/).slice(1)) {
      if (!l.includes("Federal electoral district")) continue;
      const f = champs(l), id = Number(f[8]), code = f[2];
      if (!(id in TAUX) && !(id in VALEURS)) continue;
      if (!par.has(code)) par.set(code, { carte, circonscription: code });
      par.get(code)![id in TAUX ? TAUX[id] : VALEURS[id]] = id in TAUX ? Number(f[17]) : Number(f[11]);
    }
    lignes.push(...par.values());
    console.log(`carte ${carte} : ${par.size} circonscriptions`);
  }
  ecrireCsv(new URL("csv/recensement_circonscriptions_federales.csv", RACINE), ["carte", "circonscription", ...VARIABLES], lignes);
}
