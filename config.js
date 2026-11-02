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
  modoAutomatico: false,
  creditosIniciais: 30,     // sugestão de créditos ao cadastrar um cliente (só com modoAutomatico)
  contato: ''               // opcional: link do seu WhatsApp ou página de venda, mostrado na tela de login
};
