-- Přílohy v chatech a zprávách nejvýš 10 MB (fotky se v prohlížeči stejně zmenší).
-- Úkoly, materiály, odevzdání a nástěnka zůstávají na 25 MB. Stejné limity hlídá src/lib/upload.ts.
update storage.buckets set file_size_limit = 10485760 where id in ('zpravy', 'chat', 'tymy');
