# data

Données électorales et de sondages du projet Votoscope / election and poll data for the Votoscope project.

## Contenu

| Dossier | Contenu |
|---|---|
| `csv/` | Tables publiées : sondages, parts par parti, résultats officiels par circonscription, recensement par circonscription. Chaque ligne indique sa source primaire. |
| `sources/` | Téléchargeurs et lecteurs, un par source publique (Wikipédia, Élections Canada, Élections Québec, Statistique Canada, rapports des maisons de sondage, agences provinciales). |
| `vigile/` | Vigile des sondages : détecte les sondages nouveaux ou modifiés dans les sources, les intègre et met à jour les tables. |
| `raw/` | Téléchargements bruts, locaux, non versionnés. |
| `prive/` | Données dont la republication n'est pas autorisée, locales, non versionnées. |

Les données des agences dont les conditions n'autorisent pas la republication (par exemple Elections Alberta) sont téléchargées par les outils de `sources/` dans `raw/` et ne sont pas versionnées : le dépôt contient le téléchargeur, pas leurs données.

Les chiffres de sondage proviennent des rapports publiés par les maisons de sondage. Chaque ligne cite le sondeur, la date de terrain et le document d'origine ; les rapports eux-mêmes ne sont pas reproduits.

## Licences

- **Code** (`sources/`, `vigile/`, outils) : GNU GPL v3 (`LICENSE`).
- **Données** (`csv/`) : Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International (CC BY-SA 4.0, `LICENCE-CC-BY-SA-4.0.txt`). Les tables dérivées de Wikipédia et de l'Atlas des élections au Québec sont elles-mêmes sous CC BY-SA 4.0.
- **Attributions** obligatoires des sources : `ATTRIBUTIONS.md`.

Citer : Votoscope, *data* (https://github.com/votoscope/data), avec les attributions des sources utilisées.
