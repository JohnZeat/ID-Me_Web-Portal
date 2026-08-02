-- Nullable so existing staff rows (created manually before this feature)
-- aren't broken; new invites require it at the application layer.
alter table staff add column full_name text;
