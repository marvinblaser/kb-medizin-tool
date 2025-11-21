/**
 * KB Medizin Technik - Page Transitions
 * View Transitions API for smooth page navigation
 */

// Vérifier si le navigateur supporte View Transitions API
const supportsViewTransitions = 'startViewTransition' in document;

/**
 * Navigation avec transition
 */
function navigateWithTransition(url) {
  if (!supportsViewTransitions) {
    window.location.href = url;
    return;
  }

  // Démarrer la transition
  document.startViewTransition(() => {
    return new Promise((resolve) => {
      window.location.href = url;
      resolve();
    });
  });
}

/**
 * Attacher les transitions aux liens internes
 */
function initPageTransitions() {
  if (!supportsViewTransitions) {
    console.log('View Transitions API non supportée');
    return;
  }

  // Intercepter les clics sur les liens internes
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    
    // Ignorer les liens externes, mailto, tel, etc.
    if (!href || 
        href.startsWith('mailto:') || 
        href.startsWith('tel:') || 
        href.startsWith('http') ||
        href.startsWith('#') ||
        link.target === '_blank') {
      return;
    }
    
    // Ignorer les liens avec data-no-transition
    if (link.hasAttribute('data-no-transition')) {
      return;
    }
    
    e.preventDefault();
    navigateWithTransition(href);
  });

  // Ajouter une classe pendant la transition
  const observer = new MutationObserver(() => {
    if (document.documentElement.classList.contains('view-transition')) {
      console.log('Transition en cours');
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });
}

// Initialiser au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPageTransitions);
} else {
  initPageTransitions();
}

// Export pour utilisation manuelle
window.navigateWithTransition = navigateWithTransition;