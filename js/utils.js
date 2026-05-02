export function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function readApiKeys() {
  return {
    geminiKey:    document.getElementById('geminiKeyInput')?.value.trim()    ?? '',
    openaiKey:    document.getElementById('openaiKeyInput')?.value.trim()    ?? '',
    anthropicKey: document.getElementById('anthropicKeyInput')?.value.trim() ?? '',
    deepseekKey:  document.getElementById('deepseekKeyInput')?.value.trim()  ?? '',
    mistralKey:   document.getElementById('mistralKeyInput')?.value.trim()   ?? '',
    groqKey:      document.getElementById('groqKeyInput')?.value.trim()      ?? '',
  };
}
