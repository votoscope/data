/**
 * Outils communs : lecture et écriture des tables CSV, identifiants de
 * sondage, accès à l'API de Wikipédia.
 */

import { createHash } from "node:crypto";

export const RACINE = new URL("../", import.meta.url);
export const USER_AGENT = "votoscope-data/0.1 (https://github.com/votoscope/data; yysrk9lh@duck.com)";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type Ligne = Record<string, string>;

export function lireCsv(chemin: URL): Ligne[] {
  let texte: string;
  try { texte = Deno.readTextFileSync(chemin).replace(/^﻿/, ""); } catch { return []; }
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = "", guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guillemets = false; else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...corps] = lignes.filter((l) => l.length > 1 || l[0] !== "");
  return corps.map((l) => Object.fromEntries(entete.map((k, j) => [k, l[j] ?? ""])));
}

const champCsv = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ecrireCsv(chemin: URL, colonnes: string[], lignes: Record<string, unknown>[]): void {
  const texte = [colonnes.join(","), ...lignes.map((l) => colonnes.map((c) => champCsv(l[c])).join(","))].join("\n") + "\n";
  Deno.writeTextFileSync(chemin, texte);
}

// ---------------------------------------------------------------------------
// Sondages
// ---------------------------------------------------------------------------

export const COLONNES_SONDAGES = ["id", "juridiction", "region", "firme", "date_debut", "date_fin", "n", "n_decides", "provenance", "reference"];
export const COLONNES_PARTS = ["id", "parti", "pct"];

export interface Sondage {
  id: string; juridiction: string; region: string; firme: string;
  date_debut: string; date_fin: string; n: string; n_decides: string;
  provenance: string; reference: string;
}
export interface Part { id: string; parti: string; pct: string }

/** Identifiant stable : sha1("juridiction|region|firme|date|effectif")[:16]. */
export function idSondage(juridiction: string, region: string, firme: string, date: string, n: string | number | null): string {
  return createHash("sha1").update(`${juridiction}|${region}|${firme}|${date}|${n ?? ""}`, "utf-8").digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Wikipédia
// ---------------------------------------------------------------------------

export interface PageWiki { titre: string; revid: number; html: string }

async function api(langue: string, params: Record<string, string>): Promise<unknown> {
  const url = `https://${langue}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (r.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
  }
  throw new Error(`API Wikipédia (${langue}) inaccessible : ${params.titles ?? params.page}`);
}

/** Identifiant de la dernière révision d'une page. */
export async function revision(langue: string, titre: string): Promise<number> {
  const j = await api(langue, { action: "query", prop: "revisions", titles: titre, rvprop: "ids" }) as { query: { pages: { revisions?: { revid: number }[] }[] } };
  const r = j.query.pages[0]?.revisions?.[0]?.revid;
  if (!r) throw new Error(`page introuvable sur ${langue}.wikipedia : ${titre}`);
  return r;
}

/** HTML rendu et révision d'une page, en un seul appel (action=parse). */
export async function page(langue: string, titre: string): Promise<PageWiki> {
  const j = await api(langue, { action: "parse", page: titre, prop: "text|revid" }) as { parse: { revid: number; text: string } };
  return { titre, revid: j.parse.revid, html: j.parse.text };
}

/** Grille complète d'un tableau HTML : cellules fusionnées (rowspan, colspan) reportées. */
export function grille(table: Element): Element[][] {
  const out: Element[][] = [], report: { cell: Element; n: number }[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const ligne: Element[] = []; let c = 0;
    const propres = [...tr.children].filter((x) => /^T[DH]$/i.test(x.tagName));
    // Une cellule d'en-tête fusionnée ne se reporte que sur d'autres lignes
    // d'en-tête : sur une ligne de données, elle décalerait les colonnes.
    const entete = propres.length > 0 && propres.every((x) => /^TH$/i.test(x.tagName));
    const prendre = () => {
      while (report[c]?.n > 0) {
        if (/^TH$/i.test(report[c].cell.tagName) && !entete) { report[c].n = 0; break; }
        ligne[c] = report[c].cell; report[c].n--; c++;
      }
    };
    for (const cell of propres) {
      prendre();
      const rs = Number(cell.getAttribute("rowspan") || 1), cs = Number(cell.getAttribute("colspan") || 1);
      for (let k = 0; k < cs; k++) { ligne[c] = cell; if (rs > 1) report[c] = { cell, n: rs - 1 }; c++; }
    }
    prendre();
    out.push(ligne);
  }
  return out;
}

export const texte = (e: Element | undefined): string => (e?.textContent ?? "").replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim();

/** Nombre d'une cellule : appels de note, espaces fines, virgule décimale, tirets (non mesuré : null). */
export function nombre(t: string): number | null {
  const s = t.replace(/\[.*?\]/g, "").replace(/[\s   ]/g, "").replace(",", ".").replace("%", "").replace("±", "");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
