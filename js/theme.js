/**
 * theme.js  —  Shared theme helpers
 *
 * Imported by both main.js and viewer.js so theme logic lives in one place.
 * Exports: initTheme, toggleTheme, applyTheme, KEY_THEME
 */

export const KEY_THEME = 'llm-eval-theme';

const HLJS_DARK  = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
const HLJS_LIGHT = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';

export function initTheme() {
  const saved  = localStorage.getItem(KEY_THEME);
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (osDark ? 'dark' : 'light'));
}

export function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

/**
 * Apply a theme:
 *   1. Set data-theme on <html> — CSS variables update immediately
 *   2. Swap the highlight.js stylesheet href
 *   3. Re-highlight any code blocks already rendered
 *   4. Persist choice to localStorage
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const link = document.getElementById('hljs-theme');
  if (link) link.href = theme === 'dark' ? HLJS_DARK : HLJS_LIGHT;

  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('pre code[class*="language-"]').forEach(block => {
      delete block.dataset.highlighted;
      hljs.highlightElement(block);
    });
  }
  localStorage.setItem(KEY_THEME, theme);
}
