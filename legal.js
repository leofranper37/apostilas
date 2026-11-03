// Preenche nas páginas legais os dados do responsável, do preço e do contato definidos em app/config.js
(function(){
  const c = window.APOSTILAS_CONFIG || {}, r = c.responsavel || {};
  const nome = (r.nome || '').trim(), doc = (r.documento || '').trim(), email = (r.email || '').trim();
  const zap = String(c.whatsapp || '').replace(/\D/g, '');
  const telefone = zap.length >= 12 ? `(${zap.slice(2, 4)}) ${zap.slice(4, -4)}-${zap.slice(-4)}` : '';
  const valor = c.valor ? 'R$ ' + Number(c.valor).toFixed(2).replace('.', ',') : '';
  document.querySelectorAll('[data-r]').forEach(el => {
    const k = el.dataset.r;
    if (k === 'nome' && nome) el.textContent = nome + (doc ? ` (${doc})` : '');
    if (k === 'email'){ if (email){ el.innerHTML = ''; const a = document.createElement('a'); a.href = 'mailto:' + email; a.textContent = email; el.append('pelo e-mail ', a, ' ou '); } }
    if (k === 'whatsapp' && zap){ el.innerHTML = ''; const a = document.createElement('a'); a.href = 'https://wa.me/' + zap; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'WhatsApp ' + telefone; el.append('pelo ', a); }
    if (k === 'valor' && valor) el.textContent = valor;
  });
})();
