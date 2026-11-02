# Criador de Apostilas: site próprio com venda

Endereço do site: https://leofranper37.github.io/apostilas/

Sem configuração (`config.js` vazio), o app abre para qualquer pessoa e só funciona o modo **Semiautomático**.
Com o Supabase configurado, o app pede login, só libera para quem comprou e o modo **Automático** passa a gastar créditos.

## 1. Publicar o site (uma vez)
GitHub > repositório `apostilas` > **Settings > Pages** > Branch **main**, pasta **/(root)** > **Save**.

## 2. Criar o banco no Supabase
1. Crie um projeto em https://supabase.com (pode ser o plano grátis).
2. **SQL Editor > New query**: cole todo o arquivo `supabase/schema.sql` e clique em **Run**.
3. **Authentication > URL Configuration**:
   - Site URL: `https://leofranper37.github.io/apostilas/`
   - Redirect URLs: adicione `https://leofranper37.github.io/apostilas/`
4. **Authentication > Emails > Magic Link**: troque o texto para português, se quiser.
   O plano grátis manda poucos e-mails por hora. Para vender de verdade, configure um SMTP próprio, como Resend ou Brevo, em **Authentication > Emails > SMTP Settings**.

## 3. Ligar a IA (modo automático)
1. Crie uma chave de API em https://console.anthropic.com e coloque crédito nela. Você paga pelo uso.
2. No Supabase: **Edge Functions > Secrets**, adicione:
   - `ANTHROPIC_API_KEY` = sua chave
   - `WEBHOOK_CHAVE` = uma senha longa inventada por você (ex.: `apostilas-8f3k29dk1lq`)
3. Publique as funções. No terminal, dentro desta pasta:
   ```
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase functions deploy gerar
   npx supabase functions deploy compra --no-verify-jwt
   ```

## 4. Ligar o app ao Supabase
Edite o `config.js` com a URL e a **anon public key** (em **Project Settings > API**) e o link da página de venda.
Depois envie a mudança para o GitHub (git add, commit, push).

## 5. Kiwify ou Hotmart
Crie o produto "acesso vitalício" e cadastre o webhook:
`https://SEU_PROJECT_REF.supabase.co/functions/v1/compra?chave=SUA_WEBHOOK_CHAVE`
- **Kiwify**: Apps > Webhooks > eventos "Compra aprovada", "Reembolso" e "Chargeback".
- **Hotmart**: Ferramentas > Webhook (versão 2.0) > eventos de compra aprovada, completa, reembolsada, chargeback e cancelada.
  Para conferir o hottok, salve-o no secret `HOTMART_HOTTOK`.

Cada compra aprovada libera o acesso e dá **30 créditos**. Para mudar, edite a linha `creditos_por_compra` na tabela `ajustes`.
Para vender pacotes de créditos extras, crie outro produto e salve o id dele no secret `PRODUTO_CREDITOS`.
A quantidade de créditos do pacote vai no secret `CREDITOS_PACOTE` (padrão 20).

## Administrar
No Supabase, **Table Editor > clientes** mostra quem entrou, os créditos e o uso.
Nessa tabela você também pode dar créditos (`creditos`) ou bloquear alguém (`ativo` = false).
Para liberar alguém sem compra, como cortesia, crie uma linha em `compras` com o e-mail, `ativo` = true e os créditos.
Se a pessoa já tiver conta, mude a linha dela em `clientes`.

## Custo da IA
O padrão é o modelo `claude-opus-5-5` com esforço `low`, para responder rápido dentro do limite de tempo da função.
Para trocar, crie os secrets `ANTHROPIC_MODEL` (ex.: `claude-sonnet-5-5`, que é mais barato) e `ANTHROPIC_EFFORT`.
Acompanhe os gastos em console.anthropic.com e defina o preço dos créditos para cobrir esse custo.
