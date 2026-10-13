/**
 * Téléchargeur des résultats officiels et des limites d'Elections Alberta,
 * pour usage local seulement : les fichiers vont dans raw/elections_alberta/
 * (non versionné) et ne sont pas republiés. Les conditions d'utilisation
 * d'Elections Alberta (https://www.elections.ab.ca/terms-conditions/)
 * autorisent la reproduction non modifiée avec mention de la source et
 * exigent une permission écrite pour toute autre utilisation ; le dépôt
 * contient ce téléchargeur, pas leurs données.
 *
 * Run: deno run --allow-read --allow-write --allow-net=www.elections.ab.ca sources/elections_alberta.ts
 */

import { RACINE, USER_AGENT } from "../lib/commun.ts";

const RAW = new URL("raw/elections_alberta/", RACINE);
export const FICHIERS = [
  // Résultats officiels des élections générales (2023 : relevé du scrutin).
  "https://www.elections.ab.ca/uploads/2023-Provincial-General-Election-Statement-of-Vote.xlsx",
  "https://www.elections.ab.ca/uploads/2019PGEOfficialResultsAllEDs.xlsx",
  "https://www.elections.ab.ca/uploads/Volume-2-2019-Provincial-General-Election-Report.pdf",
  "https://www.elections.ab.ca/uploads/2015PGE-Official-Results.xlsx",
  "https://www.elections.ab.ca/uploads/2012PGEOfficialResults.xlsx",
  // Limites : circonscriptions de 2019 (utilisées en 2023), sections de vote.
  "https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip",
  "https://www.elections.ab.ca/uploads/EA_Voting_Area_Boundaries_2026.zip",
];

if (import.meta.main) {
  Deno.mkdirSync(RAW, { recursive: true });
  for (const url of FICHIERS) {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) { console.log(`${url} : HTTP ${r.status}`); continue; }
    const nom = url.split("/").at(-1)!;
    Deno.writeFileSync(new URL(nom, RAW), new Uint8Array(await r.arrayBuffer()));
    console.log(`raw/elections_alberta/${nom}`);
  }
}
