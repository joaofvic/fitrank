-- Permite embed PostgREST: desafio_participantes → profiles
ALTER TABLE public.desafio_participantes
  DROP CONSTRAINT IF EXISTS desafio_participantes_user_id_fkey;

ALTER TABLE public.desafio_participantes
  ADD CONSTRAINT desafio_participantes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
