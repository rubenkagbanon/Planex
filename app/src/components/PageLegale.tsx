import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PlanexLogo } from '@/components/PlanexLogo'

// Adresse affichée sur les pages légales pour toute question ou demande sur les données
export const EMAIL_CONTACT = '[adresse e-mail de contact]'
export const DATE_MISE_A_JOUR = '5 octobre 2026'

interface PageLegaleProps {
  titre: string
  children: ReactNode
}

// Mise en page commune aux pages publiques « Règles de confidentialité » et « Conditions d'utilisation »
export function PageLegale({ titre, children }: PageLegaleProps) {
  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b border-border px-6 py-5 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <Link to="/">
            <PlanexLogo size={26} animated={false} />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-serif text-3xl font-semibold text-foreground">{titre}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {DATE_MISE_A_JOUR}</p>
        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </main>
      <footer className="border-t border-border px-6 py-8 lg:px-16">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-5 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Accueil
          </Link>
          <Link to="/confidentialite" className="hover:text-foreground">
            Règles de confidentialité
          </Link>
          <Link to="/conditions-utilisation" className="hover:text-foreground">
            Conditions d'utilisation
          </Link>
        </div>
      </footer>
    </div>
  )
}
