/* public/js/mobile-menu.js */

/**
 * KB Medizin Technik - Mobile Menu Handler
 * Gestion du menu burger et de la sidebar responsive
 */

(function() {
  'use strict';
  
  // Initialisation au chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    initMobileMenu();
  }
  
  function initMobileMenu() {
    
    // Création du bouton burger
    createMenuToggle();
    
    // Création de l'overlay
    createSidebarOverlay();
    
    // Écouteurs d'événements
    setupEventListeners();
    
    // Gestion du redimensionnement
    handleResize();
    window.addEventListener('resize', handleResize);
    
  }
  
  /**
   * Crée le bouton burger pour mobile
   */
  function createMenuToggle() {
    // Vérifier si le bouton existe déjà
    if (document.querySelector('.menu-toggle')) return;
    
    const menuToggle = document.createElement('button');
    menuToggle.className = 'menu-toggle';
    menuToggle.setAttribute('aria-label', 'Toggle menu');
    menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    
    // Insérer au début du body
    document.body.insertBefore(menuToggle, document.body.firstChild);
  }
  
  /**
   * Crée l'overlay pour fermer le menu
   */
  function createSidebarOverlay() {
    // Vérifier si l'overlay existe déjà
    if (document.querySelector('.sidebar-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    
    // Insérer au début du body
    document.body.insertBefore(overlay, document.body.firstChild);
  }
  
  /**
   * Configure les écouteurs d'événements
   */
  function setupEventListeners() {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
    
    if (!menuToggle || !sidebar || !overlay) return;
    
    // Clic sur le bouton burger
    menuToggle.addEventListener('click', toggleSidebar);
    
    // Clic sur l'overlay pour fermer
    overlay.addEventListener('click', closeSidebar);
    
    // Clic sur un lien de navigation (ferme le menu sur mobile)
    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 768) {
          closeSidebar();
        }
      });
    });
    
    // Touche Escape pour fermer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('active')) {
        closeSidebar();
      }
    });
  }
  
  /**
   * Ouvre/ferme la sidebar
   */
  function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (!sidebar || !overlay || !menuToggle) return;
    
    const isActive = sidebar.classList.contains('active');
    
    if (isActive) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }
  
  /**
   * Ouvre la sidebar
   */
  function openSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (!sidebar || !overlay || !menuToggle) return;
    
    sidebar.classList.add('active');
    overlay.classList.add('active');
    
    // Change l'icône du burger en croix
    const icon = menuToggle.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    }
    
    // Empêche le scroll du body
    document.body.style.overflow = 'hidden';
    
    // Accessibilité
    menuToggle.setAttribute('aria-expanded', 'true');
  }
  
  /**
   * Ferme la sidebar
   */
  function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (!sidebar || !overlay || !menuToggle) return;
    
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    
    // Remet l'icône burger
    const icon = menuToggle.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
    
    // Réactive le scroll du body
    document.body.style.overflow = '';
    
    // Accessibilité
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  
  /**
   * Gère le redimensionnement de la fenêtre
   */
  function handleResize() {
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (!sidebar || !menuToggle) return;
    
    // Si on passe en desktop, fermer la sidebar mobile
    if (window.innerWidth >= 768) {
      closeSidebar();
      menuToggle.style.display = 'none';
    } else {
      menuToggle.style.display = 'flex';
    }
  }
  
  /**
   * Ajoute les attributs data-label pour les tableaux responsive
   */
  function addTableLabels() {
    const tables = document.querySelectorAll('.table');
    
    tables.forEach(table => {
      const headers = table.querySelectorAll('thead th');
      const rows = table.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
          if (headers[index]) {
            const labelText = headers[index].textContent.trim();
            cell.setAttribute('data-label', labelText);
          }
        });
      });
    });
  }
  
  // Ajouter les labels aux tableaux après le chargement
  addTableLabels();
  
  // Observer les changements dans le DOM pour les tableaux dynamiques
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        addTableLabels();
      }
    });
  });
  
  // Observer le body pour les changements
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
})();
