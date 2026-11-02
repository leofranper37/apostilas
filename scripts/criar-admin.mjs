// Cria a conta de administrador (uma vez só). Uso: node scripts/criar-admin.mjs SUA_SENHA
// Antes, ative "E-mail/senha" no Firebase: Authentication > Método de login.
import { readFileSync } from 'node:fs';
const senha = process.argv[2];
if (!senha || senha.length < 6) { console.log('Uso: node scripts/criar-admin.mjs SUA_SENHA   (mínimo 6 caracteres)'); process.exit(1); }
const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const apiKey = cfg.match(/apiKey:\s*'([^']+)'/)[1];
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@apostilas.local', password: senha, returnSecureToken: false }),
});
const d = await r.json();
if (r.ok) console.log('Pronto! Entre no app com usuário "admin" e a senha que você escolheu.');
else console.log('Não deu certo:', d.error?.message === 'EMAIL_EXISTS' ? 'o admin já existe.' : d.error?.message === 'OPERATION_NOT_ALLOWED' ? 'ative E-mail/senha em Authentication > Método de login.' : d.error?.message);
