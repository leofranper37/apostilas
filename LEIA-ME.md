# Criador de Apostilas (funciona como o app PNCD)

**Página de vendas:** https://criador-apostilas-leo.web.app
**App (login):** https://criador-apostilas-leo.web.app/app/
Também abre em https://leofranper37.github.io/apostilas/ (app em /apostilas/app/)

- O login é feito com **usuário e senha**, que o administrador cria no **Painel admin**.
- O modo **Semiautomático** é grátis e ilimitado para todos os clientes liberados.
- O modo **Automático** gasta 1 crédito por apostila, seção ou ilustração.
- O administrador (usuário `admin`) não gasta créditos.

## Gerador de apostilas (botão "Criar com IA")
Passo a passo em 5 etapas:
1. **Conteúdo**: tipo de apostila, tema, público e objetivo.
2. **Profundidade**: nível (introdutório a completo), modelo das páginas (*Revista de estudo*, *Revista visual* ou *Apostila didática*), quantidade de páginas, idioma e atividades.
3. **Base bíblica / Material de apoio**: passagens (ou "sugerir automaticamente"), a lista de páginas ou lições e o seu esboço ou material (a IA usa como fonte principal, até 5 mil letras por pedido).
4. **Estilo**: estilo de escrita, estilo visual das ilustrações, paleta de cores e personagem com a sua foto.
5. **Gerar**: resumo de tudo e o planejamento das páginas pela IA (ou "Definir manualmente").

No **Planejamento**: mude títulos e instruções, mude a ordem, gere uma página por vez ("Gerar novamente" em cada uma) ou todas de uma vez.
No quadro **Capa, contracapa e imagens**: pedido pronto da imagem da capa (com a sua foto como personagem, se quiser), contracapa escrita pela IA (frase de destaque e texto) e a lista de todas as imagens que faltam, com "Pedir imagem" e "Enviar" em cada uma.
A contracapa é a última folha e também pode ser editada em **Capa e estilo > Contracapa**.
No semiautomático (grátis), o "de uma vez" vai de 4 em 4 páginas, para a resposta da IA não ser cortada. O plano fica salvo junto com a apostila.
Também existe um modelo pronto "Revista de estudo (EBD)" em **Nova**.

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

## Vender créditos
**1 crédito = 1 apostila completa**: o planejamento, todas as páginas, os "gerar novamente" e a contracapa,
até 40 pedidos à IA. O cliente vê o saldo no menu lateral (☰) e o botão **Gerar apostila completa · 1 crédito**.
As imagens continuam grátis, com os prompts para o ChatGPT ou o Gemini.

Para ligar:
1. Faça os 3 passos de "Ligar o modo automático (IA)" acima.
2. Em `app/config.js`:
   - preencha `pix` (chave, nome e cidade). Sem a chave, "Comprar créditos" só abre o seu WhatsApp;
   - confira `pacotes` (quantidade e preço) e `whatsapp` (o número que recebe os comprovantes);
   - mude `modoAutomatico` para `true`.
3. Publique: `firebase deploy --only functions,hosting`.

Quando alguém compra:
1. O cliente escolhe o pacote, paga pelo QR Code ou pelo Pix copia e cola e toca em **Já paguei: enviar comprovante**.
   A mensagem chega no seu WhatsApp com o pacote e o usuário dele.
2. Confira o Pix no app do banco.
3. Abra **Painel admin**, toque em **Créditos** no cliente e use +5, +10 ou +30. O saldo muda na hora na tela dele.

Cada cliente novo ganha `creditosIniciais` créditos de presente para testar (o padrão é 1).
Antes de definir o preço, gere algumas apostilas e veja o custo real em Functions > Registros ("uso da IA") e em console.anthropic.com.

## Publicar uma mudança no app
```
firebase deploy --only hosting
git add -A && git commit -m "atualizar" && git push
```
O primeiro comando atualiza o .web.app. O `git push` atualiza o GitHub Pages.

## Trocar o usuário administrador
O nome `admin` aparece em 3 lugares: `app/config.js` (admins), `firestore.rules` e `functions/index.js` (ADMINS).
Se mudar, mude nos 3 e publique de novo (`firebase deploy`).

## Venda por Pix, Termos e Privacidade
Tudo em `app/config.js`:
- `valor`: preço do acesso vitalício. Com `0` (como está hoje) a página mostra "A combinar" e o botão de compra abre o WhatsApp.
- `pix`: `chave`, `nome` e `cidade` de quem recebe. Com a chave preenchida, o botão **Comprar com Pix** mostra o QR Code e o código copia e cola. Sem a chave, o botão abre o WhatsApp.
- `whatsapp`: número (só dígitos, com 55 e DDD) que recebe os comprovantes.
- `responsavel`: `nome`, `documento` (CPF ou CNPJ) e `email`. Aparecem nos Termos de Uso (`termos.html`) e na Política de Privacidade (`privacidade.html`).

Quando chegar um comprovante: confira o Pix no banco, cadastre o cliente no **Painel admin** e mande o usuário e a senha pelo WhatsApp.
Reembolso (garantia de 7 dias): devolva o Pix e clique em **Bloquear** no painel.
O próprio cliente pode apagar a conta e as apostilas em **Minha conta > Excluir minha conta** (direito previsto na LGPD).

## Contato na página de vendas
Em `app/config.js`, coloque em `contato` o link do seu WhatsApp (ex.: `https://wa.me/5524999999999`). Os botões "Quero acesso" passam a abrir o WhatsApp.
