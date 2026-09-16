# Moteur de génération de l'emploi du temps

Ce dossier contient le moteur qui génère automatiquement l'emploi du temps complet d'un établissement
(qui enseigne quoi, à quelle classe, à quel créneau) à partir des données déjà saisies dans Paramètres :
classes, professeurs, horaires de référence (volume hebdomadaire par matière/niveau) et créneaux horaires.

Il tourne entièrement côté client (aucun backend séparé — cohérent avec l'architecture Supabase-only de
Planex), déclenché depuis le bouton "Générer l'emploi du temps" sur `/dashboard`
([Dashboard.tsx](../../pages/Dashboard.tsx)) et affiché sur `/planning` ([Planning.tsx](../../pages/Planning.tsx)).

## Vue d'ensemble

```
Données Supabase                    Moteur (ce dossier)                    Résultat
─────────────────                   ────────────────────                   ────────
professeurs            ┐
classes_etablissement   ├─► charges.ts  ──► Charge[]  ┐
horaires_reference     ┘                              │
                                                        ├─► solver.ts ──► Seance[]
creneaux_horaires      ┐                              │
horaires_contraintes    ├─► slots.ts  ──► Slot[]  ─────┤
                                                        │
professeur_indisponibilites ─────────────────────────► │ (résolues en clés prof/jour/heure)
                                                                     │
                                                          generate.ts (orchestrateur)
                                                                     │
                                                                     ▼
                                                     Dashboard : delete-all + insert
                                                     dans la table `emploi_du_temps`
```

Quatre fichiers, chacun pur TypeScript, sans dépendance externe et testable indépendamment de Supabase :

| Fichier | Rôle |
|---|---|
| [`charges.ts`](./charges.ts) | Détermine **qui doit enseigner quoi, à quelle classe, combien de séances par semaine**. |
| [`slots.ts`](./slots.ts) | Construit la **grille des créneaux plaçables** (jour × créneau) pour chaque cycle. |
| [`solver.ts`](./solver.ts) | **Place** chaque séance sur un créneau libre, sans jamais créer de conflit. |
| [`generate.ts`](./generate.ts) | Orchestre les trois étapes et renvoie le résultat + les avertissements lisibles. |

## 1. `charges.ts` — de quoi a-t-on besoin ?

Chaque ligne `professeurs` porte **une matière explicite** (`professeurs.matiere`, colonne singulière) et
ses propres classes (`professeurs.niveaux`, ex. `"3e"` = toutes les classes de 3e, `"3e-2"` = uniquement
3e 2). Un professeur qui enseigne plusieurs matières a donc **plusieurs lignes** — une par matière, chacune
avec son propre volume horaire et sa propre liste de classes (ex. "Appia A." a une ligne E.D.H.C. et une
ligne L.V.2 (All./Esp.), chacune avec ses classes à elle). Ce modèle élimine toute ambiguïté matière↔classe
à la source : il n'y a plus besoin de deviner quelle matière s'applique à quel niveau.

Pour chaque ligne professeur, pour chaque niveau qu'elle couvre :

1. **Étend** le niveau en classes concrètes (`niveau` + `section`) via
   [`expandNiveauCodes`](../classeCode.ts) et `classes_etablissement.nombre_classes`.
2. **Détermine les blocs de séances à placer**, via `blocksForNiveauEtablissement`
   [`horairesReference.ts`](../horairesReference.ts). Une cellule de `horaires_reference` peut s'écrire de
   deux façons :
   - **Non décomposée** (ex. `"3"`, `"1h30"`) : le volume est converti en minutes puis en un nombre N de
     séances via `minutesToPeriods` (dans `charges.ts`), régi par le réglage **"1 créneau = 1 heure de
     cours"** (`horaires_contraintes.creneau_egale_heure`, par cycle, dans Paramètres > Horaires &
     contraintes > Contraintes pédagogiques, activé par défaut) : activé, `Math.ceil(minutes / 60)`
     (indépendant de la durée réelle des créneaux, ex. 50 min — la convention des emplois du temps réels du
     dossier `/source`) ; désactivé, `Math.round(minutes / periodMinutes)` avec la durée de créneau réelle
     du cycle. Si N vaut exactement **2**, c'est un seul bloc `[2]` (double cours consécutif recherché en
     priorité — voir la règle de dernier recours ci-dessous) ; sinon, N blocs de taille 1 (répartition
     libre, comme avant).
   - **Décomposée avec des "+"** (ex. `"1 + 2h"`, `"1+1+1"`) : chaque terme devient un **bloc de séances
     consécutives** à placer d'un seul tenant (`parseCellBlocks`) — `"1 + 2"` = une séance isolée un jour,
     plus un vrai double cours (2 créneaux consécutifs, sans trou) un autre jour. Le "h" est cosmétique
     ("2h" = "2") et une fraction ("2h30") est tronquée à l'entier — un bloc est toujours un nombre entier
     de séances. C'est une **règle stricte** côté solveur (voir plus bas) : un bloc issu d'une cellule
     décomposée avec "+" n'est jamais scindé, soit il est placé en entier sur des créneaux consécutifs,
     soit il ne l'est pas du tout — contrairement au bloc `[2]` auto-inféré (non décomposé) ci-dessus, qui
     lui peut être scindé en dernier recours (`Charge.autoConsecutiveSplittable`, voir plus bas).

   Si `horaires_reference` n'a aucun volume pour cette (matière, niveau) — la ligne source est incohérente
   avec la grille de référence — le niveau est ignoré pour cette ligne, avec un avertissement plutôt qu'un
   échec silencieux.

Sortie : une liste de `Charge { professeurId, professeurNom, niveau, section, matiere, cycle, blocks,
requiredPeriods }` (une entrée par classe précise, pas par niveau) + les avertissements éventuels.
`blocks` est la liste des tailles de bloc (ex. `[1, 2]`), `requiredPeriods` leur somme. `professeurNom` est
conservé sur chaque charge car c'est lui, pas `professeurId`, qui identifie la personne physique pour le
solveur (voir `solver.ts` ci-dessous).

## 2. `slots.ts` — sur quels créneaux peut-on placer un cours ?

Construit, pour chaque cycle (collège/lycée), la liste des couples (jour, créneau) valides :

- Uniquement les créneaux de type `cours` (les créneaux `recreation`/`dejeuner` ne sont jamais utilisés).
- Uniquement les jours listés dans `horaires_contraintes.jours_cours` pour ce cycle.
- **Mercredi après-midi banalisé** : si `horaires_contraintes.mercredi_apres_midi_banalise` est actif, tous
  les créneaux du mercredi dont l'heure de début est postérieure au créneau de type `dejeuner` sont
  exclus — même règle exacte que l'aperçu déjà affiché dans Paramètres > Horaires & contraintes
  ([`HorairesContraintes.tsx`](../../components/HorairesContraintes.tsx)), pour rester cohérent entre les
  deux écrans.

## 3. `solver.ts` — comment les séances sont-elles placées ?

### Contraintes dures (jamais violées)

- Un **professeur** ne peut pas être sur deux séances au même moment. La disponibilité d'un professeur est
  indexée par **son nom** (`professeurNom`) + `jour` + heure de début/fin réelles — pas par `professeurId` :
  comme une même personne peut avoir plusieurs lignes `professeurs` (une par matière), utiliser l'id de
  ligne laisserait le solveur doubler la même personne sur deux de ses lignes en même temps. Indexer par
  nom + heures réelles (pas par identifiant de créneau) couvre aussi le cas d'un professeur qui enseigne à
  la fois au collège et au lycée avec des grilles de créneaux distinctes en base mais qui se chevauchent
  dans le temps.
- Une **classe** (niveau + section) ne peut pas avoir deux séances au même créneau.
- Seuls les créneaux construits par `slots.ts` (type `cours`, jour actif, hors mercredi banalisé) sont
  utilisés.
- **Indisponibilités déclarées** (table `professeur_indisponibilites`, éditables depuis Paramètres >
  Professeurs > "Indisponibilités" sur chaque fiche) : un créneau où un professeur est marqué indisponible
  est traité exactement comme une occupation déjà existante, avant même de commencer à placer des séances
  (`generate.ts` résout chaque ligne `{nomComplet, cycle, jour, creneauId}` vers la même clé nom+jour+heure
  réelle que la disponibilité d'un professeur, et `solve()` pré-remplit l'ensemble des créneaux occupés
  avec ces clés). Comme pour les autres contraintes dures, si ça rend une charge implaçable, la séance
  manquante est signalée en avertissement plutôt que la règle silencieusement contournée. Indexée par nom
  (pas par fiche) : les indisponibilités d'une personne s'appliquent à toutes ses fiches (une par matière)
  et survivent à l'édition/l'enregistrement de l'écran Professeurs (qui remplace entièrement les fiches à
  chaque sauvegarde).

Ces deux premières règles sont *aussi* garanties au niveau base par deux contraintes `unique` sur la table
`emploi_du_temps` (`etablissement_id, jour, creneau_id, niveau, section` et
`etablissement_id, jour, creneau_id, professeur_id`) : même si le solveur avait un bug, l'insertion
échouerait plutôt que de persister un double-booking silencieux.

- **Un bloc n'est (presque) jamais scindé.** Pour un bloc de taille B issu d'une cellule décomposée
  (`"1+2"` → blocs `[1, 2]`) ou d'une valeur non décomposée valant exactement 2, le solveur cherche B
  créneaux de cours **consécutifs** dans le tableau des créneaux plaçables du jour (`findConsecutiveRun`
  dans `solver.ts`) et libres à la fois pour le professeur et la classe. Deux passes, dans l'ordre :
  1. **Dos à dos strict** (`strictOnly`) : la fin de l'un doit être exactement le début du suivant — essayé
     sur tous les jours disponibles en premier.
  2. **Avec coupure autorisée** (dernier recours, seulement si aucun jour n'a permis un enchaînement
     strict) : deux créneaux de cours voisins dans le tableau (récréation/déjeuner déjà exclus par
     `slots.ts`) comptent aussi comme "consécutifs" même séparés dans la réalité — une heure juste avant
     la récréation suivie d'une heure juste après, ou la dernière heure du matin suivie de la première de
     l'après-midi (autour du déjeuner).

  Si même la seconde passe échoue sur tous les jours, le comportement dépend de l'origine du bloc :
  - Bloc issu d'une cellule **décomposée avec "+"** : compté "non placé" (avertissement), point final —
    jamais réparti sur plusieurs jours ni coupé en séances isolées (règle stricte, jamais assouplie).
  - Bloc `[2]` **auto-inféré** (valeur non décomposée valant 2, `Charge.autoConsecutiveSplittable`) :
    **dernier recours supplémentaire**, le moteur tente de placer les 2 séances comme deux unités isolées
    (taille 1 chacune, mêmes deux passes ci-dessus, potentiellement sur des jours différents) plutôt que de
    laisser la classe sans aucune séance de cette matière. Seules les unités réellement impossibles à caser
    comptent alors comme "non placées". Ce compromis a été choisi après validation contre un vrai emploi du
    temps de collège (dossier `/source`), qui montre que certaines matières "2h" (E.P.S. notamment) y sont
    elles-mêmes ponctuellement scindées en "1+1" par nécessité pour une classe donnée — la contrainte
    "toujours consécutif" n'est donc pas absolue dans la réalité, seulement la préférence par défaut.

### Contraintes souples (best effort)

- **Étalement dans la semaine** : pour une même charge (une classe + une matière), le moteur essaie les
  jours du moins chargé au plus chargé pour caser chaque bloc, afin d'éviter de concentrer tous les cours
  sur 2-3 jours.
- **Équilibrage de la classe** : à charge égale, le moteur préfère le jour où la classe a le moins de
  séances déjà placées ce jour-là (toutes matières confondues).
- **Heures creuses en fin de segment** : à l'intérieur d'une journée, chaque créneau libre pour une classe
  est cherché en priorité du début vers la fin (matin puis après-midi) — les séances d'une classe ont donc
  tendance à se tasser en début de matinée/après-midi, laissant les heures creuses éventuelles en fin de
  segment plutôt qu'au milieu. C'est un effet de construction, pas une garantie stricte : un professeur
  déjà occupé ailleurs peut encore forcer un trou au milieu d'une journée pour une classe donnée.
- **E.P.S. aux bords de journée** : pour cette matière spécifiquement, le solveur essaie en priorité les 2
  premiers créneaux de la matinée ou les 2 derniers de l'après-midi (`preferBoundaries` dans
  `findConsecutiveRun`) avant les positions intermédiaires. Activé sur une partie des tentatives
  seulement (`epsPreferBoundariesThisAttempt`, ~60 %) — pour un professeur qui couvre beaucoup de classes,
  cette préférence peut entrer en compétition avec elle-même (toutes ses classes veulent les mêmes 4
  créneaux "au bord" par jour) ; `solve()` choisit ensuite, parmi toutes les tentatives, celle qui place
  le plus de séances (jamais moins pour gagner en confort E.P.S.), puis à égalité celle qui respecte le
  plus cette préférence.

### Algorithme

Heuristique gloutonne classique de type "most-constrained-first" avec relances aléatoires — une approche
standard en recherche opérationnelle pour ce type de volume (~50 professeurs, ~35 classes, ~35-40
créneaux/semaine), plus légère et plus simple à faire évoluer qu'un solveur CSP générique (SMT/WASM) qui
serait disproportionné ici :

1. Les charges sont triées par nombre de séances requises décroissant (les plus lourdes — donc les plus
   difficiles à caser — sont placées en premier), avec l'ordre mélangé aléatoirement (seed déterministe)
   à chaque tentative pour explorer des solutions différentes.
2. Au sein d'une charge, les blocs sont triés par taille décroissante (les plus gros — donc les plus
   difficiles à caser d'un seul tenant — en premier).
3. Pour chaque bloc, les jours sont essayés du moins chargé au plus chargé (pour cette charge, puis pour
   la classe) ; le premier jour offrant une séquence de créneaux consécutifs libres est retenu.
4. Si aucun jour ne convient, le bloc entier est compté "non placé" pour cette tentative — le moteur
   continue avec les blocs/charges suivants plutôt que d'abandonner.
5. **400 tentatives** (seeds différents) sont lancées ; celle avec le moins de séances non placées est
   retenue, et parmi les tentatives à égalité (typiquement toutes à zéro manquant), celle qui respecte le
   mieux la préférence E.P.S. "aux bords". Le calcul reste rapide (quelques dizaines de ms) à cette échelle
   (~50 professeurs, ~35 classes) — augmenter le nombre de tentatives est nécessaire pour trouver une
   combinaison qui place tout **et** respecte au mieux les préférences strictes-avant-relâchées et E.P.S.
   simultanément.

## 4. `generate.ts` — orchestrateur

`generateEmploiDuTemps(input)` enchaîne les trois étapes et renvoie :

```ts
{
  seances: Seance[]       // le planning généré
  warnings: string[]      // ambiguïtés de matière + créneaux manquants + séances non placées
  totalCharges: number    // nombre total de séances requises
  totalPlacees: number    // nombre de séances effectivement placées
}
```

C'est ce résultat que `Dashboard.tsx` persiste (delete-all-then-reinsert, scopé à l'établissement) et que
le résumé affiché à l'utilisateur reflète directement — jamais de faux succès : si des séances n'ont pas pu
être placées, elles apparaissent explicitement dans les avertissements avec le détail
(professeur, classe, matière, N/M séances placées).

## Limites connues (hors périmètre de cette itération)

- **Salles** : la colonne `emploi_du_temps.salle` existe mais n'est pas encore renseignée ni contrainte
  par le solveur (pas de vérification qu'une salle n'est pas utilisée par deux classes en même temps) —
  explicitement mis de côté car optionnel.
- **`professeurs.volume_horaire`** (le volume déclaré par l'établissement, par ligne/matière) n'est pas
  utilisé comme contrainte par le moteur — les besoins sont recalculés uniquement à partir de
  `horaires_reference`. Sur
  les données réelles testées, les deux coïncident (ex. Ake A. : 16 séances générées = 16h déclarées),
  mais ce n'est pas une garantie mathématique.
- La décomposition en blocs (`"1+2"`) ne s'applique qu'au niveau de la cellule `horaires_reference`
  (matière × niveau) — elle est donc partagée par tous les professeurs qui enseignent cette matière à ce
  niveau, pas personnalisable par professeur ou par classe individuellement.

## Régénérer / tester

- Depuis l'UI : `/dashboard` → "Générer l'emploi du temps" (nécessite classes, professeurs, créneaux et
  horaires de référence déjà configurés).
- Chaque génération **remplace entièrement** l'emploi du temps existant de l'établissement (delete-all puis
  reinsert) — relancer la génération après avoir modifié des données sources est le comportement attendu.
- Les fonctions de ce dossier n'ont pas de dépendance à React ni à Supabase : elles peuvent être appelées
  directement dans un test unitaire ou un script Node avec des données construites à la main.
