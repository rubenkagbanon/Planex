# Planex

Application de gestion d'emploi du temps (React + Supabase, sans backend séparé).

## Stack technique

- **Frontend** : React 18 + TypeScript + Vite
- **UI** : TailwindCSS v4, primitives façon shadcn/ui (Radix + class-variance-authority) écrites à la main dans `src/components/ui`
- **Routing** : React Router
- **Données serveur** : TanStack Query + client Supabase (`src/lib/supabase.ts`, typé via `src/lib/database.types.ts`)
- **État local** : Zustand (filtres UI), `useState` / contexte React pour le reste (ex. `AuthContext`)
- **Glisser-déposer** : `@dnd-kit`
- **Export** : `xlsx` (SheetJS, installé depuis le CDN officiel — le paquet npm public est vulnérable, voir Notes techniques) pour Excel, impression navigateur pour le PDF
- **Backend** : Supabase (Postgres + Auth + Row Level Security) — pas de serveur API séparé
- **Tests** : Vitest

## Structure

```
app/
  src/
    components/ui/   → primitives (Button, Input, Label, Card, ...)
    components/       → PlanexLogo, ProtectedRoute, RedirectIfAuthed
    context/          → AuthContext
    lib/               → supabase.ts, database.types.ts, utils.ts (cn)
    pages/             → Landing (/), Login, Signup, Accueil (/accueil, protégée)
```

## Configuration

### `.env`

```
VITE_SUPABASE_URL=https://jmqiittzzxjxsmnaobzz.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publishable>
```

Ce fichier est ignoré par git (voir `.gitignore`).

## Lancer le projet

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # build de prod (tsc -b && vite build)
npm run test     # Vitest
```

## Avancement

### ✅ Étape 1 — Connexions & authentification (fait)

- Projet Supabase `Planex` connecté (URL + clé publishable dans `.env`)
- Table `profiles` (email, prénom, nom, établissement) avec Row Level Security (chaque utilisateur ne voit/modifie que sa propre ligne)
- Table `etablissements` (nom unique), en lecture publique — alimentée automatiquement à l'inscription
- Trigger `on_auth_user_created` : à l'inscription, crée (ou rattache) l'établissement puis le profil (prénom, nom, établissement liés)
- Auth email + mot de passe (`AuthContext`, pages `Login` / `Signup` avec prénom, nom et établissement)
- **`/` (Landing)** : page publique façon Suno — logo animé, présentation de Planex, boutons "Se connecter" / "Créer un compte"
- **`/accueil`** : espace protégé (ex-Dashboard), accessible uniquement connecté ; redirection automatique vers `/accueil` si déjà connecté depuis `/`, `/login` ou `/signup`
- Logo Planex animé (pulsation des carrés + apparition lettre par lettre), reconstruit fidèlement depuis `ideas/Planex Logo.dc.html`
- Stack technique posée : Tailwind v4, primitives UI shadcn-style, React Router, TanStack Query, Zustand, dnd-kit, xlsx (CDN SheetJS), Vitest
- Build TypeScript + Vite vérifié ; flux d'inscription testé de bout en bout (trigger SQL validé, données de test nettoyées)

### 🚧 Étape 2 — Modèle de données de l'emploi du temps (en cours)

- **`/parametres`** (protégée) : onglet "Horaires des 1er et 2nd cycles" — grille de référence officielle
  (Circulaire N°0311/MENA/CAB/DPFC, 2025-2026), 12 disciplines × 12 niveaux (6e → Tle D), éditable et
  enregistrée par établissement (table `horaires_reference`, RLS scopée via `profiles.etablissement_id`)
- Ligne TOTAL calculée automatiquement (somme des cellules par colonne, formule validée contre les totaux
  officiels de la circulaire) — non stockée, dérivée en direct des valeurs saisies
- Onglet "Horaires & contraintes" : structure de la journée par cycle (Collège 6e-3e et/ou Lycée 2nde-Tle,
  horaires indépendants ou partagés) — jours de cours, liste de créneaux horaires (heure début/fin + type
  Cours/Récréation/Déjeuner, ajoutables/supprimables), et contraintes pédagogiques (bulles on/off façon
  `ideas/EDT Pro v2.dc.html`, enregistrées immédiatement au clic) : "Mercredi après-midi banalisé",
  "1 créneau = 1 heure de cours" (par défaut activé — le moteur de génération compte 1 créneau généré pour
  1 heure de la circulaire, sans tenir compte de sa durée réelle ; désactivé, il calcule avec la vraie
  durée des créneaux), et "Colorer les matières" (chaque matière a sa couleur sur `/planning`, pour repérer
  d'un coup d'œil les cases qui portent la même matière) — tables `horaires_contraintes` et
  `creneaux_horaires`, RLS scopée via `profiles.etablissement_id`
- Aperçu en direct de l'emploi du temps (jours × créneaux, durée de chaque créneau affichée en filigrane,
  mercredi après-midi banalisé pris en compte)
- Onglet "Classes" : niveaux proposés par l'établissement (6e → Tle D, avec 1re A et Tle A scindées en A1/A2
  côté établissement) et nombre de classes par niveau, bulles on/off + compteur (table `classes_etablissement`)
- Onglet "Professeurs" : une fiche par **matière** — un professeur qui en enseigne plusieurs a plusieurs
  fiches (ex. "Appia A." a une fiche E.D.H.C. et une fiche L.V.2, chacune avec ses classes et son volume
  horaire propres), niveaux pris en charge — au survol d'un niveau à plusieurs classes, bulle pour choisir
  précisément lesquelles (ex. "3e 1", "3e 2"). Table `professeurs` (`matiere` text, `niveaux` text[] au
  format `niveau` ou `niveau-section`, remarque optionnelle). Ce modèle une-ligne-par-matière élimine toute
  ambiguïté matière↔classe pour le moteur de génération (voir Étape 3). Jeu de données réel importé :
  55 professeurs, 64 fiches.
- Sur chaque fiche, bouton "Indisponibilités" : petite grille jours × créneaux (fusionnant les cycles de
  la personne, comme le planning) pour cocher les moments où ce professeur n'est jamais disponible —
  contrainte stricte pour le moteur de génération, jamais violée (table `professeur_indisponibilites`,
  indexée par nom donc partagée entre toutes les fiches d'une même personne et par tous les cycles où elle
  enseigne)
- Chaque onglet de Paramètres a sa propre URL (`/parametres`, `/parametres-contraintes`, `/parametres-classes`,
  `/parametres-professeurs`) — partageable et rafraîchissable directement sur le bon onglet
- **`/dashboard`** : reprend l'écran "Dashboard" du mockup — cartes de statut (classes, professeurs, créneaux,
  horaires de référence) sourcées en direct depuis Supabase, avec liens directs vers ce qui manque. Le bouton
  "Générer l'emploi du temps" déclenche désormais le vrai moteur de génération (voir ci-dessous) et affiche
  un résumé honnête (séances placées / total, avertissements) plutôt qu'un faux succès
- **`/planning`** : reprend l'écran "Emploi du temps" du mockup — bascule Classe/Professeur, sélection de
  l'entité précise (ex. "3e 1", ou un professeur), grille jours × créneaux construite depuis les vraies données
  et affichant désormais les séances réellement générées (matière + professeur ou matière + classe par case)
- **`AppHeader`** : nouvelle nav commune (Accueil / Dashboard / Planning / Paramètres) partagée par toutes les
  pages protégées, façon topbar du mockup — remplace les en-têtes ad-hoc dupliqués
- Écrans de gestion basés sur le mockup `ideas/EDT Pro v2.dc.html`

### ✅ Étape 3 — Moteur de génération de l'emploi du temps (fait)

- Table `emploi_du_temps` (une ligne par séance : établissement, cycle, jour, créneau, niveau/section,
  matière, professeur, salle optionnelle) avec RLS scopée comme les autres tables, et deux contraintes
  `unique` en base (par créneau+classe et par créneau+professeur) qui garantissent qu'aucun double-booking
  ne peut être persisté, même en cas de bug du solveur
- Moteur 100 % client (`src/lib/scheduling/`, aucune dépendance externe — les librairies JS de scheduling/CSP
  existantes sont peu maintenues ou trop lourdes pour ce volume) :
  - `charges.ts` dérive les besoins d'enseignement (qui doit enseigner quelle matière, à quelle classe,
    combien de séances/semaine) à partir des professeurs (une matière explicite par fiche, donc aucune
    ambiguïté à deviner), des classes et de la grille horaires de référence
  - `slots.ts` construit la grille des créneaux plaçables par cycle (jours de cours, créneaux "cours"
    uniquement, mercredi après-midi banalisé exclu)
  - `solver.ts` place les séances par heuristique gloutonne "most-constrained-first" avec relances
    aléatoires (100 tentatives, seed déterministe), sans jamais double-réserver une classe ni une
    **personne** (identifiée par son nom, pas par l'id de fiche, puisqu'un même professeur peut avoir
    plusieurs fiches — une par matière — qui ne doivent jamais se chevaucher entre elles non plus)
  - `generate.ts` orchestre le tout et renvoie séances + avertissements lisibles
- Conversion volume horaire → séances : `Math.ceil(minutes / 60)`, indépendante de la durée réelle des
  créneaux (50 min) — "N heures" dans la circulaire = N séances directement, pas N×60 min à répartir en
  créneaux de 50 min (ça donnait un résultat faux : 3h → 4 séances au lieu de 3)
- **Décomposition en blocs de séances consécutives** : une cellule de la grille horaire de référence peut
  s'écrire avec des "+" (ex. "1 + 2h" au lieu de "3") pour dire explicitement comment répartir les séances
  dans la semaine — chaque terme devient un bloc de séances consécutives à placer d'un seul tenant (le "h"
  ne change rien au calcul). "1 + 2" = une séance isolée un jour, plus un vrai double cours (2 créneaux
  consécutifs) un autre jour ; "1+1+1" = trois séances isolées, chacune idéalement un jour différent. Une
  valeur non décomposée valant exactement 2 (ex. "2") est aussi cherchée en priorité comme un bloc
  consécutif de 2 (double cours), sans qu'il soit besoin d'écrire "1+1". "Consécutif" veut dire créneaux de
  cours voisins, sans exiger l'absence de coupure réelle : une heure juste avant la récréation et une heure
  juste après (ou autour du déjeuner) comptent comme un bloc de 2. Un bloc issu d'une cellule décomposée
  avec "+" n'est jamais scindé par le solveur — soit il est placé en entier, soit il est signalé non placé.
  Un bloc `[2]` auto-inféré (non décomposé) suit la même règle en priorité, mais a un **dernier recours** :
  si aucun placement consécutif n'est trouvé nulle part, le solveur tente de caser les 2 séances isolément
  (éventuellement des jours différents) plutôt que de laisser la classe sans aucune séance de cette matière
  — validé contre un vrai emploi du temps de collège (dossier `/source`) qui montre que ce genre de matière
  y est parfois lui-même scindé en "1+1" par nécessité. Seules les unités réellement impossibles à caser
  comptent alors comme non placées. Une cellule non décomposée valant autre chose que 2 garde le
  comportement d'avant (répartition libre)
- **E.P.S. aux bords de journée** : le solveur essaie en priorité de placer les cours d'E.P.S. sur les 2
  premiers créneaux de la matinée ou les 2 derniers de l'après-midi, sans jamais sacrifier de séances
  placées pour l'obtenir (préférence best-effort, activée sur une partie des tentatives seulement)
- **Heures creuses en fin de segment** : à l'intérieur d'une journée, les séances d'une classe sont placées
  en priorité du début vers la fin (effet de construction), ce qui tend à laisser les heures creuses en fin
  de matinée/après-midi plutôt qu'au milieu — best-effort, pas une garantie stricte
- **Indisponibilités des professeurs** : contrainte stricte, jamais violée — un créneau où un professeur est
  déclaré indisponible (Paramètres > Professeurs > bouton "Indisponibilités" sur chaque fiche) est traité
  exactement comme une occupation déjà existante avant même de commencer à placer les séances (table
  `professeur_indisponibilites`, indexée par nom donc partagée entre toutes les fiches d'une même personne).
  Si ça rend une charge implaçable, c'est signalé en avertissement comme les autres échecs de placement,
  jamais contourné silencieusement
- Testé de bout en bout sur les données réelles de l'établissement (55 professeurs / 64 fiches, 10 niveaux,
  22 créneaux) : 955/957 séances placées, 0 conflit — le volume hebdomadaire obtenu par professeur
  correspond exactement aux données réelles du dossier `/source` pour 54 des 55 professeurs, alors qu'il
  est dérivé indépendamment de `horaires_reference` et non du champ déclaré `professeurs.volume_horaire`.
  Seule exception : Ake A. (Physique-Chimie, 8 classes collège+lycée) obtient 14/16 séances — un
  professeur avec beaucoup de matières "double cours" (E.P.S., Physique-Chimie, S.V.T. sont toutes des
  blocs de 2) sur autant de classes crée une tension structurelle réelle sur certains créneaux ; validé
  contre le dossier `/source` lui-même, qui montre que l'établissement réel a dû, pour des cas similaires,
  scinder certaines matières "2h" en "1+1" au cas par cas plutôt que garder un double cours partout —
  cohérent avec la règle de dernier recours ci-dessus
- Hors périmètre pour cette itération (volontairement) : allocation des salles (champ optionnel non
  contraint par le solveur)

### ⏳ Étape 4 — Écrans applicatifs restants (à venir)

## Notes techniques

- Pas de backend Node séparé : toute la logique métier passe par Postgres (RLS, fonctions, contraintes) et les requêtes directes du client via Supabase.
- Le paquet `xlsx` publié sur le registre npm contient des vulnérabilités connues sans correctif (prototype pollution, ReDoS). Il est donc installé depuis le CDN officiel SheetJS (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), qui distribue les versions à jour.
