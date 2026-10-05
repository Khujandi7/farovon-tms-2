-- Откат M9 (Phase 2.2). Данные не затрагиваются.
drop trigger profiles_self_protect on profiles;
drop function trg_profiles_self_protect();
