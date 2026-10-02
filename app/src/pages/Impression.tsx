import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { useEtablissement } from '@/hooks/useEtablissement'
import { useEmploiDuTempsData, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { anneeScolaire } from '@/lib/anneeScolaire'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import {
  classeLabel,
  construireLignes,
  estVieScolaire,
  formatHeure,
  joursActifs,
  libellePause,
  seancesDeCase,
  type SeanceRow,
} from '@/lib/timetable'
import type { Tables } from '@/lib/database.types'
import { cn } from '@/lib/utils'

type TypeDoc = 'classe' | 'professeur' | 'salle'

interface Document {
  key: string
  titre: string
  sousTitre: string | null
  cycles: Cycle[]
  seances: SeanceRow[]
  type: TypeDoc
}

// "3e" → "3EME", "2ndeA" → "2NDE A", "1reA2" → "1ERE A2", "TleD" → "TLE D" (format des documents officiels)
function titreNiveau(niveau: string): string {
  const label = NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveau)?.label ?? niveau
  return label.replace(/^(\d)e\b/, '$1EME').replace(/^1re\b/, '1ERE').toUpperCase()
}

function construireDocuments(data: EmploiDuTempsData, type: TypeDoc): Document[] {
  if (type === 'classe') {
    return data.classeOptions.map((c) => {
      const pp = data.classesDetails.find((d) => d.niveau === c.niveau && d.section === c.section)?.professeur_principal
      return {
        key: c.key,
        titre: `EMPLOI DU TEMPS CLASSE : ${titreNiveau(c.niveau)} ${c.section}`,
        sousTitre: pp ? `PROFESSEUR PRINCIPAL : ${pp.toUpperCase()}` : null,
        cycles: [c.cycle],
        seances: data.seances.filter((s) => s.niveau === c.niveau && s.section === c.section),
        type,
      }
    })
  }
  if (type === 'professeur') {
    return [...data.professeurIdsParNom.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nom, ids]) => {
        const idSet = new Set(ids)
        const fiches = data.professeurs.filter((p) => idSet.has(p.id))
        const cycles = new Set<Cycle>()
        for (const p of fiches) for (const code of p.niveaux) cycles.add(cycleForNiveau(code.split('-')[0]))
        return {
          key: nom,
          titre: `EMPLOI DU TEMPS PROFESSEUR : ${nom.toUpperCase()}`,
          sousTitre: `DISCIPLINE${fiches.length > 1 ? 'S' : ''} : ${[...new Set(fiches.map((f) => f.matiere))].join(', ').toUpperCase()}`,
          cycles: [...cycles].sort(),
          seances: data.seances.filter((s) => idSet.has(s.professeur_id)),
          type,
        }
      })
  }
  return data.salles.map((salle) => ({
    key: salle.id,
    titre: `OCCUPATION DE LA SALLE : ${salle.nom.toUpperCase()}`,
    sousTitre: null,
    cycles: ['college', 'lycee'].filter((cycle) => data.contraintes.some((c) => c.cycle === cycle)) as Cycle[],
    seances: data.seances.filter((s) => s.salle_id === salle.id),
    type,
  }))
}

// Créneaux occupés (une séance de tandem ou de tronc commun ne compte qu'une fois)
function nbHeures(doc: Document): number {
  return new Set(doc.seances.map((s) => `${s.jour}|${s.creneau_id}`)).size
}

// Texte d'une case, ligne par ligne (matière / salle / professeur, ou classe / matière / salle).
function lignesCase(seances: SeanceRow[], doc: Document, data: EmploiDuTempsData): string[][] {
  return seances.map((s) => {
    const salle = s.salle_id ? data.salleNomById[s.salle_id] : ''
    const prof = data.profNameById[s.professeur_id] ?? ''
    const autres = s.groupe_seance
      ? [...new Set(data.seances.filter((o) => o.groupe_seance === s.groupe_seance && (o.niveau !== s.niveau || o.section !== s.section)).map((o) => classeLabel(o.niveau, o.section)))]
      : []
    if (doc.type === 'classe') return [s.matiere.toUpperCase(), salle, prof].filter(Boolean)
    const classe = [classeLabel(s.niveau, s.section), ...autres].join(' + ')
    return doc.type === 'professeur' ? [classe, s.matiere, salle].filter(Boolean) : [classe, s.matiere, prof].filter(Boolean)
  })
}

function EnTete({ etablissement }: { etablissement: Tables<'etablissements'> | null }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6 text-center text-[10px] leading-snug">
      <div className="max-w-[48%]">
        {etablissement?.ministere && <div className="font-bold uppercase">{etablissement.ministere}</div>}
        {etablissement?.drena && (
          <>
            <div>---------------</div>
            <div className="font-bold uppercase">{etablissement.drena}</div>
            <div>---------------</div>
          </>
        )}
        <div className="mt-1 font-bold uppercase">{etablissement?.name}</div>
        {etablissement?.adresse && <div className="font-bold">{etablissement.adresse}</div>}
        {etablissement?.telephone && <div className="font-bold">Tél : {etablissement.telephone}</div>}
        {etablissement?.email && <div className="font-bold">Email : {etablissement.email}</div>}
      </div>
      <div className="max-w-[45%]">
        <div className="font-bold">REPUBLIQUE DE COTE D'IVOIRE</div>
        <div className="italic">Union - Discipline - Travail</div>
        <div>---------------</div>
        <div className="mt-6 font-bold">Année Scolaire : {anneeScolaire(etablissement?.annee_scolaire)}</div>
        {(etablissement?.code_etablissement || etablissement?.statut) && (
          <div className="mt-2">
            {etablissement?.code_etablissement && (
              <>
                Code : <strong>{etablissement.code_etablissement}</strong>
              </>
            )}
            {etablissement?.statut && (
              <>
                {'  '}Statut : <strong>{etablissement.statut}</strong>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PageDocument({ doc, data, etablissement }: { doc: Document; data: EmploiDuTempsData; etablissement: Tables<'etablissements'> | null }) {
  const lignes = construireLignes(data.creneaux, doc.cycles)
  const jours = joursActifs(data.contraintes, doc.cycles)
  return (
    <section className="page-impression mx-auto mb-10 w-full max-w-[800px] bg-white p-8 text-black shadow print:mb-0 print:max-w-none print:p-0 print:shadow-none">
      <EnTete etablissement={etablissement} />
      <h2 className="mx-auto mb-4 w-fit border border-black px-6 py-1.5 text-center text-base font-bold">{doc.titre}</h2>
      {doc.sousTitre && <p className="mb-1 text-xs font-bold">{doc.sousTitre}</p>}
      <p className="mb-3 text-xs">
        <strong>{doc.type === 'classe' ? 'NOMBRE HEURES DE COURS PAR SEMAINE' : "NOMBRE D'HEURES PAR SEMAINE"} =</strong> {nbHeures(doc)}H
      </p>
      <table className="w-full table-fixed border-collapse border border-black text-[10px]">
        <thead>
          <tr className="bg-[#d9d9d9]">
            <th className="w-[90px] border border-black px-1 py-1">HORAIRES</th>
            {jours.map((j) => (
              <th key={j.key} className="border border-black px-1 py-1 uppercase">
                {j.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.key}>
              <td className={cn('border border-black px-1 text-center', ligne.type === 'cours' ? 'h-[44px]' : 'bg-[#d9d9d9] py-0.5')}>
                {formatHeure(ligne.heureDebut)} - {formatHeure(ligne.heureFin)}
              </td>
              {ligne.type !== 'cours' ? (
                <td colSpan={jours.length} className="border border-black bg-[#d9d9d9] py-0.5 text-center font-bold">
                  {libellePause(ligne.type)}
                </td>
              ) : (
                jours.map((j) => {
                  if (estVieScolaire(j.key, ligne, data.contraintes, data.creneaux, doc.cycles)) {
                    return (
                      <td key={j.key} className="border border-black text-center font-bold text-[#555]">
                        VIE SCOLAIRE
                      </td>
                    )
                  }
                  const contenu = lignesCase(seancesDeCase(doc.seances, j.key, ligne), doc, data)
                  return (
                    <td key={j.key} className="border border-black px-0.5 text-center align-middle leading-tight">
                      {contenu.map((texte, i) => (
                        <div key={i} className={i > 0 ? 'mt-0.5 border-t border-dashed border-black/30 pt-0.5' : undefined}>
                          <div className="font-bold">{texte[0]}</div>
                          {texte[1] && <div className="font-bold text-[#3d8b3d]">{texte[1]}</div>}
                          {texte[2] && <div className="text-[9px] font-semibold text-[#d9822b]">{texte[2]}</div>}
                        </div>
                      ))}
                    </td>
                  )
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {etablissement?.signataire_nom && (
        <div className="mt-10 text-right text-xs">
          <div className="font-bold">{etablissement.signataire_nom}</div>
          {etablissement.signataire_titre && <div>{etablissement.signataire_titre}</div>}
        </div>
      )}
    </section>
  )
}

function nomFeuille(titre: string, deja: Set<string>): string {
  const base = titre.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Feuille'
  let nom = base
  let i = 2
  while (deja.has(nom)) nom = `${base.slice(0, 28)} ${i++}`
  deja.add(nom)
  return nom
}

async function exporterExcel(docs: Document[], data: EmploiDuTempsData, etablissement: Tables<'etablissements'> | null) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const noms = new Set<string>()
  for (const doc of docs) {
    const lignes = construireLignes(data.creneaux, doc.cycles)
    const jours = joursActifs(data.contraintes, doc.cycles)
    const aoa: string[][] = [
      [etablissement?.name ?? ''],
      [`Année scolaire : ${anneeScolaire(etablissement?.annee_scolaire)}`],
      [doc.titre],
      ...(doc.sousTitre ? [[doc.sousTitre]] : []),
      [`Nombre d'heures par semaine = ${nbHeures(doc)}H`],
      [],
      ['HORAIRES', ...jours.map((j) => j.label.toUpperCase())],
    ]
    const debutTableau = aoa.length
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []
    for (const ligne of lignes) {
      const horaire = `${formatHeure(ligne.heureDebut)} - ${formatHeure(ligne.heureFin)}`
      if (ligne.type !== 'cours') {
        merges.push({ s: { r: aoa.length, c: 1 }, e: { r: aoa.length, c: jours.length } })
        aoa.push([horaire, libellePause(ligne.type), ...jours.slice(1).map(() => '')])
        continue
      }
      aoa.push([
        horaire,
        ...jours.map((j) =>
          estVieScolaire(j.key, ligne, data.contraintes, data.creneaux, doc.cycles)
            ? 'VIE SCOLAIRE'
            : lignesCase(seancesDeCase(doc.seances, j.key, ligne), doc, data)
                .map((t) => t.join('\n'))
                .join('\n— — —\n'),
        ),
      ])
    }
    if (etablissement?.signataire_nom) aoa.push([], ['', ...jours.slice(0, -1).map(() => ''), `${etablissement.signataire_nom}${etablissement.signataire_titre ? ` — ${etablissement.signataire_titre}` : ''}`])
    const feuille = XLSX.utils.aoa_to_sheet(aoa)
    feuille['!merges'] = merges
    feuille['!cols'] = [{ wch: 14 }, ...jours.map(() => ({ wch: 22 }))]
    feuille['!rows'] = aoa.map((_, i) => (i > debutTableau && i < debutTableau + lignes.length + 1 ? { hpt: 48 } : {}))
    XLSX.utils.book_append_sheet(wb, feuille, nomFeuille(doc.titre.split(':').pop() ?? doc.key, noms))
  }
  const type = docs[0]?.type ?? 'classe'
  XLSX.writeFile(wb, `Emplois_du_temps_${type === 'classe' ? 'classes' : type === 'professeur' ? 'professeurs' : 'salles'}.xlsx`)
}

export function Impression() {
  const [params] = useSearchParams()
  const { etablissementId, etablissement } = useEtablissement()
  const { data } = useEmploiDuTempsData(etablissementId)
  const [type, setType] = useState<TypeDoc>((params.get('type') as TypeDoc) || 'classe')
  const [selection, setSelection] = useState<Set<string> | null>(() => (params.get('cle') ? new Set([params.get('cle')!]) : null))

  const documents = useMemo(() => (data ? construireDocuments(data, type) : []), [data, type])
  const choisis = documents.filter((d) => (selection ? selection.has(d.key) : true))

  function changerType(next: TypeDoc) {
    setType(next)
    setSelection(null)
  }

  function basculer(key: string) {
    setSelection((current) => {
      const base = current ?? new Set(documents.map((d) => d.key))
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white">
      <AppHeader />
      <main className="mx-auto max-w-6xl p-8 print:p-0">
        <div className="no-print">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Impression & export</div>
          <h1 className="mb-2 font-serif text-3xl font-semibold">Emplois du temps à diffuser</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Une page A4 par emploi du temps, avec l'en-tête officiel de l'établissement (Paramètres &gt; Établissement).
            « Imprimer » ouvre la fenêtre d'impression du navigateur : choisis « Enregistrer au format PDF » pour obtenir
            un fichier PDF.
          </p>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
              {(
                [
                  { key: 'classe', label: 'Classes' },
                  { key: 'professeur', label: 'Professeurs' },
                  ...(data && data.salles.length > 0 ? [{ key: 'salle', label: 'Salles' }] : []),
                ] as { key: TypeDoc; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => changerType(tab.key)}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                    type === tab.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.print()} disabled={choisis.length === 0}>
                <Printer className="mr-1 h-4 w-4" /> Imprimer / PDF ({choisis.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => data && exporterExcel(choisis, data, etablissement)} disabled={choisis.length === 0}>
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Exporter en Excel
              </Button>
            </div>
          </div>

          <div className="mb-8 rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex gap-4 text-xs font-semibold">
              <button type="button" className="text-primary hover:underline" onClick={() => setSelection(null)}>
                Tout sélectionner
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setSelection(new Set())}>
                Tout désélectionner
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {documents.map((d) => {
                const actif = selection ? selection.has(d.key) : true
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => basculer(d.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      actif ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {d.titre.split(': ').pop()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {data && choisis.map((doc) => <PageDocument key={doc.key} doc={doc} data={data} etablissement={etablissement} />)}
        {data && data.seances.length === 0 && (
          <p className="no-print text-sm text-muted-foreground">Aucune séance générée pour l'instant — lance la génération depuis le Dashboard.</p>
        )}
      </main>
    </div>
  )
}
