// Configuração do site próprio. Deixe supabaseUrl vazio para o app abrir sem login (só modo semiautomático).
// A "anon key" do Supabase é pública por natureza: pode ficar aqui. NUNCA coloque aqui a service_role key nem a chave da IA.
window.APOSTILAS_CONFIG = {
  supabaseUrl: '',      // ex.: 'https://abcdefgh.supabase.co'  (Supabase > Project Settings > API)
  supabaseAnonKey: '',  // ex.: 'eyJhbGciOi...'                  (Supabase > Project Settings > API > anon public)
  linkCompra: '',       // link da página de venda na Kiwify ou Hotmart (acesso vitalício)
  linkCreditos: ''      // opcional: link de um produto de "créditos extras"
};
