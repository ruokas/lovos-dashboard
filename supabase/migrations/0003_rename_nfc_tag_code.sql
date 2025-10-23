-- Supabase migracija: suderiname NFC stulpelio pavadinimą su planu.
-- Jei ankstesnėse versijose buvo naudojamas `tag_uid`, pervadiname į `tag_code`
-- ir atnaujiname unikalų apribojimą.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nfc_tags'
      and column_name = 'tag_uid'
  ) then
    alter table public.nfc_tags rename column tag_uid to tag_code;
  end if;
exception
  when undefined_column then
    null;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'nfc_tags'
      and constraint_name = 'nfc_tags_tag_uid_key'
  ) then
    alter table public.nfc_tags rename constraint nfc_tags_tag_uid_key to nfc_tags_tag_code_key;
  end if;
exception
  when undefined_object then
    null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'nfc_tags'
      and indexname = 'nfc_tags_tag_code_key'
  ) then
    alter table public.nfc_tags
      add constraint nfc_tags_tag_code_key unique (tag_code);
  end if;
exception
  when duplicate_object then
    null;
end $$;
