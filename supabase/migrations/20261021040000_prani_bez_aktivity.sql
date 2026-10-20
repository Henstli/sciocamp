-- Schválená přání, jejichž aktivita byla smazána ještě před triggerem
-- wish_activity_gone, se přepnou na uzavřená (stejně jako by to udělal trigger).
update public.wishes
set status = 'uzavreno', note = 'Vypsaná aktivita byla zrušena.', closed_at = now()
where status = 'vypsano' and activity_id is null;
