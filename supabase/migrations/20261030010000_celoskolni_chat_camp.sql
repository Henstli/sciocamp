-- Celoškolní chat se jmenuje „Camp“ (přejmenovat ho jinak nejde, proto na chvíli bez triggeru).
alter table public.conversations disable trigger keep_school_chat;
update public.conversations set title = 'Camp' where is_school;
alter table public.conversations enable trigger keep_school_chat;
