(function() {
  'use strict';

  function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar();
  }

  function openSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('open', 'mobile-open');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open', 'mobile-open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function init() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }
    overlay.addEventListener('click', closeSidebar);

    let hamburger = document.getElementById('mobile-menu-btn');
    if (!hamburger) {
      const pageHeader = document.querySelector('.page-header .header-title-group')
                      || document.querySelector('.page-header');
      if (pageHeader) {
        hamburger = document.createElement('button');
        hamburger.id = 'mobile-menu-btn';
        hamburger.setAttribute('aria-label', 'Menu');
        hamburger.style.cssText = 'display:none;width:34px;height:34px;align-items:center;justify-content:center;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:3px;color:var(--text-secondary);font-size:14px;cursor:pointer;margin-right:8px;flex-shrink:0;';
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
        hamburger.addEventListener('click', toggleSidebar);
        pageHeader.insertBefore(hamburger, pageHeader.firstChild);
      }
    } else {
      hamburger.addEventListener('click', toggleSidebar);
    }

    function handleResize() {
      if (!hamburger) return;
      const isMobile = window.innerWidth <= 768;
      hamburger.style.display = isMobile ? 'flex' : 'none';
      if (!isMobile) closeSidebar();
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSidebar();
    });

    document.querySelectorAll('.mobile-menu-btn:not(#mobile-menu-btn)')
            .forEach(btn => btn.style.display = 'none');
  }

  window.toggleSidebar = toggleSidebar;
  window.openSidebar   = openSidebar;
  window.closeSidebar  = closeSidebar;

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();