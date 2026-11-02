-- Criador de Apostilas: clientes, compras e créditos.
-- Cole tudo no Supabase > SQL Editor > New query e clique em Run. Pode rodar de novo sem problema.

-- Quanto cada compra aprovada dá de créditos do modo automático (mude se quiser)
create table if not exists public.ajustes (
  chave text primary key,
  valor text not null
);
insert into public.ajustes (chave, valor) values ('creditos_por_compra', '30') on conflict (chave) do nothing;

-- Uma linha por pessoa que entrou no app
create table if not exists public.clientes (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  ativo boolean not null default false,
  creditos integer not null default 0,
  usos_ia integer not null default 0,
  apostilas integer not null default 0,
  pdfs integer not null default 0,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

-- Compras recebidas da Kiwify/Hotmart (vale mesmo antes de a pessoa criar a conta)
create table if not exists public.compras (
  email text primary key,
  ativo boolean not null default true,
  creditos integer not null default 0,
  origem text,
  atualizado_em timestamptz not null default now()
);

-- Pedidos já processados (evita dar crédito duas vezes quando a plataforma reenvia o aviso)
create table if not exists public.pedidos (
  id text primary key,
  email text not null,
  evento text not null,
  recebido_em timestamptz not null default now()
);

alter table public.ajustes enable row level security;
alter table public.clientes enable row level security;
alter table public.compras enable row level security;
alter table public.pedidos enable row level security;

-- Cada pessoa só lê a própria linha; ninguém altera nada pelo app (só pelas funções abaixo)
drop policy if exists "cliente le o proprio" on public.clientes;
create policy "cliente le o proprio" on public.clientes for select to authenticated using (auth.uid() = id);

-- Quando alguém cria a conta, puxa a compra feita com o mesmo e-mail
create or replace function public.novo_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.compras%rowtype;
begin
  select * into c from public.compras where email = lower(new.email);
  insert into public.clientes (id, email, ativo, creditos)
  values (new.id, lower(new.email), coalesce(c.ativo, false), coalesce(c.creditos, 0))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.novo_cliente();

-- Compra aprovada: libera o acesso e soma os créditos (uma vez por pedido)
create or replace function public.registrar_compra(p_email text, p_pedido text, p_origem text, p_creditos integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  p_email := lower(trim(p_email));
  insert into public.pedidos (id, email, evento) values (p_origem || ':' || p_pedido, p_email, 'aprovado')
  on conflict (id) do nothing;
  if not found then return; end if;
  n := coalesce(p_creditos, (select valor::integer from public.ajustes where chave = 'creditos_por_compra'), 0);
  insert into public.compras (email, ativo, creditos, origem) values (p_email, true, n, p_origem)
  on conflict (email) do update set ativo = true, creditos = public.compras.creditos + n, origem = p_origem, atualizado_em = now();
  update public.clientes set ativo = true, creditos = creditos + n where email = p_email;
end $$;

-- Reembolso ou chargeback: bloqueia o acesso
create or replace function public.cancelar_compra(p_email text, p_pedido text, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_email := lower(trim(p_email));
  insert into public.pedidos (id, email, evento) values (p_origem || ':' || p_pedido || ':cancelado', p_email, 'cancelado')
  on conflict (id) do nothing;
  update public.compras set ativo = false, atualizado_em = now() where email = p_email;
  update public.clientes set ativo = false where email = p_email;
end $$;

-- Gasta 1 crédito; devolve quantos sobraram, ou null se não havia crédito
create or replace function public.usar_credito(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare resto integer;
begin
  update public.clientes set creditos = creditos - 1, usos_ia = usos_ia + 1, ultimo_acesso = now()
  where id = p_id and ativo and creditos > 0
  returning creditos into resto;
  return resto;
end $$;

-- Devolve o crédito quando a IA falha
create or replace function public.devolver_credito(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare resto integer;
begin
  update public.clientes set creditos = creditos + 1, usos_ia = greatest(usos_ia - 1, 0)
  where id = p_id returning creditos into resto;
  return resto;
end $$;

-- Contadores que o próprio app atualiza (apostilas criadas, PDFs baixados, último acesso)
create or replace function public.contar_uso(campo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if campo = 'apostilas' then
    update public.clientes set apostilas = apostilas + 1, ultimo_acesso = now() where id = auth.uid();
  elsif campo = 'pdfs' then
    update public.clientes set pdfs = pdfs + 1, ultimo_acesso = now() where id = auth.uid();
  else
    update public.clientes set ultimo_acesso = now() where id = auth.uid();
  end if;
end $$;

-- Só o servidor (service_role) mexe em compras e créditos
revoke execute on function public.registrar_compra(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.cancelar_compra(text, text, text) from public, anon, authenticated;
revoke execute on function public.usar_credito(uuid) from public, anon, authenticated;
revoke execute on function public.devolver_credito(uuid) from public, anon, authenticated;
revoke execute on function public.novo_cliente() from public, anon, authenticated;
revoke execute on function public.contar_uso(text) from public, anon;
grant execute on function public.contar_uso(text) to authenticated;
