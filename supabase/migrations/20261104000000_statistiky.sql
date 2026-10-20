-- Statistiky studentů (Výuka → Statistiky): vyučující a admin vidí odevzdávání
-- a hodnocení celé školy. Funkce vrací jen surová data (zveřejněné úkoly od
-- zadaného data a práce k nim); přehledy počítá aplikace (src/lib/stats.ts).

create or replace function public.stats_work(since timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Statistiky vidí jen vyučující a admin.';
  end if;
  return jsonb_build_object(
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'activity', a.activity_id, 'title', a.title, 'due', a.due_at,
        'max', a.max_points, 'created', a.created_at, 'team', a.team_work
      ) order by coalesce(a.due_at, a.created_at))
      from public.assignments a
      where a.kind = 'ukol'
        and (a.publish_at is null or a.publish_at <= now())
        and coalesce(a.due_at, a.created_at) >= since
    ), '[]'::jsonb),
    'work', coalesce((
      select jsonb_agg(jsonb_build_object(
        'a', w.assignment_id, 's', w.student_id, 'st', w.status, 'at', w.submitted_at,
        'r', w.result, 'p', w.points, 'ra', w.reviewed_at, 'rt', w.returned
      ))
      from (
        select coalesce(s.assignment_id, r.assignment_id) as assignment_id,
               coalesce(s.student_id, r.student_id) as student_id,
               s.status, s.submitted_at, r.result, r.points, r.reviewed_at,
               exists (
                 select 1 from public.review_returns x
                 where x.assignment_id = coalesce(s.assignment_id, r.assignment_id)
                   and x.student_id = coalesce(s.student_id, r.student_id)
               ) as returned
        from public.submissions s
        full join public.reviews r on r.assignment_id = s.assignment_id and r.student_id = s.student_id
      ) w
      join public.assignments a on a.id = w.assignment_id
      where a.kind = 'ukol'
        and (a.publish_at is null or a.publish_at <= now())
        and coalesce(a.due_at, a.created_at) >= since
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.stats_work(timestamptz) from public, anon;
grant execute on function public.stats_work(timestamptz) to authenticated;
