-- Adiciona campos para controlar visibilidade e legenda do check-in no feed social.
-- feed_visible: se o check-in aparece no feed (default true para manter compatibilidade)
-- feed_caption: legenda personalizada opcional (max 200 chars)

ALTER TABLE public.checkins
  ADD COLUMN feed_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN feed_caption text DEFAULT NULL
    CONSTRAINT checkins_caption_length CHECK (feed_caption IS NULL OR char_length(trim(feed_caption)) <= 200);
