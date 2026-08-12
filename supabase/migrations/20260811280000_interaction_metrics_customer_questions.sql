-- Customer question count on the interaction metrics.
--
-- The category playbook treats the questions customers ask on the floor as the
-- clearest signal of where a range confuses people: the most frequent questions
-- are the architecture's failure points. How many were asked in an interaction
-- is therefore a measure in its own right, counted in code from the extracted,
-- evidence-backed questions.

alter table public.interaction_metrics
  add column customer_question_count integer not null default 0;
