// public/js/toast.js
// Système de notifications toast pour KB Medizin Tool

class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Créer le conteneur s'il n'existe pas
        if (!document.querySelector('.toast-container')) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    show(type, title, message, duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check',
            error: 'fa-times',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info'
        };

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type] || 'fa-info'}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="this.closest('.toast').remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toast);

        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-suppression
        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                toast.classList.add('hide');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    }

    success(title, message, duration) {
        return this.show('success', title, message, duration);
    }

    error(title, message, duration) {
        return this.show('error', title, message, duration);
    }

    warning(title, message, duration) {
        return this.show('warning', title, message, duration);
    }

    info(title, message, duration) {
        return this.show('info', title, message, duration);
    }

    // Helper pour gérer les erreurs HTTP
    handleHttpError(error, response) {
        if (!response) {
            this.error('Erreur réseau', 'Impossible de contacter le serveur.');
            return;
        }

        switch (response.status) {
            case 400:
                this.error('Données invalides', error.error || 'Veuillez vérifier les informations saisies.');
                break;
            case 401:
                this.error('Non authentifié', 'Votre session a expiré. Redirection...');
                setTimeout(() => window.location.href = '/login.html', 2000);
                break;
            case 403:
                this.error('Accès refusé', error.error || 'Vous n\'avez pas la permission d\'effectuer cette action.');
                break;
            case 404:
                this.error('Introuvable', error.error || 'La ressource demandée n\'existe pas.');
                break;
            case 409:
                this.error('Conflit', error.error || 'Cette action entre en conflit avec les données existantes.');
                break;
            case 429:
                this.warning('Trop de requêtes', 'Veuillez patienter quelques instants avant de réessayer.');
                break;
            case 500:
            case 502:
            case 503:
                this.error('Erreur serveur', 'Une erreur s\'est produite. Veuillez réessayer.');
                break;
            default:
                this.error('Erreur', error.error || `Erreur HTTP ${response.status}`);
        }
    }
}

// Instance globale - créée après le chargement du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.toast = new ToastManager();
    });
} else {
    // DOM déjà chargé
    window.toast = new ToastManager();
}

// Helper pour les fetch API
window.handleApiError = async (response) => {
    let errorData = { error: 'Une erreur est survenue' };
    try {
        errorData = await response.json();
    } catch (e) {
        // Si pas de JSON, on garde le message par défaut
    }
    
    // S'assurer que toast existe avant de l'utiliser
    if (window.toast) {
        window.toast.handleHttpError(errorData, response);
    }
    return errorData;
};