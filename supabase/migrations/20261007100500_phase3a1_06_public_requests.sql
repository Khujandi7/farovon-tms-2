-- Phase 3A.1 · M19: внешние заявки руководителей без аккаунтов TMS.
-- Анонимный пользователь НЕ получает доступа к таблицам: форма вызывает серверное действие, которое под service_role вызывает
-- только две функции ниже (проверка токена, лимиты, валидация, создание заявки). Токены хранятся в request_links и привязаны к подразделению по id.

alter table training_requests
  add column submitted_via text not null default 'INTERNAL' check (submitted_via in ('INTERNAL','PUBLIC')),
  add column request_link_id uuid,
  add column contact text;

create table request_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (length(token) >= 32),
  scope text not null check (scope in ('GENERAL','DEPARTMENT')),
  org_unit_id bigint references org_units(id),
  label text not null check (length(trim(label)) > 0),
  is_active boolean not null default true,
  expires_at timestamptz,
  uses_count integer not null default 0,
  last_used_at timestamptz,
  replaced_by uuid references request_links(id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  disabled_at timestamptz,
  constraint request_links_scope_ok check ((scope = 'DEPARTMENT') = (org_unit_id is not null))
);
create index request_links_org_unit_idx on request_links (org_unit_id);
create index request_links_replaced_by_idx on request_links (replaced_by);
create index request_links_created_by_idx on request_links (created_by);
alter table training_requests add constraint training_requests_link_fk foreign key (request_link_id) references request_links(id);
create index training_requests_link_idx on training_requests (request_link_id);

create table public_request_attempts (
  id bigint generated always as identity primary key,
  link_id uuid references request_links(id),
  client_hash text not null,
  at timestamptz not null default now(),
  outcome text not null
);
create index public_request_attempts_at_idx on public_request_attempts (at);
create index public_request_attempts_client_idx on public_request_attempts (client_hash, at);
create index public_request_attempts_link_idx on public_request_attempts (link_id, at);

create trigger audit_request_links after insert or update or delete on request_links for each row execute function trg_audit();
alter table request_links enable row level security;
alter table public_request_attempts enable row level security;   -- политик нет: доступ только у service_role
call grant_table('request_links', array['ADMIN']::app_role[], array['ADMIN']::app_role[]);
revoke all on public_request_attempts from authenticated, anon;

-- ---------- Управление ссылками (ADMIN) ----------
create function create_request_link(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_unit bigint := nullif(p->>'org_unit_id','')::bigint;
begin
  perform req_role('{ADMIN}'::app_role[]);
  if length(trim(coalesce(p->>'label',''))) = 0 then raise exception 'Укажите название ссылки' using errcode = 'P0015'; end if;
  if v_unit is not null and not exists (select 1 from org_units where id = v_unit and level = 'DEPARTMENT' and is_active) then
    raise exception 'Ссылку можно привязать только к действующему департаменту' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Ссылка для заявок'), true);
  insert into request_links(token, scope, org_unit_id, label, expires_at)
  values (encode(gen_random_bytes(24), 'hex'), case when v_unit is null then 'GENERAL' else 'DEPARTMENT' end, v_unit,
          trim(p->>'label'), nullif(p->>'expires_at','')::timestamptz)
  returning id into v_id;
  return v_id;
end $$;

create function set_request_link_active(p_id uuid, p_active boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update request_links set is_active = p_active, disabled_at = case when p_active then null else now() end where id = p_id;
  if not found then raise exception 'Ссылка не найдена' using errcode = 'P0015'; end if;
end $$;

-- Перевыпуск: старая ссылка отключается (история и счётчики сохраняются), создаётся новая с тем же подразделением
create function regenerate_request_link(p_id uuid, p_reason text) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare o request_links%rowtype; v_new uuid;
begin
  perform req_role('{ADMIN}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select * into o from request_links where id = p_id for update;
  if not found then raise exception 'Ссылка не найдена' using errcode = 'P0015'; end if;
  insert into request_links(token, scope, org_unit_id, label, expires_at)
  values (encode(gen_random_bytes(24), 'hex'), o.scope, o.org_unit_id, o.label, o.expires_at) returning id into v_new;
  update request_links set is_active = false, disabled_at = now(), replaced_by = v_new where id = p_id;
  return v_new;
end $$;

-- Общая форма /request (без токена): включается и выключается ADMIN
create function set_public_request_open(p_open boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  insert into app_settings(key, value, description) values ('public_request_open', case when p_open then 'true' else 'false' end,
    'Открыта ли общая форма заявок /request без токена')
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ---------- Публичный вход (только service_role) ----------
create function public_request_options(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare l request_links%rowtype; v_open boolean;
begin
  if p_token is null or p_token = '' then
    select coalesce((select value = 'true' from app_settings where key = 'public_request_open'), false) into v_open;
    if not v_open then return null; end if;
    return jsonb_build_object('mode', 'GENERAL', 'label', 'Заявка на обучение',
      'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name,
         'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name), '[]'::jsonb)
                     from org_units u where u.parent_id = d.id and u.is_active)) order by d.name), '[]'::jsonb)
                       from org_units d where d.level = 'DEPARTMENT' and d.is_active));
  end if;
  select * into l from request_links where token = p_token;
  if not found or not l.is_active or (l.expires_at is not null and l.expires_at < now()) then return null; end if;
  if l.scope = 'DEPARTMENT' and not exists (select 1 from org_units where id = l.org_unit_id and is_active) then return null; end if;
  return jsonb_build_object('mode', l.scope, 'label', l.label,
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name,
       'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name), '[]'::jsonb)
                   from org_units u where u.parent_id = d.id and u.is_active)) order by d.name), '[]'::jsonb)
                     from org_units d where d.level = 'DEPARTMENT' and d.is_active and (l.scope = 'GENERAL' or d.id = l.org_unit_id)));
end $$;

create function submit_public_request(p_token text, p jsonb, p_client text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare l request_links%rowtype; v_dept bigint := nullif(p->>'department_id','')::bigint; v_unit bigint := nullif(p->>'unit_id','')::bigint;
        v_year smallint := extract(year from current_date)::smallint; v_code text; v_id uuid; v_n integer;
        v_topic text := trim(coalesce(p->>'topic','')); v_name text := trim(coalesce(p->>'requester_name','')); v_cnt integer;
        v_fmt text := nullif(p->>'format','');
begin
  if length(coalesce(p_client,'')) < 8 then raise exception 'Недопустимый запрос' using errcode = 'P0015'; end if;
  delete from public_request_attempts where at < now() - interval '7 days';
  if p_token is not null and p_token <> '' then
    select * into l from request_links where token = p_token;
    if not found or not l.is_active or (l.expires_at is not null and l.expires_at < now()) then
      raise exception 'Ссылка недействительна' using errcode = 'P0018'; end if;
    if l.scope = 'DEPARTMENT' then v_dept := l.org_unit_id; end if;
  elsif not coalesce((select value = 'true' from app_settings where key = 'public_request_open'), false) then
    raise exception 'Приём заявок закрыт' using errcode = 'P0018';
  end if;
  -- ограничение частоты: 5 заявок в час с одного клиента, 30 в час на ссылку, 300 в сутки на общую форму
  select count(*) into v_cnt from public_request_attempts where client_hash = p_client and at > now() - interval '1 hour' and outcome = 'OK';
  if v_cnt >= 5 then insert into public_request_attempts(link_id, client_hash, outcome) values (l.id, p_client, 'RATE_CLIENT');
    raise exception 'Слишком много заявок. Попробуйте позже.' using errcode = 'P0019'; end if;
  select count(*) into v_cnt from public_request_attempts where coalesce(link_id, '00000000-0000-0000-0000-000000000000') = coalesce(l.id, '00000000-0000-0000-0000-000000000000')
     and at > now() - interval '1 hour' and outcome = 'OK';
  if v_cnt >= 30 then insert into public_request_attempts(link_id, client_hash, outcome) values (l.id, p_client, 'RATE_LINK');
    raise exception 'Слишком много заявок. Попробуйте позже.' using errcode = 'P0019'; end if;
  -- валидация
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Укажите ФИО инициатора' using errcode = 'P0015'; end if;
  if length(v_topic) < 5 or length(v_topic) > 300 then raise exception 'Укажите тему (от 5 символов)' using errcode = 'P0015'; end if;
  if length(trim(coalesce(p->>'goal',''))) < 5 or length(p->>'goal') > 2000 then raise exception 'Опишите цель обучения' using errcode = 'P0015'; end if;
  if v_dept is null or not exists (select 1 from org_units where id = v_dept and level = 'DEPARTMENT' and is_active) then
    raise exception 'Выберите подразделение' using errcode = 'P0015'; end if;
  if v_unit is not null and not exists (select 1 from org_units where id = v_unit and parent_id = v_dept and is_active) then
    raise exception 'Отдел не относится к выбранному подразделению' using errcode = 'P0015'; end if;
  v_n := nullif(p->>'participants_planned','')::integer;
  if v_n is null or v_n < 1 or v_n > 1000 then raise exception 'Количество участников: от 1 до 1000' using errcode = 'P0015'; end if;
  if v_fmt is not null and v_fmt not in ('ONLINE','OFFLINE','BLENDED') then raise exception 'Недопустимый формат' using errcode = 'P0015'; end if;
  if length(coalesce(p->>'comment','')) > 2000 or length(coalesce(p->>'period','')) > 200 or length(coalesce(p->>'direction','')) > 200
     or length(coalesce(p->>'contact','')) > 200 then raise exception 'Слишком длинное значение' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Заявка через публичную форму', true);
  v_code := next_request_code(v_year);
  insert into training_requests(canonical_id, plan_year, request_date, department_id, unit_id, requester_raw, topic, direction, goal,
        participants_planned, format, period_raw, status, comment, contact, submitted_via, request_link_id)
  values (v_code, v_year, current_date, v_dept, v_unit, v_name, v_topic, nullif(trim(coalesce(p->>'direction','')), ''), trim(p->>'goal'),
          v_n, v_fmt::training_format, nullif(trim(coalesce(p->>'period','')), ''), 'NEW', nullif(trim(coalesce(p->>'comment','')), ''),
          nullif(trim(coalesce(p->>'contact','')), ''), 'PUBLIC', l.id)
  returning id into v_id;
  insert into public_request_attempts(link_id, client_hash, outcome) values (l.id, p_client, 'OK');
  if l.id is not null then update request_links set uses_count = uses_count + 1, last_used_at = now() where id = l.id; end if;
  return jsonb_build_object('code', v_code);
end $$;

revoke execute on function create_request_link(jsonb, text), set_request_link_active(uuid, boolean, text), regenerate_request_link(uuid, text),
  set_public_request_open(boolean, text) from public, anon;
grant execute on function create_request_link(jsonb, text), set_request_link_active(uuid, boolean, text), regenerate_request_link(uuid, text),
  set_public_request_open(boolean, text) to authenticated;
revoke execute on function public_request_options(text), submit_public_request(text, jsonb, text) from public, anon, authenticated;
grant execute on function public_request_options(text), submit_public_request(text, jsonb, text) to service_role;
