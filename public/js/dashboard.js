let map = null;
let markers = [];
let allClients = [];
let currentFilter = 'all';

// Coordonnées précises des principales villes suisses
const cityCoords = {
  // Canton AG
  'Aarau': [47.3919, 8.0458],
  'Baden': [47.4724, 8.3064],
  'Wettingen': [47.4669, 8.3194],
  
  // Canton BE
  'Bern': [46.9480, 7.4474],
  'Biel': [47.1372, 7.2459],
  'Thun': [46.7578, 7.6283],
  'Interlaken': [46.6863, 7.8632],
  
  // Canton BS/BL
  'Basel': [47.5596, 7.5886],
  'Liestal': [47.4851, 7.7344],
  'Biel-Benken': [47.5056, 7.5533],
  
  // Canton FR
  'Fribourg': [46.8036, 7.1517],
  'Bulle': [46.6189, 7.0567],
  
  // Canton GE
  'Genève': [46.2044, 6.1432],
  'Carouge': [46.1833, 6.1389],
  
  // Canton GR
  'Chur': [46.8499, 9.5331],
  'Davos': [46.8014, 9.8364],
  
  // Canton JU
  'Delémont': [47.3654, 7.3426],
  
  // Canton LU
  'Luzern': [47.0502, 8.3093],
  'Emmen': [47.0777, 8.2989],
  
  // Canton NE
  'Neuchâtel': [46.9900, 6.9298],
  'La Chaux-de-Fonds': [47.1003, 6.8269],
  
  // Canton SG
  'St. Gallen': [47.4239, 9.3743],
  'Rapperswil': [47.2269, 8.8184],
  
  // Canton SO
  'Solothurn': [47.2078, 7.5385],
  'Olten': [47.3493, 7.9072],
  
  // Canton TG
  'Frauenfeld': [47.5530, 8.8989],
  'Kreuzlingen': [47.6430, 9.1750],
  
  // Canton TI
  'Lugano': [46.0037, 8.9511],
  'Bellinzona': [46.1928, 9.0175],
  'Locarno': [46.1701, 8.7997],
  
  // Canton VD
  'Lausanne': [46.5197, 6.6323],
  'Montreux': [46.4312, 6.9108],
  'Yverdon': [46.7785, 6.6408],
  'Vevey': [46.4601, 6.8432],
  
  // Canton VS
  'Sion': [46.2310, 7.3601],
  'Martigny': [46.1016, 7.0744],
  'Monthey': [46.2549, 6.9586],
  
  // Canton ZH
  'Zürich': [47.3769, 8.5417],
  'Winterthur': [47.5000, 8.7500],
  'Uster': [47.3478, 8.7214],
  'Wetzikon': [47.3244, 8.7975]
};

// Canton fallback coordinates
const cantonCoords = {
  AG: [47.4, 8.15], AI: [47.32, 9.42], AR: [47.37, 9.3], BE: [46.95, 7.45],
  BL: [47.48, 7.73], BS: [47.56, 7.59], FR: [46.8, 7.15], GE: [46.2, 6.15],
  GL: [47.04, 9.07], GR: [46.85, 9.53], JU: [47.35, 7.15], LU: [47.05, 8.3],
  NE: [47.0, 6.93], NW: [46.93, 8.38], OW: [46.88, 8.25], SG: [47.42, 9.37],
  SH: [47.7, 8.63], SO: [47.3, 7.53], SZ: [47.02, 8.65], TG: [47.55, 9.0],
  TI: [46.33, 8.8], UR: [46.88, 8.63], VD: [46.57, 6.65], VS: [46.23, 7.36],
  ZG: [47.17, 8.52], ZH: [47.37, 8.54]
};

let widgetSettings = {
  appointments: true,
  contacts: true,
  'maintenance-month': true,
  warranty: true,
  map: true
};

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadWidgetSettings();
  initMap();
  setupMapFilters();
  await loadDashboard();
  setupWidgetCustomization();

  document.getElementById('logout-btn').addEventListener('click', logout);
});

async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await response.json();
    
    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details">
        <strong>${data.user.name}</strong>
        <span>${data.user.role === 'admin' ? 'Administrateur' : 'Technicien'}</span>
      </div>
    `;

    if (data.user.role === 'admin') {
      document.getElementById('admin-link').classList.remove('hidden');
    }
  } catch (error) {
    window.location.href = '/login.html';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

function setupWidgetCustomization() {
  const pageHeader = document.querySelector('.page-header');
  const customizeBtn = document.createElement('button');
  customizeBtn.className = 'btn btn-secondary';
  customizeBtn.id = 'customize-widgets-btn';
  customizeBtn.innerHTML = '<i class="fas fa-th-large"></i> Personnaliser';
  customizeBtn.onclick = openWidgetCustomization;
  pageHeader.appendChild(customizeBtn);
}

function openWidgetCustomization() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content widget-selector-modal">
      <div class="modal-header">
        <h2><i class="fas fa-th-large"></i> Personnaliser le tableau de bord</h2>
        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: var(--space-6); color: var(--neutral-600)">
          Choisissez les widgets à afficher sur votre tableau de bord
        </p>
        
        <div class="widget-selector-grid">
          <div class="widget-selector-card ${widgetSettings.appointments ? 'active' : ''}" data-widget="appointments">
            <div class="widget-selector-icon"><i class="fas fa-calendar-alt"></i></div>
            <h3>Rendez-vous à venir</h3>
            <p>Prochains rendez-vous planifiés</p>
            <div class="widget-selector-toggle">
              <input type="checkbox" id="widget-check-appointments" ${widgetSettings.appointments ? 'checked' : ''} />
            </div>
          </div>
          
          <div class="widget-selector-card ${widgetSettings.contacts ? 'active' : ''}" data-widget="contacts">
            <div class="widget-selector-icon"><i class="fas fa-phone"></i></div>
            <h3>Clients à contacter</h3>
            <p>Clients nécessitant un contact</p>
            <div class="widget-selector-toggle">
              <input type="checkbox" id="widget-check-contacts" ${widgetSettings.contacts ? 'checked' : ''} />
            </div>
          </div>
          
          <div class="widget-selector-card ${widgetSettings['maintenance-month'] ? 'active' : ''}" data-widget="maintenance-month">
            <div class="widget-selector-icon"><i class="fas fa-wrench"></i></div>
            <h3>Maintenances du mois</h3>
            <p>Maintenances prévues ce mois</p>
            <div class="widget-selector-toggle">
              <input type="checkbox" id="widget-check-maintenance-month" ${widgetSettings['maintenance-month'] ? 'checked' : ''} />
            </div>
          </div>
          
          <div class="widget-selector-card ${widgetSettings.warranty ? 'active' : ''}" data-widget="warranty">
            <div class="widget-selector-icon"><i class="fas fa-shield-alt"></i></div>
            <h3>Garanties expirant</h3>
            <p>Garanties bientôt expirées</p>
            <div class="widget-selector-toggle">
              <input type="checkbox" id="widget-check-warranty" ${widgetSettings.warranty ? 'checked' : ''} />
            </div>
          </div>
          
          <div class="widget-selector-card ${widgetSettings.map ? 'active' : ''}" data-widget="map">
            <div class="widget-selector-icon"><i class="fas fa-map-marked-alt"></i></div>
            <h3>Carte des clients</h3>
            <p>Visualisation géographique</p>
            <div class="widget-selector-toggle">
              <input type="checkbox" id="widget-check-map" ${widgetSettings.map ? 'checked' : ''} />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
          <i class="fas fa-times"></i> Annuler
        </button>
        <button class="btn btn-primary" onclick="saveWidgetCustomization(this)">
          <i class="fas fa-check"></i> Enregistrer
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelectorAll('.widget-selector-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.matches('input, label')) {
        const checkbox = card.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
        card.classList.toggle('active', checkbox.checked);
      }
    });
    
    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      card.classList.toggle('active', checkbox.checked);
    });
  });
}

function saveWidgetCustomization(button) {
  widgetSettings.appointments = document.getElementById('widget-check-appointments').checked;
  widgetSettings.contacts = document.getElementById('widget-check-contacts').checked;
  widgetSettings['maintenance-month'] = document.getElementById('widget-check-maintenance-month').checked;
  widgetSettings.warranty = document.getElementById('widget-check-warranty').checked;
  widgetSettings.map = document.getElementById('widget-check-map').checked;
  
  localStorage.setItem('dashboardWidgets', JSON.stringify(widgetSettings));
  applyWidgetSettings();
  button.closest('.modal').remove();
  showNotification('Configuration enregistrée avec succès', 'success');
}

function loadWidgetSettings() {
  const saved = localStorage.getItem('dashboardWidgets');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      widgetSettings = {
        appointments: parsed.appointments !== undefined ? parsed.appointments : true,
        contacts: parsed.contacts !== undefined ? parsed.contacts : true,
        'maintenance-month': parsed['maintenance-month'] !== undefined ? parsed['maintenance-month'] : true,
        warranty: parsed.warranty !== undefined ? parsed.warranty : true,
        map: parsed.map !== undefined ? parsed.map : true
      };
    } catch (e) {
      console.error('Erreur chargement widgets:', e);
    }
  }
  applyWidgetSettings();
}

function applyWidgetSettings() {
  const widgetElements = {
    'appointments': document.getElementById('widget-appointments'),
    'contacts': document.getElementById('widget-contacts'),
    'maintenance-month': document.getElementById('widget-maintenance-month'),
    'warranty': document.getElementById('widget-warranty'),
    'map': document.getElementById('widget-map')
  };
  
  Object.keys(widgetSettings).forEach(widgetName => {
    const element = widgetElements[widgetName];
    if (element) {
      element.style.display = widgetSettings[widgetName] ? 'block' : 'none';
    }
  });
}

function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  notification.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${message}</span>
  `;

  container.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadUpcomingAppointments(),
    loadClientsToContact(),
    loadMaintenanceMonth(),
    loadWarrantyExpiring(),
    loadClientsMap()
  ]);
  
}

async function loadStats() {
  try {
    const response = await fetch('/api/dashboard/stats');
    const stats = await response.json();

    document.getElementById('stat-expired').textContent = stats.maintenanceExpired;
    document.getElementById('stat-appointments').textContent = stats.appointmentsToSchedule;
    document.getElementById('stat-uptodate').textContent = `${stats.clientsUpToDate}/${stats.totalClients}`;
    document.getElementById('stat-equipment').textContent = stats.equipmentInstalled;
  } catch (error) {
    console.error('Erreur stats:', error);
  }
}

async function loadUpcomingAppointments() {
  try {
    const response = await fetch('/api/dashboard/upcoming-appointments');
    const appointments = await response.json();
    const list = document.getElementById('appointments-list');
    
    if (appointments.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--neutral-500)">Aucun rendez-vous.</p>';
      return;
    }

    list.innerHTML = appointments.map(apt => `
      <div class="widget-item">
        <strong>${apt.cabinet_name}</strong>
        <small><i class="fas fa-calendar"></i> ${formatDate(apt.appointment_at)} • ${apt.phone || 'N/A'}</small>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur RDV:', error);
  }
}

async function loadClientsToContact() {
  try {
    const response = await fetch('/api/dashboard/clients-to-contact');
    const clients = await response.json();
    const list = document.getElementById('contacts-list');
    
    if (clients.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--neutral-500)">Aucun client.</p>';
      return;
    }

    list.innerHTML = clients.map(c => `
      <div class="widget-item">
        <strong>${c.cabinet_name}</strong>
        <small><i class="fas fa-wrench"></i> ${formatDate(c.maintenance_due_date)} • ${c.phone || 'N/A'}</small>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur contacts:', error);
  }
}

async function loadMaintenanceMonth() {
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const response = await fetch('/api/clients?page=1&limit=1000');
    const data = await response.json();
    const maintenances = data.clients.filter(c => c.maintenance_due_date >= start && c.maintenance_due_date <= end);
    const list = document.getElementById('maintenance-month-list');
    
    if (maintenances.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--neutral-500)">Aucune maintenance.</p>';
      return;
    }

    list.innerHTML = maintenances.map(c => `
      <div class="widget-item">
        <strong>${c.cabinet_name}</strong>
        <small><i class="fas fa-calendar-check"></i> ${formatDate(c.maintenance_due_date)} • ${c.city}</small>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur maintenances:', error);
  }
}

async function loadWarrantyExpiring() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await fetch('/api/clients?page=1&limit=1000');
    const data = await response.json();

    const equipmentPromises = data.clients.map(async (client) => {
      const eq_resp = await fetch(`/api/clients/${client.id}/equipment`);
      const equipment = await eq_resp.json();
      return equipment.filter(eq => eq.warranty_until && eq.warranty_until >= today && eq.warranty_until <= future)
        .map(eq => ({ ...eq, client_name: client.cabinet_name }));
    });

    const all = (await Promise.all(equipmentPromises)).flat();
    const list = document.getElementById('warranty-list');
    
    if (all.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--neutral-500)">Aucune garantie.</p>';
      return;
    }

    list.innerHTML = all.sort((a,b) => a.warranty_until.localeCompare(b.warranty_until))
      .map(eq => `
        <div class="widget-item">
          <strong>${eq.name} - ${eq.client_name}</strong>
          <small><i class="fas fa-shield-alt"></i> ${formatDate(eq.warranty_until)}</small>
        </div>
      `).join('');
  } catch (error) {
    console.error('Erreur garanties:', error);
  }
}

async function loadClientsMap() {
  try {
    const response = await fetch('/api/dashboard/clients-map');
    const clients = await response.json();
    const clientsWithEq = await Promise.all(clients.map(async (c) => {
      try {
        const eq_resp = await fetch(`/api/clients/${c.id}/equipment`);
        const equipment = await eq_resp.json();
        return { ...c, equipment };
      } catch {
        return { ...c, equipment: [] };
      }
    }));
    allClients = clientsWithEq;
    updateMapMarkers();
  } catch (error) {
    console.error('Erreur carte:', error);
  }
}

function getCoordinatesForClient(client) {
  // Nettoyer le nom de la ville
  const city = client.city.trim();
  
  // Chercher coordonnées exactes de la ville
  if (cityCoords[city]) {
    return cityCoords[city];
  }
  
  // Fallback sur les coordonnées du canton avec petit décalage aléatoire
  const cantonBase = cantonCoords[client.canton] || [46.8, 8.2];
  return [
    cantonBase[0] + (Math.random() - 0.5) * 0.05,
    cantonBase[1] + (Math.random() - 0.5) * 0.05
  ];
}

function updateMapMarkers() {
  if (!map) {
    console.warn('Carte non initialisée, impossible d\'ajouter les marqueurs');
    return;
  }
  
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const filtered = allClients.filter(c => currentFilter === 'all' || c.status === currentFilter);
  
  filtered.forEach(client => {
    const coords = getCoordinatesForClient(client);
    const color = client.status === 'expired' ? '#dc2626' : client.status === 'warning' ? '#f59e0b' : '#16a34a';

    const marker = L.circleMarker(coords, {
      radius: 8, 
      fillColor: color, 
      color: '#fff', 
      weight: 2, 
      opacity: 1, 
      fillOpacity: 0.8
    }).addTo(map);

    const badge = client.status === 'expired' 
      ? '<span class="map-popup-badge badge-danger"><i class="fas fa-exclamation-circle"></i> Expiré</span>'
      : client.status === 'warning'
      ? '<span class="map-popup-badge badge-warning"><i class="fas fa-clock"></i> Bientôt</span>'
      : '<span class="map-popup-badge badge-success"><i class="fas fa-check-circle"></i> OK</span>';

    // 🔥 NOUVEAU : Pop-up amélioré
    function getEquipmentBadge(nextMaintenanceDate) {
      if (!nextMaintenanceDate) {
        return '<span class="badge badge-primary" style="font-size: 10px !important; padding: 0.25rem 0.5rem !important;"><i class="fas fa-clock"></i> À définir</span>';
      }
      
      const date = new Date(nextMaintenanceDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const diffTime = date - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return `<span class="badge badge-danger" style="font-size: 10px !important; padding: 0.25rem 0.5rem !important;"><i class="fas fa-exclamation-circle"></i> Expiré (${Math.abs(diffDays)}j)</span>`;
      } else if (diffDays <= 30) {
        return `<span class="badge badge-warning" style="font-size: 10px !important; padding: 0.25rem 0.5rem !important;"><i class="fas fa-clock"></i> ${diffDays} jours</span>`;
      } else {
        return `<span class="badge badge-success" style="font-size: 10px !important; padding: 0.25rem 0.5rem !important;"><i class="fas fa-check-circle"></i> ${diffDays} jours</span>`;
      }
    }

    const eq_html = client.equipment && client.equipment.length > 0
      ? `<div class="map-popup-section">
          <div class="map-popup-section-title"><i class="fas fa-tools"></i> Équipements (${client.equipment.length})</div>
          ${client.equipment.map(eq => `
            <div class="map-popup-equipment">
              <div class="map-popup-equipment-info">
                <strong>${escapeHtml(eq.name)}</strong>
                <small>${escapeHtml(eq.brand)} ${eq.model ? '- ' + escapeHtml(eq.model) : ''}</small>
                ${eq.serial_number ? `<small style="color: var(--neutral-500);"><i class="fas fa-barcode"></i> ${escapeHtml(eq.serial_number)}</small>` : ''}
              </div>
              <div class="map-popup-equipment-badge">
                ${getEquipmentBadge(eq.next_maintenance_date)}
              </div>
            </div>
          `).join('')}
        </div>`
      : '<div class="map-popup-section"><em style="color: var(--neutral-500);">Aucun équipement installé</em></div>';

    marker.bindPopup(`
      <div class="map-popup">
        <div class="map-popup-header">
          <h3>${escapeHtml(client.cabinet_name)}</h3>
          ${badge}
        </div>
        <div class="map-popup-section">
          <div class="map-popup-row"><i class="fas fa-user"></i><span>${escapeHtml(client.contact_name)}</span></div>
          <div class="map-popup-row"><i class="fas fa-briefcase"></i><span>${escapeHtml(client.activity)}</span></div>
          <div class="map-popup-row"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(client.address)}, ${client.postal_code || ''} ${escapeHtml(client.city)}</span></div>
          ${client.phone ? `<div class="map-popup-row"><i class="fas fa-phone"></i><a href="tel:${client.phone}">${escapeHtml(client.phone)}</a></div>` : ''}
          ${client.email ? `<div class="map-popup-row"><i class="fas fa-envelope"></i><a href="mailto:${client.email}">${escapeHtml(client.email)}</a></div>` : ''}
        </div>
        ${eq_html}
        <div class="map-popup-footer">
          <button class="map-popup-link" onclick="openClientFromMap(${client.id})">
            <i class="fas fa-folder-open"></i> Voir la fiche complète
          </button>
        </div>
      </div>
    `, { maxWidth: 450, className: 'map-popup-container' });
    markers.push(marker);
  });
}

// Fonction globale pour ouvrir la fiche client depuis la carte
window.openClientFromMap = async function(clientId) {
  // Charger le script clients.js si pas déjà fait
  if (typeof openClientModal === 'undefined') {
    // Rediriger vers la page clients avec l'ID
    window.location.href = `/clients.html?open=${clientId}`;
  } else {
    // Si on est déjà sur la page clients, ouvrir directement
    await openClientModal(clientId);
  }
};

function setupMapFilters() {
  document.querySelectorAll('.map-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      updateMapMarkers();
    });
  });
}

function initMap() {
  try {
    map = L.map('map').setView([46.8, 8.2], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    console.log('Carte initialisée avec succès');
  } catch (error) {
    console.error('Erreur initialisation carte:', error);
  }
}

function formatDate(d) {
  if (!d) return '-';
  const [y,m,day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Rafraîchir toutes les 60 secondes
setInterval(() => {
  loadDashboard();
}, 60000);