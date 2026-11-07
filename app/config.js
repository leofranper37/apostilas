// Configuração do site próprio (Firebase, igual ao app PNCD).
// Estes dados do Firebase são públicos por natureza; a segurança fica nas regras (firestore.rules).
// NUNCA coloque aqui a chave da IA: ela fica guardada como segredo da Cloud Function.
window.APOSTILAS_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyBehgtz9NhAaMbKV8V-nABQArIIww_PL18',
    authDomain: 'criador-apostilas-leo.firebaseapp.com',
    projectId: 'criador-apostilas-leo',
    storageBucket: 'criador-apostilas-leo.firebasestorage.app',
    messagingSenderId: '193105518440',
    appId: '1:193105518440:web:497a7393bfb10c235e40dd'
  },
  regiao: 'southamerica-east1',
  // Usuários administradores (abrem o Painel admin). Se mudar aqui, mude também em firestore.rules e functions/index.js
  admins: ['admin'],
  // Modo automático com IA (pago: precisa do plano Blaze + chave da IA). false = tudo grátis
  // Com true: aparecem o saldo no menu, "Comprar créditos" e o botão "Gerar apostila completa · 1 crédito".
  // Só ligue depois de ativar o servidor (veja LEIA-ME.md > "Vender créditos").
  modoAutomatico: true,
  creditosIniciais: 1,      // créditos de presente ao cadastrar um cliente (só com modoAutomatico)

  // Pacotes de créditos à venda: 1 crédito = 1 página gerada pela IA (texto ou página ilustrada).
  // O planejamento e a contracapa não gastam créditos.
  pacotes: [
    {creditos: 5,  valor: 19.90},
    {creditos: 10, valor: 34.90, destaque: 'Mais vendido'},
    {creditos: 30, valor: 89.90, destaque: 'Melhor preço'}
  ],
  contato: 'https://wa.me/5524992122018?text=Ol%C3%A1!%20Quero%20conhecer%20o%20Criador%20de%20Apostilas.',  // opcional: link do seu WhatsApp ou página de venda, mostrado na tela de login
  whatsapp: '5524992122018',  // só números, com 55 e DDD: recebe os comprovantes do Pix

  // Venda do acesso vitalício (página de vendas)
  valor: 0,                   // em reais; 0 = "A combinar" (o botão de compra abre o WhatsApp)
  // Pix automático pelo Mercado Pago (os créditos entram sozinhos). Precisa do segredo MP_ACCESS_TOKEN e das functions publicadas.
  // Os preços dos pacotes também estão em functions/index.js (PACOTES): se mudar aqui, mude lá.
  mercadoPago: true,
  // Pix manual: enquanto a chave estiver vazia, o botão de compra abre o WhatsApp
  pix: {
    chave: '',                // CPF, CNPJ, e-mail, celular (+5524...) ou chave aleatória
    nome: '',                 // nome de quem recebe, como está no banco
    cidade: ''                // cidade de quem recebe
  },

  // Responsável pelo serviço (aparece nos Termos de Uso e na Política de Privacidade)
  responsavel: {
    nome: '',                 // seu nome completo ou o nome da empresa
    documento: '',            // CPF ou CNPJ (opcional, mas recomendado)
    email: ''                 // e-mail para pedidos sobre dados pessoais (LGPD)
  }
};
