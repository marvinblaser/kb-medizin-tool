// public/js/confirm.js
// KB Med — Remplacement global de window.confirm() par un popup moderne

(function () {
  'use strict';

  // ── INJECTE LE HTML DU MODAL ────────────────────────────────────────
  function injectModal() {
    if (document.getElementById('kb-confirm-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'kb-confirm-modal';
    modal.innerHTML = `
      <div id="kb-confirm-backdrop">
        <div id="kb-confirm-box">
          <div id="kb-confirm-icon-wrap">
            <i id="kb-confirm-icon" class="fas fa-exclamation-triangle"></i>
          </div>
          <h3 id="kb-confirm-title">Confirmer</h3>
          <p id="kb-confirm-message">Êtes-vous sûr ?</p>
          <div id="kb-confirm-actions">
            <button id="kb-confirm-cancel">Annuler</button>
            <button id="kb-confirm-ok">Confirmer</button>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #kb-confirm-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      #kb-confirm-modal.active {
        display: block;
      }

      #kb-confirm-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: kb-fade-in 0.15s ease-out;
      }

      @keyframes kb-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      @keyframes kb-pop-in {
        from { transform: scale(0.93); opacity: 0; }
        to   { transform: scale(1);    opacity: 1; }
      }

      #kb-confirm-box {
        background: var(--bg-elevated, #fff);
        border: 1px solid var(--border-primary, #e5e7eb);
        border-radius: 6px;
        padding: 28px 28px 22px;
        max-width: 380px;
        width: 100%;
        box-shadow: 0 20px 50px rgba(0,0,0,0.18);
        text-align: center;
        animation: kb-pop-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      #kb-confirm-icon-wrap {
        width: 48px;
        height: 48px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
        font-size: 20px;
        background: var(--color-danger-bg, #fee2e2);
        color: var(--color-danger, #ef4444);
        transition: background 0.15s, color 0.15s;
      }

      #kb-confirm-icon-wrap.warning {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #f59e0b);
      }

      #kb-confirm-icon-wrap.info {
        background: var(--color-info-bg, #dbeafe);
        color: var(--color-info, #3b82f6);
      }

      #kb-confirm-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--text-primary, #111827);
        margin: 0 0 8px;
      }

      #kb-confirm-message {
        font-size: 0.9rem;
        color: var(--text-secondary, #6b7280);
        margin: 0 0 22px;
        line-height: 1.5;
      }

      #kb-confirm-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
      }

      #kb-confirm-actions button {
        flex: 1;
        padding: 9px 16px;
        border-radius: 3px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.15s;
        font-family: inherit;
      }

      #kb-confirm-cancel {
        background: var(--bg-secondary, #f3f4f6);
        border-color: var(--border-primary, #e5e7eb) !important;
        color: var(--text-primary, #374151);
      }

      #kb-confirm-cancel:hover {
        background: var(--bg-tertiary, #e5e7eb);
      }

      #kb-confirm-ok {
        background: var(--color-danger, #ef4444);
        color: #fff;
      }

      #kb-confirm-ok:hover {
        background: #dc2626;
      }

      #kb-confirm-ok.warning {
        background: var(--color-warning, #f59e0b);
      }

      #kb-confirm-ok.warning:hover {
        background: #d97706;
      }

      #kb-confirm-ok.primary {
        background: var(--color-primary, #2c5aa0);
      }

      #kb-confirm-ok.primary:hover {
        background: var(--kb-blue-dark, #1e3f73);
      }

      @media (max-width: 480px) {
        #kb-confirm-backdrop {
          align-items: flex-end;
          padding: 0;
        }

        #kb-confirm-box {
          border-radius: 12px 12px 0 0;
          max-width: 100%;
          width: 100%;
          padding: 24px 20px 28px;
        }

        #kb-confirm-actions button {
          padding: 12px;
          font-size: 0.95rem;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);
  }

  // ── FONCTION PRINCIPALE ─────────────────────────────────────────────
  /**
   * Affiche un popup de confirmation.
   * @param {string|Object} options - Message ou options {title, message, confirmText, cancelText, type}
   * @returns {Promise<boolean>}
   */
  window.showConfirm = function (options) {
    injectModal();

    const config = typeof options === 'string'
      ? { message: options }
      : options;

    const {
      title       = 'Confirmer l\'action',
      message     = 'Êtes-vous sûr de vouloir continuer ?',
      confirmText = 'Confirmer',
      cancelText  = 'Annuler',
      type        = 'danger'   // 'danger' | 'warning' | 'info' | 'primary'
    } = config;

    return new Promise(resolve => {
      const modal      = document.getElementById('kb-confirm-modal');
      const iconWrap   = document.getElementById('kb-confirm-icon-wrap');
      const icon       = document.getElementById('kb-confirm-icon');
      const titleEl    = document.getElementById('kb-confirm-title');
      const messageEl  = document.getElementById('kb-confirm-message');
      const okBtn      = document.getElementById('kb-confirm-ok');
      const cancelBtn  = document.getElementById('kb-confirm-cancel');

      // Icônes selon le type
      const icons = {
        danger:  'fa-exclamation-triangle',
        warning: 'fa-exclamation-circle',
        info:    'fa-info-circle',
        primary: 'fa-question-circle'
      };

      titleEl.textContent   = title;
      messageEl.textContent = message;
      okBtn.textContent     = confirmText;
      cancelBtn.textContent = cancelText;

      iconWrap.className = type === 'danger' ? '' : type;
      icon.className = `fas ${icons[type] || icons.danger}`;
      okBtn.className = type === 'danger' ? '' : type;

      modal.classList.add('active');

      function cleanup(result) {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      function onOk()     { cleanup(true);  }
      function onCancel() { cleanup(false); }
      function onKey(e) {
        if (e.key === 'Enter')  { e.preventDefault(); cleanup(true);  }
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      // Focus sur OK par défaut
      setTimeout(() => cancelBtn.focus(), 50);
    });
  };

  // ── REMPLACE window.confirm() GLOBALEMENT ──────────────────────────
  // ATTENTION : window.confirm() est synchrone, showConfirm() est async.
  // Cette surcharge intercepte les appels existants.
  const originalConfirm = window.confirm.bind(window);

  window.confirm = function (message) {
    // Si on est dans un contexte async (via showConfirm), on l'utilise
    // Sinon on retourne une Promise (les appelants async la gèrent)
    // Pour les appelants synchrones legacy (if(!confirm(...))), on affiche le popup
    // et on retourne false (bloque l'action) jusqu'à ce que l'utilisateur réponde.
    // En pratique, on redirige tout vers showConfirm.

    // Vérifie si l'appelant peut gérer une Promise
    const stack = new Error().stack || '';
    const isAsync = stack.includes('async') || stack.includes('await');

    // Affiche le popup et retourne false immédiatement pour les appels sync.
    // L'action ne s'exécutera pas — c'est intentionnel.
    // Les fonctions async devront utiliser showConfirm() directement.
    window.showConfirm({ message: message || 'Êtes-vous sûr ?' });
    return false;
  };

  // ── HELPERS PRATIQUES ───────────────────────────────────────────────
  /** Confirmation de suppression */
  window.confirmDelete = function (item = 'cet élément') {
    return window.showConfirm({
      title:       'Supprimer ' + item + ' ?',
      message:     'Cette action est irréversible. Vous ne pourrez pas récupérer les données supprimées.',
      confirmText: 'Oui, supprimer',
      cancelText:  'Annuler',
      type:        'danger'
    });
  };

  /** Confirmation d'action sensible */
  window.confirmAction = function (message, title = 'Confirmer') {
    return window.showConfirm({
      title:       title,
      message:     message,
      confirmText: 'Confirmer',
      cancelText:  'Annuler',
      type:        'warning'
    });
  };

  /** Confirmation d'action primaire (bleue) */
  window.confirmPrimary = function (message, title = 'Confirmer') {
    return window.showConfirm({
      title:       title,
      message:     message,
      confirmText: 'Continuer',
      cancelText:  'Annuler',
      type:        'primary'
    });
  };

  // Injecte le modal dès que le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectModal);
  } else {
    injectModal();
  }

})();