-- Když učitel zruší celý pátek (nebo jeden blok), jeho konzultace v té době
-- se zruší a účastníci dostanou oznámení; z cizích konzultací, kam je
-- pozvaný, se odebere.

create function public.after_consultation_block() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.consultations;
  people uuid[];
begin
  for c in
    select * from public.consultations x
    where x.teacher_id = new.teacher_id and x.day = new.day
      and (new.slot is null or (x.starts_at <= new.slot and new.slot < x.ends_at))
  loop
    select array[c.student_id] || coalesce(array_agg(g.user_id), '{}') into people
    from public.consultation_guests g where g.consultation_id = c.id;
    delete from public.consultations where id = c.id;
    perform public.notify(
      people, 'konzultace', 'Konzultace zrušena',
      public.consultation_label(c.day, c.starts_at, c.ends_at) || ' · ' || public.profile_name(c.teacher_id) || ' v tu dobu nemůže', '/konzultace'
    );
  end loop;
  delete from public.consultation_guests g
  using public.consultations x
  where g.consultation_id = x.id and g.user_id = new.teacher_id and x.day = new.day
    and (new.slot is null or (x.starts_at <= new.slot and new.slot < x.ends_at));
  return null;
end;
$$;
create trigger consultation_block_cancels after insert on public.consultation_blocks
  for each row execute function public.after_consultation_block();
revoke execute on function public.after_consultation_block from public, anon, authenticated;
