import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PlanexLogo } from '@/components/PlanexLogo'

const FEATURES = [
  {
    title: 'Génération automatique',
    desc: "Planex construit l'emploi du temps de vos classes, enseignants et salles à partir de vos volumes horaires et de vos contraintes pédagogiques.",
  },
  {
    title: 'Édition par glisser-déposer',
    desc: "Ajustez un créneau à la main quand c'est nécessaire, sans casser le reste de l'emploi du temps.",
  },
  {
    title: 'Export Excel & PDF',
    desc: "Partagez l'emploi du temps généré en un clic, prêt à imprimer ou à diffuser.",
  },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-6 lg:px-16">
        <PlanexLogo size={28} />
        <div className="flex items-center gap-2 sm:gap-6">
          <Link
            to="/login"
            className="hidden text-sm font-semibold text-foreground hover:text-primary sm:inline-flex"
          >
            Se connecter
          </Link>
          <Button asChild className="rounded-full px-5">
            <Link to="/signup">Créer un compte</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center lg:pt-24">
        <div className="mb-4 text-xs font-semibold uppercase tracking-[1.5px] text-primary">
          Planification automatique des emplois du temps
        </div>
        <h1 className="mb-6 font-serif text-4xl font-semibold leading-tight lg:text-5xl">
          Des emplois du temps scolaires, sans conflit.
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Planex construit automatiquement les emplois du temps de vos classes, enseignants et
          salles à partir de vos volumes horaires et de vos contraintes pédagogiques — puis
          documente chaque arbitrage dans un rapport clair.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Créer un compte</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Se connecter</Link>
          </Button>
        </div>
      </main>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-6 pb-20 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-2 font-serif text-lg font-semibold">{feature.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        Conçu pour les établissements secondaires et universitaires — collèges, lycées, facultés.
      </footer>
    </div>
  )
}
