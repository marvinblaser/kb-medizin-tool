// public/js/slimselect-mobile-fix.js
// LOT 2B — Bouton de fermeture pour le picker SlimSelect plein écran (mobile).
// Nécessaire quand showSearch:false (pas de champ pour capter Échap), donc
// aucune façon de fermer un multi-select (closeOnSelect:false) autrement.
// Fichier neuf, n'appelle ni ne modifie aucune fonction SlimSelect existante.
(function () {
  function closeOpenDropdown() {
    var openMain = document.querySelector('.ss-main[aria-expanded="true"]');
    if (openMain) openMain.click();
  }

  function init() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ss-mobile-close';
    btn.setAttribute('aria-label', 'Fermer la liste');
    btn.innerHTML = '&times;';
    btn.addEventListener('click', closeOpenDropdown);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
