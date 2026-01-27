// public/js/loader.js

(function() {
    // 1. INJECTION DU STYLE CSS (Position Haut-Droite type "Notification")
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- LE CONTENEUR PRINCIPAL --- */
        #global-loader {
            position: fixed;
            top: 20px;   /* Marge depuis le haut */
            right: 20px; /* Marge depuis la droite */
            
            /* DESIGN CLAIR (Light Mode) */
            background-color: white; 
            color: #334155; /* Gris foncé */
            
            padding: 12px 20px; /* Taille compacte */
            border-radius: 8px;
            border-left: 4px solid var(--color-primary, #3b82f6); /* Petite barre colorée à gauche */
            
            font-family: 'Segoe UI', sans-serif;
            font-size: 0.95rem; 
            font-weight: 600;
            
            display: flex;
            align-items: center; 
            gap: 12px; 
            
            box-shadow: 0 4px 12px rgba(0,0,0,0.1); /* Ombre légère */
            z-index: 10000;
            
            /* Animation d'entrée */
            opacity: 0;
            visibility: hidden;
            transform: translateX(20px); /* Arrive depuis la droite */
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
        }

        /* État visible */
        #global-loader.visible {
            opacity: 1;
            visibility: visible;
            transform: translateX(0); /* Reste fixe */
        }

        /* --- SPINNER --- */
        .spinner-box {
            position: relative;
            width: 20px;
            height: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .spinner-rotator {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid #e2e8f0; 
            border-top-color: var(--color-primary, #3b82f6);
            border-right-color: var(--color-primary, #3b82f6);
            animation: spin-clean 0.8s linear infinite;
        }

        @keyframes spin-clean {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // 2. CRÉATION DE L'ÉLÉMENT HTML
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = `
        <div class="spinner-box">
            <div class="spinner-rotator"></div>
        </div>
        <span>Chargement...</span>
    `;
    document.body.appendChild(loader);

    // 3. LOGIQUE D'INTERCEPTION
    let activeRequests = 0;
    const originalFetch = window.fetch;

    function showLoader() {
        if (activeRequests === 0) {
            loader.classList.add('visible');
        }
        activeRequests++;
    }

    function hideLoader() {
        activeRequests--;
        if (activeRequests <= 0) {
            activeRequests = 0;
            setTimeout(() => {
                if (activeRequests === 0) {
                    loader.classList.remove('visible');
                }
            }, 300);
        }
    }

    window.fetch = async function(...args) {
        showLoader();
        try {
            return await originalFetch(...args);
        } catch (error) {
            throw error;
        } finally {
            hideLoader();
        }
    };

    console.log("✅ Loader Notification (Haut-Droite) activé");
})();