-- One row per user and body part, also in a table created before
-- 20261028120000 or by hand without the UNIQUE constraint: duplicates are
-- merged into the newest row, and a unique index keeps it that way (the
-- server's upsert, on_conflict=user_id,body_part, relies on it).

delete from public.user_injuries older
  using public.user_injuries newer
  where older.user_id = newer.user_id
    and older.body_part = newer.body_part
    and (older.reported_at, older.id) < (newer.reported_at, newer.id);

create unique index if not exists user_injuries_user_body_part_uidx
  on public.user_injuries (user_id, body_part);
