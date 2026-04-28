/**
 * tabs.js  —  Shared tab-switching helpers
 *
 * Imported by both main.js and viewer.js so tab logic lives in one place.
 * Tab panel IDs are derived from data-tab attributes on .tab-btn elements,
 * so no hardcoded list of tab names is needed here.
 *
 * Exports: initTabs, switchTab
 */

export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

export function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const panelId = `tab${btn.dataset.tab[0].toUpperCase()}${btn.dataset.tab.slice(1)}`;
    document.getElementById(panelId)?.classList.toggle('hidden', btn.dataset.tab !== name);
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
}
