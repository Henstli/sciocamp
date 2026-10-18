-- Učitel spravuje své kurzy, ateliéry a další aktivity celé — včetně smazání.
-- (Zakládat a upravovat už mohl.) Pravidla se sčítají: admin dál maže vše
-- podle „admin maže aktivity“, tohle přidává mazání vlastních aktivit vyučujícím.

create policy "vyučující maže své aktivity" on public.activities
  for delete to authenticated
  using (public.is_staff() and teacher_id = (select auth.uid()));
