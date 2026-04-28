export function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
