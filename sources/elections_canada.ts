/**
 * Résultats officiels des élections générales fédérales (Élections Canada,
 * Licence du gouvernement ouvert – Canada) : tableau 12 (votes par
 * candidat) et transposition des votes de la 44e élection sur l'ordonnance
 * de représentation de 2023 (Open Canada). Téléchargés dans
 * raw/elections_canada/, puis :
 *  - csv/resultats.csv : lignes ca-federal de provenance Élections Canada
 *    remplacées (votes agrégés par circonscription et par parti) ;
 *  - csv/candidats_federaux.csv : un candidat par ligne, député sortant
 *    marqué « ** » par Élections Canada.
 * Partis : LPC, CPC, NDP, BQ, GPC, PPC, AUTRES.
 *
 * Run: deno run --allow-read --allow-write --allow-net=www.elections.ca,open.canada.ca,opencanada.blob.core.windows.net sources/elections_canada.ts
 */

import { ecrireCsv, lireCsv, RACINE, USER_AGENT } from "../lib/commun.ts";

const RAW = new URL("raw/elections_canada/", RACINE);
// [élection, date, carte, URL du tableau 12]
export const ELECTIONS: [string, string, string, string][] = [
  ["2015", "2015-10-19", "2013", "https://www.elections.ca/res/rep/off/ovr2015app/41/data_donnees/table_tableau12.csv"],
  ["2019", "2019-10-21", "2013", "https://www.elections.ca/res/rep/off/ovr2019app/51/data_donnees/table_tableau12.csv"],
  ["2021", "2021-09-20", "2013", "https://www.elections.ca/res/rep/off/ovr2021app/53/data_donnees/table_tableau12.csv"],
  ["2025", "2025-04-28", "2023", "https://www.elections.ca/res/rep/off/ovrGE45/62/data_donnees/table_tableau12.csv"],
];
const TRANSPOSITION = "https://open.canada.ca/data/dataset/08c4ffbc-c513-41a4-b741-d35b41b50c22/resource/463aa010-d9c1-470e-b6e3-d18a1c7a6a4a/download/transposition_343_fed_vote_count.csv";
const PARTIS: [RegExp, string][] = [
  [/Liberal\/Libéral$|^Liberal Party/, "LPC"], [/Conservative\/Conservateur$|^Conservative Party/, "CPC"],
  [/NDP-New Democratic Party|^New Democratic Party/, "NDP"], [/Bloc Québécois/, "BQ"],
  [/Green Party\/Parti Vert$|^Green Party/, "GPC"], [/People's Party/, "PPC"],
];
const parti = (s: string) => PARTIS.find(([re]) => re.test(s))?.[1] ?? "AUTRES";
const PROV_EC = "Élections Canada";

async function telecharger(url: string, fichier: string): Promise<URL> {
  const dest = new URL(fichier, RAW);
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  Deno.mkdirSync(RAW, { recursive: true });
  Deno.writeFileSync(dest, new Uint8Array(await r.arrayBuffer()));
  return dest;
}

if (import.meta.main) {
  const lignes = new Map<string, Record<string, unknown>>(), candidats: Record<string, unknown>[] = [];
  const ajouter = (election: string, carte: string, code: string, nom: string, p: string, votes: number, provenance: string) => {
    const k = `${election}|${carte}|${code}|${p}`;
    const l = lignes.get(k);
    if (l) l.votes = Number(l.votes) + votes;
    else lignes.set(k, { juridiction: "ca-federal", election, carte, circonscription: code, nom, parti: p, votes, provenance });
  };
  for (const [an, date, carte, url] of ELECTIONS) {
    const f = await telecharger(url, `table12_${an}.csv`);
    for (const r of lireCsv(f)) {
      const code = (r["Electoral District Number/Numéro de circonscription"] ?? "").trim();
      if (!/^\d{5}$/.test(code)) continue;
      const brut = (r["Candidate/Candidat"] ?? "").trim(), votes = Number(r["Votes Obtained/Votes obtenus"]) || 0, p = parti(brut);
      ajouter(date, carte, code, (r["Electoral District Name/Nom de circonscription"] ?? "").trim(), p, votes, `${PROV_EC}, résultats officiels (tableau 12)`);
      candidats.push({ election: date, carte, circonscription: code, nom: brut.split(/\s\*\*\s|\s(?=\S+\/)/)[0].trim(), parti: p, sortant: /\s\*\*\s/.test(brut) ? 1 : 0, votes });
    }
    console.log(`${an} : tableau 12 lu`);
  }
  const t = await telecharger(TRANSPOSITION, "transposition_2021_sur_2023_votes.csv");
  for (const r of lireCsv(t)) {
    const code = (r.FED_NUM ?? "").trim();
    if (!/^\d{5}$/.test(code)) continue;
    const cols = Object.keys(r), fin = cols.findIndex((c) => /^Transposed_Votes/i.test(c));
    for (const c of cols.slice(cols.indexOf("FED_EN") + 1, fin < 0 ? undefined : fin)) {
      if (/Rejected/i.test(c) || r[c] === "NA" || r[c] === "") continue;
      ajouter("2021-09-20", "2023", code, r.FED_EN, parti(c), Number(r[c]), `${PROV_EC}, transposition des votes de la 44e élection générale (ordonnance de 2023)`);
    }
  }
  const F = new URL("csv/resultats.csv", RACINE);
  const autres = lireCsv(F).filter((l) => !(l.juridiction === "ca-federal" && l.provenance.startsWith(PROV_EC)));
  const tout = [...autres, ...lignes.values()].sort((a, b) => String(a.juridiction).localeCompare(String(b.juridiction)) || String(a.election).localeCompare(String(b.election))
    || String(a.carte).localeCompare(String(b.carte)) || String(a.circonscription).localeCompare(String(b.circonscription)) || String(a.parti).localeCompare(String(b.parti)));
  ecrireCsv(F, ["juridiction", "election", "carte", "circonscription", "nom", "parti", "votes", "provenance"], tout);
  ecrireCsv(new URL("csv/candidats_federaux.csv", RACINE), ["election", "carte", "circonscription", "nom", "parti", "sortant", "votes"], candidats);
  console.log(`resultats.csv : ${lignes.size} lignes d'Élections Canada (${tout.length} au total) ; candidats : ${candidats.length}`);
}
