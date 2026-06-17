ALTER TABLE public.reserves
    ADD COLUMN IF NOT EXISTS external_source text,
    ADD COLUMN IF NOT EXISTS external_uid text,
    ADD COLUMN IF NOT EXISTS external_feed_url text,
    ADD COLUMN IF NOT EXISTS external_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS reserves_external_source_room_uid_idx
    ON public.reserves (external_source, room_id, external_uid);

CREATE INDEX IF NOT EXISTS reserves_external_feed_room_idx
    ON public.reserves (external_source, room_id, external_feed_url)
    WHERE external_source IS NOT NULL;

