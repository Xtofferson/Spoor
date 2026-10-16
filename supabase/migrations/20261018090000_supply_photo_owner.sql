-- A place's photo must be the one its owner uploaded for it ('<user id>/<point id>.jpg'), so
-- nobody can point their place at someone else's photo. Clear any photo that doesn't match
-- first, so the check can be added.
update public.supply_points
set photo_path = null
where photo_path is not null
  and photo_path <> created_by::text || '/' || id::text || '.jpg';

alter table public.supply_points
  add constraint supply_points_photo_path_owner
  check (photo_path is null or photo_path = created_by::text || '/' || id::text || '.jpg');
