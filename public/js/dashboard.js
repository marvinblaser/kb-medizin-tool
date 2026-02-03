// public/js/dashboard.js

let map = null;
let markers = [];
let allClients = [];
let currentFilter = "all";
let currentUser = null;

// Coordonnées
const cityCoords = {
  Aarau: [47.3919, 8.0458],
  Baden: [47.4724, 8.3064],
  Bern: [46.948, 7.4474],
  Biel: [47.1372, 7.2459],
  Basel: [47.5596, 7.5886],
  "Biel-Benken": [47.5056, 7.5533],
  Fribourg: [46.8036, 7.1517],
  Genève: [46.2044, 6.1432],
  Lausanne: [46.5197, 6.6323],
  Zürich: [47.3769, 8.5417],
  Winterthur: [47.5, 8.75],
  Neuchâtel: [46.99, 6.9298],
};
const cantonCoords = {
  AG: [47.4, 8.15],
  AI: [47.32, 9.42],
  AR: [47.37, 9.3],
  BE: [46.95, 7.45],
  BL: [47.48, 7.73],
  BS: [47.56, 7.59],
  FR: [46.8, 7.15],
  GE: [46.2, 6.15],
  GL: [47.04, 9.07],
  GR: [46.85, 9.53],
  JU: [47.35, 7.15],
  LU: [47.05, 8.3],
  NE: [47.0, 6.93],
  NW: [46.93, 8.38],
  OW: [46.88, 8.25],
  SG: [47.42, 9.37],
  SH: [47.7, 8.63],
  SO: [47.3, 7.53],
  SZ: [47.02, 8.65],
  TG: [47.55, 9.0],
  TI: [46.33, 8.8],
  UR: [46.88, 8.63],
  VD: [46.57, 6.65],
  VS: [46.23, 7.36],
  ZG: [47.17, 8.52],
  ZH: [47.37, 8.54],
};

let widgetSettings = {
  appointments: true,
  contacts: true,
  "maintenance-month": true,
  warranty: true,
  map: true,
};

const customDashboardStyles = `
  /* --- 1. LAYOUT & ALIGNEMENT (Ne pas toucher) --- */
  .stats-grid, .widgets-grid, .checklists-grid, .table-controls { 
      margin-left: 3rem !important; 
      margin-right: 3rem !important; 
      width: auto !important; 
  }
  .stats-grid { margin-top: 4rem !important; }

  /* --- 2. CARTES STATISTIQUES (HAUT) - STYLE INTERACTIF --- */
  /* On ajoute juste l'effet "cliquable" et le survol, sans changer les dimensions */
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

  /* --- 3. WIDGETS DU BAS (Listes) - STYLE "PRO" --- */
  .widget-item { 
      padding: 12px 15px; 
      border-bottom: 1px solid #f1f5f9; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      transition: all 0.2s; 
      cursor: pointer; 
      border-left: 3px solid transparent; 
  }

  .widget-selector-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
  .widget-selector-card { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; text-align: center; cursor: pointer; transition: all 0.2s; position: relative; }
  .widget-selector-card:hover { border-color: var(--color-primary-light, #e0f2fe); transform: translateY(-3px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
  .widget-selector-card.active { border-color: var(--color-primary, #0284c7); background-color: var(--color-primary-light, #f0f9ff); }
  .widget-selector-icon { font-size: 2rem; margin-bottom: 1rem; color: #94a3b8; }
  .widget-selector-card.active .widget-selector-icon { color: var(--color-primary, #0284c7); }
  .widget-selector-card h3 { font-size: 1rem; margin: 0 0 0.5rem 0; color: #1e293b; }
  .widget-selector-card p { font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4; }
  .widget-selector-toggle { position: absolute; top: 10px; right: 10px; }
  
  /* Effet au survol des lignes */
  .widget-item:hover { 
      background-color: #f8fafc; 
      border-left-color: var(--color-primary); 
      padding-left: 18px; /* Petit effet de glissement visuel */
  }
  .widget-item:last-child { border-bottom: none; }
  
  /* Couleurs spécifiques pour les retards */
  .item-danger { border-left-color: var(--color-danger) !important; background: #fff5f5; }
  .item-warning { border-left-color: var(--color-warning) !important; }

  /* Contenu des widgets */
  .widget-info { display: flex; flex-direction: column; gap: 2px; }
  .widget-title { font-weight: 600; color: #334155; font-size: 0.9rem; }
  .widget-meta { font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 8px; }
  
  /* Boutons d'action dans les listes */
  .widget-actions { display: flex; gap: 8px; }
  .btn-action-mini { 
      width: 28px; height: 28px; border-radius: 6px; 
      display: flex; align-items: center; justify-content: center; 
      border: 1px solid #e2e8f0; background: white; color: #64748b; 
      transition: all 0.2s; 
  }
  .btn-action-mini:hover { 
      border-color: var(--color-primary); color: var(--color-primary); 
      transform: translateY(-1px); 
  }
  
  /* Badges */
  .badge-mini { font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
  .bg-red { background: #fee2e2; color: #991b1b; }
  .bg-blue { background: #e0f2fe; color: #0369a1; }

  /* États vides */
  .empty-widget { padding: 2rem; text-align: center; color: #94a3b8; font-style: italic; font-size: 0.9rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-action-btn { margin-top: 5px; font-size: 0.8rem; padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; cursor: pointer; }
  .empty-action-btn:hover { background: #f1f5f9; }

  /* --- 4. CARTE CLIENTS (MAP) --- */
  .map-wrapper-fixed { 
      margin: 2rem 3rem !important; 
      width: auto !important; 
      background: white !important; 
      border: 1px solid var(--border-color) !important; 
      border-radius: var(--radius-lg) !important; 
      box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; 
      overflow: hidden !important; 
      display: flex !important; 
      flex-direction: column !important; 
      padding: 0 !important; 
  }
  
  #widget-map {
      max-width: none !important; width: auto !important; margin: 0 !important; padding: 0 !important;
      box-shadow: none !important; border: none !important; background: transparent !important;
  }

  .map-filters { padding: 1rem 1.5rem !important; margin: 0 !important; border-bottom: 1px solid var(--border-color) !important; background: #fff !important; display: flex !important; flex-wrap: wrap !important; gap: 10px !important; width: 100% !important; box-sizing: border-box !important; }
  #map { width: 100% !important; height: 600px !important; margin: 0 !important; border: none !important; flex-grow: 1 !important; }
  
  .map-filter-btn { border-radius: 50px !important; padding: 0.5rem 1.25rem !important; font-weight: 600 !important; font-size: 0.85rem !important; border: 1px solid #e2e8f0 !important; background: white !important; color: #64748b !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; display: inline-flex !important; align-items: center !important; gap: 6px !important; }
  .map-filter-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.05) !important; color: #1e293b !important; }
  .map-filter-btn.active { border-color: transparent !important; color: white !important; box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important; }
  
  button[data-filter="all"].active, .map-filters button:nth-child(1).active { background-color: var(--color-primary) !important; }
  button[data-filter="up_to_date"].active, .map-filters button:nth-child(2).active { background-color: var(--color-success) !important; }
  button[data-filter="warning"].active, .map-filters button:nth-child(3).active { background-color: var(--color-warning) !important; }
  button[data-filter="expired"].active, .map-filters button:nth-child(4).active { background-color: var(--color-danger) !important; }
  
  .leaflet-popup-close-button { color: white !important; font-size: 24px !important; font-weight: bold !important; top: 10px !important; right: 10px !important; text-shadow: 0 1px 2px rgba(0,0,0,0.3); opacity: 1 !important; }
  .leaflet-popup-close-button:hover { color: #e0e0e0 !important; }

  /* --- 5. DIVERS (Accordéons, etc.) --- */
  .group-row { cursor: pointer; transition: background 0.2s; }
  .group-row:hover { background-color: #f8fafc; }
  .group-row.expanded { background-color: #f1f5f9; }
  .group-details { display: none; background-color: #f8fafc; }
  .group-details.show { display: table-row; animation: fadeIn 0.3s; }
  .fa-chevron-down { transition: transform 0.2s; }
  .expanded .fa-chevron-down { transform: rotate(180deg); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
    if (!response.ok) {
      window.location.href = "/login.html";
      return;
    }
    const data = await response.json();
    currentUser = data.user;

    let roleDisplay = "Technicien";
    if (data.user.role === "admin") roleDisplay = "Administrateur";
    else if (data.user.role === "validator") roleDisplay = "Validateur";
    else if (data.user.role === "verifier" || data.user.role === "verificateur")
      roleDisplay = "Vérificateur";
    else if (data.user.role === "secretary") roleDisplay = "Secrétariat";

    document.getElementById("user-info").innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details"><strong>${data.user.name}</strong><span>${roleDisplay}</span></div>
    `;
    if (data.user.role === "admin")
      document.getElementById("admin-link").classList.remove("hidden");
  } catch {
    window.location.href = "/login.html";
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
}

// --- MODAL ---
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
        <div class="widget-selector-icon">
            <i class="fas ${icon}"></i>
        </div>
        <h3>${title}</h3>
        <p>${desc}</p>
    </div>`;
}

window.toggleWidgetCard = function (c, n) {
  const k = c.querySelector('input[type="checkbox"]');
  if (event.target !== k) k.checked = !k.checked;
  if (k.checked) c.classList.add("active");
  else c.classList.remove("active");
};
function saveWidgetCustomization(b) {
  widgetSettings.appointments = document.getElementById(
    "widget-check-appointments",
  ).checked;
  widgetSettings.contacts = document.getElementById(
    "widget-check-contacts",
  ).checked;
  widgetSettings["maintenance-month"] = document.getElementById(
    "widget-check-maintenance-month",
  ).checked;
  widgetSettings.warranty = document.getElementById(
    "widget-check-warranty",
  ).checked;
  widgetSettings.map = document.getElementById("widget-check-map").checked;
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
      Object.keys(p).forEach((k) => {
        if (widgetSettings[k] !== undefined) widgetSettings[k] = p[k];
      });
    } catch (e) {}
  }
  applyWidgetSettings();
  applyWidgetSettings();
}
function applyWidgetSettings() {
  const i = {
    appointments: "widget-appointments",
    contacts: "widget-contacts",
    "maintenance-month": "widget-maintenance-month",
    warranty: "widget-warranty",
    map: "widget-map",
  };
  Object.keys(widgetSettings).forEach((k) => {
    const e = document.getElementById(i[k]);
    if (e) e.style.display = widgetSettings[k] ? "block" : "none";
  });
}
function showNotification(m, t = "info") {
  let c = document.getElementById("notification-container");
  if (!c) {
    c = document.createElement("div");
    c.id = "notification-container";
    c.className = "notification-container";
    document.body.appendChild(c);
  }
  const n = document.createElement("div");
  n.className = `notification notification-${t}`;
  n.innerHTML = `<i class="fas ${t === "success" ? "fa-check-circle" : t === "error" ? "fa-exclamation-circle" : "fa-info-circle"}"></i><span>${m}</span>`;
  c.appendChild(n);
  setTimeout(() => n.classList.add("show"), 10);
  setTimeout(() => {
    n.classList.remove("show");
    setTimeout(() => n.remove(), 300);
  }, 3000);
}

async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadUpcomingAppointments(),
    loadClientsToContact(),
    // loadMaintenanceMonth(), // DÉSACTIVÉ
    // loadWarrantyExpiring(), // DÉSACTIVÉ
    loadClientsMap(),
    loadPendingReportsWidget(),
  ]);

  // Masquer visuellement les conteneurs vides des widgets désactivés s'ils existent
  const maintenanceWidget = document.getElementById('widget-maintenance-month');
  if(maintenanceWidget) maintenanceWidget.style.display = 'none';
  
  const warrantyWidget = document.getElementById('widget-warranty');
  if(warrantyWidget) warrantyWidget.style.display = 'none';

  setupStatClickHandlers();
}

function setupStatClickHandlers() {
  // 1. Maintenances Expirées (Rouge)
  document.querySelector(".stat-card.danger").onclick = () =>
    openStatPopup("expired");

  // 2. RDV à fixer / Bientôt (Orange)
  document.querySelector(".stat-card.warning").onclick = () =>
    openStatPopup("warning");

  // 3. Clients à jour (Vert) -> On affiche ceux qui NE le sont PAS (par soustraction)
  document.querySelector(".stat-card.success").onclick = () =>
    openStatPopup("not_ok");
}

// --- GESTION UNIFIÉE DES NOTIFICATIONS (ROUGE) ---
async function loadPendingReportsWidget() {
  try {
    const res = await fetch("/api/reports/stats");
    const stats = await res.json();

    const pendingCount = stats.pending || 0;
    const validatedCount = stats.validated || 0;
    const role = currentUser?.role;

    // 1. CALCUL DU TOTAL POUR LA SIDEBAR
    const sidebarLink = document.querySelector('a[href="/reports.html"]');
    if (sidebarLink) {
      const oldBadge = sidebarLink.querySelector(".sidebar-badge");
      if (oldBadge) oldBadge.remove();

      let badgeCount = 0;
      const canValidate = [
        "admin",
        "validator",
        "sales_director",
        "verifier",
        "verificateur",
      ].includes(role);
      const canArchive = ["admin", "secretary"].includes(role);

      if (canValidate) badgeCount += pendingCount;
      if (canArchive) badgeCount += validatedCount;

      if (badgeCount > 0) {
        const badge = document.createElement("span");
        badge.className = "sidebar-badge";
        badge.style.cssText =
          "background:#ef4444; color:white; font-size:0.75rem; padding:2px 6px; border-radius:10px; margin-left:auto; font-weight:bold;";
        badge.textContent = badgeCount;
        sidebarLink.appendChild(badge);
        sidebarLink.style.display = "flex";
        sidebarLink.style.alignItems = "center";
      }
    }

    // 2. WIDGETS DASHBOARD
    const grid = document.querySelector(".widgets-grid");
    if (!grid) return;

    document.getElementById("widget-validation")?.remove();
    document.getElementById("widget-archiving")?.remove();

    const canValidate = [
      "admin",
      "validator",
      "sales_director",
      "verifier",
      "verificateur",
    ].includes(role);
    const canArchive = ["admin", "secretary"].includes(role);

    // A. WIDGET VALIDATION
    if (canValidate && pendingCount > 0) {
      const r = await fetch("/api/reports?status=pending&limit=5");
      const data = await r.json();

      const widgetHtml = `
            <div class="widget" id="widget-validation" style="border: 2px solid #ef4444;">
                <div class="widget-header" style="background: #fee2e2;">
                    <h2 style="color: #991b1b;"><i class="fas fa-file-signature"></i> Rapports à valider (${pendingCount})</h2>
                </div>
                <div class="widget-content">
                    ${data.reports
                      .map(
                        (rep) => `
                        <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/reports.html?status=pending'">
                            <div style="display:flex; justify-content:space-between;">
                                <strong>${escapeHtml(rep.cabinet_name)}</strong>
                                <span class="badge badge-warning">En attente</span>
                            </div>
                            <small>${escapeHtml(rep.work_type)} • ${formatDate(rep.created_at)}</small>
                        </div>
                    `,
                      )
                      .join("")}
                    ${pendingCount > 5 ? `<div style="text-align:center; padding-top:10px;"><a href="/reports.html?status=pending" style="color:#ef4444; font-weight:bold;">Voir tout (${pendingCount})</a></div>` : ""}
                </div>
            </div>`;
      grid.insertAdjacentHTML("afterbegin", widgetHtml);
    }

    // B. WIDGET ARCHIVAGE
    if (canArchive && validatedCount > 0) {
      const r = await fetch("/api/reports?status=validated&limit=5");
      const data = await r.json();

      const widgetHtml = `
            <div class="widget" id="widget-archiving" style="border: 2px solid #ef4444;">
                <div class="widget-header" style="background: #fee2e2;">
                    <h2 style="color: #991b1b;"><i class="fas fa-archive"></i> Rapports à archiver (${validatedCount})</h2>
                </div>
                <div class="widget-content">
                    ${data.reports
                      .map(
                        (rep) => `
                        <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/reports.html?status=validated'">
                            <div style="display:flex; justify-content:space-between;">
                                <strong>${escapeHtml(rep.cabinet_name)}</strong>
                                <span class="badge badge-success">Validé</span>
                            </div>
                            <small>${escapeHtml(rep.work_type)} • Validé par ${escapeHtml(rep.validator_name)}</small>
                        </div>
                    `,
                      )
                      .join("")}
                    ${validatedCount > 5 ? `<div style="text-align:center; padding-top:10px;"><a href="/reports.html?status=validated" style="color:#b91c1c; font-weight:bold;">Voir tout (${validatedCount})</a></div>` : ""}
                </div>
            </div>`;
      grid.insertAdjacentHTML("afterbegin", widgetHtml);
    }
  } catch (e) {
    console.error("Err widget reports:", e);
  }
}

async function loadStats() {
  try {
    // 1. Stats globales
    const r = await fetch("/api/dashboard/stats");
    const s = await r.json();

    // 2. Chiffres précis via les nouvelles routes details
    // On récupère juste la longueur des tableaux pour les compteurs
    const [resExpired, resWarning] = await Promise.all([
      fetch("/api/dashboard/details?type=expired"),
      fetch("/api/dashboard/details?type=warning"),
    ]);

    const jsonExpired = await resExpired.json();
    const jsonWarning = await resWarning.json();

    const countExpired = jsonExpired.length;
    const countWarning = jsonWarning.length;

    // 3. Mise à jour de l'affichage
    document.getElementById("stat-expired").textContent = countExpired;
    document.getElementById("stat-appointments").textContent = countWarning;

    document.getElementById("stat-uptodate").textContent =
      `${s.clientsUpToDate}/${s.totalClients}`;
    document.getElementById("stat-equipment").textContent =
      s.equipmentInstalled;
  } catch (e) {
    console.error("Erreur chargement stats:", e);
  }
}

async function loadUpcomingAppointments() {
  try {
    const r = await fetch("/api/dashboard/upcoming-appointments");
    const data = await r.json();
    const l = document.getElementById("appointments-list");

    if (data.length === 0) {
      l.innerHTML = '<div class="widget-empty"><i class="fas fa-calendar-check" style="margin-right:8px; opacity:0.5;"></i> Aucun rendez-vous prévu.</div>';
      return;
    }

    l.innerHTML = data.map((rdv) => {
        // Date propre
        const d = new Date(rdv.appointment_date);
        const dateStr = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Badges techniciens élégants (Pill)
        let techsHtml = '<span style="color:#94a3b8; font-style:italic; font-size:0.75rem;">À assigner</span>';
        if (rdv.technician_names) {
            techsHtml = rdv.technician_names.split(', ').map(name => 
                `<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600; border:1px solid #bae6fd;">${escapeHtml(name)}</span>`
            ).join(' ');
        }

        // Nouveau Design : Flexbox structuré
        return `
        <div class="widget-item" style="padding: 12px 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;"
             onclick="window.location.href='/clients.html?open=${rdv.client_id}'">
            
            <div style="display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(rdv.cabinet_name)}
                </div>
                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    ${techsHtml}
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-left: 10px;">
                <div style="font-size: 0.9rem; font-weight: 600; color: #475569; background: #f8fafc; padding: 5px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <i class="far fa-calendar-alt" style="color:var(--color-primary); margin-right:5px; font-size:0.8rem;"></i> ${dateStr}
                </div>
                
                <button onclick="event.stopPropagation(); window.location.href='/clients.html?open=${rdv.client_id}&edit_rdv=${rdv.appointment_id}'"
                        title="Modifier le RDV"
                        style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; color: var(--neutral-600); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    <i class="fas fa-pen" style="font-size: 0.85rem;"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
  } catch (e) {
      console.error("Erreur chargement RDV:", e);
  }
}

async function loadClientsToContact() {
  try {
    const r = await fetch("/api/dashboard/clients-to-contact");
    const clients = await r.json();
    const l = document.getElementById("contacts-list");
    
    if (clients.length === 0) {
      l.innerHTML = '<div class="widget-empty"><i class="fas fa-check-circle" style="margin-right:8px; opacity:0.5;"></i> Aucun client à contacter.</div>';
      return;
    }
    
    l.innerHTML = clients.map((c) => {
        // Formatage date
        const dateStr = new Date(c.maintenance_due_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Design harmonisé avec "Rendez-vous à venir"
        return `
        <div class="widget-item" style="padding: 12px 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s;"
             onclick="window.location.href='/clients.html?open=${c.id}'">
            
            <div style="display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(c.cabinet_name)}
                </div>
                <div style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 5px;">
                   <i class="fas fa-phone" style="font-size: 0.7rem;"></i> ${escapeHtml(c.phone || '-')}
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-left: 10px;">
                <div style="font-size: 0.9rem; font-weight: 600; color: #b91c1c; background: #fef2f2; padding: 5px 10px; border-radius: 6px; border: 1px solid #fecaca; display:flex; align-items:center; gap:5px;">
                     <i class="fas fa-wrench" style="font-size:0.8rem;"></i> ${dateStr}
                </div>
            </div>
        </div>
        `;
      }).join("");
  } catch(e) { console.error(e); }
}

async function loadMaintenanceMonth() {
  try {
    const t = new Date();
    const s = new Date(t.getFullYear(), t.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const e = new Date(t.getFullYear(), t.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
    const r = await fetch("/api/clients?page=1&limit=1000");
    const d = await r.json();
    const m = d.clients.filter(
      (c) => c.maintenance_due_date >= s && c.maintenance_due_date <= e,
    );
    const l = document.getElementById("maintenance-month-list");
    if (m.length === 0) {
      l.innerHTML =
        '<div class="widget-empty"><i class="fas fa-clipboard-check" style="margin-right:8px; opacity:0.5;"></i> Aucune maintenance.</div>';
      return;
    }
    l.innerHTML = m
      .map(
        (c) =>
          `<div class="widget-item"><strong>${escapeHtml(c.cabinet_name)}</strong><small><i class="fas fa-calendar-check"></i> ${formatDate(c.maintenance_due_date)} • ${escapeHtml(c.city)}</small></div>`,
      )
      .join("");
  } catch {}
}
async function loadWarrantyExpiring() {
  try {
    const t = new Date().toISOString().split("T")[0];
    const f = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const r = await fetch("/api/clients?page=1&limit=1000");
    const d = await r.json();
    const p = d.clients.map(async (c) => {
      const er = await fetch(`/api/clients/${c.id}/equipment`);
      const eq = await er.json();
      return eq
        .filter(
          (e) =>
            e.warranty_until && e.warranty_until >= t && e.warranty_until <= f,
        )
        .map((e) => ({ ...e, client_name: c.cabinet_name }));
    });
    const all = (await Promise.all(p)).flat();
    const l = document.getElementById("warranty-list");
    if (all.length === 0) {
      l.innerHTML =
        '<div class="widget-empty"><i class="fas fa-shield-alt" style="margin-right:8px; opacity:0.5;"></i> Aucune garantie expirante.</div>';
      return;
    }
    l.innerHTML = all
      .sort((a, b) => a.warranty_until.localeCompare(b.warranty_until))
      .map(
        (e) =>
          `<div class="widget-item"><strong>${escapeHtml(e.name)} - ${escapeHtml(e.client_name)}</strong><small><i class="fas fa-shield-alt"></i> ${formatDate(e.warranty_until)}</small></div>`,
      )
      .join("");
  } catch {}
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
        } catch {
          return { ...c, equipment: [] };
        }
      }),
    );
    updateMapMarkers();
  } catch {}
}
function getCoordinatesForClient(client) {
  if (client.latitude && client.longitude) {
    return [client.latitude, client.longitude];
  }
  if (cityCoords[client.city.trim()]) return cityCoords[client.city.trim()];
  const base = cantonCoords[client.canton] || [46.8, 8.2];
  return [
    base[0] + (Math.random() - 0.5) * 0.05,
    base[1] + (Math.random() - 0.5) * 0.05,
  ];
}

function updateMapMarkers() {
  if (!map) return;
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  const filtered = allClients.filter(
    (c) => currentFilter === "all" || c.status === currentFilter,
  );

  filtered.forEach((client) => {
    const coords = getCoordinatesForClient(client);
    const color =
      client.status === "expired"
        ? "#dc2626"
        : client.status === "warning"
          ? "#f59e0b"
          : "#16a34a";
    const marker = L.circleMarker(coords, {
      radius: 8,
      fillColor: color,
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    }).addTo(map);

    const badgeClass =
      client.status === "expired"
        ? "badge-danger"
        : client.status === "warning"
          ? "badge-warning"
          : "badge-success";
    const badgeText =
      client.status === "expired"
        ? "Expiré"
        : client.status === "warning"
          ? "Bientôt"
          : "À jour";
    const badgeIcon =
      client.status === "expired"
        ? "fa-times-circle"
        : client.status === "warning"
          ? "fa-exclamation-triangle"
          : "fa-check-circle";

    let headerBg = "var(--color-primary, #005691)";
    if (client.status === "expired") headerBg = "var(--color-danger, #dc2626)";
    else if (client.status === "warning")
      headerBg = "var(--color-warning, #f59e0b)";
    else if (client.status === "ok" || client.status === "up_to_date")
      headerBg = "var(--color-success, #16a34a)";

    const getEqBadge = (date) => {
      if (!date)
        return '<span class="badge badge-primary" style="font-size:10px!important;padding:2px 6px;">À définir</span>';
      const d = new Date(date),
        diff = Math.ceil(
          (d - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24),
        );
      if (diff < 0)
        return `<span class="badge badge-danger" style="font-size:10px!important;padding:2px 6px;">Expiré (${Math.abs(diff)}j)</span>`;
      if (diff <= 30)
        return `<span class="badge badge-warning" style="font-size:10px!important;padding:2px 6px;">${diff} jours</span>`;
      return `<span class="badge badge-success" style="font-size:10px!important;padding:2px 6px;">OK</span>`;
    };

    const eqHtml =
      client.equipment && client.equipment.length > 0
        ? `<div class="map-equipment-section" style="margin-top:10px; border-top:1px solid #eee; padding-top:10px; max-height: 200px; overflow-y: auto; padding-right: 5px;">
                 <strong style="font-size:0.8rem; text-transform:uppercase; color:#64748b; display:block; margin-bottom:8px; position: sticky; top: 0; background: white; z-index: 1;">Équipements (${client.equipment.length})</strong>
                 ${client.equipment
                   .map(
                     (e) => `
                    <div class="map-equipment-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #f1f5f9;">
                        <div style="font-size:0.85rem; line-height:1.2;">
                            <strong style="color:#334155;">${escapeHtml(e.name)}</strong><br/>
                            <span style="color:#94a3b8;font-size:0.75rem;">${escapeHtml(e.brand || "-")}</span>
                        </div>
                        <div>${getEqBadge(e.next_maintenance_date)}</div>
                    </div>`,
                   )
                   .join("")}
               </div>`
        : `<div class="map-equipment-section" style="margin-top:10px; padding:10px; background:#f8fafc; color:#94a3b8; font-style:italic; font-size:0.85rem; text-align:center; border-radius:4px;">Aucun équipement installé</div>`;

    const popupContent = `
            <div class="map-popup" style="font-family: 'Inter', sans-serif;">
                <div class="map-popup-header" style="background:${headerBg}; color:white; padding:15px; border-radius:8px 8px 0 0;">
                    <h3 style="margin:0; font-size:1.1rem; font-weight:600;">${escapeHtml(client.cabinet_name)}</h3>
                    <div style="margin-top:5px; display:flex; gap:5px;">
                        <span class="badge ${badgeClass}" style="border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.2); color:white;">
                            <i class="fas ${badgeIcon}"></i> ${badgeText}
                        </span>
                    </div>
                </div>
                <div class="map-popup-body" style="padding:15px;">
                    <div class="map-info-row" style="margin-bottom:8px; display:flex; gap:10px; color:#475569;">
                        <i class="fas fa-user-md" style="color:var(--color-primary); width:20px;"></i>
                        <strong>${escapeHtml(client.contact_name)}</strong>
                    </div>
                    <div class="map-info-row" style="margin-bottom:8px; display:flex; gap:10px; color:#475569;">
                        <i class="fas fa-map-marker-alt" style="color:var(--color-primary); width:20px;"></i>
                        <span>${escapeHtml(client.address)}, ${client.postal_code ? client.postal_code + " " : ""}${escapeHtml(client.city)}</span>
                    </div>
                    ${
                      client.phone
                        ? `
                    <div class="map-info-row" style="margin-bottom:15px; display:flex; gap:10px; color:#475569;">
                        <i class="fas fa-phone" style="color:var(--color-primary); width:20px;"></i>
                        <a href="tel:${client.phone}" style="color:var(--color-primary); text-decoration:none;">${escapeHtml(client.phone)}</a>
                    </div>`
                        : ""
                    }
                    ${eqHtml}
                    <div style="margin-top:15px; text-align:center;">
                        <button class="btn btn-sm btn-secondary w-100" style="width:100%; justify-content:center;" onclick="openClientFromMap(${client.id})">
                            <i class="fas fa-external-link-alt"></i> Voir la fiche complète
                        </button>
                    </div>
                </div>
            </div>`;
    marker.bindPopup(popupContent, {
      maxWidth: 360,
      minWidth: 320,
      className: "kb-map-popup",
    });
    markers.push(marker);
  });
}

// --- GESTION DES POPUPS STATISTIQUES (MODIFIÉE POUR UTILISER /API/DASHBOARD/DETAILS) ---

async function openStatPopup(type) {
  const modal = document.getElementById("stats-detail-modal");
  const titleEl = document.getElementById("stats-modal-title");
  const listEl = document.getElementById("stats-modal-list");

  modal.classList.add("active");
  listEl.innerHTML =
    '<div style="text-align:center; padding:2rem; color:#666;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Chargement...</div>';

  try {
    let html = "";
    let totalCount = 0;

    if (type === "expired") {
      // ICI : On utilise la nouvelle route dédiée qui renvoie la liste précise
      const res = await fetch("/api/dashboard/details?type=expired");
      const rows = await res.json();
      totalCount = rows.length;

      titleEl.innerHTML = `<i class="fas fa-exclamation-circle text-danger"></i> Maintenances Expirées <span class="badge badge-danger" style="font-size:0.6em; vertical-align:middle; margin-left:10px;">${totalCount}</span>`;

      if (totalCount === 0) {
        html = '<p class="text-center">Aucune maintenance expirée.</p>';
      } else {
        html = buildGroupedTable(rows, "expired");
      }
    } else if (type === "warning") {
      // ICI : Pareil pour le warning
      const res = await fetch("/api/dashboard/details?type=warning");
      const rows = await res.json();
      totalCount = rows.length;

      titleEl.innerHTML = `<i class="fas fa-clock text-warning"></i> RDV à fixer (Bientôt) <span class="badge badge-warning" style="font-size:0.6em; vertical-align:middle; margin-left:10px;">${totalCount}</span>`;

      if (totalCount === 0) {
        html =
          '<p class="text-center">Aucun équipement arrivant à échéance.</p>';
      } else {
        html = buildGroupedTable(rows, "warning");
      }
    } else if (type === "not_ok") {
      const notUpToDateClients = allClients.filter(
        (c) => c.status !== "ok" && c.status !== "up_to_date",
      );
      totalCount = notUpToDateClients.length;

      titleEl.innerHTML = `<i class="fas fa-user-clock text-danger"></i> Clients non à jour <span class="badge badge-danger" style="font-size:0.6em; vertical-align:middle; margin-left:10px;">${totalCount}</span>`;

      if (totalCount === 0) {
        html =
          '<p class="text-center text-success"><i class="fas fa-check-circle"></i> Bravo ! Tous les clients sont à jour.</p>';
      } else {
        html = `
                <table class="erp-table" style="width:100%">
                    <thead>
                        <tr>
                            <th style="text-align:left">Client</th>
                            <th style="text-align:left">Ville</th>
                            <th style="text-align:center">Statut</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${notUpToDateClients
                          .map((c) => {
                            const badgeClass =
                              c.status === "expired"
                                ? "badge-danger"
                                : "badge-warning";
                            const badgeText =
                              c.status === "expired" ? "Expiré" : "Bientôt";
                            return `
                            <tr onclick="window.location.href='/clients.html?open=${c.id}'" style="cursor:pointer; border-bottom:1px solid #eee;">
                                <td style="padding:10px;"><strong>${escapeHtml(c.cabinet_name)}</strong></td>
                                <td style="padding:10px;">${escapeHtml(c.city)}</td>
                                <td style="padding:10px; text-align:center;"><span class="badge ${badgeClass}">${badgeText}</span></td>
                                <td style="text-align:right; color:var(--color-primary);"><i class="fas fa-chevron-right"></i></td>
                            </tr>`;
                          })
                          .join("")}
                    </tbody>
                </table>`;
      }
    }

    listEl.innerHTML = html;
  } catch (e) {
    console.error(e);
    listEl.innerHTML =
      '<p class="text-danger text-center">Erreur lors du chargement des données.</p>';
  }
}

// Fonction pour grouper les machines par client
function buildGroupedTable(rows, statusType) {
  // 1. Groupement des données par Client ID
  const groups = {};
  rows.forEach((row) => {
    if (!groups[row.client_id]) {
      groups[row.client_id] = {
        client_name: row.cabinet_name,
        city: row.city,
        client_id: row.client_id,
        machines: [],
      };
    }
    groups[row.client_id].machines.push(row);
  });

  const color =
    statusType === "expired" ? "var(--color-danger)" : "var(--color-warning)";

  // 2. Construction du HTML
  let tbodyHtml = "";

  Object.values(groups).forEach((group, index) => {
    const count = group.machines.length;
    const groupId = `group-${index}`;

    // Trouver la date la plus urgente
    const dates = group.machines.map((m) => m.next_maintenance_date).sort();
    const worstDate = dates[0];

    // Adaptation des noms de champs pour correspondre à /api/dashboard/details
    // m.name (Model), m.brand (Brand)

    if (count === 1) {
      const m = group.machines[0];
      const displayTitle = m.name || m.catalog_name || "Machine"; // Fallback

      tbodyHtml += `
            <tr onclick="window.location.href='/clients.html?open=${group.client_id}'" style="cursor:pointer; border-bottom:1px solid #eee;" class="group-row">
                <td style="padding:10px;">
                    <div style="font-weight:bold; color:#333;">${escapeHtml(group.client_name)}</div>
                    <div style="font-size:0.85em; color:#666;">${escapeHtml(group.city)}</div>
                </td>
                <td style="padding:10px;">
                    <div style="font-weight:500;">${escapeHtml(displayTitle)}</div>
                    <div style="font-size:0.85em; color:#888;">${escapeHtml(m.brand || "")}</div>
                </td>
                <td style="padding:10px; font-weight:bold; color:${color};">
                    ${formatDate(m.next_maintenance_date)}
                </td>
                <td style="text-align:right; padding-right:15px; color:var(--color-primary);">
                    <i class="fas fa-external-link-alt"></i>
                </td>
            </tr>`;
    } else {
      tbodyHtml += `
            <tr onclick="toggleGroupRow('${groupId}', this)" class="group-row" style="border-bottom:1px solid #eee;">
                <td style="padding:10px;">
                    <div style="font-weight:bold; color:#333;">${escapeHtml(group.client_name)}</div>
                    <div style="font-size:0.85em; color:#666;">${escapeHtml(group.city)}</div>
                </td>
                <td style="padding:10px;">
                    <span class="badge" style="background:${statusType === "expired" ? "#fee2e2" : "#fef3c7"}; color:${statusType === "expired" ? "#991b1b" : "#92400e"}; border:1px solid ${statusType === "expired" ? "#fca5a5" : "#fcd34d"};">
                        ${count} Appareils
                    </span>
                </td>
                <td style="padding:10px; font-weight:bold; color:${color};">
                    ${formatDate(worstDate)} <span style="font-size:0.8em; color:#888; font-weight:normal;">(et +)</span>
                </td>
                <td style="text-align:right; padding-right:15px; color:#64748b;">
                    <i class="fas fa-chevron-down"></i>
                </td>
            </tr>
            
            <tr id="${groupId}" class="group-details">
                <td colspan="4" style="padding:0;">
                    <div style="padding: 5px 15px 15px 15px; border-bottom:2px solid #e2e8f0;">
                        <table style="width:100%; font-size:0.9em;">
                            ${group.machines
                              .map((m) => {
                                const mTitle =
                                  m.name || m.catalog_name || "Machine";
                                return `
                                <tr style="border-bottom:1px dashed #e2e8f0; cursor:pointer;" onclick="window.location.href='/clients.html?open=${group.client_id}'">
                                    <td style="padding:8px 0; color:#475569;">
                                        <i class="fas fa-circle" style="font-size:6px; vertical-align:middle; margin-right:8px; color:${color}"></i>
                                        ${escapeHtml(mTitle)} <span style="color:#94a3b8;">(${escapeHtml(m.brand || "")})</span>
                                    </td>
                                    <td style="padding:8px 0; text-align:right; font-weight:600; color:${color};">
                                        ${formatDate(m.next_maintenance_date)}
                                    </td>
                                    <td style="width:30px; text-align:right;">
                                        <i class="fas fa-arrow-right" style="font-size:0.8em; color:var(--color-primary); opacity:0.5;"></i>
                                    </td>
                                </tr>`;
                              })
                              .join("")}
                        </table>
                    </div>
                </td>
            </tr>`;
    }
  });

  return `
    <table class="erp-table" style="width:100%; border-collapse:collapse;">
        <thead style="background:#f8f9fa;">
            <tr>
                <th style="padding:10px; text-align:left; width:40%;">Client</th>
                <th style="padding:10px; text-align:left; width:30%;">Machine / Info</th>
                <th style="padding:10px; text-align:left;">Échéance</th>
                <th style="width:40px;"></th>
            </tr>
        </thead>
        <tbody>
            ${tbodyHtml}
        </tbody>
    </table>`;
}

// Fonction pour ouvrir/fermer l'accordéon
window.toggleGroupRow = function (id, element) {
  const detailRow = document.getElementById(id);
  if (detailRow) {
    detailRow.classList.toggle("show");
    element.classList.toggle("expanded");
  }
};

window.openClientFromMap = function (id) {
  window.location.href = `/clients.html?open=${id}`;
};
function setupMapFilters() {
  document.querySelectorAll(".map-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".map-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      updateMapMarkers();
    });
  });
}
function initMap() {
  try {
    map = L.map("map").setView([46.8, 8.2], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
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
setInterval(() => {
  loadDashboard();
}, 60000);
