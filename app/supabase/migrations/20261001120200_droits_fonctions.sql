-- Resserrement des droits d'exécution signalés par l'audit de sécurité Supabase.
-- `mon_etablissement_id` et `est_admin` ne servent qu'aux règles RLS et à des utilisateurs connectés : inutile
-- de les exposer aux visiteurs non connectés. `rls_auto_enable` est une fonction de trigger d'événement
-- (activation automatique de RLS) qui n'a pas à être appelable via l'API.
revoke execute on function public.mon_etablissement_id() from public, anon;
revoke execute on function public.est_admin() from public, anon;
grant execute on function public.mon_etablissement_id() to authenticated;
grant execute on function public.est_admin() to authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
