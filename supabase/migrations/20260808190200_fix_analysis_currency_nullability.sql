-- An observation may identify the currency context without identifying a money
-- amount (for example, an EMI question). The persisted money pair stays atomic:
-- store currency only when a deterministic minor-unit amount exists.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.persist_analysis_result(uuid, jsonb, jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    $search$nullif(v_observation ->> 'amountMinor', '')::bigint, nullif(v_observation ->> 'currency', ''),$search$,
    $replace$nullif(v_observation ->> 'amountMinor', '')::bigint, case when nullif(v_observation ->> 'amountMinor', '') is null then null else nullif(v_observation ->> 'currency', '') end,$replace$
  );
  execute v_definition;
end;
$$;
