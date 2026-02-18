DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_ingredients;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;
