// public/js/dashboard.js

let map = null;
let markers = [];
let allClients = [];
let currentFilter = "all";
let currentUser = null;

// Coordonnées
const cityCoords = { Aarau: [47.3919, 8.0458], Baden: [47.4724, 8.3064], Bern: [46.948, 7.4474], Biel: [47.1372, 7.2459], Basel: [47.5596, 7.5886], "Biel-Benken": [47.5056, 7.5533], Fribourg: [46.8036, 7.1517], Genève: [46.2044, 6.1432], Lausanne: [46.5197, 6.6323], Zürich: [47.3769, 8.5417], Winterthur: [47.5, 8.75], Neuchâtel: [46.99, 6.9298] };
const cantonCoords = { AG: [47.4, 8.15], AI: [47.32, 9.42], AR: [47.37, 9.3], BE: [46.95, 7.45], BL: [47.48, 7.73], BS: [47.56, 7.59], FR: [46.8, 7.15], GE: [46.2, 6.15], GL: [47.04, 9.07], GR: [46.85, 9.53], JU: [47.35, 7.15], LU: [47.05, 8.3], NE: [47.0, 6.93], NW: [46.93, 8.38], OW: [46.88, 8.25], SG: [47.42, 9.37], SH: [47.7, 8.63], SO: [47.3, 7.53], SZ: [47.02, 8.65], TG: [47.55, 9.0], TI: [46.33, 8.8], UR: [46.88, 8.63], VD: [46.57, 6.65], VS: [46.23, 7.36], ZG: [47.17, 8.52], ZH: [47.37, 8.54] };

// Remplacez la ligne existante par celle-ci :
let widgetSettings = { appointments: true, contacts: true, "maintenance-month": true, warranty: true, map: true, tickets: true, activity: true };

const customDashboardStyles = `

.page-header {
  position: sticky; top: 0; z-index: 400;
  /* On remplace la hauteur fixe par une hauteur minimale et un bon padding */
  min-height: 70px; 
  padding: 1rem 3rem;
  background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
  display: flex; align-items: center; justify-content: space-between;
}

  /* --- 1. LAYOUT & ALIGNEMENT (Ne pas toucher) --- */
  .stats-grid, .widgets-grid, .checklists-grid, .table-controls { margin-left: 3rem !important; margin-right: 3rem !important; width: auto !important; }
  .stats-grid { margin-top: 4rem !important; }

  /* --- 2. CARTES STATISTIQUES (HAUT) - STYLE INTERACTIF --- */
  .stat-card { border-left-width: 6px !important; border-left-style: solid !important; position: relative; overflow: hidden; transition: transform 0.2s ease; cursor: pointer;}
  .stat-card:hover { transform: translateY(-3px); box-shadow: 0 4px 6px rgba(0,0,0,0.1);}
  .stat-card.danger { border-left-color: var(--color-danger); }
  .stat-card.danger .value { color: var(--color-danger); font-weight: 800; }
  .stat-card.danger::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(220, 38, 38, 0.05) 0%, transparent 100%); pointer-events: none; }
  .stat-card.warning { border-left-color: var(--color-warning); }
  .stat-card.warning .value { color: #d97706; font-weight: 800; }
  .stat-card.warning::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(245, 158, 11, 0.05) 0%, transparent 100%); pointer-events: none; }
  .stat-card.success { border-left-color: var(--color-success); }
  .stat-card.success .value { color: var(--color-success); font-weight: 800; }
  .stat-card.success::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(22, 163, 74, 0.05) 0%, transparent 100%); pointer-events: none; }
  .stat-card.info { border-left-color: var(--color-primary); }
  .stat-card.info .value { color: var(--color-primary); font-weight: 800; }
  .stat-card.info::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(2, 132, 199, 0.05) 0%, transparent 100%); pointer-events: none; }

  /* --- 3. WIDGETS DU BAS --- */
  .widget {
    background: white !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
    display: flex;
    flex-direction: column;
    transition: transform 0.2s ease;
    border-top-width: 4px !important; /* Bordure en haut pour tout le monde */
    border-top-style: solid !important;
    min-height: 100%; /* S'assure que le contenu remplit la boîte */
  }
  .widget-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s; cursor: pointer; border-left: 3px solid transparent; }
  .widget-selector-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
  .widget-selector-card { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; text-align: center; cursor: pointer; transition: all 0.2s; position: relative; }
  .widget-selector-card:hover { border-color: var(--color-primary-light, #e0f2fe); transform: translateY(-3px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
  .widget-selector-card.active { border-color: var(--color-primary, #0284c7); background-color: var(--color-primary-light, #f0f9ff); }
  .widget-selector-icon { font-size: 2rem; margin-bottom: 1rem; color: #94a3b8; }
  .widget-selector-card.active .widget-selector-icon { color: var(--color-primary, #0284c7); }
  .widget-selector-card h3 { font-size: 1rem; margin: 0 0 0.5rem 0; color: #1e293b; }
  .widget-selector-card p { font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4; }
  .widget-selector-toggle { position: absolute; top: 10px; right: 10px; }
  
  .widget-item:hover { background-color: #f8fafc; border-left-color: var(--color-primary); padding-left: 18px; }
  .widget-item:last-child { border-bottom: none; }
  
  .item-danger { border-left-color: var(--color-danger) !important; background: #fff5f5; }
  .item-warning { border-left-color: var(--color-warning) !important; }
  .widget-content {
    flex-grow: 1; /* Permet au contenu de prendre toute la place et d'aligner les pieds de widgets */
    display: flex;
    flex-direction: column;
  }

  /* Badges */
  .badge-mini { font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
  .bg-red { background: #fee2e2; color: #991b1b; }
  .bg-blue { background: #e0f2fe; color: #0369a1; }
  .empty-widget { padding: 2rem; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }

  /* --- 4. CARTE CLIENTS (MAP) --- */
  .map-wrapper-fixed { margin: 2rem 3rem !important; width: auto !important; background: white !important; border: 1px solid var(--border-color) !important; border-radius: var(--radius-lg) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; padding: 0 !important; }
  #widget-map { max-width: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; background: transparent !important; }
  .map-filters { padding: 1rem 1.5rem !important; margin: 0 !important; border-bottom: 1px solid var(--border-color) !important; background: #fff !important; display: flex !important; flex-wrap: wrap !important; gap: 10px !important; width: 100% !important; box-sizing: border-box !important; }
  #map { width: 100% !important; height: 600px !important; margin: 0 !important; border: none !important; flex-grow: 1 !important; }
  
  .map-filter-btn { border-radius: 50px !important; padding: 0.5rem 1.25rem !important; font-weight: 600 !important; font-size: 0.85rem !important; border: 1px solid #e2e8f0 !important; background: white !important; color: #64748b !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; display: inline-flex !important; align-items: center !important; gap: 6px !important; }
  .map-filter-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.05) !important; color: #1e293b !important; }
  .map-filter-btn.active { border-color: transparent !important; color: white !important; box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important; }
  
  button[data-filter="all"].active, .map-filters button:nth-child(1).active { background-color: var(--color-primary) !important; }
  button[data-filter="up_to_date"].active, .map-filters button:nth-child(2).active { background-color: var(--color-success) !important; }
  button[data-filter="warning"].active, .map-filters button:nth-child(3).active { background-color: var(--color-warning) !important; }
  button[data-filter="expired"].active, .map-filters button:nth-child(4).active { background-color: var(--color-danger) !important; }
  button[data-filter="ghost"].active { background-color: #64748b !important; border-color: transparent !important; color: white !important; }

  .leaflet-popup-close-button { color: white !important; font-size: 24px !important; font-weight: bold !important; top: 10px !important; right: 10px !important; text-shadow: 0 1px 2px rgba(0,0,0,0.3); opacity: 1 !important; }
  .leaflet-popup-close-button:hover { color: #e0e0e0 !important; }

  /* --- 5. DIVERS --- */
  .group-row { cursor: pointer; transition: background 0.2s; }
  .group-row:hover { background-color: #f8fafc; }
  .group-row.expanded { background-color: #f1f5f9; }
  .group-details { display: none; background-color: #f8fafc; }
  .group-details.show { display: table-row; animation: fadeIn 0.3s; }
  .fa-chevron-down { transition: transform 0.2s; }
  .expanded .fa-chevron-down { transform: rotate(180deg); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  /* --- 6. MASQUER LE GROS FOOTER SUR LE DASHBOARD --- */
  .app-footer { display: none !important; }
  
  /* On s'assure que la map a un bel espace de fin */
  .map-wrapper-fixed { margin-bottom: 3rem !important; }
`;

document.addEventListener("DOMContentLoaded", async () => {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = customDashboardStyles;
  document.head.appendChild(styleSheet);

  const mapElement = document.getElementById("map");
  if (mapElement) {
    const mapContainer = mapElement.parentElement;
    if (mapContainer) mapContainer.classList.add("map-wrapper-fixed");
  }

  await checkAuth();
  loadWidgetSettings();
  initMap();
  setupMapFilters();
  await loadDashboard();
  setupWidgetCustomization();
  document.getElementById("logout-btn").addEventListener("click", logout);
});

async function checkAuth() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) { window.location.href = "/login.html"; return; }
    const data = await response.json();
    currentUser = data.user;

    let roleDisplay = "Technicien";
    if (data.user.role === "admin") roleDisplay = "Administrateur";
    else if (data.user.role === "validator") roleDisplay = "Validateur";
    else if (data.user.role === "verifier" || data.user.role === "verificateur") roleDisplay = "Vérificateur";
    else if (data.user.role === "secretary") roleDisplay = "Secrétariat";

    document.getElementById("user-info").innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details"><strong>${data.user.name}</strong><span>${roleDisplay}</span></div>
    `;
  } catch { window.location.href = "/login.html"; }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
}

function setupWidgetCustomization() {
  const h = document.querySelector(".page-header");
  if (h) {
    const existingBtn = h.querySelector(".btn-custom-widget");
    if (existingBtn) existingBtn.remove();
    const b = document.createElement("button");
    b.className = "btn btn-secondary btn-custom-widget";
    b.innerHTML = '<i class="fas fa-th-large"></i> Personnaliser';
    b.onclick = openWidgetCustomization;
    h.appendChild(b);
  }
}

function openWidgetCustomization() {
  const m = document.createElement("div");
  m.className = "modal active";
  m.innerHTML = `
    <div class="modal-content widget-selector-modal" style="max-width:900px; width:90%;">
        <div class="modal-header" style="padding: 1.5rem;">
            <h2><i class="fas fa-th-large" style="color:var(--color-primary)"></i> Personnaliser le tableau de bord</h2>
            <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 2rem;">
            <p style="margin-bottom:1.5rem;color:var(--neutral-500);">Sélectionnez les widgets que vous souhaitez afficher sur votre vue d'ensemble.</p>
            <div class="widget-selector-grid">
                ${createWidgetCard("appointments", "fa-calendar-alt", "Rendez-vous", "Prochains RDV prévus")}
                ${createWidgetCard("contacts", "fa-phone", "À contacter", "Suivi clients & rappels")}
                ${createWidgetCard("maintenance-month", "fa-wrench", "Maintenances", "Prévues ce mois-ci")}
                ${createWidgetCard("warranty", "fa-shield-alt", "Garanties", "Équipements expirant bientôt")}
                ${createWidgetCard("map", "fa-map-marked-alt", "Carte Clients", "Vue géographique interactive")}
                ${createWidgetCard("tickets", "fa-ticket-alt", "Tickets", "Urgences et suivis")}
                ${createWidgetCard("activity", "fa-rss", "Activité", "Flux des dernières actions")}
            </div>
        </div>
        <div class="modal-footer" style="padding: 1.5rem;">
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Annuler</button>
            <button class="btn btn-primary" onclick="saveWidgetCustomization(this)">Enregistrer les préférences</button>
        </div>
    </div>`;
  document.body.appendChild(m);
}

function createWidgetCard(id, icon, title, desc) {
  const a = widgetSettings[id];
  return `
    <div class="widget-selector-card ${a ? "active" : ""}" onclick="toggleWidgetCard(this,'${id}')">
        <div class="widget-selector-toggle">
            <input type="checkbox" id="widget-check-${id}" ${a ? "checked" : ""} style="accent-color:var(--color-primary); transform:scale(1.2);" onclick="event.stopPropagation();toggleWidgetCard(this.closest('.widget-selector-card'),'${id}')">
        </div>
        <div class="widget-selector-icon"><i class="fas ${icon}"></i></div>
        <h3>${title}</h3><p>${desc}</p>
    </div>`;
}

window.toggleWidgetCard = function (c, n) {
  const k = c.querySelector('input[type="checkbox"]');
  if (event.target !== k) k.checked = !k.checked;
  if (k.checked) c.classList.add("active"); else c.classList.remove("active");
};

function saveWidgetCustomization(b) {
  widgetSettings.appointments = document.getElementById("widget-check-appointments").checked;
  widgetSettings.contacts = document.getElementById("widget-check-contacts").checked;
  widgetSettings["maintenance-month"] = document.getElementById("widget-check-maintenance-month").checked;
  widgetSettings.warranty = document.getElementById("widget-check-warranty").checked;
  widgetSettings.map = document.getElementById("widget-check-map").checked;
  widgetSettings.tickets = document.getElementById("widget-check-tickets").checked;
  widgetSettings.activity = document.getElementById("widget-check-activity").checked;
  localStorage.setItem("dashboardWidgets", JSON.stringify(widgetSettings));
  applyWidgetSettings();
  b.closest(".modal").remove();
  showNotification("Configuration enregistrée", "success");
}

function loadWidgetSettings() {
  const s = localStorage.getItem("dashboardWidgets");
  if (s) {
    try {
      const p = JSON.parse(s);
      Object.keys(p).forEach((k) => { if (widgetSettings[k] !== undefined) widgetSettings[k] = p[k]; });
    } catch (e) {}
  }
  applyWidgetSettings();
}

function applyWidgetSettings() {
  const i = { appointments: "widget-appointments", contacts: "widget-contacts", "maintenance-month": "widget-maintenance-month", warranty: "widget-warranty", map: "widget-map", tickets: "widget-tickets", activity: "widget-activity" };
  Object.keys(widgetSettings).forEach((k) => {
    const e = document.getElementById(i[k]);
    if (e) e.style.display = widgetSettings[k] ? "block" : "none";
  });
}

function showNotification(m, t = "info") {
  let c = document.getElementById("notification-container");
  if (!c) { c = document.createElement("div"); c.id = "notification-container"; c.className = "notification-container"; document.body.appendChild(c); }
  const n = document.createElement("div"); n.className = `notification notification-${t}`; n.innerHTML = `<i class="fas ${t === "success" ? "fa-check-circle" : t === "error" ? "fa-exclamation-circle" : "fa-info-circle"}"></i><span>${m}</span>`;
  c.appendChild(n); setTimeout(() => n.classList.add("show"), 10); setTimeout(() => { n.classList.remove("show"); setTimeout(() => n.remove(), 300); }, 3000);
}

async function loadDashboard() {
  await Promise.all([
    loadStats(), loadUpcomingAppointments(), loadClientsToContact(), loadClientsMap(), loadPendingReportsWidget(),loadTicketsWidget(), loadActivityWidget()
  ]);
  const maintenanceWidget = document.getElementById('widget-maintenance-month');
  if(maintenanceWidget) maintenanceWidget.style.display = 'none';
  const warrantyWidget = document.getElementById('widget-warranty');
  if(warrantyWidget) warrantyWidget.style.display = 'none';
  setupStatClickHandlers();
}

function setupStatClickHandlers() {
  document.querySelector(".stat-card.danger").onclick = () => openStatPopup("expired");
  document.querySelector(".stat-card.warning").onclick = () => openStatPopup("warning");
  const successCard = document.querySelector(".stat-card.success");
  if(successCard) { successCard.onclick = null; successCard.style.cursor = "default"; }
}

async function loadPendingReportsWidget() {
  try {
    const res = await fetch("/api/reports/stats");
    const stats = await res.json();
    const pendingCount = stats.pending || 0;
    const validatedCount = stats.validated || 0;
    const role = currentUser?.role;
    const sidebarLink = document.querySelector('a[href="/reports.html"]');
    
    if (sidebarLink) {
      const oldBadge = sidebarLink.querySelector(".sidebar-badge");
      if (oldBadge) oldBadge.remove();
      let badgeCount = 0;
      const canValidate = ["admin", "validator", "sales_director", "verifier", "verificateur"].includes(role);
      const canArchive = ["admin", "secretary"].includes(role);
      if (canValidate) badgeCount += pendingCount;
      if (canArchive) badgeCount += validatedCount;
      if (badgeCount > 0) {
        const badge = document.createElement("span");
        badge.className = "sidebar-badge";
        badge.style.cssText = "background:#ef4444; color:white; font-size:0.75rem; padding:2px 6px; border-radius:10px; margin-left:auto; font-weight:bold;";
        badge.textContent = badgeCount;
        sidebarLink.appendChild(badge);
        sidebarLink.style.display = "flex";
        sidebarLink.style.alignItems = "center";
      }
    }

    const grid = document.querySelector(".widgets-grid");
    if (!grid) return;
    document.getElementById("widget-validation")?.remove();
    document.getElementById("widget-archiving")?.remove();

    const canValidate = ["admin", "validator", "sales_director", "verifier", "verificateur"].includes(role);
    const canArchive = ["admin", "secretary"].includes(role);

    if (canValidate && pendingCount > 0) {
      const r = await fetch("/api/reports?status=pending&limit=5");
      const data = await r.json();
      const widgetHtml = `<div class="widget" id="widget-validation" style="border: 2px solid #ef4444;"><div class="widget-header" style="background: #fee2e2;"><h2 style="color: #991b1b;"><i class="fas fa-file-signature"></i> Rapports à valider (${pendingCount})</h2></div><div class="widget-content">${data.reports.map(rep => `<div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/reports.html?status=pending'"><div style="display:flex; justify-content:space-between;"><strong>${escapeHtml(rep.cabinet_name)}</strong><span class="badge badge-warning">En attente</span></div><small>${escapeHtml(rep.work_type)} • ${formatDate(rep.created_at)}</small></div>`).join("")}${pendingCount > 5 ? `<div style="text-align:center; padding-top:10px;"><a href="/reports.html?status=pending" style="color:#ef4444; font-weight:bold;">Voir tout (${pendingCount})</a></div>` : ""}</div></div>`;
      grid.insertAdjacentHTML("afterbegin", widgetHtml);
    }

    if (canArchive && validatedCount > 0) {
      const r = await fetch("/api/reports?status=validated&limit=5");
      const data = await r.json();
      const widgetHtml = `<div class="widget" id="widget-archiving" style="border: 2px solid #ef4444;"><div class="widget-header" style="background: #fee2e2;"><h2 style="color: #991b1b;"><i class="fas fa-archive"></i> Rapports à archiver (${validatedCount})</h2></div><div class="widget-content">${data.reports.map(rep => `<div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/reports.html?status=validated'"><div style="display:flex; justify-content:space-between;"><strong>${escapeHtml(rep.cabinet_name)}</strong><span class="badge badge-success">Validé</span></div><small>${escapeHtml(rep.work_type)} • Validé par ${escapeHtml(rep.validator_name)}</small></div>`).join("")}${validatedCount > 5 ? `<div style="text-align:center; padding-top:10px;"><a href="/reports.html?status=validated" style="color:#b91c1c; font-weight:bold;">Voir tout (${validatedCount})</a></div>` : ""}</div></div>`;
      grid.insertAdjacentHTML("afterbegin", widgetHtml);
    }
  } catch (e) {}
}

async function loadStats() {
  try {
    const r = await fetch("/api/dashboard/stats");
    const s = await r.json();
    const [resExpired, resWarning] = await Promise.all([ fetch("/api/dashboard/details?type=expired"), fetch("/api/dashboard/details?type=warning") ]);
    const jsonExpired = await resExpired.json();
    const jsonWarning = await resWarning.json();

    document.getElementById("stat-expired").textContent = jsonExpired.length;
    document.getElementById("stat-appointments").textContent = jsonWarning.length;
    document.getElementById("stat-uptodate").textContent = `${s.clientsUpToDate}/${s.totalClients}`;
    document.getElementById("stat-equipment").textContent = s.equipmentInstalled;
  } catch (e) {}
}

async function loadUpcomingAppointments() {
  try {
    const r = await fetch("/api/dashboard/upcoming-appointments");
    const data = await r.json();
    const l = document.getElementById("appointments-list");
    if (data.length === 0) { l.innerHTML = '<div class="widget-empty" style="color:#94a3b8; padding:1.5rem; text-align:center;"><i class="fas fa-check" style="opacity:0.3; display:block; margin-bottom:5px; font-size:1.2rem;"></i>Rien à l\'agenda</div>'; return; }
    const MAX = 5;
    const list = data.slice(0, MAX);
    l.innerHTML = list.map(rdv => {
        const dateStr = new Date(rdv.appointment_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let techText = rdv.technician_names ? `<span style="color:#64748b;">${escapeHtml(rdv.technician_names)}</span>` : '<span style="color:#cbd5e1; font-style:italic;">Non assigné</span>';
        return `
        <div class="widget-item" style="padding:10px 15px; border-bottom:1px solid #f8fafc; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="window.location.href='/clients.html?open=${rdv.client_id}'">
             <div style="min-width:0;">
                <div style="font-weight:600; color:#334155; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(rdv.cabinet_name)}</div>
                <div style="font-size:0.8rem; margin-top:1px;">${techText}</div>
             </div>
             <div style="text-align:right; flex-shrink:0; margin-left:10px;">
                <div style="font-size:0.85rem; font-weight:600; color:#475569;">${dateStr}</div>
                <button onclick="event.stopPropagation(); window.location.href='/clients.html?open=${rdv.client_id}&edit_rdv=${rdv.appointment_id}'" style="background:none; border:none; color:#94a3b8; cursor:pointer; padding:2px;"><i class="fas fa-pen" style="font-size:0.8rem;"></i></button>
             </div>
        </div>`;
    }).join('');
    if (data.length > MAX) l.innerHTML += `<div style="text-align:center; padding:8px; font-size:0.8rem;"><a href="#" onclick="event.preventDefault(); openStatPopup('appointments_full')" style="color:#64748b; text-decoration:none;">Voir les ${data.length} RDV</a></div>`;
  } catch (e) {}
}

async function loadClientsToContact() {
  try {
    const r = await fetch("/api/dashboard/clients-to-contact");
    const data = await r.json();
    const l = document.getElementById("contacts-list");
    if (data.length === 0) { l.innerHTML = '<div class="widget-empty" style="color:#94a3b8; padding:1.5rem; text-align:center;"><i class="fas fa-smile" style="opacity:0.3; display:block; margin-bottom:5px; font-size:1.2rem;"></i>Tout est à jour</div>'; return; }
    const MAX = 5;
    const list = data.slice(0, MAX);
    l.innerHTML = list.map(c => {
        const dateStr = new Date(c.maintenance_due_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `
        <div class="widget-item" style="padding:10px 15px; border-bottom:1px solid #f8fafc; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="window.location.href='/clients.html?open=${c.id}'">
             <div style="min-width:0;">
                <div style="font-weight:600; color:#334155; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.cabinet_name)}</div>
                <div style="font-size:0.8rem; color:#94a3b8;"><i class="fas fa-phone" style="font-size:0.7rem;"></i> ${escapeHtml(c.phone || '-')}</div>
             </div>
             <div style="text-align:right; flex-shrink:0; margin-left:10px;">
                <div style="font-size:0.85rem; font-weight:600; color:#ef4444;">${dateStr}</div>
             </div>
        </div>`;
    }).join('');
    if (data.length > MAX) l.innerHTML += `<div style="text-align:center; padding:8px; font-size:0.8rem;"><a href="#" onclick="event.preventDefault(); openStatPopup('contacts_full')" style="color:#64748b; text-decoration:none;">Voir les ${data.length} clients</a></div>`;
  } catch(e) {}
}

async function loadClientsMap() {
  try {
    const r = await fetch("/api/dashboard/clients-map");
    const clients = await r.json();
    allClients = await Promise.all(
      clients.map(async (c) => {
        try {
          const er = await fetch(`/api/clients/${c.id}/equipment`);
          const eq = await er.json();
          return { ...c, equipment: eq };
        } catch { return { ...c, equipment: [] }; }
      })
    );
    updateMapMarkers();
  } catch {}
}

function getCoordinatesForClient(client) {
  if (client.latitude && client.longitude) return [client.latitude, client.longitude];
  if (cityCoords[client.city.trim()]) return cityCoords[client.city.trim()];
  const base = cantonCoords[client.canton] || [46.8, 8.2];
  return [base[0] + (Math.random() - 0.5) * 0.05, base[1] + (Math.random() - 0.5) * 0.05];
}

function updateMapMarkers() {
  if (!map) return;
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  
  // 1. NOUVEAU FILTRAGE INTELLIGENT
  const filtered = allClients.filter(c => {
      if (currentFilter === "all") return c.status !== "ghost";
      
      if (currentFilter === "ghost") {
          // Si on cherche les fantômes, on affiche les clients 100% fantômes 
          // MAIS AUSSI les clients normaux qui ont au moins 1 machine secondaire !
          return c.status === "ghost" || (c.equipment && c.equipment.some(e => e.is_secondary === 1 || e.catalog_is_secondary === 1));
      }
      
      return c.status === currentFilter;
  });

  filtered.forEach((client) => {
    const coords = getCoordinatesForClient(client);
    
    // 2. FORCER L'APPARTENANCE VISUELLE AU FILTRE
    let displayStatus = client.status;
    if (currentFilter === "ghost") displayStatus = "ghost"; // Force le gris si on est dans le filtre "Hors contrat"

    let color = "#16a34a"; // Vert
    if (displayStatus === "expired") color = "#dc2626";
    else if (displayStatus === "warning") color = "#f59e0b";
    else if (displayStatus === "planned") color = "#3b82f6";
    else if (displayStatus === "ghost") color = "#94a3b8"; // Gris

    const marker = L.circleMarker(coords, {
      radius: 8, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
    }).addTo(map);

    let badgeClass = "badge-success", badgeText = "À jour", badgeIcon = "fa-check-circle", headerBg = "var(--color-success, #16a34a)";

    if (displayStatus === "expired") { badgeClass = "badge-danger"; badgeText = "Expiré"; badgeIcon = "fa-times-circle"; headerBg = "var(--color-danger, #dc2626)"; } 
    else if (displayStatus === "warning") { badgeClass = "badge-warning"; badgeText = "Bientôt"; badgeIcon = "fa-exclamation-triangle"; headerBg = "var(--color-warning, #f59e0b)"; } 
    else if (displayStatus === "planned") { badgeClass = "badge-primary"; badgeText = "RDV Planifié"; badgeIcon = "fa-calendar-check"; headerBg = "var(--color-primary, #0284c7)"; }
    else if (displayStatus === "ghost") { badgeClass = "badge-secondary"; badgeText = "Hors contrat"; badgeIcon = "fa-ghost"; headerBg = "#64748b"; }

    const getEqBadge = (date, isSecondary) => {
      if (isSecondary) return `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:10px!important;padding:2px 6px;">Hors contrat</span>`;
      if (!date) return '<span class="badge badge-primary" style="font-size:10px!important;padding:2px 6px;">À définir</span>';
      const d = new Date(date); d.setHours(0,0,0,0); 
      const now = new Date(); now.setHours(0,0,0,0); 
      const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) return `<span class="badge badge-danger" style="font-size:10px!important;padding:2px 6px;">Expiré (${Math.abs(diff)}j)</span>`;
      if (diff <= 30) return `<span class="badge badge-warning" style="font-size:10px!important;padding:2px 6px;">${diff} jours</span>`;
      return `<span class="badge badge-success" style="font-size:10px!important;padding:2px 6px;">OK</span>`;
    };

    // 3. GESTION DE L'AFFICHAGE DANS LA POPUP
    let visibleEquipment = client.equipment || [];
    if (currentFilter === "ghost") {
        // En mode "Hors contrat", on n'affiche QUE les machines secondaires
        if (client.status !== "ghost" || visibleEquipment.some(e => e.is_secondary === 1 || e.catalog_is_secondary === 1)) {
            visibleEquipment = visibleEquipment.filter(e => e.is_secondary === 1 || e.catalog_is_secondary === 1);
        }
    } else {
        // Dans les autres modes, on cache les secondaires pour ne pas polluer
        visibleEquipment = visibleEquipment.filter(e => e.is_secondary !== 1 && e.catalog_is_secondary !== 1);
    }

    const eqHtml = visibleEquipment.length > 0
        ? `<div class="map-equipment-section" style="margin-top:10px; border-top:1px solid #eee; padding-top:10px; max-height: 200px; overflow-y: auto; padding-right: 5px;">
             <strong style="font-size:0.8rem; text-transform:uppercase; color:#64748b; display:block; margin-bottom:8px; position: sticky; top: 0; background: white; z-index: 1;">Équipements (${visibleEquipment.length})</strong>
             ${visibleEquipment.map(e => `
                <div class="map-equipment-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #f1f5f9; ${(e.is_secondary===1 || e.catalog_is_secondary===1)?'opacity:0.6;':''}">
                    <div style="font-size:0.85rem; line-height:1.2;">
                        <strong style="color:#334155;">${escapeHtml(e.name)}</strong><br/>
                        <span style="color:#94a3b8;font-size:0.75rem;">${escapeHtml(e.brand || "-")}</span>
                    </div>
                    <div>${getEqBadge(e.next_maintenance_date, (e.is_secondary===1 || e.catalog_is_secondary===1))}</div>
                </div>`).join("")}
           </div>`
        : `<div class="map-equipment-section" style="margin-top:10px; padding:10px; background:#f8fafc; color:#94a3b8; font-style:italic; font-size:0.85rem; text-align:center; border-radius:4px;">
                ${displayStatus === "ghost" ? "Aucune machine hors contrat" : "Aucune machine principale"}
           </div>`;

    const popupContent = `
            <div class="map-popup" style="font-family: 'Inter', sans-serif;">
                <div class="map-popup-header" style="background:${headerBg}; color:white; padding:15px; border-radius:8px 8px 0 0;">
                    <h3 style="margin:0; font-size:1.1rem; font-weight:600;">${escapeHtml(client.cabinet_name)}</h3>
                    <div style="margin-top:5px; display:flex; gap:5px;">
                        <span class="badge ${badgeClass}" style="border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.2); color:white;"><i class="fas ${badgeIcon}"></i> ${badgeText}</span>
                    </div>
                </div>
                <div class="map-popup-body" style="padding:15px;">
                    <div class="map-info-row" style="margin-bottom:8px; display:flex; gap:10px; color:#475569;">
                        <i class="fas fa-user-md" style="color:var(--color-primary); width:20px;"></i><strong>${escapeHtml(client.contact_name)}</strong>
                    </div>
                    <div class="map-info-row" style="margin-bottom:8px; display:flex; gap:10px; color:#475569;">
                        <i class="fas fa-map-marker-alt" style="color:var(--color-primary); width:20px;"></i><span>${escapeHtml(client.address)}, ${client.postal_code ? client.postal_code + " " : ""}${escapeHtml(client.city)}</span>
                    </div>
                    ${client.phone ? `<div class="map-info-row" style="margin-bottom:15px; display:flex; gap:10px; color:#475569;"><i class="fas fa-phone" style="color:var(--color-primary); width:20px;"></i><a href="tel:${client.phone}" style="color:var(--color-primary); text-decoration:none;">${escapeHtml(client.phone)}</a></div>` : ""}
                    ${eqHtml}
                    <div style="margin-top:15px; text-align:center;">
                        <button class="btn btn-sm btn-secondary w-100" style="width:100%; justify-content:center;" onclick="openClientFromMap(${client.id})">
                            <i class="fas fa-external-link-alt"></i> Voir la fiche complète
                        </button>
                    </div>
                </div>
            </div>`;
    marker.bindPopup(popupContent, { maxWidth: 360, minWidth: 320, className: "kb-map-popup" });
    markers.push(marker);
  });
}

async function openStatPopup(type) {
  const modal = document.getElementById("stats-detail-modal");
  const titleEl = document.getElementById("stats-modal-title");
  const listEl = document.getElementById("stats-modal-list");
  modal.classList.add("active");
  listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:#cbd5e1;"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>';

  try {
    let html = '<table class="erp-table" style="width:100%; border-collapse:collapse;">';
    
    if (type === 'appointments_full') {
        const res = await fetch("/api/dashboard/upcoming-appointments");
        const rows = await res.json();
        titleEl.innerHTML = `Agenda complet <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; font-size:0.6em; vertical-align:middle;">${rows.length}</span>`;
        html += `<thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><tr><th style="padding:12px; text-align:left; color:#64748b;">Client</th><th style="padding:12px; text-align:left; color:#64748b;">Info</th><th style="padding:12px; text-align:left; color:#64748b;">Date</th><th style="width:40px;"></th></tr></thead><tbody>`;
        html += rows.map(rdv => `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="window.location.href='/clients.html?open=${rdv.client_id}'"><td style="padding:12px;"><div style="font-weight:600; color:#334155;">${escapeHtml(rdv.cabinet_name)}</div><div style="font-size:0.85em; color:#94a3b8;">${escapeHtml(rdv.city)}</div></td><td style="padding:12px;"><div style="font-size:0.9em; color:#475569;">${rdv.technician_names || '<span style="font-style:italic;color:#cbd5e1">Non assigné</span>'}</div></td><td style="padding:12px; font-weight:600; color:#334155;">${new Date(rdv.appointment_date).toLocaleDateString('fr-CH')}</td><td style="text-align:right; padding-right:15px;"><button onclick="event.stopPropagation(); window.location.href='/clients.html?open=${rdv.client_id}&edit_rdv=${rdv.appointment_id}'" style="border:1px solid #e2e8f0; background:white; color:#64748b; border-radius:4px; padding:4px 8px; cursor:pointer;"><i class="fas fa-pen"></i></button></td></tr>`).join('');
    } 
    else if (type === 'contacts_full') {
        const res = await fetch("/api/dashboard/clients-to-contact");
        const rows = await res.json();
        titleEl.innerHTML = `À contacter <span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:0.6em; vertical-align:middle;">${rows.length}</span>`;
        html += `<thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><tr><th style="padding:12px; text-align:left; color:#64748b;">Client</th><th style="padding:12px; text-align:left; color:#64748b;">Contact</th><th style="padding:12px; text-align:left; color:#64748b;">Échéance</th><th style="width:40px;"></th></tr></thead><tbody>`;
        html += rows.map(c => `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="window.location.href='/clients.html?open=${c.id}'"><td style="padding:12px;"><div style="font-weight:600; color:#334155;">${escapeHtml(c.cabinet_name)}</div><div style="font-size:0.85em; color:#ef4444; font-weight:500;">Maintenance expirée</div></td><td style="padding:12px;">${c.phone ? `<div style="font-size:0.9em; color:#475569;"><i class="fas fa-phone" style="font-size:0.8em; margin-right:5px; color:#cbd5e1;"></i>${escapeHtml(c.phone)}</div>` : '-'}</td><td style="padding:12px; font-weight:600; color:#dc2626;">${new Date(c.maintenance_due_date).toLocaleDateString('fr-CH')}</td><td style="text-align:right; padding-right:15px; color:#3b82f6;"><i class="fas fa-external-link-alt"></i></td></tr>`).join('');
    }
    else if (type === "expired") {
      const res = await fetch("/api/dashboard/details?type=expired");
      const rows = await res.json();
      titleEl.innerHTML = `Maintenances Expirées <span class="badge badge-danger" style="margin-left:10px;">${rows.length}</span>`;
      if (rows.length === 0) return listEl.innerHTML = '<p class="text-center">Rien à signaler.</p>';
      html = buildGroupedTable(rows, "expired"); 
      return listEl.innerHTML = html; 
    } 
    else if (type === "warning") {
      const res = await fetch("/api/dashboard/details?type=warning");
      const rows = await res.json();
      titleEl.innerHTML = `RDV à fixer (Bientôt) <span class="badge badge-warning" style="margin-left:10px;">${rows.length}</span>`;
      if (rows.length === 0) return listEl.innerHTML = '<p class="text-center">Rien à signaler.</p>';
      html = buildGroupedTable(rows, "warning");
      return listEl.innerHTML = html;
    }
    html += `</tbody></table>`;
    listEl.innerHTML = html;
  } catch (e) { listEl.innerHTML = '<p>Erreur.</p>'; }
}

function buildGroupedTable(rows, statusType) {
  const groups = {};
  rows.forEach((row) => {
    if (!groups[row.client_id]) groups[row.client_id] = { client_name: row.cabinet_name, city: row.city, client_id: row.client_id, machines: [] };
    groups[row.client_id].machines.push(row);
  });

  const color = statusType === "expired" ? "var(--color-danger)" : "var(--color-warning)";
  let tbodyHtml = "";

  Object.values(groups).forEach((group, index) => {
    const count = group.machines.length;
    const groupId = `group-${index}`;
    const dates = group.machines.map((m) => m.next_maintenance_date).sort();
    const worstDate = dates[0];

    if (count === 1) {
      const m = group.machines[0];
      const displayTitle = m.name || m.catalog_name || "Machine";
      tbodyHtml += `<tr onclick="window.location.href='/clients.html?open=${group.client_id}'" style="cursor:pointer; border-bottom:1px solid #eee;" class="group-row"><td style="padding:10px;"><div style="font-weight:bold; color:#333;">${escapeHtml(group.client_name)}</div><div style="font-size:0.85em; color:#666;">${escapeHtml(group.city)}</div></td><td style="padding:10px;"><div style="font-weight:500;">${escapeHtml(displayTitle)}</div><div style="font-size:0.85em; color:#888;">${escapeHtml(m.brand || "")}</div></td><td style="padding:10px; font-weight:bold; color:${color};">${formatDate(m.next_maintenance_date)}</td><td style="text-align:right; padding-right:15px; color:var(--color-primary);"><i class="fas fa-external-link-alt"></i></td></tr>`;
    } else {
      tbodyHtml += `<tr onclick="toggleGroupRow('${groupId}', this)" class="group-row" style="border-bottom:1px solid #eee;"><td style="padding:10px;"><div style="font-weight:bold; color:#333;">${escapeHtml(group.client_name)}</div><div style="font-size:0.85em; color:#666;">${escapeHtml(group.city)}</div></td><td style="padding:10px;"><span class="badge" style="background:${statusType === "expired" ? "#fee2e2" : "#fef3c7"}; color:${statusType === "expired" ? "#991b1b" : "#92400e"}; border:1px solid ${statusType === "expired" ? "#fca5a5" : "#fcd34d"};">${count} Appareils</span></td><td style="padding:10px; font-weight:bold; color:${color};">${formatDate(worstDate)} <span style="font-size:0.8em; color:#888; font-weight:normal;">(et +)</span></td><td style="text-align:right; padding-right:15px; color:#64748b;"><i class="fas fa-chevron-down"></i></td></tr>
            <tr id="${groupId}" class="group-details"><td colspan="4" style="padding:0;"><div style="padding: 5px 15px 15px 15px; border-bottom:2px solid #e2e8f0;"><table style="width:100%; font-size:0.9em;">
            ${group.machines.map((m) => { const mTitle = m.name || m.catalog_name || "Machine"; return `<tr style="border-bottom:1px dashed #e2e8f0; cursor:pointer;" onclick="window.location.href='/clients.html?open=${group.client_id}'"><td style="padding:8px 0; color:#475569;"><i class="fas fa-circle" style="font-size:6px; vertical-align:middle; margin-right:8px; color:${color}"></i>${escapeHtml(mTitle)} <span style="color:#94a3b8;">(${escapeHtml(m.brand || "")})</span></td><td style="padding:8px 0; text-align:right; font-weight:600; color:${color};">${formatDate(m.next_maintenance_date)}</td><td style="width:30px; text-align:right;"><i class="fas fa-arrow-right" style="font-size:0.8em; color:var(--color-primary); opacity:0.5;"></i></td></tr>`; }).join("")}
            </table></div></td></tr>`;
    }
  });

  return `<table class="erp-table" style="width:100%; border-collapse:collapse;"><thead style="background:#f8f9fa;"><tr><th style="padding:10px; text-align:left; width:40%;">Client</th><th style="padding:10px; text-align:left; width:30%;">Machine / Info</th><th style="padding:10px; text-align:left;">Échéance</th><th style="width:40px;"></th></tr></thead><tbody>${tbodyHtml}</tbody></table>`;
}

window.toggleGroupRow = function (id, element) {
  const detailRow = document.getElementById(id);
  if (detailRow) { detailRow.classList.toggle("show"); element.classList.toggle("expanded"); }
};

window.openClientFromMap = function (id) { window.location.href = `/clients.html?open=${id}`; };

function setupMapFilters() {
  const filterContainer = document.querySelector('.map-filters');
  // Création du bouton fantôme (s'il n'existe pas)
  if (filterContainer && !document.querySelector('[data-filter="ghost"]')) {
      const ghostBtn = document.createElement('button');
      ghostBtn.className = 'map-filter-btn';
      ghostBtn.dataset.filter = 'ghost';
      ghostBtn.innerHTML = '<i class="fas fa-ghost"></i> Hors contrat';
      filterContainer.appendChild(ghostBtn);
  }

  document.querySelectorAll(".map-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".map-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      updateMapMarkers();
    });
  });
}

function initMap() {
  try {
    map = L.map("map").setView([46.8, 8.2], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
  } catch {}
}

function formatDate(d) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function escapeHtml(t) {
  if (!t) return "";
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

setInterval(() => { loadDashboard(); }, 60000);

// --- NOUVEAUX WIDGETS : TICKETS ET ACTIVITÉ ---

async function loadTicketsWidget() {
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) return;
        const tickets = await res.json();
        const container = document.getElementById('tickets-list');
        
        const userId = String(currentUser.id);

        // Tri des données
        const urgencies = tickets.filter(t => t.is_urgent === 1 && t.status !== 'Clôturé');
        const unassigned = tickets.filter(t => (!t.assigned_ids || t.assigned_ids.length === 0) && t.status !== 'Clôturé' && t.is_urgent !== 1);
        const myTickets = tickets.filter(t => t.assigned_ids && t.assigned_ids.split(',').includes(userId) && t.status !== 'Clôturé' && t.is_urgent !== 1);

        let html = '';

        // 1. BLOC URGENCES (Rouge)
        if (urgencies.length > 0) {
            html += `<div style="padding: 6px 15px; background: #fee2e2; color: #991b1b; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">🚨 Urgences (${urgencies.length})</div>`;
            html += urgencies.slice(0, 3).map(t => `
                <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/tickets.html?open=${t.id}'">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="color: #991b1b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">#${t.id} ${escapeHtml(t.title)}</strong>
                        <small style="color: #dc2626; display: block; margin-top: 2px;">${escapeHtml(t.cabinet_name || 'Client inconnu')}</small>
                    </div>
                </div>
            `).join('');
        }

        // 2. BLOC NON ASSIGNÉS (Orange)
        if (unassigned.length > 0) {
             html += `<div style="padding: 6px 15px; background: #fffbeb; color: #b45309; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;"><i class="fas fa-inbox"></i> À prendre (${unassigned.length})</div>`;
             html += unassigned.slice(0, 2).map(t => `
                <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/tickets.html?open=${t.id}'">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">#${t.id} ${escapeHtml(t.title)}</strong>
                    </div>
                    <span style="font-size: 0.7rem; color: #b45309; font-weight:bold; background: #fef3c7; padding: 2px 6px; border-radius: 4px; margin-left: 10px; flex-shrink: 0;">Nouveau</span>
                </div>
            `).join('');
        }

        // 3. BLOC MES TICKETS (Gris/Bleu)
        html += `<div style="padding: 6px 15px; background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;"><i class="fas fa-user"></i> Mes Tickets en cours (${myTickets.length})</div>`;
        if (myTickets.length > 0) {
            html += myTickets.slice(0, 3).map(t => `
                <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/tickets.html?open=${t.id}'">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">#${t.id} ${escapeHtml(t.title)}</strong>
                    </div>
                    <span class="badge" style="font-size: 0.7rem; background:#e2e8f0; color:#475569; padding: 2px 6px; border-radius: 4px; margin-left: 10px; flex-shrink: 0;">${t.status}</span>
                </div>
            `).join('');
        } else {
            html += `<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 0.9rem;">Aucun ticket assigné.</div>`;
        }

        container.innerHTML = html;
    } catch (e) { console.error("Erreur tickets widget:", e); }
}

async function loadActivityWidget() {
    try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const notifs = await res.json();
        const container = document.getElementById('activity-list');

        if (notifs.length === 0) {
            container.innerHTML = '<div class="widget-empty"><i class="fas fa-bed fa-2x" style="opacity:0.2; margin-bottom:10px;"></i><br>Aucune activité récente.</div>';
            return;
        }

        // On affiche les 5 premières lignes
        let html = notifs.slice(0, 5).map(n => {
            const timeStr = new Date(n.created_at).toLocaleDateString('fr-CH', { hour: '2-digit', minute: '2-digit' });
            return `
            <div class="widget-item" style="display:flex; justify-content:flex-start; gap:12px; align-items:flex-start; border-left: 3px solid ${n.is_read ? 'transparent' : '#3b82f6'}; cursor:pointer;" onclick="${n.link ? `window.location.href='${n.link}'` : ''}">
                <div style="color: ${n.is_read ? '#cbd5e1' : '#3b82f6'}; flex-shrink: 0; padding-top: 4px;">
                    <i class="fas fa-circle" style="font-size: 0.55rem;"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.9rem; color: #334155; line-height: 1.4; word-wrap: break-word; font-weight: ${n.is_read ? 'normal' : '600'};">${n.message}</div>
                    <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 4px;"><i class="far fa-clock"></i> ${timeStr}</div>
                </div>
            </div>`;
        }).join('');

        // AJOUT DU BOUTON "VOIR TOUT"
        html += `
            <div style="padding: 10px; text-align: center; border-top: 1px solid #f1f5f9;">
                <button class="btn btn-sm btn-outline" onclick="openActivityPopup()" style="width: 100%; justify-content: center; background: white;">
                    <i class="fas fa-history"></i> Voir tout l'historique
                </button>
            </div>`;

        container.innerHTML = html;
    } catch (e) { console.error("Erreur activity widget:", e); }
}

window.openActivityPopup = async function() {
    // On réutilise la modale de détails déjà existante dans votre dashboard.html
    const modal = document.getElementById("stats-detail-modal");
    const titleEl = document.getElementById("stats-modal-title");
    const listEl = document.getElementById("stats-modal-list");
    
    modal.classList.add("active");
    titleEl.innerHTML = '<i class="fas fa-rss"></i> Historique complet des activités';
    listEl.innerHTML = '<div style="text-align:center; padding:2rem;"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>';

    try {
        const res = await fetch('/api/notifications');
        const notifs = await res.json();

        if (notifs.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; padding:2rem;">Aucun historique disponible.</p>';
            return;
        }

        let html = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${notifs.map(n => {
                    const dateFull = new Date(n.created_at).toLocaleDateString('fr-CH', { 
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                    });
                    return `
                    <div style="padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: ${n.is_read ? 'white' : '#f0f9ff'};">
                        <div style="font-size: 0.95rem; color: #1e293b; margin-bottom: 4px;">${n.message}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
                            <i class="far fa-clock"></i> ${dateFull}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
            
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '<p style="color:red; text-align:center;">Erreur lors du chargement de l\'historique.</p>';
    }
};