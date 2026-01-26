import SlimSelect from 'https://unpkg.com/slim-select@2.8.2/dist/slimselect.es.js';

// Registre pour suivre nos selects : Map<Element HTML, { instance: SlimSelect, count: nombre_options }>
const registry = new Map();

// 1. Fonction pour transformer un select en SlimSelect
const initSelect = (element) => {
    // Si déjà transformé ou caché, on ignore
    if (element.dataset.ssid || element.classList.contains('hidden')) return;

    // Création
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

    // On l'ajoute au registre avec son nombre d'options actuel
    registry.set(element, {
        instance: slim,
        count: element.options.length
    });
};

// 2. Fonction de vérification (Le "Polling")
// Cette fonction tourne en boucle doucement pour voir si des choses ont changé
const checkUpdates = () => {
    registry.forEach((data, element) => {
        // Si l'élément n'existe plus dans la page, on arrête de le suivre
        if (!document.body.contains(element)) {
            registry.delete(element);
            return;
        }

        // LE TEST CRUCIAL : Est-ce que le nombre d'options a changé ?
        // (Exemple : reports.js vient de charger les 570 clients)
        if (element.options.length !== data.count) {
            
            // Mise à jour des données dans SlimSelect
            const newData = Array.from(element.options).map(option => ({
                text: option.text,
                value: option.value,
                selected: option.selected,
                placeholder: option.value === '',
                style: option.style.cssText,
                class: option.className
            }));
            
            data.instance.setData(newData);
            
            // On met à jour le compteur pour ne pas refaire le travail pour rien
            data.count = element.options.length;
        }
    });
};

document.addEventListener("DOMContentLoaded", () => {
    // A. Initialisation au démarrage
    document.querySelectorAll('select').forEach(initSelect);

    // B. Détection des NOUVEAUX selects (ex: bouton "Ajouter Matériel")
    // On garde un observer simple UNIQUEMENT pour détecter l'apparition de nouveaux blocs HTML.
    // Il ne regarde pas l'intérieur des selects, donc aucun risque de boucle.
    const newNodesObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Si c'est une balise HTML
                    if (node.tagName === 'SELECT') initSelect(node);
                    else node.querySelectorAll('select').forEach(initSelect);
                }
            });
        });
    });
    newNodesObserver.observe(document.body, { childList: true, subtree: true });

    // C. LANCEMENT DU POLLING (Toutes les 500ms)
    // C'est ça qui remplace le mouchard buggé.
    setInterval(checkUpdates, 500);
});