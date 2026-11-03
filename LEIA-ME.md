# Criador de Apostilas (funciona como o app PNCD)

**Página de vendas:** https://criador-apostilas-leo.web.app
**App (login):** https://criador-apostilas-leo.web.app/app/
Também abre em https://leofranper37.github.io/apostilas/ (app em /apostilas/app/)

- O login é feito com **usuário e senha**, que o administrador cria no **Painel admin**.
- O modo **Semiautomático** é grátis e ilimitado para todos os clientes liberados.
- O modo **Automático** gasta 1 crédito por apostila, seção ou ilustração.
- O administrador (usuário `admin`) não gasta créditos.

## Ativar (uma vez só), no console do Firebase
Console: https://console.firebase.google.com/project/criador-apostilas-leo

1. **Firestore Database > Criar banco de dados**: escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.
2. **Authentication > Começar > Método de login > E-mail/senha**: ative e salve.
3. Crie sua conta de administrador. No terminal, nesta pasta:
   ```
   node scripts/criar-admin.mjs SUA_SENHA
   firebase deploy --only firestore:rules
   ```
4. Abra o app e entre com o usuário **admin** e a sua senha. Para cadastrar clientes, vá em **Painel admin > Cadastrar cliente**.

## Apostilas salvas na conta e troca de senha
- Tudo o que o cliente edita é salvo sozinho na conta dele (aparece "✓ Salvo na sua conta" no topo).
- Em **Minhas apostilas** ele abre, continua ou exclui as apostilas, em qualquer computador ou celular.
- Ao entrar num aparelho novo, o app já abre a última apostila em que ele mexeu.
- Em **Minha conta > Trocar senha**, o cliente (e o admin) troca a própria senha.
- Só o dono vê as próprias apostilas; nem o admin vê o conteúdo.
- Se um cliente esquecer a senha: por enquanto, cadastre um usuário novo para ele (redefinir a senha de outra pessoa exige o plano Blaze).

## Ligar o modo automático (IA)
1. Mude o projeto para o plano **Blaze**, o mesmo do PNCD (no console, clique em **Fazer upgrade**).
   O Firebase cobra pouco ou nada nesse volume. O que você paga de verdade é a IA.
2. Crie uma chave em https://console.anthropic.com e coloque crédito nela.
3. No terminal, nesta pasta:
   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy --only functions
   ```

O padrão é o modelo `claude-opus-5-5` com esforço `low`, para responder rápido.
Para trocar (por exemplo, para `claude-sonnet-5-5`, que é mais barato), crie o arquivo `functions/.env` com:
```
ANTHROPIC_MODEL=claude-sonnet-5-5
ANTHROPIC_EFFORT=low
```
Depois rode `firebase deploy --only functions` de novo.
Acompanhe os gastos em console.anthropic.com e cobre os créditos de forma a cobrir esse custo.

## Publicar uma mudança no app
```
firebase deploy --only hosting
git add -A && git commit -m "atualizar" && git push
```
O primeiro comando atualiza o .web.app. O `git push` atualiza o GitHub Pages.

## Trocar o usuário administrador
O nome `admin` aparece em 3 lugares: `app/config.js` (admins), `firestore.rules` e `functions/index.js` (ADMINS).
Se mudar, mude nos 3 e publique de novo (`firebase deploy`).

## Contato na página de vendas
Em `app/config.js`, coloque em `contato` o link do seu WhatsApp (ex.: `https://wa.me/5524999999999`). Os botões "Quero acesso" passam a abrir o WhatsApp.
