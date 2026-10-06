-- Logo de l'établissement, imprimé dans l'en-tête des emplois du temps (Paramètres > Établissement).
-- Stocké en data URL (image PNG/JPEG redimensionnée côté navigateur), plafonné à ~700 Ko.

alter table public.etablissements
  add column if not exists logo text;

alter table public.etablissements
  drop constraint if exists etablissements_logo_taille;
alter table public.etablissements
  add constraint etablissements_logo_taille
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 700000));

-- Modifiable par un admin, comme les autres champs de l'en-tête (la policy de modification limite déjà
-- à son propre établissement).
grant update (logo) on public.etablissements to authenticated;
