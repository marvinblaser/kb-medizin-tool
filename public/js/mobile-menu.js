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

    // Ferme le drawer au clic sur un lien de nav (utile le temps que la
    // navigation vers la nouvelle page se charge, et pour le cas où le
    // lien cliqué est celui de la page déjà active).
    sidebar.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeSidebar);
    });

    // Swipe pour fermer : glisser vers la gauche sur le drawer ouvert.
    let touchStartX = null;
    let touchStartY = null;
    sidebar.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    sidebar.addEventListener('touchend', e => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (dx < -50 && Math.abs(dx) > Math.abs(dy)) closeSidebar();
      touchStartX = null;
      touchStartY = null;
    }, { passive: true });

    let hamburger = document.getElementById('mobile-menu-btn');
    if (!hamburger) {
      const pageHeader = document.querySelector('.page-header .header-title-group')
                      || document.querySelector('.rma-topbar-left')
                      || document.querySelector('.page-header')
                      || document.querySelector('.topbar-left');
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