-- Correct the Phase 3 operational default without changing applied migration history.
-- Every persisted recording must identify one of the two supported capture paths.

alter table public.recordings
  alter column capture_source set default 'existing_upload';

update public.recordings
set capture_source = 'existing_upload'
where capture_source not in ('browser_recording', 'existing_upload');
