import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, GripVertical, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlanexLogo } from '@/components/PlanexLogo'
import { colorForMatiere } from '@/lib/matiereColor'
import { cn } from '@/lib/utils'

// Page d'accueil publique : présentation de Planex, avec des animations discrètes (apparition au
// défilement, emploi du temps qui se remplit, onglets qui défilent, chiffres qui s'incrémentent).
// Toutes les animations s'arrêtent si le visiteur a demandé de réduire les animations.

const reduireAnimations = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Apparition au défilement : l'élément glisse vers le haut en devenant visible
function Reveal({ children, delai = 0, className }: { children: ReactNode; delai?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} data-visible={visible} className={cn('reveal', className)} style={{ '--reveal-delay': `${delai}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

// Nombre qui s'incrémente quand il apparaît à l'écran
function Compteur({ valeur, duree = 1600 }: { valeur: number; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [affiche, setAffiche] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduireAnimations()) {
      setAffiche(valeur)
      return
    }
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const debut = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - debut) / duree)
        setAffiche(Math.round(valeur * (1 - Math.pow(1 - p, 3))))
        if (p < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [valeur, duree])
  return <span ref={ref}>{affiche.toLocaleString('fr-FR')}</span>
}

// --- Visuel du hero : un emploi du temps qui se construit tout seul ---------------------------------

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']
const HEURES = ['07:45', '08:35', '09:25', '10:30', '11:20', '13:15', '14:05']
// Emploi du temps de démonstration d'une classe de 3e (null = pas cours ; mercredi après-midi libre)
const GRILLE: (string | null)[][] = [
  ['E.P.S.', 'Français', 'Mathématiques', 'S.V.T.', 'Anglais'],
  ['E.P.S.', 'Français', 'Mathématiques', 'S.V.T.', 'Anglais'],
  ['Mathématiques', 'Anglais', 'Français', 'Histoire-Géo', 'Physique-Chimie'],
  ['Histoire-Géo', 'Physique-Chimie', 'L.V.2', 'Français', 'Physique-Chimie'],
  ['Français', 'Physique-Chimie', 'E.D.H.C.', 'Mathématiques', 'Histoire-Géo'],
  ['Anglais', 'Histoire-Géo', null, 'L.V.2', 'Mathématiques'],
  ['L.V.2', 'TICE', null, 'Français', null],
]
const ABREGE: Record<string, string> = {
  'E.P.S.': 'EPS',
  'Français': 'FRANÇAIS',
  'Mathématiques': 'MATHS',
  'S.V.T.': 'SVT',
  'Anglais': 'ANGLAIS',
  'Histoire-Géo': 'H-G',
  'Physique-Chimie': 'PC',
  'L.V.2': 'LV2',
  'E.D.H.C.': 'EDHC',
  'TICE': 'TICE',
}
// Ordre d'apparition pseudo-aléatoire mais stable des cases
const ORDRE = GRILLE.flatMap((ligne, h) => ligne.map((m, j) => ({ h, j, m })))
  .filter((c) => c.m)
  .sort((a, b) => ((a.h * 7 + a.j * 13) % 17) - ((b.h * 7 + b.j * 13) % 17))

function EmploiDuTempsAnime() {
  const [placees, setPlacees] = useState(() => (reduireAnimations() ? ORDRE.length : 0))
  useEffect(() => {
    if (reduireAnimations()) return
    // Remplit la grille case par case, marque une pause une fois terminée, puis recommence
    const id = setInterval(() => setPlacees((n) => (n >= ORDRE.length + 18 ? 0 : n + 1)), 140)
    return () => clearInterval(id)
  }, [])
  const visibles = new Set(ORDRE.slice(0, placees).map((c) => `${c.h}|${c.j}`))
  const fini = placees >= ORDRE.length
  const total = 929
  const affichees = fini ? total : Math.round((placees / ORDRE.length) * total)

  return (
    <div
      className="motion-safe-anim relative rounded-2xl border border-border bg-card p-4 shadow-[0_30px_80px_-30px_rgba(31,58,46,0.35)] sm:p-5"
      style={{ animation: 'planex-float 7s ease-in-out infinite' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Emploi du temps</div>
          <div className="font-serif text-lg font-semibold text-foreground">3e 2</div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-500',
            fini ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
          )}
        >
          {fini ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
          {fini ? `${total}/${total} séances · 0 conflit` : `Génération… ${affichees}/${total}`}
        </div>
      </div>
      <div className="grid grid-cols-[2.6rem_repeat(5,minmax(0,1fr))] gap-1 text-[9px] sm:text-[10px]">
        <div />
        {JOURS.map((j) => (
          <div key={j} className="rounded bg-secondary py-1 text-center font-semibold uppercase tracking-wide text-secondary-foreground">
            {j}
          </div>
        ))}
        {HEURES.map((heure, h) => (
          <LigneGrille key={heure} heure={heure} h={h} visibles={visibles} />
        ))}
      </div>
    </div>
  )
}

function LigneGrille({ heure, h, visibles }: { heure: string; h: number; visibles: Set<string> }) {
  const apresDejeuner = h === 5
  return (
    <>
      <div className={cn('flex items-center text-muted-foreground', apresDejeuner && 'mt-2')}>{heure}</div>
      {GRILLE[h].map((m, j) => {
        const mercrediApresMidi = j === 2 && h >= 5
        return (
          <div key={j} className={cn('relative h-7 rounded sm:h-8', apresDejeuner && 'mt-2', mercrediApresMidi ? 'bg-muted/40' : 'bg-background')}>
            {mercrediApresMidi && apresDejeuner && (
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold uppercase text-muted-foreground">Vie sco.</span>
            )}
            {m && visibles.has(`${h}|${j}`) && (
              <div
                className="motion-safe-anim absolute inset-0 flex items-center justify-center rounded font-semibold text-foreground"
                style={{ backgroundColor: colorForMatiere(m), animation: 'planex-cell-in 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
              >
                {ABREGE[m] ?? m}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// --- Onglets « une vue pour chacun » ------------------------------------------------------------------

function ApercuLignes({ lignes }: { lignes: [string, string, string?][] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {lignes.map(([gauche, droite, couleur], i) => (
        <div
          key={i}
          className="motion-safe-anim flex items-center justify-between rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: couleur ?? 'var(--background)', animation: `planex-fade-up 0.5s ${i * 70}ms both` }}
        >
          <span className="font-semibold text-foreground">{gauche}</span>
          <span className="text-foreground/70">{droite}</span>
        </div>
      ))}
    </div>
  )
}

const ONGLETS: { cle: string; titre: string; accroche: string; texte: string; points: string[]; apercu: ReactNode }[] = [
  {
    cle: 'classe',
    titre: 'Classe',
    accroche: 'Chaque classe, sa semaine complète',
    texte: "Toutes les heures de la grille officielle, réparties selon vos règles : pas deux sciences d'affilée, EPS en début ou fin de journée, mercredi après-midi libre.",
    points: ['Professeur principal en en-tête', 'Salle attitrée ou spécialisée', 'Groupes LV2 en parallèle'],
    apercu: (
      <ApercuLignes
        lignes={[
          ['Lundi 07:45', 'EPS · Terrain', colorForMatiere('E.P.S.')],
          ['Lundi 09:25', 'Mathématiques · S15', colorForMatiere('Mathématiques')],
          ['Lundi 10:30', 'Histoire-Géo · S15', colorForMatiere('Histoire-Géo')],
          ['Lundi 11:20', 'Français · S15', colorForMatiere('Français')],
          ['Lundi 13:15', 'Anglais · S15', colorForMatiere('Anglais')],
        ]}
      />
    ),
  },
  {
    cle: 'professeur',
    titre: 'Professeur',
    accroche: 'Un service lisible pour chaque enseignant',
    texte: "Jamais deux classes à la fois, ses indisponibilités respectées, une demi-journée libre préservée. Glissez une heure pour la déplacer : Planex vérifie tout avant d'accepter.",
    points: ['Indisponibilités déclarées', 'Heures par semaine calculées', 'Déplacement contrôlé et verrouillé'],
    apercu: (
      <div className="flex flex-col gap-1.5">
        {(
          [
            ['Mardi 07:45', '4e 2 · Mathématiques', false],
            ['Mardi 08:35', '4e 2 · Mathématiques', false],
            ['Mardi 10:30', '3e 4 · Mathématiques', true],
            ['Mardi 11:20', '6e 1 · Mathématiques', false],
          ] as [string, string, boolean][]
        ).map(([quand, quoi, deplace], i) => (
          <div
            key={quand}
            className={cn('motion-safe-anim flex items-center gap-2 rounded-md px-3 py-2 text-xs', deplace ? 'bg-primary text-primary-foreground shadow-md' : 'bg-background')}
            style={{ animation: `planex-fade-up 0.5s ${i * 70}ms both` }}
          >
            <GripVertical className="h-3.5 w-3.5 opacity-60" />
            <span className="font-semibold">{quand}</span>
            <span className="ml-auto opacity-80">{quoi}</span>
            {deplace && <Lock className="h-3.5 w-3.5" />}
          </div>
        ))}
        <p className="mt-1 text-[11px] text-muted-foreground">Séance déplacée et verrouillée : la prochaine génération la gardera à cette place.</p>
      </div>
    ),
  },
  {
    cle: 'salle',
    titre: 'Salle',
    accroche: 'Des salles jamais réservées deux fois',
    texte: 'Laboratoires pour les sciences, salle informatique, terrain pour l’EPS, amphi pour les troncs communs. Sans données de salles, Planex fonctionne aussi.',
    points: ['Capacité par salle (amphi, terrain)', 'Salle attitrée par classe', 'Occupation de chaque salle'],
    apercu: (
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className={cn('motion-safe-anim h-8 rounded', [0, 1, 3, 6, 7, 8, 11, 12, 14, 16, 18, 19, 21, 23].includes(i) ? 'bg-secondary' : 'bg-background')}
            style={{ animation: `planex-cell-in 0.4s ${i * 30}ms both` }}
          />
        ))}
        <p className="col-span-5 mt-2 text-[11px] text-muted-foreground">LABO 1 · occupée 14 créneaux sur 25 cette semaine</p>
      </div>
    ),
  },
  {
    cle: 'controle',
    titre: 'Contrôles',
    accroche: 'Le rapport qui justifie chaque choix',
    texte: 'Volumes horaires, conflits, règles pédagogiques : tout est vérifié et listé. Quand une règle doit céder pour ne perdre aucune heure, le rapport dit où et pourquoi.',
    points: ['Zéro conflit garanti', 'Écarts aux règles expliqués', 'Comparaison avec votre emploi du temps actuel'],
    apercu: (
      <ApercuLignes
        lignes={[
          ['Séances placées', '929 / 929'],
          ['Conflits de professeur', '0'],
          ['Conflits de salle', '0'],
          ['Sciences enchaînées', '0'],
          ['EPS hors bords de journée', '3 · expliqué'],
        ]}
      />
    ),
  },
]

const DUREE_ONGLET = 7000

function Onglets() {
  const [actif, setActif] = useState(0)
  const [pause, setPause] = useState(false)
  useEffect(() => {
    if (pause || reduireAnimations()) return
    const id = setTimeout(() => setActif((i) => (i + 1) % ONGLETS.length), DUREE_ONGLET)
    return () => clearTimeout(id)
  }, [actif, pause])
  const o = ONGLETS[actif]
  return (
    <div onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
      <div className="mb-8 flex flex-wrap justify-center gap-2" role="tablist">
        {ONGLETS.map((onglet, i) => (
          <button
            key={onglet.cle}
            type="button"
            role="tab"
            aria-selected={i === actif}
            onClick={() => setActif(i)}
            className={cn(
              'relative overflow-hidden rounded-full border px-5 py-2 text-sm font-semibold transition-colors',
              i === actif ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {onglet.titre}
            {i === actif && !pause && (
              <span
                key={actif}
                className="motion-safe-anim absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
                style={{ animation: `planex-progress ${DUREE_ONGLET}ms linear both` }}
              />
            )}
          </button>
        ))}
      </div>
      <div key={o.cle} className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 md:grid-cols-2 md:p-10">
        <div className="motion-safe-anim" style={{ animation: 'planex-fade-up 0.5s both' }}>
          <h3 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">{o.accroche}</h3>
          <p className="mt-3 leading-relaxed text-muted-foreground">{o.texte}</p>
          <ul className="mt-5 flex flex-col gap-2">
            {o.points.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-primary" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-4">{o.apercu}</div>
      </div>
    </div>
  )
}

// --- FAQ --------------------------------------------------------------------------------------------

const FAQ: { q: string; r: string }[] = [
  {
    q: 'Faut-il saisir toutes les salles pour commencer ?',
    r: 'Non. Planex construit un emploi du temps sans aucune donnée de salles. Si vous les saisissez, il les attribue en plus : laboratoires, salle informatique, terrain, salles attitrées.',
  },
  {
    q: 'Les volumes horaires officiels sont-ils respectés ?',
    r: "Oui, c'est la priorité absolue : chaque classe reçoit toutes les heures de la grille horaire de référence (circulaire du MENA, modifiable). Aucune règle pédagogique ne peut faire perdre une heure.",
  },
  {
    q: 'Peut-on modifier l’emploi du temps à la main ?',
    r: 'Oui, par glisser-déposer depuis la vue d’une classe ou d’un professeur. Chaque déplacement est contrôlé (professeur, classe, salle, indisponibilités) puis verrouillé : une nouvelle génération le conserve.',
  },
  {
    q: 'Planex peut-il reprendre nos habitudes actuelles ?',
    r: 'Oui. Déposez les PDF de vos emplois du temps par classe : Planex mesure comment vos matières sont disposées et propose les réglages qui reproduisent ces habitudes. Il compare aussi votre emploi du temps actuel au sien.',
  },
  {
    q: 'Plusieurs personnes peuvent-elles travailler sur le même établissement ?',
    r: "Oui. Le créateur de l'établissement en est l'administrateur et partage un code d'invitation à ses collègues (censeurs, adjoints).",
  },
  {
    q: 'Comment diffuser les emplois du temps ?',
    r: 'Impression au format officiel (en-tête du ministère, DRENA, professeur principal) par classe, professeur ou salle, une par page ou en lot, et export Excel.',
  },
]

function Faq() {
  const [ouvert, setOuvert] = useState<number | null>(0)
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {FAQ.map((item, i) => {
        const estOuvert = ouvert === i
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOuvert(estOuvert ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              aria-expanded={estOuvert}
            >
              <span className="font-serif text-lg font-semibold text-foreground">{item.q}</span>
              <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300', estOuvert && 'rotate-180')} />
            </button>
            <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', estOuvert ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
              <div className="overflow-hidden">
                <p className="px-6 pb-5 leading-relaxed text-muted-foreground">{item.r}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Page ---------------------------------------------------------------------------------------------

const ETAPES = [
  {
    num: '01',
    titre: 'Décrivez votre établissement',
    texte: 'Classes, professeurs et leurs classes, horaires de la journée. Importez vos professeurs depuis Excel ; la grille horaire officielle est déjà saisie.',
  },
  {
    num: '02',
    titre: 'Générez en quelques secondes',
    texte: 'Planex place toutes les heures sans aucun conflit, en respectant vos règles pédagogiques, et explique chaque arbitrage dans un rapport.',
  },
  {
    num: '03',
    titre: 'Ajustez, imprimez, diffusez',
    texte: 'Retouchez au glisser-déposer, verrouillez ce qui doit rester, imprimez au format officiel ou exportez en Excel.',
  },
]

const FONCTIONS: { titre: string; items: string[] }[] = [
  { titre: 'Générer', items: ['Grille horaire officielle du MENA', 'Règles pédagogiques activables', 'Troncs communs et groupes LV2', 'Salles spécialisées et attitrées'] },
  { titre: 'Contrôler', items: ['Zéro conflit garanti', 'Rapport de génération', "Vue d'ensemble de toutes les classes", 'Services des professeurs'] },
  { titre: 'Ajuster', items: ['Glisser-déposer contrôlé', 'Séances verrouillées', 'Indisponibilités des professeurs', 'Versions et restauration'] },
  { titre: 'Partager', items: ['Impression au format officiel', 'Export Excel', "Équipe avec code d'invitation", 'Apprentissage depuis vos PDF'] },
]

const CHIFFRES: { valeur: number; suffixe: string; label: string; detail?: string }[] = [
  { valeur: 929, suffixe: ' / 929', label: 'heures de la grille placées' },
  { valeur: 0, suffixe: '', label: 'conflit de professeur, de classe ou de salle', detail: 'contre 75 dans l’emploi du temps fait à la main' },
  { valeur: 961, suffixe: '', label: 'séances analysées pour apprendre les habitudes' },
  { valeur: 5, suffixe: ' s', label: 'pour générer tout l’établissement' },
]

export function Landing() {
  const [defile, setDefile] = useState(false)
  useEffect(() => {
    const onScroll = () => setDefile(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header
        className={cn(
          'sticky top-0 z-30 flex items-center justify-between px-6 py-4 transition-all duration-300 lg:px-16',
          defile ? 'border-b border-border bg-background/85 backdrop-blur' : 'border-b border-transparent',
        )}
      >
        <PlanexLogo size={28} />
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#comment" className="hover:text-foreground">Comment ça marche</a>
          <a href="#vues" className="hover:text-foreground">Fonctionnalités</a>
          <a href="#preuve" className="hover:text-foreground">Résultats</a>
          <a href="#faq" className="hover:text-foreground">Questions</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-5">
          <Link to="/login" className="hidden text-sm font-semibold text-foreground hover:text-primary sm:inline-flex">
            Se connecter
          </Link>
          <Button asChild className="rounded-full px-5">
            <Link to="/signup">Créer un compte</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:px-16 lg:pt-20">
        <div>
          <div
            className="motion-safe-anim mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary"
            style={{ animation: 'planex-fade-up 0.6s both' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Pour les censeurs des collèges et lycées
          </div>
          <h1
            className="motion-safe-anim font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
            style={{ animation: 'planex-fade-up 0.7s 0.08s both' }}
          >
            L’emploi du temps de tout l’établissement, <span className="text-primary">sans conflit.</span>
          </h1>
          <p className="motion-safe-anim mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground" style={{ animation: 'planex-fade-up 0.7s 0.16s both' }}>
            Ce qui prend des semaines à la main se fait en quelques secondes : Planex place toutes les heures de la grille
            officielle, respecte vos règles pédagogiques et vous explique chaque choix.
          </p>
          <div className="motion-safe-anim mt-9 flex flex-wrap items-center gap-3" style={{ animation: 'planex-fade-up 0.7s 0.24s both' }}>
            <Button asChild size="lg" className="group rounded-full px-7">
              <Link to="/signup">
                Commencer <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <Link to="/login">Se connecter</Link>
            </Button>
          </div>
        </div>
        <div className="motion-safe-anim" style={{ animation: 'planex-fade-up 0.9s 0.3s both' }}>
          <EmploiDuTempsAnime />
        </div>
      </section>

      {/* 01 02 03 */}
      <section id="comment" className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-28 lg:px-16">
        <Reveal>
          <h2 className="max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">Confiez-lui la tâche, pas seulement le calcul.</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ETAPES.map((e, i) => (
            <Reveal key={e.num} delai={i * 120} className="h-full">
              <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-25px_rgba(31,58,46,0.4)]">
                <div className="font-serif text-4xl font-semibold text-primary/70 transition-colors group-hover:text-primary">{e.num}</div>
                <h3 className="mt-6 font-serif text-xl font-semibold">{e.titre}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{e.texte}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Onglets */}
      <section id="vues" className="scroll-mt-24 border-y border-border bg-muted/30 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mb-12 text-center">
            <h2 className="font-serif text-4xl font-semibold sm:text-5xl">Une vue pour chacun</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Classes, professeurs, salles : le même emploi du temps, cohérent sous tous les angles.
            </p>
          </Reveal>
          <Reveal>
            <Onglets />
          </Reveal>
        </div>
      </section>

      {/* Preuve */}
      <section id="preuve" className="scroll-mt-24 bg-secondary py-28 text-secondary-foreground">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[2px] text-primary">Testé sur un établissement réel</div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              37 classes, 55 professeurs : les mêmes données, un emploi du temps sans un seul conflit.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-secondary-foreground/75">
              Nous avons repris l’emploi du temps réel d’un collège-lycée de Bingerville, fait à la main, et fait générer le
              sien à Planex avec exactement les mêmes classes, professeurs et volumes horaires.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-secondary-foreground/15 sm:grid-cols-2 lg:grid-cols-4">
            {CHIFFRES.map((s, i) => (
              <Reveal key={s.label} delai={i * 100} className="h-full">
                <div className="h-full bg-secondary p-8">
                  <div className="whitespace-nowrap font-serif text-5xl font-semibold text-primary">
                    <Compteur valeur={s.valeur} />
                    <span className="text-3xl">{s.suffixe}</span>
                  </div>
                  <div className="mt-3 text-sm text-secondary-foreground/80">{s.label}</div>
                  {s.detail && <div className="mt-1 text-xs text-secondary-foreground/50">{s.detail}</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section className="mx-auto max-w-7xl px-6 py-28 lg:px-16">
        <Reveal>
          <h2 className="font-serif text-4xl font-semibold sm:text-5xl">Tout ce qu’il faut, rien de plus</h2>
        </Reveal>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {FONCTIONS.map((f, i) => (
            <Reveal key={f.titre} delai={i * 100}>
              <h3 className="border-b border-border pb-3 text-xs font-semibold uppercase tracking-[2px] text-primary">{f.titre}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {f.items.map((item) => (
                  <li key={item} className="text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 pb-28">
        <Reveal>
          <h2 className="mb-10 text-center font-serif text-4xl font-semibold sm:text-5xl">Questions fréquentes</h2>
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
      </section>

      {/* Appel final */}
      <section className="px-6 pb-28">
        <Reveal>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
            <h2 className="font-serif text-4xl font-semibold sm:text-5xl">Votre prochaine rentrée, déjà planifiée.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/85">
              Créez votre établissement en quelques minutes, ou rejoignez celui de vos collègues avec leur code d’invitation.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary" className="rounded-full px-7">
                <Link to="/signup">Créer un compte</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-primary-foreground/40 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/login">Se connecter</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border px-6 py-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <PlanexLogo size={22} />
          <span className="text-center">Conçu pour les collèges et lycées — grille horaire officielle du MENA intégrée.</span>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-foreground">
              Se connecter
            </Link>
            <Link to="/signup" className="hover:text-foreground">
              Créer un compte
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
