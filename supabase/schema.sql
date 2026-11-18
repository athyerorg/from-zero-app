-- نادي — database for the from-zero reference app.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run twice.

-- 1) Profiles: one row per user, just a name. Users read/write only their own row.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile write" on public.profiles;
create policy "own profile read"  on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2) Memberships: who paid. Only readable by the owner; NEVER writable from the browser
--    (activation happens in demo_activate() today, in the payment webhook later).
create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','cancelled')),
  provider text not null default 'demo',
  reference text,
  paid_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.memberships enable row level security;
drop policy if exists "own membership read" on public.memberships;
create policy "own membership read" on public.memberships for select using (auth.uid() = user_id);

-- 3) Content: the thing people pay for.
create table if not exists public.content (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  title text not null,
  summary text not null default '',
  body text not null default '',
  is_free boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.content enable row level security;

create or replace function public.is_member(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = uid and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

drop policy if exists "free or member can read content" on public.content;
create policy "free or member can read content" on public.content for select
  using (is_free or public.is_member(auth.uid()));

-- Public index (titles only, no body) so the library page can list locked items too.
create or replace view public.content_list as
  select id, position, title, summary, is_free from public.content;
grant select on public.content_list to anon, authenticated;

-- 4) DEMO payment. Replaced by the gateway webhook in stage 9 of the guide.
create or replace function public.demo_activate() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.memberships (user_id, status, provider, reference, paid_at, expires_at)
  values (auth.uid(), 'active', 'demo', 'demo-' || substr(gen_random_uuid()::text, 1, 8), now(), now() + interval '30 days')
  on conflict (user_id) do update
    set status = 'active', provider = 'demo', paid_at = now(), expires_at = now() + interval '30 days';
end $$;

create or replace function public.demo_cancel() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.memberships set status = 'cancelled' where user_id = auth.uid();
end $$;

revoke all on function public.demo_activate() from public;
revoke all on function public.demo_cancel() from public;
grant execute on function public.demo_activate() to authenticated;
grant execute on function public.demo_cancel() to authenticated;

-- 4b) Grants. New projects do not expose tables to the app automatically (that checkbox at
--     project creation). Row Level Security above decides WHICH rows; these decide WHICH tables.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select on public.content to anon, authenticated;

-- 5) Sample content (fictional). Delete and add your own.
insert into public.content (position, title, summary, body, is_free)
select * from (values
  (1, 'كيف تبدأ', 'الفكرة في ثلاث دقايق', 'هذا المحتوى مجاني. تقرأه بدون تسجيل.' || chr(10) || 'الفكرة: تصفّح أول، سجّل لما تحتاج، ادفع لما تقتنع. كل شي بعد هذا الدرس للمشتركين.', true),
  (2, 'الأساس الأول', 'اللي ما يقولونه لك في البداية', 'هذا محتوى للمشتركين.' || chr(10) || 'لو تقرأه، معناه الاشتراك شغّال وقاعدة البيانات تفرّق بين المشترك وغيره.', false),
  (3, 'الأساس الثاني', 'خطوة عملية تطبّقها اليوم', 'محتوى مدفوع رقم اثنين.' || chr(10) || 'هنا يحط صاحب التطبيق المادة الحقيقية: درس، قالب، ملف، أو فيديو.', false),
  (4, 'التطبيق', 'نجمع كل شي في مثال', 'محتوى مدفوع رقم ثلاثة.' || chr(10) || 'والمكتبة تكبر من لوحة Supabase بدون كود: صف جديد في جدول content.', false)
) as v(position, title, summary, body, is_free)
where not exists (select 1 from public.content);
