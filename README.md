# Planex — emplois du temps scolaires sans conflit

Planex automatise le travail que le **censeur** (ou le directeur des études) fait aujourd'hui à la main :
construire les emplois du temps de toutes les classes et de tous les professeurs, en respectant les
volumes horaires officiels, les contraintes pédagogiques et la disponibilité des salles, puis les
imprimer au format officiel.

Le dossier [`source/`](source/) contient les vrais emplois du temps du Collège Le Conquérant
(Bingerville, 2023-2024) : ils servent de référence pour le format des documents et de jeu de données
pour valider le moteur.

---

## Sommaire

1. [Le parcours du censeur](#1-le-parcours-du-censeur)
2. [Comptes et sécurité](#2-comptes-et-sécurité)
3. [Paramétrage](#3-paramétrage)
4. [Salles, tronc commun et tandem](#4-salles-tronc-commun-et-tandem)
5. [Règles pédagogiques](#5-règles-pédagogiques)
6. [Génération, rapport et versions](#6-génération-rapport-et-versions)
7. [Retouches manuelles](#7-retouches-manuelles)
8. [Contrôle : la vue d'ensemble](#8-contrôle--la-vue-densemble)
9. [Impression et export](#9-impression-et-export)
10. [Architecture technique](#10-architecture-technique)
11. [Installation et commandes](#11-installation-et-commandes)
12. [Limites connues](#12-limites-connues)
13. [Pas encore fait](#13-pas-encore-fait)

---

## 1. Le parcours du censeur

La page **Accueil** affiche les étapes dans l'ordre et met en avant la prochaine à faire :

| # | Étape | Écran |
|---|---|---|
| 1 | En-tête de l'établissement (ministère, DRENA, code, signataire) | Paramètres › Établissement |
| 2 | Volumes horaires officiels, créneaux de la journée, règles pédagogiques | Paramètres › Horaires… |
| 3 | Classes : niveaux, nombre de classes, professeur principal, salle attitrée | Paramètres › Classes |
| 4 | Professeurs : une fiche par matière (saisie ou **import Excel**) | Paramètres › Professeurs |
| 5 | *(facultatif)* Salles, troncs communs, tandems | Paramètres › Salles / Regroupements |
| 6 | Générer l'emploi du temps | Dashboard |
| 7 | *(facultatif)* Retoucher à la main par glisser-déposer | Planning |
| 8 | Contrôler (classes, salles, règles, services) | Vue d'ensemble |
| 9 | Imprimer / exporter | Impression |
| 10 | *(fin d'année)* Clôturer l'année et préparer la suivante | Bibliothèque |

À tout moment, l'établissement peut **importer ses emplois du temps actuels** (PDF) pour que Planex en
apprenne les habitudes et les horaires (Paramètres › Apprendre d'un modèle, voir §5).

---

## 2. Comptes et sécurité

### Rejoindre un établissement

À l'inscription, deux choix :

- **Nouvel établissement** : l'établissement est créé et l'utilisateur en devient l'**administrateur**.
  Si un établissement du même nom existe déjà, l'inscription est refusée avec un message clair.
- **Rejoindre avec un code** : l'utilisateur saisit le **code d'invitation** de son établissement
  (10 caractères, ex. `K7QHM-2XRPA`) et devient **membre**.

Il est impossible de rejoindre un établissement sans son code. Auparavant, il suffisait de taper le même
nom d'établissement à l'inscription pour accéder à toutes ses données.

### Connexion

- Page d'accueil publique (`/`) présentant Planex, avec des animations ; connexion (`/login`) et
  inscription (`/signup`).
- Messages d'erreur en français (« Email ou mot de passe incorrect », email non confirmé, trop de
  tentatives…) et bouton pour afficher le mot de passe.
- **Mot de passe oublié** : un lien envoyé par email ouvre `/reinitialiser-mot-de-passe` pour choisir un
  nouveau mot de passe. La page ne révèle pas quelles adresses ont un compte.
- À configurer dans Supabase (Authentication) avant la mise en ligne : l'adresse du site dans
  *Redirect URLs* (`…/reinitialiser-mot-de-passe`) et un serveur SMTP (le service d'email par défaut est
  limité à quelques messages par heure).

### Rôles

| | Administrateur | Membre |
|---|---|---|
| Paramétrer, générer, retoucher, imprimer | ✅ | ✅ |
| Modifier l'en-tête de l'établissement | ✅ | ❌ |
| Voir le code d'invitation | ✅ | ✅ |
| Générer un nouveau code d'invitation | ✅ | ❌ |
| Nommer / retirer un administrateur, retirer un membre | ✅ | ❌ |
| Clôturer l'année, ranger ou supprimer une année de la Bibliothèque | ✅ | ❌ |
| Consulter la Bibliothèque | ✅ | ✅ |

Tout se gère dans **Paramètres › Établissement**. Un établissement garde toujours au moins un
administrateur.

### Garanties côté base de données (Supabase / PostgreSQL)

- **Row Level Security** sur toutes les tables : un utilisateur ne lit et n'écrit que les données de son
  établissement (`mon_etablissement_id()`).
- Un utilisateur **ne peut pas changer lui-même d'établissement ni de rôle** : seules les colonnes
  `first_name`, `last_name`, `full_name` de `profiles` lui sont modifiables (droits par colonne).
- La liste des établissements n'est plus publique : chacun ne voit que le sien.
- Le code d'invitation est généré avec un aléa cryptographique (`gen_random_bytes`) et ne se modifie que
  via `regenerer_code_invitation()` (administrateur uniquement).
- Les opérations sensibles passent par des fonctions SQL qui vérifient le rôle : `retirer_membre`,
  `definir_role_membre`, `regenerer_code_invitation`.

---

## 3. Paramétrage

### Plan
Premier onglet de Paramètres : une vue d'ensemble de **l'organisation de l'emploi du temps de
l'établissement**, présentée comme un schéma de base de données. Chaque rubrique est une table (en-tête,
lignes « champ / valeur ») et les traits relient les rubriques liées.

| Table | Contenu |
|---|---|
| Établissement | nom, année scolaire, code, statut, DRENA, cycles, nombre de comptes |
| Jours & horaires | jours de cours, créneaux du matin et de l'après-midi, récréations, déjeuner (par cycle, ou fusionnés si identiques) |
| Règles pédagogiques | chaque règle avec sa nature (prioritaire / à éviter / contrôle), barrée si désactivée |
| Niveaux & classes | nombre et identification des classes par niveau, salles attitrées, professeurs principaux |
| Emploi du temps | séances, heures-classe par semaine, séances verrouillées, dernière génération |
| Regroupements | troncs communs et tandems déclarés |
| Salles | nombre, identification (« S1 à S12 ») et usage par type de local |
| Enseignants | discipline(s), heures par semaine, nombre de niveaux différents (en rouge au-delà de 3) |
| Volume horaire par discipline et par niveau | heures par niveau, **total pondéré** (× nombre de classes), nombre d'enseignants, salle exigée |

Survoler une table isole ses liens et affiche leur nom. Le plan se recalcule à chaque modification des
paramètres.

### Horaires des 1er et 2nd cycles
Grille officielle (circulaire N°0311/MENA/CAB/DPFC du 01/09/2025), modifiable. Une cellule peut être
**décomposée** avec des `+` pour imposer la répartition : `1+2` = une séance isolée et un double cours.

### Horaires & contraintes
Jours de cours et créneaux (cours / récréation / déjeuner) à gauche ; à droite, mercredi après-midi
banalisé (« Vie scolaire ») et les **règles pédagogiques** (voir §5). Un écart de moins de 10 minutes
entre deux créneaux (11h20 → 11h25) est un intercours : les deux cours se suivent.

### Classes
Niveaux et nombre de classes à gauche ; à droite, pour chaque classe, le **professeur principal** (imprimé
en tête de l'emploi du temps) et la **salle attitrée** (facultative).

### Professeurs
Une fiche par professeur **et par matière**. Un professeur qui enseigne deux matières a deux fiches.

**Import Excel** : « Modèle Excel » télécharge un fichier prêt à remplir (onglet *Aide* inclus), puis
« Importer depuis Excel » le lit.
- Matières reconnues même écrites librement : `MATHS`, `PH-CH`, `SVT`, `HG`, `EDHC`, `EPS`, `ALLEMAND` /
  `ESPAGNOL` (→ LV2), `PHILO`…
- Classes au format des emplois du temps : `3e`, `3EME 2`, `2nde A 1`, `1ère A2 1`, `Tle D 3`…
- Plusieurs matières dans une case (`Français, EDHC`) donnent une fiche par matière.
- Chaque ligne en erreur est signalée. Rien n'est enregistré avant le clic sur « Enregistrer ».
  On choisit de **remplacer** la liste ou d'**ajouter** à la liste.

Deux affichages : **fiches** (deux par ligne sur grand écran) ou **tableau**. Le tableau se filtre
(recherche, matière, niveau) et se trie au clic sur Professeur, Matière, Nb classes ou Heures/semaine (du
plus petit au plus grand, puis l'inverse), avec le total d'heures des fiches affichées.

> L'enregistrement des professeurs **met à jour les fiches en place**. Avant, il supprimait puis recréait
> toutes les fiches, ce qui effaçait tout l'emploi du temps par cascade, séances verrouillées comprises.

---

## 4. Salles, tronc commun et tandem

> **Les salles sont facultatives.** Sans aucune salle saisie, l'emploi du temps se génère exactement
> pareil, simplement sans salle indiquée sur les séances.

### Principe
En règle générale, **une salle ne reçoit qu'une classe par créneau**, sauf en **tronc commun**.
Inversement, **une classe n'occupe qu'une salle à la fois**, sauf en **tandem**.

### Paramètres › Salles
- Chaque salle a un **nom** (S15, LABO1, INFO1…), un **type** (salle de classe, laboratoire, salle
  informatique, terrain/sport, autre) et une **capacité**. La capacité est le nombre de classes accueillies
  en même temps : 1 en général, plus pour un terrain.
- **Salle exigée par matière** : ex. S.V.T. et Physique-Chimie → laboratoire, TICE → salle informatique.
- Les autres matières ont lieu de préférence dans la **salle attitrée** de la classe. Si elle est occupée,
  le moteur prend une autre salle de classe libre ; s'il n'en reste aucune, la séance est placée sans salle.
  Un établissement a souvent moins de salles que de classes, et plusieurs classes partagent la même salle
  attitrée. Seules les salles spécialisées (laboratoire, informatique, terrain) sont obligatoires.

### Paramètres › Regroupements
- **Tronc commun** : plusieurs classes suivent **ensemble** le même cours, avec le même professeur, dans la
  même salle et au même créneau. Exemples : EPS de deux classes sur le terrain, Philosophie de Tle A2 1 et
  Tle A2 2. Les classes doivent avoir le même professeur pour cette matière (l'écran l'affiche pour
  vérification).
- **Tandem** : une classe est **scindée en groupes** qui ont cours **en même temps** dans des salles
  différentes, un groupe par matière (ex. S.V.T. / Physique-Chimie). Le volume en parallèle est le plus
  petit des volumes ; le reste éventuel de la matière la plus lourde est placé normalement, pour toute la
  classe.
- **Tandem automatique** : quand **deux professeurs enseignent la même matière à une même classe** (cas
  réel de la LV2 Allemand / Espagnol), leurs groupes sont placés en parallèle. Avant ce changement, le
  moteur plaçait les deux séries l'une après l'autre (6 h de LV2 au lieu de 3). Règle désactivable.

Dans les emplois du temps, une case de tandem montre les deux groupes. Une séance de tronc commun indique
les autres classes réunies (« + Tle A2 2 »).

---

## 5. Règles pédagogiques

Dans **Paramètres › Horaires & contraintes › Règles pédagogiques**, chaque règle s'active ou se désactive
d'un clic. Les réglages sont **par cycle** (collège / lycée).

| Règle | Nature | Personnalisable |
|---|---|---|
| **e.** Ne pas enchaîner les disciplines littéraires (Français, Anglais, LV2…) | À éviter | liste des matières |
| **f.** Ne pas enchaîner les disciplines scientifiques (Maths, PC, SVT) | À éviter | liste des matières |
| **g.** Pas de double cours (ou tandem de 3h) coupé par une récréation / le déjeuner | À éviter | exception autorisée ou non |
| **h.** Une seule séance par discipline et par jour | À éviter | — |
| **h.** Au moins N disciplines différentes par jour | Contrôle | N (3 par défaut) |
| **i.** EPS aux 2 premiers créneaux du matin ou aux 2 derniers de l'après-midi, en séance unique de 2h, sur le terrain | **Prioritaire** | matière, durée |
| **j.** Mercredi après-midi banalisé : « Vie scolaire » | **Toujours** | (réglage « Mercredi après-midi banalisé ») |
| Heures creuses en fin de matinée ou l'après-midi, jamais entre deux cours | À éviter | — |
| Groupes en parallèle (tandem) automatiques | **Toujours** | — |
| Une demi-journée libre par professeur | À éviter | — |

**La grille horaire de référence passe avant tout.** Chaque classe reçoit toutes les heures de la
grille ; aucune règle pédagogique ne peut faire perdre une heure. Seules les contraintes physiques sont
absolues : un professeur, une classe ou une salle ne peut pas être à deux endroits en même temps, et les
indisponibilités déclarées sont respectées.

- **Prioritaire** : respectée tant que c'est possible. Elle n'est relâchée que si, sans cela, des heures
  de la grille seraient perdues. Exemples : une EPS en milieu de matinée, un double cours scindé, une
  coupure par la récréation, un cours de SVT sans laboratoire libre. Chaque écart est signalé dans le
  rapport.
- **À éviter** : le moteur la respecte en priorité et ne la relâche qu'en dernier recours, plutôt que de
  laisser une classe sans cours. Chaque entorse est listée dans le rapport.
- **Contrôle** : vérifiée et signalée, sans bloquer.

**Exemple réel (données de `/source`).** Avec la règle EPS, Bah G. E. a 15 classes d'EPS de 2h. La semaine
n'offre que 9 positions « début de matinée / fin d'après-midi » (5 matins + 4 fins d'après-midi, le
mercredi après-midi étant banalisé). Toutes les séances sont tout de même placées : celles qui
ne tiennent pas dans ces positions vont ailleurs dans la journée. Le rapport le dit explicitement et
propose de déclarer des **troncs communs EPS** (deux classes ensemble sur le terrain).

### Apprendre d'un modèle (Paramètres › Apprendre d'un modèle)

Planex peut **apprendre les habitudes d'un établissement** à partir d'un emploi du temps existant.
Le censeur clique sur **« Importer les PDF des emplois du temps de classe »** et sélectionne tous ses PDF
(un par classe), ou les dépose dans le cadre. Les PDF sont lus directement dans le navigateur
(`app/src/lib/importEdtPdf.ts`) : aucun script ni accès au code n'est nécessaire. Planex vérifie que chaque
classe retombe sur son total d'heures annoncé et signale les fichiers illisibles. Le résultat peut être
analysé tout de suite, puis **enregistré comme version** pour le retrouver plus tard, ici et dans
Vue d'ensemble › Comparer. Toute version déjà enregistrée peut aussi servir de modèle.

**Des PDF faits de manières différentes.** Chaque établissement produit ses emplois du temps à sa façon. La
lecture ne dépend donc pas d'un logiciel précis :

- **Grille générique.** Planex cherche les jours (LUNDI, MARDI…) en colonnes et les horaires
  (« 07H30-08H25 », « 07:45 - 08:35 ») en lignes. Un fichier peut contenir une ou plusieurs classes, avec une
  page par classe ; les pages vierges sont ignorées.
- **Professeurs.** Ils sont lus dans la case (« MATHÉMATIQUES / S15 / Kone A. ») ou dans la liste de
  l'en-tête (« PC : M. KOUADIO »). Les écritures d'un même professeur sont réunies (« M. KOUADIO Wilfred » et
  « M. KOUADIO », « Mme KADJA » et « M. KADJA »), sans confondre deux personnes de matières différentes.
- **Libellés inconnus.** Quand une case contient un libellé que Planex ne connaît pas, l'écran demande au
  censeur à quelle matière il correspond, ou de l'ignorer. Ce choix est retenu dans le navigateur pour les
  imports suivants de l'établissement.
- **Contrôles.** Planex vérifie le total d'heures quand le PDF l'annonce. Il signale les cases sans
  professeur et explique pourquoi un PDF scanné (une image, sans texte) ne peut pas être lu.
- **Pauses.** Un écart de moins de 10 minutes entre deux cours (11h20 → 11h25) est un simple intercours et
  non une pause : les deux cours se suivent.

Formats vérifiés : les PDF par classe de Bingerville (37 classes, 961 séances, identiques au relevé de
référence) et les PDF Word du Groupe Scolaire Vatican II (18 classes, 467 séances, dans ses deux versions).

Planex mesure chaque règle dans ce modèle et propose
les réglages qui le reproduisent. Le censeur coche ce qu'il veut adopter, cycle par cycle, puis clique sur
« Appliquer ». Les suggestions qui *ajoutent* une habitude sont pré-cochées. Celles qui *désactivent*
une règle restent au jugement du censeur.

Les mesures appliquent les mêmes définitions que le rapport de génération
(`app/src/lib/apprentissage.ts`) :

- **Découpage** (informatif) : pour chaque matière et chaque volume, comment les heures sont réparties en
  séances. Le découpage appliqué par le moteur reste celui saisi dans la grille horaire (ex. « 2+1+1 »).
- **Enchaînements** : le taux observé est comparé au taux attendu si les matières étaient disposées au hasard.
  Un taux nettement plus bas signifie que l'établissement les évite.
- **Autres mesures** : coupures par une pause, doublons dans la journée, place de l'EPS, heures creuses,
  demi-journées libres des professeurs, et mercredi après-midi.

**Ce que Planex a appris des 37 emplois du temps de Bingerville (961 séances)**

| Constat | Collège | Lycée |
|---|---|---|
| Anglais, LV2, EDHC, TICE en séances d'1h | 100 % des classes | 90 à 100 % |
| Physique-Chimie, SVT, EPS en doubles de 2h ; Philosophie en doubles | 100 % | 100 % |
| Français et Mathématiques : un double par semaine + séances d'1h | 82 % / 50 % (Maths 4h : moitié 2+1+1, moitié 1+1+1+1) | 100 % / 93 % (Maths 5h → 2+2+1, 6h → 2+2+2) |
| Histoire-Géographie : 1h, sauf à 4h (2+1+1) | 91 % | 80 % |
| Sciences enchaînées (Maths, PC, SVT) | 2 % des enchaînements, contre 6 % au hasard : **évité** | 8 % contre 8 % : pas évité |
| Langues enchaînées | 22 % contre 10 % au hasard : pas évité | 25 % contre 6 % : pas évité |
| Double cours coupé par une pause | 8 % | 3 % |
| EPS en début de matinée ou fin d'après-midi | 64 % | 80 % |
| Professeurs avec au moins une demi-journée libre | 93 % (51 sur 55) | |
| Cours le mercredi après-midi | aucun | aucun |

Le découpage se règle dans la grille horaire de référence (« 2+1+1 »), qui passe avant toutes les règles.
La règle « demi-journée libre » est activée par défaut.

---

## 6. Génération, rapport et versions

**Dashboard › Générer l'emploi du temps** :

1. Sauvegarde l'emploi du temps actuel comme **version** (restaurable).
2. Conserve les **séances verrouillées** 🔒 telles quelles.
3. Place toutes les autres séances, en environ 5 secondes au maximum.
4. Enregistre et affiche le **rapport** : séances placées / à placer, avertissements, entorses aux règles
   classées par règle. Le rapport reste consultable après rechargement.

**Versions** : liste des sauvegardes, restauration (l'état courant est sauvegardé avant), suppression,
enregistrement manuel (« Version validée par le proviseur »). Une version décrit les séances par nom de
professeur, horaire et nom de salle, pas par identifiant interne. Elle reste donc restaurable après une
modification des fiches.

**La grille horaire passe avant tout** : aucune règle ne peut faire perdre une heure. En dernier recours,
le moteur place une EPS hors des bords de journée, scinde un double cours, accepte une coupure par une
pause ou place une séance sans salle spécialisée libre, et le rapport le signale.

**Résultat sur les données réelles** (37 classes, 55 professeurs, 64 fiches, 22 créneaux), toutes règles
actives : **929 séances sur 929 placées**, 0 conflit. Les 3 séances d'EPS que la semaine ne peut pas mettre
en début ou fin de journée sont expliquées dans le rapport.

---

### Validation sur un établissement réel (Collège Le Conquérant, Bingerville)

Les 37 emplois du temps réels de l'établissement (PDF de [`source/`](source/), faits à la main, 2023-2024)
ont été importés dans Planex, puis comparés à ce que Planex génère **à partir des mêmes données** (Vue
d'ensemble › **Comparer**, usage « Fait à la main vs Planex »).

| Critère | Réel (fait à la main) | Planex |
|---|---|---|
| Séances de la grille placées | — | **929 / 929** |
| Volumes classe × matière identiques au réel | — | 326 / 328 (99 %) |
| Découpages en séances identiques au réel (ex. 2+1+1) | — | 310 / 328 |
| Conflits de professeur (un professeur dans deux classes au même moment) | 34 | **0** |
| Conflits de classe | 4 | **0** |
| Conflits de salle | 37 | **0** |
| Entorses « ne pas enchaîner deux langues / deux sciences » | 77 | **0** |
| Doubles cours coupés par une pause | 13 | **0** |
| Deux séances de la même discipline le même jour | 24 | **0** |
| EPS hors du début de matinée / fin d'après-midi | 11 | 3 (expliquées) |
| Heures creuses mal placées | 103 | 19 |

- Les 2 écarts de volume restants sont les tandems LV2 « partiels » du réel : 2 h en parallèle + 1 h
  séparée par groupe.
- Planex ne retrouve pas la grille case par case : pour les mêmes données, il existe des milliers
  d'emplois du temps valides. Il produit un emploi du temps **équivalent** (mêmes heures, mêmes
  professeurs) et **sans conflit**.
- L'impression d'une classe reprend la mise en page, l'en-tête, le professeur principal, le total d'heures
  et la signature du PDF officiel.

Pour reproduire :

```bash
cd app
node scripts/extraire-edt-pdf.mjs ../source ../source/emplois_du_temps_reels.json   # PDF → JSON (contrôle des totaux d'heures)
PLANEX_EMAIL=... PLANEX_PASSWORD=... node scripts/importer-bingerville.mjs          # données + version « réel » dans Planex
```

L'import met à jour, pour l'établissement du compte utilisé :
- les fiches professeurs (classes et heures réelles) ;
- les 27 salles réelles, plus un terrain ;
- les professeurs principaux et les salles attitrées ;
- les troncs communs EPS observés ;
- l'en-tête officiel.

Il enregistre aussi l'emploi du temps réel comme version. Le réel contient des conflits : cette version se
**consulte et se compare**, mais le garde-fou de la base refuse de la restaurer telle quelle.

## 7. Retouches manuelles

Sur **Planning**, vue **Classe** ou vue **Professeur** :

- **Glisser-déposer** une séance vers une autre case la **déplace**. Si la case est occupée, les deux
  séances sont **échangées**.
- En vue Professeur, c'est la classe concernée qui change d'horaire. Si la case contient une autre classe
  du professeur, les deux heures sont échangées. Si la classe a cours avec un collègue au nouvel horaire,
  ses deux heures sont échangées, à condition que le collègue soit libre.
- Chaque déplacement est **contrôlé** avant d'être appliqué : professeur déjà occupé (même au lycée si
  l'horaire coïncide), classe, salle pleine, indisponibilité déclarée, mercredi après-midi. En cas de
  conflit, il est refusé avec l'explication.
- Si le déplacement enfreint une règle pédagogique « à éviter », il est accepté mais signalé.
- Une séance déplacée est **verrouillée** automatiquement. On peut aussi verrouiller une séance (icône 🔒)
  ou toute la classe : la prochaine génération ne les touchera pas.
- **Annuler le dernier déplacement** revient en arrière, pas à pas.
- Un tandem ou un tronc commun se déplace en bloc (tous les groupes / toutes les classes ensemble).

La vue **Salle** est en lecture.

---

## 8. Contrôle : la vue d'ensemble

| Onglet | Contenu |
|---|---|
| Toutes les classes | Grille du jour choisi : toutes les classes × tous les créneaux (matière + professeur) |
| Salles | Occupation de chaque salle par créneau et taux d'occupation du jour |
| Contrôles pédagogiques | Entorses aux règles actives, recalculées en direct (y compris après retouches) |
| Services des professeurs | Heures dues (fiches) / heures placées / écart, par professeur |
| Dernier rapport | Rapport de la dernière génération |
| Comparer | Deux usages. **Fait à la main vs Planex** : l'emploi du temps fait à la main de la même année (PDF importés) face à celui de Planex, avec les mêmes données. **Version précédente vs actuelle** : pour qui crée tout dans Planex, ce qui a changé depuis une version enregistrée (sauvegarde automatique avant génération, ou enregistrée depuis le Dashboard). Conflits de chacun, écarts aux règles, écarts de volume, grilles d'une classe côte à côte. Sans rien à comparer, l'onglet explique comment importer des PDF ou enregistrer une version. |

### Bibliothèque des années scolaires

Planex travaille sur **une année à la fois** : l'année active, celle de Paramètres › Établissement, affichée
dans la barre du haut. L'onglet **Bibliothèque** garde les années passées.

- **Clôturer l'année** (administrateur seulement) : Planex range dans la bibliothèque une photo complète de
  l'année, avec le paramétrage, l'emploi du temps final, le dernier rapport et les versions enregistrées.
  L'établissement passe ensuite à l'année suivante en gardant son paramétrage (classes, professeurs, salles,
  horaires, grille, règles) comme point de départ. Par défaut, l'emploi du temps est vidé pour être
  régénéré, et les professeurs principaux sont effacés ; les deux options sont décochables. Le tout se fait
  en une seule opération en base (`cloturer_annee`).
- **Ranger une année passée** : un emploi du temps importé des PDF d'une autre année peut être rangé à son
  année. Il quitte alors les versions de l'année en cours.
- **Consulter une année rangée** : ses emplois du temps par classe, professeur ou salle, en lecture seule,
  avec export Excel. Elle sert aussi dans Vue d'ensemble › Comparer (contre l'année en cours) et dans
  Apprendre d'un modèle.
- Les versions de Comparer ne concernent ainsi que l'année en cours ; celles des années passées sont rangées
  avec elles.

Migration : `supabase/migrations/20261002120000_bibliotheque_annees.sql`. Tant qu'elle n'est pas
appliquée, l'application fonctionne normalement et l'onglet Bibliothèque explique comment l'activer.

---

## 9. Impression et export

**Impression** reproduit la mise en page des documents officiels de `/source` :
- **En-tête :** ministère, DRENA, établissement, téléphone, email ; République de Côte d'Ivoire, année
  scolaire, code, statut.
- **Corps :** titre encadré (`EMPLOI DU TEMPS CLASSE : 3EME 1`), professeur principal, total d'heures,
  grille avec matière / salle / professeur.
- **Pied de page :** signature (nom et fonction du signataire).

- **Classes, Professeurs ou Salles** : tout sélectionner ou choisir.
- **Imprimer / PDF** : une page A4 par emploi du temps. Pour un fichier PDF, choisir « Enregistrer au
  format PDF » dans la fenêtre d'impression.
- **Exporter en Excel** : un classeur, une feuille par emploi du temps.
- Depuis le Planning, le bouton « Imprimer » ouvre directement l'emploi du temps affiché.

---

## 10. Architecture technique

```
Planex/
├── README.md                ← ce fichier
├── source/                  ← emplois du temps réels (PDF/Excel) servant de référence
├── ideas/                   ← maquettes d'origine (EDT Pro v2, logo)
└── app/                     ← application React + Supabase
    ├── supabase/migrations/ ← schéma SQL versionné (sécurité, salles, versions…)
    └── src/
        ├── pages/           ← Landing, Login, Signup, MotDePasseOublie, ReinitialiserMotDePasse, Accueil,
        │                      Dashboard, Planning, VueEnsemble, Impression, Bibliotheque, Parametres
        ├── components/      ← écrans de paramétrage (Professeurs, Salles, Regroupements, EtablissementInfos,
        │                      ReglesPedagogiquesPanel, ClassesDetails, PlanEtablissement…), ApprentissageModele,
        │                      HorairesDuModele, Comparaison, AppHeader, ChampMotDePasse + primitives UI
        ├── hooks/           ← useEtablissement, useEmploiDuTempsData, useBibliotheque, useHorairesGrid, useProfile
        └── lib/
            ├── scheduling/  ← moteur de génération (voir ci-dessous)
            ├── regles.ts    ← règles pédagogiques (types, valeurs par défaut, descriptions)
            ├── edition.ts   ← contrôle des déplacements manuels
            ├── timetable.ts ← construction des grilles (planning, impression, Excel)
            ├── importProfesseurs.ts ← lecture tolérante des fichiers Excel
            ├── importEdtPdf.ts      ← lecture des emplois du temps en PDF (deux mises en page, noms harmonisés)
            ├── apprentissage.ts     ← habitudes et horaires appris d'un emploi du temps existant
            ├── comparaison.ts       ← mesures pour Comparer (volumes, conflits, règles, découpages)
            ├── bibliotheque.ts      ← lecture et export des années archivées
            └── authErreurs.ts       ← messages d'erreur de connexion en français
```

- **Pile technique :** React 18, TypeScript, Vite, Tailwind v4, TanStack Query, `@dnd-kit` (glisser-déposer),
  `xlsx` (SheetJS, chargé à la demande).
- **Pas de serveur applicatif :** tout passe par Supabase (Postgres, authentification, RLS, fonctions SQL).

### Moteur de génération (`app/src/lib/scheduling/`)

| Fichier | Rôle |
|---|---|
| `charges.ts` | Qui enseigne quoi, à quelle classe, combien de séances (à partir des fiches et de la grille officielle) |
| `activites.ts` | Regroupe les charges en **activités** placées d'un bloc : simple, tandem, tronc commun ; applique la règle EPS (séance unique) |
| `slots.ts` | Créneaux plaçables par cycle (jours actifs, mercredi banalisé, matin / après-midi) ; `seSuivent` : deux créneaux séparés de moins de 10 min se suivent |
| `solver.ts` | Placement : contraintes physiques jamais relâchées (professeur, classe, capacité des salles, indisponibilités, verrous), puis niveaux de relâchement (0 : toutes les règles ; 1 : sans règles souples ; 2 : coupure par une pause tolérée ; 3 : dernier recours — EPS hors des bords, salle spécialisée absente, coupure — plutôt que perdre une heure). Un double cours sans créneaux consécutifs libres est scindé. Placement « compact » contre les heures creuses ; tentatives aléatoires dans un budget de temps |
| `entorses.ts` | Analyse des entorses aux règles : sert à noter les tentatives, au rapport et à la vue d'ensemble |
| `generate.ts` | Orchestration, prise en compte des séances verrouillées, diagnostic de capacité EPS, rapport |

Détails historiques de l'algorithme : [`app/src/lib/scheduling/README.md`](app/src/lib/scheduling/README.md).

### Garde-fou en base

Un **trigger de contrainte différé** (`verifier_conflits_seance`) refuse tout enregistrement qui mettrait
une classe ou un professeur sur deux séances distinctes au même créneau, ou une salle au-delà de sa
capacité. Seules les lignes d'une même séance partagée (`groupe_seance` : tandem ou tronc commun) peuvent
partager un créneau. La vérification a lieu en fin de transaction, ce qui permet d'**échanger** deux
séances.

### Tables principales

| Table | Contenu |
|---|---|
| `etablissements` | nom, en-tête officiel, code d'invitation |
| `profiles` | utilisateur, établissement, rôle (`admin` / `membre`) |
| `horaires_reference` | grille officielle des volumes horaires |
| `horaires_contraintes` | jours, mercredi banalisé, règles pédagogiques (`regles` jsonb) par cycle |
| `creneaux_horaires` | créneaux de la journée par cycle |
| `classes_etablissement` / `classes_details` | niveaux et nombre de classes / professeur principal et salle attitrée |
| `professeurs` / `professeur_indisponibilites` | fiches par matière / indisponibilités |
| `salles` / `matieres_salles` | salles et capacité / type de salle exigé par matière |
| `regroupements` | troncs communs et tandems |
| `emploi_du_temps` | séances (salle, `verrouille`, `groupe_seance`) |
| `emploi_du_temps_versions` / `generations` | sauvegardes de l'année en cours / rapports de génération |
| `annees_archivees` | Bibliothèque : années clôturées ou importées (paramétrage, emploi du temps, versions) |

---

## 11. Installation et commandes

```bash
cd app
npm install --allow-remote=all   # npm ≥ 12 : nécessaire pour xlsx, distribué par le CDN officiel SheetJS
npm run dev                      # http://localhost:5173
npm run build                    # build de production
npm run test                     # tests (moteur, règles, édition, import Excel et PDF, apprentissage, bibliothèque)
```

Fichier `app/.env` :

```
VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publishable>
```

### Migrations

Les migrations SQL sont dans [`app/supabase/migrations/`](app/supabase/migrations/), **à appliquer dans
l'ordre** :

1. `20261001120000_securite_comptes.sql` : codes d'invitation, rôles, droits par colonne, RLS des
   établissements et des profils.
2. `20261001120100_salles_regroupements_edition.sql` : salles, regroupements, règles, verrouillage,
   garde-fou des conflits, versions, rapports.
3. `20261001120200_droits_fonctions.sql` : resserrement des droits d'exécution signalés par l'audit de
   sécurité Supabase.
4. `20261002120000_bibliotheque_annees.sql` : bibliothèque des années (table `annees_archivees`,
   fonction `cloturer_annee`).

Application : `supabase db push`, ou depuis l'éditeur SQL Supabase (coller tout le fichier). Chaque
fichier s'exécute d'un bloc : en cas d'erreur, rien n'est appliqué. La migration 1 désigne comme
administrateur le plus ancien compte de chaque établissement existant.

> **OneDrive** : si le projet est dans un dossier OneDrive, réglez le dossier sur « Toujours conserver sur
> cet appareil ». Sinon, des fichiers de `node_modules` restent « en ligne uniquement » et Vite échoue avec
> `UNKNOWN: unknown error, read`.

---

## 12. Limites connues

- **Génération dans le navigateur :** elle bloque l'onglet quelques secondes (budget de 5 s). Le résultat
  est le meilleur trouvé dans ce temps, pas un optimum prouvé.
- **Horaires qui se chevauchent sans coïncider :** les conflits de professeur et de salle entre collège et
  lycée sont détectés quand les horaires sont **identiques**. Des horaires qui se chevauchent sans
  coïncider exactement ne sont pas comparés.
- **Changement de créneaux :** modifier les créneaux horaires (Horaires & contraintes) supprime les séances
  existantes. Les versions enregistrées restent restaurables si les heures de début n'ont pas changé.
- **Pas d'avertissement de concurrence :** deux personnes qui modifient l'emploi du temps en même temps ne
  sont pas averties l'une de l'autre. Le garde-fou en base empêche cependant tout conflit enregistré.
- **Gestion du quotidien :** absences, remplacements et permanences ne sont pas encore couverts.
- **PDF scannés :** un PDF qui n'est qu'une image (photo, scan) ne contient pas de texte et ne peut pas être
  lu ; il faut l'exporter directement en PDF depuis Word, Excel ou le logiciel d'emploi du temps.
- **Libellés propres à un établissement :** les correspondances choisies (« ÉTUDE » → ignorer…) sont
  retenues dans le navigateur, pas dans la base : un collègue sur un autre ordinateur doit refaire le choix.
- **« 1ère A » sans précision :** une classe de 1re A ou Tle A sans A1/A2 est rangée en A1 par défaut.
- **Une année à la fois :** on ne prépare pas l'année suivante pendant que l'année en cours tourne encore
  (voir §13).

---

## 13. Pas encore fait

Fonctionnalités identifiées mais pas encore réalisées, par ordre de priorité suggéré.

**Bibliothèque des années**
- **Reprendre une année rangée comme point de départ** : recopier le paramétrage d'une ancienne année
  (classes, professeurs, salles, horaires, règles) dans l'année active. Plus délicat que la clôture, car il
  faut remplacer les données actuelles.
- **Préparer l'année suivante en parallèle** de l'année en cours (par exemple en juin), ce qui demanderait
  une colonne « année » dans toutes les tables (solution « A » écartée pour l'instant).
- **Imprimer une année rangée** au format officiel (aujourd'hui : consultation et export Excel).

**Import des emplois du temps existants**
- **Enregistrer les correspondances de libellés dans l'établissement** plutôt que dans le navigateur.
- **Avertir dans Comparer** quand la version comparée ne correspond pas aux données actuelles (autre année,
  classes absentes, professeurs inconnus) : seuls les conflits et les règles restent alors comparables.
- **Reprendre les professeurs et les classes d'un PDF importé** pour pré-remplir Paramètres › Professeurs
  et Classes d'un nouvel établissement.

**Règles pédagogiques**
- Règles issues du document de conception, en règles activables : **au plus 3 niveaux différents par
  enseignant** (aujourd'hui seulement signalé en rouge dans le Plan) et **un seul enseignant par discipline
  et par classe**.

**Comptes et mise en ligne**
- Appliquer la migration `20261001120200_droits_fonctions.sql` et activer « Leaked password protection »
  (Supabase › Authentication).
- Configurer les *Redirect URLs* et un serveur SMTP pour « Mot de passe oublié » (voir §2), et traduire le
  modèle d'email « Reset password ».
- *(facultatif)* Panneau de présentation de Planex à côté du formulaire de connexion sur grand écran.

**Quotidien de l'établissement**
- Absences, remplacements et permanences.
