// public/js/dashboard.js

let map = null;
let markers = [];
let allClients = [];
let currentFilter = 'all';
let currentUser = null; // Stocke l'utilisateur courant pour vérifier le rôle

// Coordonnées (inchangées)
const cityCoords = { 'Aarau': [47.3919, 8.0458], 'Baden': [47.4724, 8.3064], 'Bern': [46.9480, 7.4474], 'Biel': [47.1372, 7.2459], 'Basel': [47.5596, 7.5886], 'Biel-Benken': [47.5056, 7.5533], 'Fribourg': [46.8036, 7.1517], 'Genève': [46.2044, 6.1432], 'Lausanne': [46.5197, 6.6323], 'Zürich': [47.3769, 8.5417], 'Winterthur': [47.5000, 8.7500], 'Neuchâtel': [46.9900, 6.9298] };
const cantonCoords = { AG: [47.4, 8.15], AI: [47.32, 9.42], AR: [47.37, 9.3], BE: [46.95, 7.45], BL: [47.48, 7.73], BS: [47.56, 7.59], FR: [46.8, 7.15], GE: [46.2, 6.15], GL: [47.04, 9.07], GR: [46.85, 9.53], JU: [47.35, 7.15], LU: [47.05, 8.3], NE: [47.0, 6.93], NW: [46.93, 8.38], OW: [46.88, 8.25], SG: [47.42, 9.37], SH: [47.7, 8.63], SO: [47.3, 7.53], SZ: [47.02, 8.65], TG: [47.55, 9.0], TI: [46.33, 8.8], UR: [46.88, 8.63], VD: [46.57, 6.65], VS: [46.23, 7.36], ZG: [47.17, 8.52], ZH: [47.37, 8.54] };

let widgetSettings = { appointments: true, contacts: true, 'maintenance-month': true, warranty: true, map: true };

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
    if (!response.ok) { window.location.href = '/login.html'; return; }
    const data = await response.json();
    currentUser = data.user; // On garde ça en mémoire
    
    document.getElementById('user-info').innerHTML = `
      <div class="user-avatar">${data.user.name.charAt(0)}</div>
      <div class="user-details"><strong>${data.user.name}</strong><span>${data.user.role === 'admin' ? 'Administrateur' : (data.user.role === 'validator' ? 'Validateur' : 'Technicien')}</span></div>
    `;
    if (data.user.role === 'admin') document.getElementById('admin-link').classList.remove('hidden');
  } catch { window.location.href = '/login.html'; }
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }

// ... (Widget Customization Functions restent inchangées, je les compresse pour la lisibilité) ...
function setupWidgetCustomization(){const h=document.querySelector('.page-header');const b=document.createElement('button');b.className='btn btn-secondary';b.innerHTML='<i class="fas fa-th-large"></i> Personnaliser';b.onclick=openWidgetCustomization;h.appendChild(b);}
function openWidgetCustomization(){const m=document.createElement('div');m.className='modal active';m.innerHTML=`<div class="modal-content widget-selector-modal" style="max-width:800px;"><div class="modal-header"><h2><i class="fas fa-th-large" style="color:var(--color-primary)"></i> Personnaliser</h2><button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button></div><div class="modal-body" style="padding:2rem;"><p style="margin-bottom:1.5rem;color:var(--neutral-500);font-size:0.9rem;">Sélectionnez les éléments à afficher.</p><div class="widget-selector-grid">${createWidgetCard('appointments','fa-calendar-alt','Rendez-vous','Prochains RDV')}${createWidgetCard('contacts','fa-phone','À contacter','Suivi clients')}${createWidgetCard('maintenance-month','fa-wrench','Maintenances','Ce mois-ci')}${createWidgetCard('warranty','fa-shield-alt','Garanties','Bientôt expirées')}${createWidgetCard('map','fa-map-marked-alt','Carte','Vue géographique')}</div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Annuler</button><button class="btn btn-primary" onclick="saveWidgetCustomization(this)">Enregistrer</button></div></div>`;document.body.appendChild(m);}
function createWidgetCard(id,icon,title,desc){const a=widgetSettings[id];return `<div class="widget-selector-card ${a?'active':''}" onclick="toggleWidgetCard(this,'${id}')"><div class="widget-selector-toggle"><input type="checkbox" id="widget-check-${id}" ${a?'checked':''} onclick="event.stopPropagation();toggleWidgetCard(this.closest('.widget-selector-card'),'${id}')"></div><div class="widget-selector-icon"><i class="fas ${icon}"></i></div><h3>${title}</h3><p>${desc}</p></div>`;}
window.toggleWidgetCard=function(c,n){const k=c.querySelector('input[type="checkbox"]');if(event.target!==k)k.checked=!k.checked;if(k.checked)c.classList.add('active');else c.classList.remove('active');};
function saveWidgetCustomization(b){widgetSettings.appointments=document.getElementById('widget-check-appointments').checked;widgetSettings.contacts=document.getElementById('widget-check-contacts').checked;widgetSettings['maintenance-month']=document.getElementById('widget-check-maintenance-month').checked;widgetSettings.warranty=document.getElementById('widget-check-warranty').checked;widgetSettings.map=document.getElementById('widget-check-map').checked;localStorage.setItem('dashboardWidgets',JSON.stringify(widgetSettings));applyWidgetSettings();b.closest('.modal').remove();showNotification('Configuration enregistrée','success');}
function loadWidgetSettings(){const s=localStorage.getItem('dashboardWidgets');if(s){try{const p=JSON.parse(s);Object.keys(p).forEach(k=>{if(widgetSettings[k]!==undefined)widgetSettings[k]=p[k];});}catch(e){}}applyWidgetSettings();}
function applyWidgetSettings(){const i={'appointments':'widget-appointments','contacts':'widget-contacts','maintenance-month':'widget-maintenance-month','warranty':'widget-warranty','map':'widget-map'};Object.keys(widgetSettings).forEach(k=>{const e=document.getElementById(i[k]);if(e)e.style.display=widgetSettings[k]?'block':'none';});}
function showNotification(m,t='info'){let c=document.getElementById('notification-container');if(!c){c=document.createElement('div');c.id='notification-container';c.className='notification-container';document.body.appendChild(c);}const n=document.createElement('div');n.className=`notification notification-${t}`;n.innerHTML=`<i class="fas ${t==='success'?'fa-check-circle':t==='error'?'fa-exclamation-circle':'fa-info-circle'}"></i><span>${m}</span>`;c.appendChild(n);setTimeout(()=>n.classList.add('show'),10);setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),300)},3000);}

async function loadDashboard() {
  await Promise.all([
      loadStats(), 
      loadUpcomingAppointments(), 
      loadClientsToContact(), 
      loadMaintenanceMonth(), 
      loadWarrantyExpiring(), 
      loadClientsMap(),
      loadPendingReportsWidget() // <--- NOUVEAU
  ]);
}

// === NOUVEAU : GESTION DES RAPPORTS EN ATTENTE ===
async function loadPendingReportsWidget() {
    try {
        // 1. On récupère les stats
        const res = await fetch('/api/reports/stats');
        const stats = await res.json();
        const pendingCount = stats.pending || 0;

        // 2. Mise à jour de la Sidebar (Badge rouge)
        const sidebarLink = document.querySelector('a[href="/reports.html"]');
        if (sidebarLink) {
            // Nettoyage ancien badge
            const oldBadge = sidebarLink.querySelector('.sidebar-badge');
            if (oldBadge) oldBadge.remove();

            if (pendingCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'sidebar-badge';
                badge.style.cssText = 'background:#ef4444; color:white; font-size:0.75rem; padding:2px 6px; border-radius:10px; margin-left:auto; font-weight:bold;';
                badge.textContent = pendingCount;
                sidebarLink.appendChild(badge);
                sidebarLink.style.display = 'flex'; // Assure l'alignement
                sidebarLink.style.alignItems = 'center';
            }
        }

        // 3. Widget "À Valider" (Seulement si rôle autorisé et qu'il y a des rapports)
        // On supprime d'abord le widget s'il existe déjà pour éviter les doublons
        const existingWidget = document.getElementById('widget-validation');
        if (existingWidget) existingWidget.remove();

        const canValidate = ['admin', 'validator', 'sales_director'].includes(currentUser?.role);

        if (canValidate && pendingCount > 0) {
            // On récupère les détails des rapports en attente
            const r = await fetch('/api/reports?status=pending&limit=5');
            const data = await r.json();
            
            const widgetHtml = `
            <div class="widget" id="widget-validation" style="border: 2px solid #ef4444;">
                <div class="widget-header" style="background: #fee2e2;">
                    <h2 style="color: #991b1b;"><i class="fas fa-file-signature"></i> Rapports à valider (${pendingCount})</h2>
                </div>
                <div class="widget-content">
                    ${data.reports.map(rep => `
                        <div class="widget-item" style="cursor:pointer;" onclick="window.location.href='/reports.html?status=pending'">
                            <div style="display:flex; justify-content:space-between;">
                                <strong>${escapeHtml(rep.cabinet_name)}</strong>
                                <span class="badge badge-warning">En attente</span>
                            </div>
                            <small>${escapeHtml(rep.work_type)} • ${formatDate(rep.created_at)}</small>
                        </div>
                    `).join('')}
                    ${pendingCount > 5 ? `<div style="text-align:center; padding-top:10px;"><a href="/reports.html?status=pending" style="color:#ef4444; font-weight:bold;">Voir tout (${pendingCount})</a></div>` : ''}
                </div>
            </div>`;

            // On insère ce widget tout en haut de la grille
            const grid = document.querySelector('.widgets-grid');
            grid.insertAdjacentHTML('afterbegin', widgetHtml);
        }

    } catch (e) { console.error("Err widget reports:", e); }
}

// ... (Le reste des fonctions loadStats, loadUpcomingAppointments etc. reste inchangé) ...
async function loadStats(){try{const r=await fetch('/api/dashboard/stats');const s=await r.json();document.getElementById('stat-expired').textContent=s.maintenanceExpired;document.getElementById('stat-appointments').textContent=s.appointmentsToSchedule;document.getElementById('stat-uptodate').textContent=`${s.clientsUpToDate}/${s.totalClients}`;document.getElementById('stat-equipment').textContent=s.equipmentInstalled;}catch{}}
async function loadUpcomingAppointments(){try{const r=await fetch('/api/dashboard/upcoming-appointments');const appts=await r.json();const l=document.getElementById('appointments-list');if(appts.length===0){l.innerHTML='<div class="widget-empty"><i class="fas fa-calendar-check" style="margin-right:8px; opacity:0.5;"></i> Aucun rendez-vous.</div>';return;}l.innerHTML=appts.map(a=>`<div class="widget-item"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><strong>${escapeHtml(a.cabinet_name)}</strong>${a.technician_name?`<span class="badge badge-primary" style="font-size:0.7rem; padding:0.2rem 0.5rem;">${escapeHtml(a.technician_name)}</span>`:''}</div><small><i class="fas fa-calendar"></i> ${formatDate(a.appointment_at)} ${a.phone?`&nbsp;•&nbsp; <i class="fas fa-phone" style="font-size:0.7rem;"></i> ${escapeHtml(a.phone)}`:''} &nbsp;•&nbsp; ${escapeHtml(a.city)}</small></div>`).join('');}catch{}}
async function loadClientsToContact(){try{const r=await fetch('/api/dashboard/clients-to-contact');const clients=await r.json();const l=document.getElementById('contacts-list');if(clients.length===0){l.innerHTML='<div class="widget-empty"><i class="fas fa-check-circle" style="margin-right:8px; opacity:0.5;"></i> Aucun client à contacter.</div>';return;}l.innerHTML=clients.map(c=>`<div class="widget-item"><strong>${escapeHtml(c.cabinet_name)}</strong><small><i class="fas fa-wrench"></i> ${formatDate(c.maintenance_due_date)} ${c.phone?`&nbsp;•&nbsp; <i class="fas fa-phone" style="font-size:0.7rem;"></i> ${escapeHtml(c.phone)}`:''}</small></div>`).join('');}catch{}}
async function loadMaintenanceMonth(){try{const t=new Date();const s=new Date(t.getFullYear(),t.getMonth(),1).toISOString().split('T')[0];const e=new Date(t.getFullYear(),t.getMonth()+1,0).toISOString().split('T')[0];const r=await fetch('/api/clients?page=1&limit=1000');const d=await r.json();const m=d.clients.filter(c=>c.maintenance_due_date>=s&&c.maintenance_due_date<=e);const l=document.getElementById('maintenance-month-list');if(m.length===0){l.innerHTML='<div class="widget-empty"><i class="fas fa-clipboard-check" style="margin-right:8px; opacity:0.5;"></i> Aucune maintenance.</div>';return;}l.innerHTML=m.map(c=>`<div class="widget-item"><strong>${escapeHtml(c.cabinet_name)}</strong><small><i class="fas fa-calendar-check"></i> ${formatDate(c.maintenance_due_date)} • ${escapeHtml(c.city)}</small></div>`).join('');}catch{}}
async function loadWarrantyExpiring(){try{const t=new Date().toISOString().split('T')[0];const f=new Date(Date.now()+90*24*60*60*1000).toISOString().split('T')[0];const r=await fetch('/api/clients?page=1&limit=1000');const d=await r.json();const p=d.clients.map(async(c)=>{const er=await fetch(`/api/clients/${c.id}/equipment`);const eq=await er.json();return eq.filter(e=>e.warranty_until&&e.warranty_until>=t&&e.warranty_until<=f).map(e=>({...e,client_name:c.cabinet_name}));});const all=(await Promise.all(p)).flat();const l=document.getElementById('warranty-list');if(all.length===0){l.innerHTML='<div class="widget-empty"><i class="fas fa-shield-alt" style="margin-right:8px; opacity:0.5;"></i> Aucune garantie expirante.</div>';return;}l.innerHTML=all.sort((a,b)=>a.warranty_until.localeCompare(b.warranty_until)).map(e=>`<div class="widget-item"><strong>${escapeHtml(e.name)} - ${escapeHtml(e.client_name)}</strong><small><i class="fas fa-shield-alt"></i> ${formatDate(e.warranty_until)}</small></div>`).join('');}catch{}}
async function loadClientsMap(){try{const r=await fetch('/api/dashboard/clients-map');const clients=await r.json();allClients=await Promise.all(clients.map(async(c)=>{try{const er=await fetch(`/api/clients/${c.id}/equipment`);const eq=await er.json();return{...c,equipment:eq};}catch{return{...c,equipment:[]};}}));updateMapMarkers();}catch{}}
function getCoordinatesForClient(client){if(client.latitude&&client.longitude){return[client.latitude,client.longitude];}if(cityCoords[client.city.trim()])return cityCoords[client.city.trim()];const base=cantonCoords[client.canton]||[46.8,8.2];return[base[0]+(Math.random()-0.5)*0.05,base[1]+(Math.random()-0.5)*0.05];}
function updateMapMarkers(){if(!map)return;markers.forEach(m=>map.removeLayer(m));markers=[];const filtered=allClients.filter(c=>currentFilter==='all'||c.status===currentFilter);filtered.forEach(client=>{const coords=getCoordinatesForClient(client);const color=client.status==='expired'?'#dc2626':client.status==='warning'?'#f59e0b':'#16a34a';const marker=L.circleMarker(coords,{radius:8,fillColor:color,color:'#fff',weight:2,opacity:1,fillOpacity:0.8}).addTo(map);const badgeClass=client.status==='expired'?'badge-danger':client.status==='warning'?'badge-warning':'badge-success';const badgeText=client.status==='expired'?'Expiré':client.status==='warning'?'Bientôt':'À jour';const badgeIcon=client.status==='expired'?'fa-times-circle':client.status==='warning'?'fa-exclamation-triangle':'fa-check-circle';const getEqBadge=(date)=>{if(!date)return'<span class="badge badge-primary" style="font-size:10px!important;padding:2px 6px;">À définir</span>';const d=new Date(date),diff=Math.ceil((d-new Date().setHours(0,0,0,0))/(1000*60*60*24));if(diff<0)return`<span class="badge badge-danger" style="font-size:10px!important;padding:2px 6px;">Expiré (${Math.abs(diff)}j)</span>`;if(diff<=30)return`<span class="badge badge-warning" style="font-size:10px!important;padding:2px 6px;">${diff} jours</span>`;return`<span class="badge badge-success" style="font-size:10px!important;padding:2px 6px;">OK</span>`;};const eqHtml=client.equipment&&client.equipment.length>0?`<div class="map-equipment-section"><strong style="font-size:0.85rem;display:block;margin-bottom:5px;">Équipements (${client.equipment.length})</strong>`+client.equipment.map(e=>`<div class="map-equipment-item"><div style="font-size:0.8rem;"><strong>${escapeHtml(e.name)}</strong><br/><span style="color:#666;font-size:0.75rem;">${escapeHtml(e.brand)}</span></div><div>${getEqBadge(e.next_maintenance_date)}</div></div>`).join('')+`</div>`:`<div class="map-equipment-section" style="color:#777;font-style:italic;font-size:0.85rem;">Aucun équipement</div>`;marker.bindPopup(`<div class="map-popup"><div class="map-popup-header"><h3>${escapeHtml(client.cabinet_name)}</h3><span class="badge ${badgeClass}"><i class="fas ${badgeIcon}"></i> ${badgeText}</span></div><div class="map-popup-body"><div class="map-info-row"><i class="fas fa-user-md"></i><strong>${escapeHtml(client.contact_name)}</strong></div><div class="map-info-row"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(client.address)}, ${client.postal_code?client.postal_code+' ':''}${escapeHtml(client.city)}</span></div>${client.phone?`<div class="map-info-row"><i class="fas fa-phone"></i><a href="tel:${client.phone}">${escapeHtml(client.phone)}</a></div>`:''}${eqHtml}<div style="margin-top:1rem;text-align:center;"><button class="btn btn-sm btn-secondary w-100" onclick="openClientFromMap(${client.id})"><i class="fas fa-external-link-alt"></i> Voir la fiche complète</button></div></div></div>`,{maxWidth:340,minWidth:300,className:'kb-map-popup'});markers.push(marker);});}
window.openClientFromMap=function(id){window.location.href=`/clients.html?open=${id}`;};
function setupMapFilters(){document.querySelectorAll('.map-filter-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.map-filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentFilter=btn.dataset.filter;updateMapMarkers();});});}
function initMap(){try{map=L.map('map').setView([46.8,8.2],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);}catch{}}
function formatDate(d){if(!d)return'-';const[y,m,day]=d.split('-');return`${day}.${m}.${y}`;}
function escapeHtml(t){if(!t)return'';const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
setInterval(()=>{loadDashboard();},60000);