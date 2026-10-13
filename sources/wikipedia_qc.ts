/**
 * Sondages québécois des pages « Liste de sondages sur les élections
 * générales québécoises » de Wikipédia en français : série de la population
 * entière (« National ») et tableaux de sous-groupes (langue, régions, âge),
 * repérés par le titre de section au-dessus du tableau.
 *
 * Groupes : National, FRANCO, NONFRANCO, ILE-MTL, RMR-MTL, RMR-QC,
 * CAPITALE-NATIONALE, RESTE-QC, AGE-18-34, AGE-35-54, AGE-55+. Effectif
 * vide quand le tableau ne le publie pas. Référence : lien vers le document
 * du sondeur dans la colonne « Source » (vide s'il pointe vers un agrégateur
 * privé).
 */

import { parseHTML } from "linkedom";
import { grille, idSondage, nombre, texte, type PageWiki, type Part, type Sondage } from "../lib/commun.ts";

export const PAGES_QC: Record<string, string> = {
  "2018": "Liste de sondages sur les élections générales québécoises de 2018",
  "2022": "Liste de sondages sur les élections générales québécoises de 2022",
  "2026": "Liste de sondages sur les élections générales québécoises de 2026",
};
const JURIDICTION = "qc-provincial";

// En-têtes de colonnes -> codes de parti. Le PVQ n'existe que dans les
// tableaux de 2018 et se range dans AUTRES.
const PARTIS: Record<string, string> = { CAQ: "CAQ", PLQ: "LIB", QS: "QS", PQ: "PQ", PCQ: "PCQ", CQ: "PCQ", PVQ: "AUTRES", Autres: "AUTRES" };
const FIRMES: Record<string, string> = {
  Leger: "Léger", "Léger.": "Léger", Mainstreet: "Mainstreet Research", Pallas: "Pallas Data", Liaison: "Liaison Strategies",
  Innovative: "Innovative Research", Synopsis: "Synopsis Recherche", "Synopsis / La Presse": "Synopsis Recherche",
  Segma: "Segma Recherche", "Research Co": "Research Co.", ResearchCo: "Research Co.", Forum: "Forum Research",
};
const MOIS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};
const AGREGATEURS = /qc125|338canada/i;

function date(t: string): string | null {
  const m = t.toLowerCase().replace(/ /g, " ").match(/(\d{1,2})(?:er)?\s+([a-zéûôà]+)\s+(\d{4})/);
  if (!m || !MOIS[m[2]]) return null;
  return `${m[3]}-${String(MOIS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const firme = (t: string): string => { const s = t.replace(/\s*\/\s*La Presse$/, "").trim(); return FIRMES[s] ?? s; };
const sansAccents = (t: string): string => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lien = (cell: Element | undefined): string => {
  for (const a of cell?.querySelectorAll("a") ?? []) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("http") && !/wiki(pedia|media)\.org/.test(href)) return AGREGATEURS.test(href) ? "" : href;
  }
  return "";
};

/** Groupe désigné par la chaîne de titres de section ; null : population entière ; "?" : sous-groupe non reconnu. */
function groupe(titres: string[]): string | null {
  const dernier = sansAccents(titres.at(-1) ?? ""), tout = sansAccents(titres.join(" / "));
  const regle: [RegExp, string][] = [
    [/non-francophone/, "NONFRANCO"], [/francophone/, "FRANCO"], [/ile de montreal/, "ILE-MTL"],
    [/(metropolitaine|rmr) de montreal/, "RMR-MTL"], [/(rmr|region) de quebec/, "RMR-QC"], [/capitale-nationale/, "CAPITALE-NATIONALE"],
    [/reste du quebec/, "RESTE-QC"], [/18.{0,3}34/, "AGE-18-34"], [/35.{0,3}54/, "AGE-35-54"], [/55/, "AGE-55+"],
  ];
  for (const [re, code] of regle) if (re.test(dernier)) return code;
  if (/par langue|par region|par age|par sexe|chez les|region geographique|ile de montreal|capitale-nationale|reste du quebec/.test(tout)) return "?";
  return null;
}

function* tableaux(html: string): Generator<[Element, string[]]> {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const chaine = new Map<number, string>();
  for (const n of document.querySelectorAll("h2,h3,h4,h5,table")) {
    const tag = n.tagName.toLowerCase();
    if (tag !== "table") {
      const niveau = Number(tag[1]);
      chaine.set(niveau, texte(n).replace("[modifier | modifier le code]", "").trim());
      for (const k of [...chaine.keys()]) if (k > niveau) chaine.delete(k);
    } else yield [n, [...chaine.keys()].sort((a, b) => a - b).map((k) => chaine.get(k)!)];
  }
}

export function lirePageQc(p: PageWiki): { sondages: Sondage[]; parts: Part[]; ignores: string[] } {
  const sondages: Sondage[] = [], parts: Part[] = [], ignores: string[] = [], vus = new Set<string>();
  const provenance = `wikipedia:fr:${p.titre}`;
  const ajouter = (region: string, f: string, d: string, n: number | null, ref: string, valeurs: Map<string, number>) => {
    const id = idSondage(JURIDICTION, region, f, d, n !== null ? String(n) : null);
    if (vus.has(id)) return;
    vus.add(id);
    sondages.push({ id, juridiction: JURIDICTION, region, firme: f, date_debut: "", date_fin: d, n: n !== null ? String(n) : "", n_decides: "", provenance, reference: ref });
    for (const [parti, pct] of valeurs) parts.push({ id, parti, pct: String(pct) });
  };

  for (const [table, titres] of tableaux(p.html)) {
    const g = grille(table);
    if (!g.length) continue;
    const entetes = g[0].map((c) => texte(c));
    if (!entetes.includes("CAQ")) continue;
    // Tableau de langue en format large : colonnes FR / NF sous chaque parti.
    if (entetes[0] === "Sondeur" && entetes[1] === "Date") {
      const ligneSous = g.find((l) => l.some((c) => texte(c) === "FR"));
      if (!ligneSous) continue;
      const cols = entetes.map((h, j) => [PARTIS[h], texte(ligneSous[j])] as const);
      for (const l of g) {
        if (l.some((c) => c?.tagName === "TH") || new Set(l).size < 6) continue;
        const d = date(texte(l[1])), f = firme(texte(l[0]));
        if (!d || !f) continue;
        for (const [sous, code] of [["FR", "FRANCO"], ["NF", "NONFRANCO"]] as const) {
          const v = new Map<string, number>();
          cols.forEach(([parti, s], j) => { if (parti && s === sous) { const x = nombre(texte(l[j])); if (x !== null) v.set(parti, (v.get(parti) ?? 0) + x); } });
          if (v.size >= 2) ajouter(code, f, d, null, "", v);
        }
      }
      continue;
    }

    const grp = groupe(titres);
    if (grp === "?") { ignores.push(`${titres.at(-1)} (${g.length - 1})`); continue; }
    if (!entetes.includes("Sondeur")) continue;
    const i = (nom: string) => entetes.findIndex((h) => h === nom || h.startsWith(nom));
    const iDate = entetes.findIndex((h) => /dernier jour/i.test(h)), iFirme = i("Sondeur"), iN = i("Échantillon"), iSource = i("Source");
    const partis = entetes.map((h, j) => [PARTIS[h], j] as const).filter(([c]) => c);
    for (const l of g.slice(1)) {
      // Lignes d'événement (une cellule fusionnée sur toute la largeur) : écartées.
      if (new Set(l).size < entetes.length - 2) continue;
      if (!l[iDate] || l[iDate].tagName === "TH") continue;
      const d = date(texte(l[iDate]));
      if (!d) continue;
      const v = new Map<string, number>();
      for (const [parti, j] of partis) { const x = nombre(texte(l[j])); if (x !== null) v.set(parti, (v.get(parti) ?? 0) + x); }
      if (v.size < 2) continue;
      const f = firme(texte(l[iFirme]));
      if (!f) continue;
      const brut = iN >= 0 ? nombre(texte(l[iN])) : null;
      const n = brut !== null && brut > 0 ? Math.trunc(brut) : null;
      ajouter(grp ?? "National", f, d, n, iSource >= 0 ? lien(l[iSource]) : "", v);
    }
  }
  return { sondages, parts, ignores };
}
