import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'

// Établissement de l'utilisateur connecté (en-tête des documents, code d'invitation...) et son rôle.
export function useEtablissement() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null

  const query = useQuery({
    queryKey: ['etablissement', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase.from('etablissements').select('*').eq('id', etablissementId!).single()
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  return {
    etablissementId,
    etablissement: query.data ?? null,
    isAdmin: profile?.role === 'admin',
    isLoading: query.isLoading,
  }
}
