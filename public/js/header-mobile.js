// public/js/header-mobile.js

'use strict';

(function () {

  const style = document.createElement('style');
  style.innerHTML = `
    .kb-more-btn {
      display: none;
      width: 34px; height: 34px;
      align-items: center; justify-content: center;
      background: var(--bg-secondary, #f3f4f6);
      border: 1px solid var(--border-primary, #e5e7eb);
      border-radius: 3px;
      color: var(--text-secondary, #6b7280);
      font-size: 16px;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .kb-more-btn { display: flex !important; }
      .kb-collapsible { display: none !important; }
    }

    .kb-more-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 200px;
      background: var(--bg-elevated, #fff);
      border: 1px solid var(--border-primary, #e5e7eb);
      border-radius: 4px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      z-index: 600;
      overflow: hidden;
    }

    .kb-more-dropdown.open { display: block; }

    .kb-more-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 12px 16px;
      background: none;
      border: none;
      border-bottom: 1px solid var(--border-primary, #e5e7eb);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-primary, #111827);
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    .kb-more-item:last-child { border-bottom: none; }
    .kb-more-item:hover { background: var(--bg-secondary, #f9fafb); }
    .kb-more-item i { width: 16px; text-align: center; color: var(--color-primary, #2c5aa0); }
  `;
  document.head.appendChild(style);

  function init() {
  // Sélecteurs explicites existants
  const explicit = Array.from(document.querySelectorAll(
    '.header-actions-group, .rma-topbar-actions, .topbar-right'
  ));

  // Auto-détection : dernier enfant d'un .page-header contenant ≥2 boutons
  const auto = [];
  document.querySelectorAll('.page-header').forEach(header => {
    const children = Array.from(header.children);
    for (let i = children.length - 1; i >= 0; i--) {
      const el = children[i];
      if (!explicit.includes(el) &&
          el.querySelectorAll('button, a.btn').length >= 2) {
        auto.push(el);
        break;
      }
    }
  });

  const groups = [...explicit, ...auto];

  groups.forEach(group => {
    const btns = Array.from(group.children).filter(el =>
      !el.classList.contains('kb-notif-bell-wrap') &&
      !el.classList.contains('kb-more-btn') &&
      el.id !== 'notif-btn' &&
      el.id !== 'theme-toggle' &&
      el.id !== 'kb-notif-bell'
    );

    if (!btns.length) return;

    btns.forEach(btn => btn.classList.add('kb-collapsible'));

    const moreBtn = document.createElement('button');
    moreBtn.className = 'kb-more-btn';
    moreBtn.title = 'Plus d\'options';
    moreBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    group.style.position = 'relative';

    const dropdown = document.createElement('div');
    dropdown.className = 'kb-more-dropdown';

    btns.forEach(btn => {
      const item = document.createElement('button');
      item.className = 'kb-more-item';
      const icon = btn.querySelector('i');
      const iconHtml = icon ? `<i class="${icon.className}"></i>` : '<i class="fas fa-circle"></i>';
      const labelEl = btn.querySelector('.btn-label');
      let label = labelEl
        ? labelEl.textContent.trim()
        : btn.textContent.trim().replace(/\s+/g, ' ');
      if (!label) label = btn.title || btn.getAttribute('aria-label') || 'Action';
      item.innerHTML = `${iconHtml} ${label}`;
      item.addEventListener('click', () => {
        dropdown.classList.remove('open');
        btn.click();
      });
      dropdown.appendChild(item);
    });

    moreBtn.appendChild(dropdown);
    group.appendChild(moreBtn);

    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') dropdown.classList.remove('open');
    });
  });
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();