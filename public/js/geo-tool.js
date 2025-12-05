// public/js/geo-tool.js

document.addEventListener('DOMContentLoaded', () => {
    const streetInput = document.getElementById('street');
    const zipInput = document.getElementById('zip');
    const cityInput = document.getElementById('city');
    const searchBtn = document.getElementById('search-btn');
    const resultContainer = document.getElementById('result-container');
    const validateBtn = document.getElementById('validate-btn');
    const errorMsg = document.getElementById('error-msg');
    
    let map = L.map('map').setView([46.8182, 8.2275], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
    let marker;
    let currentLat, currentLon;

    // 1. Récupérer les paramètres URL (pré-remplissage)
    const params = new URLSearchParams(window.location.search);
    if(params.get('address')) streetInput.value = params.get('address');
    if(params.get('zip')) zipInput.value = params.get('zip');
    if(params.get('city')) cityInput.value = params.get('city');

    // Si on a des données, lancer la recherche auto
    if(cityInput.value) {
        setTimeout(searchAddress, 500);
    }

    async function searchAddress() {
        const query = `${streetInput.value} ${zipInput.value} ${cityInput.value}, Switzerland`;
        searchBtn.disabled = true;
        searchBtn.textContent = 'Recherche...';
        errorMsg.classList.add('hidden');

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await res.json();

            if(data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                updateMarker(lat, lon);
                resultContainer.classList.remove('hidden');
            } else {
                showError("Adresse introuvable. Essayez avec moins de détails (juste la ville).");
            }
        } catch(e) {
            showError("Erreur de connexion.");
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Rechercher';
        }
    }

    function updateMarker(lat, lon) {
        currentLat = lat;
        currentLon = lon;
        
        if(marker) map.removeLayer(marker);
        marker = L.marker([lat, lon], {draggable: true}).addTo(map);
        map.setView([lat, lon], 16);
        
        updateDisplay(lat, lon);

        marker.on('dragend', function(e) {
            const pos = marker.getLatLng();
            currentLat = pos.lat;
            currentLon = pos.lng;
            updateDisplay(currentLat, currentLon);
        });
        
        // Force le redimensionnement de la carte (bug fréquent dans les popups/modales)
        setTimeout(() => map.invalidateSize(), 200);
    }

    function updateDisplay(lat, lon) {
        document.getElementById('lat-display').textContent = lat.toFixed(6);
        document.getElementById('lon-display').textContent = lon.toFixed(6);
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
    }

    // --- COMMUNICATION AVEC LA FENÊTRE PARENTE ---
    validateBtn.addEventListener('click', () => {
        if (window.opener && typeof window.opener.receiveCoordinates === 'function') {
            window.opener.receiveCoordinates(currentLat.toFixed(6), currentLon.toFixed(6));
            window.close();
        } else {
            alert("Erreur : Impossible de communiquer avec la fenêtre principale.");
        }
    });

    searchBtn.addEventListener('click', searchAddress);
    
    // Thème
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        html.setAttribute('data-theme', html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
});