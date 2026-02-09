// public/js/init-selects.js
import SlimSelect from 'https://unpkg.com/slim-select@2.8.2/dist/slimselect.es.js';

// Registre pour suivre nos selects
const registry = new Map();

// 1. Initialisation d'un select
const initSelect = (element) => {
    if (element.dataset.ssid || element.classList.contains('hidden')) return;

    const slim = new SlimSelect({
        select: element,
        settings: {
            showSearch: true,
            searchText: 'Aucun résultat',
            searchPlaceholder: 'Rechercher...',
            placeholderText: 'Sélectionner...',
            closeOnSelect: true,
            allowDeselect: true
        }
    });

    registry.set(element, {
        instance: slim,
        count: element.options.length
    });
};

// 2. Vérification des changements (Polling)
const checkUpdates = () => {
    registry.forEach((data, element) => {
        if (!document.body.contains(element)) {
            registry.delete(element);
            data.instance.destroy();
            return;
        }
        // Si le nombre d'options a changé (ex: chargement des clients terminé)
        if (data.count !== element.options.length) {
            updateSlimData(element, data);
        }
    });
};

// Fonction interne pour rafraîchir les données de SlimSelect
const updateSlimData = (element, data) => {
    const newData = Array.from(element.options).map(option => ({
        text: option.text,
        value: option.value,
        selected: option.selected,
        placeholder: option.value === '',
        style: option.style.cssText,
        class: option.className
    }));
    data.instance.setData(newData);
    data.count = element.options.length;
};

// 3. FONCTION GLOBALE ROBUSTE (C'est ici que la magie opère)
window.setSlimSelect = (idOrElement, value) => {
    const element = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
    if (!element) return;

    // --- CORRECTION MAJEURE : CONVERSION EN STRING ---
    // SlimSelect a besoin de chaînes de caractères ("12"), pas de nombres (12).
    let safeValue = value;
    if (value === null || value === undefined) {
        safeValue = "";
    } else if (Array.isArray(value)) {
        safeValue = value.map(v => String(v)); // Convertit [1, 2] en ["1", "2"]
    } else {
        safeValue = String(value); // Convertit 12 en "12"
    }

    // A. Mise à jour de la valeur native (HTML)
    if (Array.isArray(safeValue)) {
        Array.from(element.options).forEach(opt => {
            opt.selected = safeValue.includes(opt.value);
        });
    } else {
        element.value = safeValue;
    }

    // B. Mise à jour de l'interface SlimSelect
    const entry = registry.get(element);
    if (entry && entry.instance) {
        // 1. On force SlimSelect à relire la liste des options (au cas où elle vient d'être chargée)
        updateSlimData(element, entry);
        
        // 2. On applique la valeur convertie en texte
        // Petit délai de sécurité pour laisser le temps au DOM de respirer
        setTimeout(() => {
            entry.instance.setSelected(safeValue);
        }, 10);
    }
};

// Démarrage
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('select').forEach(initSelect);

    const newNodesObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) { 
                    if (node.tagName === 'SELECT') initSelect(node);
                    else node.querySelectorAll('select').forEach(initSelect);
                }
            });
        });
    });
    newNodesObserver.observe(document.body, { childList: true, subtree: true });

    setInterval(checkUpdates, 500);
});