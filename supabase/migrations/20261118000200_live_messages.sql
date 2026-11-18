-- Live message delivery (18 November 2026). Only the messages table is published. Delivery applies the same row level
-- security as reading, so a person only receives rows for chats they may read, and the rows hold encrypted text only.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
