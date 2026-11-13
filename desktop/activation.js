'use strict';
const notice = document.getElementById('notice');
const button = document.getElementById('submit');
const message = new URLSearchParams(location.search).get('message');
if (message) notice.textContent = message;
document.getElementById('activate').addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  notice.textContent = 'Verificando licença...';
  try {
    const result = await window.artisysLicense.activate({email:document.getElementById('email').value.trim(),code:document.getElementById('code').value.trim()});
    notice.textContent = result.ok ? 'Licença ativada. Abrindo CRM...' : result.message;
  } catch { notice.textContent = 'Não foi possível validar a licença.'; }
  finally { button.disabled = false; }
});