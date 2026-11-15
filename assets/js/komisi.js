document.addEventListener('DOMContentLoaded', () => {
  const timeline = document.querySelector('[data-mpk-timeline]');
  if (!timeline) return;

  const tabs = Array.from(timeline.querySelectorAll('[role="tab"]'));
  const panels = Array.from(timeline.querySelectorAll('[role="tabpanel"]'));

  function activateTab(activeTab, moveFocus = false) {
    tabs.forEach(tab => {
      const selected = tab === activeTab;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.id !== activeTab.getAttribute('aria-controls');
      panel.classList.toggle('is-active', !panel.hidden);
    });
    if (moveFocus) activeTab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      activateTab(tabs[nextIndex], true);
    });
  });
});
