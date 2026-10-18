-- Opětovné odevzdání po vrácení: práce zůstává ve stavu „odevzdáno“, ale
-- po vrácení k doplnění musí nové odevzdání dostat nový čas, aby se
-- vyučujícímu znovu objevila mezi pracemi k opravení.

create or replace function public.stamp_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'odevzdano' then
    if tg_op = 'INSERT' or old.status <> 'odevzdano' then
      new.submitted_at := now();
    elsif exists (
      select 1 from public.reviews r
      where r.assignment_id = new.assignment_id
        and r.student_id = new.student_id
        and r.result = 'vraceno'
        and r.reviewed_at >= coalesce(old.submitted_at, '-infinity'::timestamptz)
    ) then
      -- Znovu odevzdáno po vrácení.
      new.submitted_at := now();
    else
      -- Úpravy odevzdané práce nesmí posunout čas odevzdání.
      new.submitted_at := old.submitted_at;
    end if;
  else
    new.submitted_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_submission from public, anon, authenticated;
