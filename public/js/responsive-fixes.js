/* public/js/responsive-fixes.js */

/**
 * KB Medizin Technik - Responsive JavaScript Fixes
 * Ajustements pour optimiser l'expérience mobile
 */

(function() {
  'use strict';
  
  // Détection mobile
  const isMobile = () => window.innerWidth < 768;
  const isTablet = () => window.innerWidth >= 768 && window.innerWidth < 1024;
  const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Initialisation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    console.log('📱 Responsive Fixes initialisés');
    
    // Fixes généraux
    fixChecklistViewStyles();
    fixTableLabels();
    addTouchSupport();
    fixModalsOnMobile();
    fixNotificationPosition();
    optimizeFormInputs();
    
    // Écouteur de redimensionnement
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fixChecklistViewStyles();
        fixTableLabels();
      }, 250);
    });
  }
  
  /**
   * 1. FIX : Checklist View - Styles inline responsive
   */
  function fixChecklistViewStyles() {
    // Sur la page checklist-view.html
    if (!window.location.pathname.includes('checklist-view')) return;
    
    const container = document.querySelector('.checklist-view-container');
    if (!container) return;
    
    if (isMobile()) {
      // Forcer le padding mobile
      container.style.padding = '1rem';
      
      // Forcer la grille en une colonne
      const grid = document.querySelector('.checklist-grid');
      if (grid) {
        grid.style.gridTemplateColumns = '1fr';
      }
      
      // Ajuster le header
      const headerCard = document.querySelector('.checklist-header-card');
      if (headerCard) {
        headerCard.style.padding = '1.5rem 1rem';
      }
    } else {
      // Rétablir les valeurs desktop
      const grid = document.querySelector('.checklist-grid');
      if (grid) {
        grid.style.gridTemplateColumns = '1fr 1fr';
      }
    }
  }
  
  /**
   * 2. FIX : Tableaux - Ajout data-label pour mode carte
   */
  function fixTableLabels() {
    const tables = document.querySelectorAll('.table');
    
    tables.forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => {
        // Récupérer le texte du header (sans les inputs de recherche)
        const clone = th.cloneNode(true);
        const inputs = clone.querySelectorAll('input, button');
        inputs.forEach(input => input.remove());
        return clone.textContent.trim();
      });
      
      const rows = table.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
          if (headers[index] && headers[index] !== '') {
            cell.setAttribute('data-label', headers[index]);
          }
        });
      });
    });
  }
  
  /**
   * 3. FIX : Support tactile amélioré
   */
  function addTouchSupport() {
    if (!isTouchDevice()) return;
    
    // Double-tap au lieu de double-click
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      
      if (tapLength < 500 && tapLength > 0) {
        // Double tap détecté
        const target = e.target;
        
        // Émettre un double-click pour compatibilité
        const event = new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        target.dispatchEvent(event);
        
        e.preventDefault();
      }
      lastTap = currentTime;
    });
    
    // Swipe pour fermer les modales
    addSwipeToCloseModals();
  }
  
  /**
   * 4. FIX : Modales - Swipe vers le bas pour fermer
   */
  function addSwipeToCloseModals() {
    if (!isTouchDevice()) return;
    
    document.addEventListener('touchstart', handleModalSwipeStart, { passive: true });
    document.addEventListener('touchmove', handleModalSwipeMove, { passive: false });
    document.addEventListener('touchend', handleModalSwipeEnd, { passive: true });
  }
  
  let swipeStartY = 0;
  let swipeCurrentY = 0;
  let isSwipingModal = false;
  let activeModal = null;
  
  function handleModalSwipeStart(e) {
    const modal = e.target.closest('.modal.active');
    if (!modal) return;
    
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Vérifier si on touche le header de la modale
    const header = modalContent.querySelector('.modal-header');
    if (header && header.contains(e.target)) {
      swipeStartY = e.touches[0].clientY;
      isSwipingModal = true;
      activeModal = modal;
    }
  }
  
  function handleModalSwipeMove(e) {
    if (!isSwipingModal || !activeModal) return;
    
    swipeCurrentY = e.touches[0].clientY;
    const diff = swipeCurrentY - swipeStartY;
    
    // Ne permettre que le swipe vers le bas
    if (diff > 0) {
      const modalContent = activeModal.querySelector('.modal-content');
      if (modalContent) {
        modalContent.style.transform = `translateY(${diff}px)`;
        modalContent.style.transition = 'none';
      }
    }
  }
  
  function handleModalSwipeEnd(e) {
    if (!isSwipingModal || !activeModal) return;
    
    const diff = swipeCurrentY - swipeStartY;
    const modalContent = activeModal.querySelector('.modal-content');
    
    if (modalContent) {
      modalContent.style.transition = 'transform 0.3s ease';
      
      // Si swipe > 100px, fermer la modale
      if (diff > 100) {
        activeModal.classList.remove('active');
        modalContent.style.transform = '';
      } else {
        // Sinon, revenir en place
        modalContent.style.transform = '';
      }
    }
    
    isSwipingModal = false;
    activeModal = null;
    swipeStartY = 0;
    swipeCurrentY = 0;
  }
  
  /**
   * 5. FIX : Modales plein écran sur mobile
   */
  function fixModalsOnMobile() {
    // Observer l'ajout de la classe 'active' sur les modales
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const modal = mutation.target;
          if (modal.classList.contains('modal') && modal.classList.contains('active')) {
            adjustModalForMobile(modal);
          }
        }
      });
    });
    
    // Observer toutes les modales
    document.querySelectorAll('.modal').forEach(modal => {
      observer.observe(modal, { attributes: true });
    });
  }
  
  function adjustModalForMobile(modal) {
    if (!isMobile()) return;
    
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Forcer une hauteur maximale raisonnable
    modalContent.style.maxHeight = '95vh';
    
    // S'assurer que le body de la modale est scrollable
    const modalBody = modalContent.querySelector('.modal-body');
    if (modalBody) {
      modalBody.style.overflowY = 'auto';
      modalBody.style.maxHeight = 'calc(95vh - 120px)'; // Moins header et footer
    }
  }
  
  /**
   * 6. FIX : Position du loader sur mobile
   */
  function fixNotificationPosition() {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    
    // Observer les changements de classe
    const observer = new MutationObserver(() => {
      if (loader.classList.contains('visible') && isMobile()) {
        // Ajuster la position sur mobile
        loader.style.top = '10px';
        loader.style.right = '10px';
        loader.style.left = '10px';
        loader.style.width = 'auto';
      }
    });
    
    observer.observe(loader, { attributes: true, attributeFilter: ['class'] });
  }
  
  /**
   * 7. FIX : Inputs - Prévenir le zoom sur iOS
   */
  function optimizeFormInputs() {
    const inputs = document.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      // S'assurer que font-size >= 16px pour éviter le zoom iOS
      const fontSize = window.getComputedStyle(input).fontSize;
      const fontSizeValue = parseFloat(fontSize);
      
      if (fontSizeValue < 16 && isMobile()) {
        input.style.fontSize = '16px';
      }
    });
  }
  
  /**
   * 8. FIX : Checklists toolbar responsive
   */
  function fixChecklistsToolbar() {
    const toolbar = document.querySelector('.toolbar-card');
    if (!toolbar) return;
    
    if (isMobile()) {
      toolbar.style.flexDirection = 'column';
      toolbar.style.alignItems = 'stretch';
    }
  }
  
  /**
   * 9. OPTIMISATION : Débounce pour les recherches
   */
  function optimizeSearchInputs() {
    const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="Recherche"]');
    
    searchInputs.forEach(input => {
      let debounceTimer;
      
      // Stocker le listener original s'il existe
      const originalListener = input.oninput;
      
      // Remplacer par un listener avec debounce
      input.oninput = function(e) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (originalListener) {
            originalListener.call(this, e);
          }
        }, 300); // Attendre 300ms après la dernière frappe
      };
    });
  }
  
  /**
   * 10. FIX : STK - Touch events pour drag & drop
   */
  function fixSTKTouchEvents() {
    // Uniquement sur la page STK
    if (!window.location.pathname.includes('stk')) return;
    if (!isTouchDevice()) return;
    
    // Ajouter le support tactile aux cartes de signature
    const sigCards = document.querySelectorAll('.sig-card');
    
    sigCards.forEach(card => {
      let touchClone = null;
      
      card.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        // Créer un clone visuel
        touchClone = card.cloneNode(true);
        touchClone.style.position = 'fixed';
        touchClone.style.opacity = '0.8';
        touchClone.style.pointerEvents = 'none';
        touchClone.style.zIndex = '10000';
        document.body.appendChild(touchClone);
        
        updateTouchClonePosition(e.touches[0], touchClone);
      });
      
      card.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (touchClone) {
          updateTouchClonePosition(e.touches[0], touchClone);
        }
      });
      
      card.addEventListener('touchend', (e) => {
        if (touchClone) {
          // Simuler le drop
          const touch = e.changedTouches[0];
          const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
          
          if (dropTarget && dropTarget.closest('#pdf-wrapper')) {
            const workspace = document.getElementById('workspace');
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              clientX: touch.clientX,
              clientY: touch.clientY
            });
            
            // Transférer la source de l'image
            const img = card.querySelector('img');
            dropEvent.dataTransfer = {
              getData: () => img.src
            };
            
            workspace.dispatchEvent(dropEvent);
          }
          
          touchClone.remove();
          touchClone = null;
        }
      });
    });
  }
  
  function updateTouchClonePosition(touch, clone) {
    clone.style.left = (touch.clientX - 75) + 'px';
    clone.style.top = (touch.clientY - 30) + 'px';
  }
  
  /**
   * 11. HELPER : Détecter le type d'appareil
   */
  window.responsiveUtils = {
    isMobile,
    isTablet,
    isTouchDevice,
    isDesktop: () => window.innerWidth >= 1024
  };
  
  /**
   * 12. FIX : Amélioration des clics sur petits boutons
   */
  function improveTapTargets() {
    if (!isTouchDevice()) return;
    
    // Ajouter un padding invisible aux petits boutons
    const smallButtons = document.querySelectorAll('.btn-icon, .btn-icon-sm, .btn-sm');
    
    smallButtons.forEach(btn => {
      const computed = window.getComputedStyle(btn);
      const size = Math.max(parseFloat(computed.width), parseFloat(computed.height));
      
      // Taille minimale recommandée : 44px (Apple) / 48px (Google)
      if (size < 44) {
        const padding = Math.ceil((44 - size) / 2);
        btn.style.padding = `${padding}px`;
      }
    });
  }
  
  /**
   * 13. FIX : Prévenir le double-tap zoom sur les boutons
   */
  function preventDoubleTapZoom() {
    if (!isTouchDevice()) return;
    
    const buttons = document.querySelectorAll('button, .btn, a');
    
    buttons.forEach(btn => {
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.click();
      }, { passive: false });
    });
  }
  
  /**
   * 14. FIX : Orientation change handler
   */
  window.addEventListener('orientationchange', () => {
    // Attendre la fin de la rotation
    setTimeout(() => {
      fixChecklistViewStyles();
      fixTableLabels();
      
      // Fermer la sidebar si on passe en paysage et qu'elle est ouverte
      if (window.innerHeight < 500) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('active')) {
          const closeSidebarEvent = new Event('click');
          document.querySelector('.sidebar-overlay')?.dispatchEvent(closeSidebarEvent);
        }
      }
    }, 100);
  });
  
  /**
   * 15. FIX : Scroll automatique vers les erreurs de formulaire
   */
  function scrollToFormErrors() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      form.addEventListener('invalid', (e) => {
        e.preventDefault();
        
        // Trouver le premier champ invalide
        const firstInvalid = form.querySelector(':invalid');
        if (firstInvalid && isMobile()) {
          firstInvalid.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }, true);
    });
  }
  
  /**
   * 16. FIX : Performance - Lazy load des images lourdes
   */
  function optimizeImageLoading() {
    if (!('IntersectionObserver' in window)) return;
    
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }
  
  /**
   * 17. DEBUG : Mode debug responsive
   */
  if (window.location.search.includes('debug=responsive')) {
    const debugPanel = document.createElement('div');
    debugPanel.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 99999;
      font-family: monospace;
    `;
    document.body.appendChild(debugPanel);
    
    function updateDebugInfo() {
      debugPanel.innerHTML = `
        <div>Largeur: ${window.innerWidth}px</div>
        <div>Hauteur: ${window.innerHeight}px</div>
        <div>Mobile: ${isMobile()}</div>
        <div>Tablette: ${isTablet()}</div>
        <div>Tactile: ${isTouchDevice()}</div>
        <div>Orientation: ${screen.orientation?.type || 'N/A'}</div>
      `;
    }
    
    updateDebugInfo();
    window.addEventListener('resize', updateDebugInfo);
    window.addEventListener('orientationchange', updateDebugInfo);
  }
  
  // Appeler les fixes supplémentaires
  setTimeout(() => {
    optimizeSearchInputs();
    improveTapTargets();
    scrollToFormErrors();
    optimizeImageLoading();
    fixSTKTouchEvents();
  }, 500);
  
  console.log('✅ Responsive Fixes appliqués avec succès');
  
})();
