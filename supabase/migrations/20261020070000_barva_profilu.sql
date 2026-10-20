-- Barva horního pruhu profilu. Každý si ji volí sám v Nastavení.

alter table public.profiles add column banner_color text not null default 'modra'
  check (banner_color in ('modra', 'fialova', 'zluta', 'zelena', 'cervena', 'ruzova'));
comment on column public.profiles.banner_color is 'Barva pruhu v profilu (modra je výchozí).';

grant update (bio, avatar_path, banner_color) on public.profiles to authenticated;
