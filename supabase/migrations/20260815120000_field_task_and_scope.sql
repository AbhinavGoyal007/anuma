-- What kind of work a field asks for, and which part of the conversation
-- settles it.
--
-- The extraction spec distinguishes a thing that was said from a judgement made
-- against a rubric, and an opening state from a closing one. Both change how the
-- same sentence is read: a customer's arrival intent cannot be rewritten by what
-- they learned twenty minutes later, or a representative who does good discovery
-- makes their own customer look decided on arrival.
--
-- These live beside the field definition rather than in the prompt, because the
-- field library is per-organization and editable. A business that adds a field
-- has to be able to say what kind of field it is, or their prompt and the static
-- one drift apart silently — which is exactly what the contract test caught.

alter table public.interaction_field_definitions
  add column if not exists task text
    check (task is null or task in ('extract', 'extract_list', 'evaluate', 'classify', 'verified')),
  add column if not exists scope text
    check (scope is null or scope in ('opening', 'closing', 'full')),
  add column if not exists speaker_source text
    check (speaker_source is null or speaker_source in ('customer', 'representative', 'any'));
