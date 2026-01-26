// 1. ON IMPORTE LA LIBRAIRIE DIRECTEMENT ICI
import SlimSelect from 'https://unpkg.com/slim-select@2.8.2/dist/slimselect.es.js';

document.addEventListener("DOMContentLoaded", () => {
    // On attend un micro-instant pour être sûr que le HTML est prêt
    setTimeout(() => {
        document.querySelectorAll('select').forEach(selectElement => {
            // Sécurité anti-doublon
            if (selectElement.dataset.ssid || selectElement.classList.contains('hidden')) return;

            new SlimSelect({
                select: selectElement,
                settings: {
                    showSearch: true,
                    searchText: 'Aucun résultat',
                    searchPlaceholder: 'Rechercher...',
                    placeholderText: 'Sélectionner...',
                }
            });
        });
    }, 50);
});