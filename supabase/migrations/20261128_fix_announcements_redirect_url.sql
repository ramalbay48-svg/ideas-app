-- IDEAS APP: ensure banner destination links are supported by announcements.
begin;

alter table public.announcements
  add column if not exists redirect_url text;

comment on column public.announcements.redirect_url is
  'Optional HTTP or HTTPS destination opened when a customer taps a banner.';

notify pgrst, 'reload schema';

commit;
