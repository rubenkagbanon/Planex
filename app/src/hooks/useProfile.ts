import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}
