// public/js/clients.js

// --- VARIABLES GLOBALES ---
let currentView = 'directory';
let clients = [];
let catalog = [];
let currentClientId = null;
let clientIdToDelete = null;
let currentFilters = { search: '', canton: '', sector: '' };
let currentSort = { col: 'cabinet_name', order: 'asc' };
let currentPage = 1;
let itemsPerPage = 25;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. D'abord on charge tout ce qui est nécessaire
    await checkAuth();
    
    // On lance les chargements en parallèle pour aller plus vite
    await Promise.all([
        loadCatalog(),
        loadTechnicians(),
        loadData()
    ]);

    // 2. Ensuite on gère les paramètres URL
    const urlParams = new URLSearchParams(window.location.search);
    const clientToOpen = urlParams.get('open');
    const editRdvId = urlParams.get('edit_rdv');
    const viewParam = urlParams.get('view');

    if(viewParam === 'planning') {
        switchView('planning');
    }

    if (clientToOpen) {
        // Nettoyage URL immédiat
        window.history.replaceState({}, document.title, "/clients.html");

        // Ouverture Fiche Client
        // Note: On attend explicitement que la fiche soit ouverte pour lancer la modale RDV
        await openClientDetails(clientToOpen); 

        // Ouverture Modale RDV (si demandé)
        if (editRdvId) {
            // Petite sécurité : on s'assure que la fonction est dispo et que le technicien select est prêt
            const rdvModal = document.getElementById('schedule-modal');
            if (rdvModal) {
                // On récupère le nom pour le titre (optionnel, cosmétique)
                const nameEl = document.getElementById('sheet-name');
                const clientName = nameEl ? nameEl.textContent : "Client";
                
                console.log("Ouverture modale RDV pour:", editRdvId);
                openScheduleModal(clientToOpen, clientName, editRdvId);
            }
        }
    }

    // --- 2. LISTENERS (Recherche & Filtres) ---
    document.getElementById('global-search')?.addEventListener('input', debounce(e => { 
        currentFilters.search = e.target.value; currentPage = 1; loadData(); 
    }, 300));

    // Filtres Toolbar
    document.getElementById('filter-canton')?.addEventListener('change', e => { 
        currentFilters.canton = e.target.value; currentPage = 1; loadData(); 
    });
    document.getElementById('filter-sector')?.addEventListener('change', e => { 
        currentFilters.sector = e.target.value; currentPage = 1; loadData(); 
    });

    // Filtres Avancés
    document.getElementById('adv-status')?.addEventListener('change', () => { currentPage = 1; loadData(); });
    ['adv-brand', 'adv-model', 'adv-serial'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debounce(() => { currentPage = 1; loadData(); }, 500));
    });

    document.getElementById('show-hidden-cb')?.addEventListener('change', e => { 
        currentFilters.showHidden = e.target.checked; 
        currentPage = 1; 
        loadData(); 
    });

    document.getElementById('toggle-advanced-filters')?.addEventListener('click', () => document.getElementById('advanced-filters-panel').classList.toggle('hidden'));
    document.getElementById('clear-filters')?.addEventListener('click', resetFilters);
    
    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    document.getElementById('limit-select')?.addEventListener('change', e => { itemsPerPage = parseInt(e.target.value); currentPage = 1; loadData(); });
    
    // Actions globales
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDeleteClient);
    document.getElementById('btn-geo-search')?.addEventListener('click', searchCoordinates);
    
    // --- 3. INITIALISATION SLIMSELECT ---
    const destroyPreviousSlimSelect = (selector) => {
        const el = document.querySelector(selector);
        if (el && el.style.display === 'none' && el.nextElementSibling?.classList.contains('ss-main')) {
            el.nextElementSibling.remove();
            el.style.display = '';
        }
    };

    ['#filter-canton', '#filter-sector', '#adv-status'].forEach(s => destroyPreviousSlimSelect(s));

    new SlimSelect({ select: '#filter-canton', settings: { showSearch: false, placeholderText: 'Canton', allowDeselect: true } });
    new SlimSelect({ select: '#filter-sector', settings: { showSearch: false, placeholderText: 'Secteur', allowDeselect: true } });
    new SlimSelect({ select: '#adv-status', settings: { showSearch: false, placeholderText: 'Statut', allowDeselect: true } });
});

async function checkAuth() {
    try { const res = await fetch('/api/me'); if(!res.ok) window.location.href='/login.html'; const d=await res.json(); currentUser=d.user; document.getElementById('user-info').innerHTML=`<div class="user-avatar">${d.user.name[0]}</div><div class="user-details"><strong>${escapeHtml(d.user.name)}</strong><span>${d.user.role}</span></div>`; if(d.user.role === 'admin') document.getElementById('admin-link').classList.remove('hidden'); } catch { window.location.href='/login.html'; }
}
async function logout() { await fetch('/api/logout', {method:'POST'}); window.location.href = '/login.html'; }
async function loadCatalog() { try { const r = await fetch('/api/admin/equipment'); catalog = await r.json(); } catch {} }

function switchView(view) {
    currentView = view;
    document.getElementById('tab-directory').classList.toggle('active', view === 'directory');
    document.getElementById('tab-planning').classList.toggle('active', view === 'planning');
    
    document.getElementById('view-directory').classList.toggle('active', view === 'directory');
    document.getElementById('view-planning').classList.toggle('active', view === 'planning');
    
    if(view === 'planning') currentSort = { col: 'next_maintenance_date', order: 'asc' };
    else currentSort = { col: 'cabinet_name', order: 'asc' };
    currentPage = 1;
    loadData();
}

async function loadData() {
    const endpoint = currentView === 'directory' ? '/api/clients' : '/api/clients/planning';
    const params = new URLSearchParams({
        page: currentPage, limit: itemsPerPage,
        search: currentFilters.search, canton: currentFilters.canton, category: currentFilters.sector,
        sortBy: currentSort.col, sortOrder: currentSort.order,
        showHidden: currentFilters.showHidden,
        brand: document.getElementById('adv-brand')?.value||'', model: document.getElementById('adv-model')?.value||'', serialNumber: document.getElementById('adv-serial')?.value||'', status: document.getElementById('adv-status')?.value||''
    });
    try {
        const res = await fetch(`${endpoint}?${params}`);
        const data = await res.json();
        if (currentView === 'directory') renderDirectory(data.clients); else renderPlanning(data);
        updatePagination({ page: currentPage, totalPages: data.pagination?.totalPages || 1, totalItems: data.pagination?.totalItems || data.length });
    } catch(e) { console.error(e); }
}

// --- UPDATE : renderDirectory (Le tableau) ---
function renderDirectory(list) {
    const tbody = document.getElementById('clients-tbody');
    if(!list || list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--neutral-400);">Aucun résultat trouvé.</td></tr>'; return; }
    
    tbody.innerHTML = list.map(c => {
        // Logique visuelle pour les masqués
        const isHidden = c.is_hidden === 1;
        const rowStyle = isHidden ? 'background-color:#f3f4f6; opacity:0.75;' : '';
        const badgeHidden = isHidden ? '<span class="badge" style="background:#e5e7eb; color:#6b7280; font-size:0.7em; margin-left:5px;">Masqué</span>' : '';
        
        // Icône du bouton : Oeil barré si visible (pour masquer), Oeil ouvert si masqué (pour réafficher)
        const iconClass = isHidden ? 'fa-eye' : 'fa-eye-slash';
        const titleAction = isHidden ? 'Réafficher ce client' : 'Masquer ce client';
        const btnColor = isHidden ? 'btn-icon-primary' : 'btn-icon-secondary'; // Bleu si on réaffiche, Gris si on masque

        return `
        <tr onclick="openClientDetails(${c.id})" style="${rowStyle}">
            <td>
                <strong style="color:var(--color-primary); font-size:0.95rem;">${escapeHtml(c.cabinet_name)}</strong> ${badgeHidden}<br>
                <span style="font-size:0.8rem; color:var(--neutral-500);">${escapeHtml(c.activity)}</span>
            </td>
            <td>${escapeHtml(c.city)} <span style="font-size:0.75rem; color:var(--neutral-400);">(${c.canton||''})</span></td>
            <td>${escapeHtml(c.contact_name)}<br><span style="font-size:0.75rem; color:var(--neutral-500);">${escapeHtml(c.phone||'-')}</span></td>
            <td><small style="color:var(--neutral-500);">${c.equipment_summary ? c.equipment_summary.split(';;').length + ' machines' : 'Aucune machine'}</small></td>
            <td>${c.appointment_at ? formatDate(c.appointment_at) : '-'}</td>
            <td style="text-align:right;">
                <div style="display:flex; justify-content:flex-end; gap:5px;">
                    <button class="btn-icon-sm ${btnColor}" onclick="event.stopPropagation(); toggleClientHidden(${c.id}, ${c.is_hidden || 0})" title="${titleAction}">
                        <i class="fas ${iconClass}"></i>
                    </button>
                    <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openClientModal(${c.id})" title="Éditer">
                        <i class="fas fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// --- NOUVELLE FONCTION (Ajoutez-la à la fin du fichier ou exposez-la) ---
async function toggleClientHidden(id, currentStatus) {
    // Si c'est 1 (masqué), on veut passer à 0. Si c'est 0, on veut passer à 1.
    const newStatus = currentStatus ? 0 : 1;
    const actionWord = newStatus ? "masquer" : "réafficher";
    
    if(!confirm(`Voulez-vous vraiment ${actionWord} ce client ?`)) return;

    try {
        const res = await fetch(`/api/clients/${id}/toggle-hidden`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: newStatus })
        });
        
        if (res.ok) {
            // On recharge les données pour mettre à jour la liste
            loadData();
            showNotification(`Client ${newStatus ? 'masqué' : 'réaffiché'} avec succès.`, 'success');
        } else {
            showNotification("Erreur lors de la mise à jour.", "error");
        }
    } catch(e) { console.error(e); }
}

// --- LOGIQUE PLANNING (AVEC BOUTONS RDV) ---
function renderPlanning(list) {
    const tbody = document.getElementById('planning-tbody');
    tbody.innerHTML = '';
    const data = Array.isArray(list) ? list : (list.data || []);

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:2rem; color:var(--neutral-400);">Aucune maintenance à prévoir.</td></tr>`;
        return;
    }

    data.forEach(client => {
        // --- 1. Statut GLOBAL du client (Ligne principale) ---
        let statusClass = 'row-ok';
        let statusIcon = '<i class="fas fa-check-circle" style="color:var(--color-success)"></i>';
        
        if (!client.future_rdv_id) {
            // Pas de RDV : on regarde l'urgence
            if (client.worst_status_score === 2) { 
                statusClass = 'row-expired';
                statusIcon = '<i class="fas fa-exclamation-circle" style="color:var(--color-danger)"></i>';
            } else if (client.worst_status_score === 1) { 
                statusClass = 'row-warning';
                statusIcon = '<i class="fas fa-clock" style="color:var(--color-warning)"></i>';
            }
        } else {
            // RDV fixé : le client est "Vert" (Géré)
            statusIcon = `<i class="fas fa-calendar-check" style="color:var(--color-primary)" title="RDV prévu le ${formatDate(client.future_rdv_date)}"></i>`;
        }

        const countTotal = client.machines.length;
        // On recompte les expirés pour le résumé (basé sur la date réelle, pas le statut)
        const countExpired = client.machines.filter(m => {
            if(!m.next_date) return false;
            return new Date(m.next_date) < new Date();
        }).length;

        let summaryHTML = `<strong>${countTotal} Appareils</strong>`;
        if (countExpired > 0 && !client.future_rdv_id) summaryHTML += ` <span style="color:var(--color-danger); font-size:0.85em; font-weight:600;">• ${countExpired} à faire</span>`;

        // --- 2. Actions (Boutons) ---
        let actionButtons = '';
        if (client.future_rdv_id) {
            actionButtons = `
                <div style="display:flex; align-items:center; gap:6px; background:white; padding:3px 8px; border-radius:6px; border:1px solid #bae6fd; margin-right:8px;">
                    <span style="font-size:0.8rem; color:#0284c7; font-weight:600;">${formatDate(client.future_rdv_date)}</span>
                    <button class="btn-icon-sm" style="color:#ef4444; height:20px; width:20px;" onclick="event.stopPropagation(); deleteAppointment(${client.future_rdv_id})" title="Annuler le RDV"><i class="fas fa-times"></i></button>
                </div>`;
        } else {
            actionButtons = `
                <button class="btn btn-sm btn-primary" style="margin-right:8px;" onclick="event.stopPropagation(); openScheduleModal(${client.client_id}, '${escapeHtml(client.cabinet_name)}')" title="Fixer un RDV">
                    <i class="fas fa-calendar-plus"></i> Fixer
                </button>`;
        }

        // --- 3. Construction Ligne Principale ---
        const tr = document.createElement('tr');
        tr.className = `planning-row ${statusClass}`;
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td style="text-align:center; font-size:1.2rem;">${statusIcon}</td>
            <td>
                <div style="font-weight:700; color:var(--neutral-800);">${escapeHtml(client.cabinet_name)}</div>
                <div style="font-size:0.85rem; color:var(--neutral-500);"><i class="fas fa-phone-alt" style="font-size:0.75rem"></i> ${client.phone || '-'}</div>
            </td>
            <td><span class="badge-canton">${client.canton}</span> ${escapeHtml(client.city)}</td>
            <td>${summaryHTML}</td>
            <td style="font-family:monospace; font-weight:600; color:var(--neutral-700);">${formatDate(client.earliest_date)}</td>
            <td style="text-align:right;">
                <div style="display:flex; justify-content:flex-end; gap:5px; align-items:center;">
                    ${actionButtons}
                    <button class="btn-icon-sm btn-icon-secondary" onclick="event.stopPropagation(); openClientDetails(${client.client_id})" title="Voir fiche"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon-sm btn-icon-secondary btn-toggle-details"><i class="fas fa-chevron-down"></i></button>
                </div>
            </td>
        `;

        // --- 4. Détails (Liste des machines) ---
        // C'est ICI que nous corrigeons la logique : on recalcule l'icône selon la date réelle
        const trDetails = document.createElement('tr');
        trDetails.className = 'details-row hidden';
        
        const machinesHTML = client.machines.map(m => {
            let color = 'var(--color-success)';
            let icon = 'fa-check';
            
            if (m.next_date) {
                const today = new Date();
                today.setHours(0,0,0,0);
                const nextDate = new Date(m.next_date);
                
                // Calcul différence en jours
                const diffTime = nextDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    // C'est expiré -> ROUGE !
                    color = 'var(--color-danger)';
                    icon = 'fa-exclamation-triangle';
                } else if (diffDays <= 60) {
                    // C'est pour bientôt -> ORANGE
                    color = 'var(--color-warning)';
                    icon = 'fa-clock';
                }
            }

            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas ${icon}" style="color:${color}; width:20px; text-align:center;"></i>
                    <div>
                        <strong style="font-size:0.9rem;">${escapeHtml(m.name)}</strong> 
                        <small style="color:#666;">(${m.serial||'?'})</small>
                    </div>
                </div>
                <div style="text-align:right;">
                    <strong style="font-size:0.85rem; color:${color}">${formatDate(m.next_date)}</strong>
                </div>
            </div>`;
        }).join('');
            
        trDetails.innerHTML = `<td colspan="6"><div style="padding:1rem 2rem; background:#f8fafc; border-left:4px solid var(--neutral-300);">${machinesHTML}</div></td>`;
        
        tr.onclick = (e) => { if(!e.target.closest('button')) trDetails.classList.toggle('hidden'); };
        tbody.appendChild(tr);
        tbody.appendChild(trDetails);
    });
}

// --- FONCTIONS MODALE RDV ---

function closeScheduleModal() {
    document.getElementById('schedule-modal').classList.remove('active');
}

async function confirmSchedule() {
    const clientId = document.getElementById('schedule-client-id').value;
    const date = document.getElementById('schedule-date').value;
    
    // Récupérer le tableau des IDs depuis SlimSelect
    const techIds = techSelectInstance ? techSelectInstance.getSelected() : [];

    if (!date) { showNotification("Date requise", "error"); return; }

    const body = {
        appointment_date: date,
        task_description: "Maintenance",
        technician_ids: techIds // On envoie le tableau [1, 3]
    };

    try {
        let res;
        if (currentEditingRdvId) {
            res = await fetch(`/api/clients/appointments/${currentEditingRdvId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } else {
            res = await fetch(`/api/clients/${clientId}/appointments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }
        
        if (res.ok) {
            closeScheduleModal();
            showNotification("Enregistré avec succès", 'success');
            loadData(); // Rafraîchir le tableau
            // Si on est dans la fiche client, on rafraîchit aussi
            if(document.getElementById('client-details-modal').classList.contains('active')) {
                openClientDetails(clientId);
            }
        }
    } catch (e) { console.error(e); }
}

// --- RESTE DU FICHEIR (MODALES CLIENTS, ETC) ---

async function openClientDetails(id) {
    currentClientId = id;
    const modal = document.getElementById('client-details-modal');
    try {
        const res = await fetch(`/api/clients/${id}`);
        const c = await res.json();
        
        // Remplissage infos de base
        document.getElementById('sheet-name').textContent = c.cabinet_name;
        document.getElementById('sheet-category').textContent = c.activity || 'Autre';
        document.getElementById('sheet-city-header').textContent = c.city;
        document.getElementById('sheet-address').textContent = `${c.address}, ${c.postal_code||''} ${c.city}`;
        document.getElementById('sheet-phone').textContent = c.phone || '-';
        document.getElementById('sheet-email').textContent = c.email || '-';
        document.getElementById('sheet-contact').textContent = c.contact_name;
        document.getElementById('sheet-notes').textContent = c.notes || 'Aucune note.';
        document.getElementById('sheet-coords').innerHTML = c.latitude ? `<i class="fas fa-check-circle"></i> ${c.latitude}, ${c.longitude}` : 'Non localisé';
        
        // --- NOUVEAU : Injection des boutons d'action dans le header ---
        const actionsRow = modal.querySelector('.sheet-actions-row');
        if (actionsRow) {
            actionsRow.innerHTML = `
                <button class="btn btn-primary btn-sm" onclick="openScheduleModal(${c.id}, '${escapeHtml(c.cabinet_name)}')" title="Fixer un nouveau RDV">
                    <i class="fas fa-calendar-plus"></i> Planifier
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openClientModal(${c.id})">
                    <i class="fas fa-pen"></i> Modifier
                </button>
                <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${c.id})">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="modal-close" onclick="closeClientDetailsModal()">&times;</button>
            `;
        }

        // Gestion Sidebar (RDV existant)
        const sidebar = document.querySelector('.sheet-sidebar');
        const oldRdv = document.getElementById('sidebar-rdv-box');
        if(oldRdv) oldRdv.remove();

        if(c.next_rdv_date) {
            const dateStr = new Date(c.next_rdv_date).toLocaleDateString('fr-CH');
            const techStr = c.next_rdv_tech ? `(${c.next_rdv_tech})` : '';
            
            const rdvHtml = `
                <div id="sidebar-rdv-box" class="info-group" style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:6px; margin-bottom:20px;">
                    <label style="color:#1e40af; margin-bottom:5px;">PROCHAIN RDV</label>
                    <div style="color:#1e3a8a; font-weight:bold; font-size:1rem; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-calendar-alt"></i> ${dateStr}
                    </div>
                    <div style="font-size:0.8rem; color:#60a5fa; margin-top:2px; margin-left:24px;">${techStr}</div>
                </div>
            `;
            sidebar.insertAdjacentHTML('afterbegin', rdvHtml);
        }

        switchSheetTab('equipment'); 
        loadClientEquipment(id); 
        loadClientHistory(id);
        modal.classList.add('active');
    } catch(e) { console.error(e); }
}

function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

function switchSheetTab(tab) {
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
    document.getElementById(`btn-tab-${tab}`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

async function loadClientEquipment(id) {
    const div = document.getElementById('sheet-equipment-list');
    div.innerHTML = '<p style="color:var(--neutral-500);">Chargement...</p>';
    div.classList.remove('cards-grid'); 

    try {
        const res = await fetch(`/api/clients/${id}/equipment`);
        const list = await res.json();
        document.getElementById('count-eq').textContent = list.length;

        if (list.length === 0) { div.innerHTML = '<p>Aucun équipement.</p>'; return; }

        const groups = {};
        list.forEach(eq => {
            const loc = eq.location && eq.location.trim() !== "" ? eq.location : "Général";
            if (!groups[loc]) groups[loc] = [];
            groups[loc].push(eq);
        });

        let fullHtml = "";
        Object.keys(groups).sort().forEach(groupName => {
            const items = groups[groupName];
            fullHtml += `
                <div style="width:100%; margin-top:1.5rem; margin-bottom:0.5rem; padding-bottom:0.5rem; border-bottom:2px solid var(--neutral-100); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-folder-open" style="color:var(--color-primary);"></i>
                    <h4 style="margin:0; font-size:1rem; color:var(--neutral-700); text-transform:uppercase;">${escapeHtml(groupName)} <span style="font-size:0.8em; opacity:0.6; margin-left:5px;">(${items.length})</span></h4>
                </div>
                <div class="cards-grid" style="margin-bottom:1rem;">
            `;
            items.forEach(eq => {
                let color = 'var(--color-success)', text = 'OK';
                if(eq.days_remaining < 0) { color = 'var(--color-danger)'; text = 'Expiré'; }
                else if(eq.days_remaining < 30) { color = 'var(--color-warning)'; text = 'Bientôt'; }
                const jsonEq = JSON.stringify(eq).replace(/"/g, '&quot;');
                fullHtml += `
                <div class="eq-card-pro" style="border-left-color:${color}">
                    <div class="eq-info">
                        <h4 class="eq-title">${escapeHtml(eq.final_name)}</h4>
                        <p class="eq-sub">${escapeHtml(eq.final_brand)} • S/N: ${escapeHtml(eq.serial_number||'-')}</p>
                        <span class="eq-date" style="color:${color}">${text} : ${formatDate(eq.next_maintenance_date)}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <button class="btn-icon-sm btn-icon-secondary" onclick="openEquipFormModal(${jsonEq})"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${id}, ${eq.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            });
            fullHtml += `</div>`;
        });
        div.innerHTML = fullHtml;
    } catch { div.innerHTML = '<p>Erreur.</p>'; }
}

async function loadClientHistory(id) {
    const div = document.getElementById('sheet-history-list');
    div.innerHTML = '<p style="color:var(--neutral-500); padding-left:20px;">Chargement de l\'historique...</p>';
    
    // On récupère le nom du client affiché en haut de la fiche pour la modale
    const clientName = document.getElementById('sheet-name').textContent || 'Client';

    try {
        const res = await fetch(`/api/clients/${id}/appointments`);
        const list = await res.json();
        document.getElementById('count-hist').textContent = list.length;
        
        if(list.length === 0) { 
            div.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--neutral-400); font-style:italic;"><i class="fas fa-history fa-2x" style="opacity:0.3; margin-bottom:10px;"></i><br>Aucun historique.</div>'; 
            return; 
        }
        
        div.innerHTML = list.map(h => {
            const isReport = h.source_type === 'report';
            const typeClass = isReport ? 'type-report' : 'type-rdv';
            
            // Calculer si c'est passé ou futur
            const rdvDate = new Date(h.appointment_date);
            const today = new Date();
            today.setHours(0,0,0,0); // On compare sans les heures
            const isPast = rdvDate < today;

            // Style visuel : Si passé -> Grisé / Si futur -> Coloré
            const opacityStyle = isPast && !isReport ? 'opacity: 0.7; filter: grayscale(100%);' : '';
            const statusBadge = isPast && !isReport ? '<span style="font-size:0.7rem; background:#eee; padding:2px 6px; border-radius:4px; color:#666;">Terminé</span>' : '';

            // Icones et Titres
            let icon = isReport ? 'fa-file-alt' : 'fa-calendar-check';
            let title = isReport ? 'Rapport d\'Intervention' : 'Rendez-vous';
            let tagName = isReport ? (h.report_number || 'Rapport') : 'RDV';
            let tagClass = isReport ? 'tag-report' : 'tag-rdv';

            // Gestion du nom du technicien
            const techHtml = h.tech_name 
                ? `<div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--neutral-600); margin-top:4px;">
                     <i class="fas fa-user-hard-hat" style="font-size:0.75rem; color:var(--neutral-400);"></i> 
                     <strong>${escapeHtml(h.tech_name)}</strong>
                   </div>`
                : `<div style="font-size:0.8rem; color:#9ca3af; margin-top:4px; font-style:italic;">Non assigné</div>`;

            const dateStr = rdvDate.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            
            return `
            <div class="timeline-item ${typeClass}" style="${opacityStyle}">
                <div class="timeline-marker"><i class="fas ${icon}"></i></div>
                <span class="timeline-date">${dateStr} ${statusBadge}</span>
                
                <div class="timeline-card">
                    <div class="timeline-header">
                        <h4 class="timeline-title">${title}</h4>
                        <span class="timeline-tag ${tagClass}">${tagName}</span>
                    </div>
                    
                    ${techHtml} 
                    
                    <div class="timeline-desc" style="margin-top:8px;">
                        ${escapeHtml(h.task_description || 'Aucune description.')}
                    </div>

                    ${h.report_id ? `
                    <div class="timeline-action">
                        <button class="btn-doc-action" onclick="window.open('/report-view.html?id=${h.report_id}', '_blank')">
                            <i class="fas fa-file-pdf"></i> Voir Rapport
                        </button>
                    </div>` : ''}

                    ${!isReport && !isPast ? `
                    <div class="timeline-action">
                        <button class="btn-doc-action" style="border-color:#cbd5e1; color:#475569;" 
                                onclick="event.stopPropagation(); openScheduleModal(${id}, '${escapeHtml(clientName)}', ${h.id_unique})">
                            <i class="fas fa-pen"></i> Modifier
                        </button>
                    </div>` : ''}

                </div>
            </div>`;
        }).join('');
        
    } catch(e) {
        console.error(e);
        div.innerHTML = '<p style="color:var(--color-danger);">Erreur de chargement.</p>';
    }
}

function handleSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }
async function openClientModal(id = null) {
    const modal = document.getElementById('client-modal'); document.getElementById('client-form').reset(); document.getElementById('client-id').value = '';
    if (id) { const res = await fetch(`/api/clients/${id}`); const d = await res.json(); document.getElementById('client-id').value = d.id; document.getElementById('client-name').value = d.cabinet_name; document.getElementById('client-city').value = d.city; }
    modal.classList.add('active');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }
async function saveClient() {
    const id = document.getElementById('client-id').value;
    
    // On récupère TOUS les champs du formulaire
    const data = {
        cabinet_name: document.getElementById('client-name').value,
        activity: document.getElementById('client-activity').value,
        contact_name: document.getElementById('client-contact').value,
        phone: document.getElementById('client-phone').value,
        email: document.getElementById('client-email').value,
        address: document.getElementById('client-address').value,
        postal_code: document.getElementById('client-npa').value,
        city: document.getElementById('client-city').value,
        canton: document.getElementById('client-canton').value,
        notes: document.getElementById('client-notes').value,
        latitude: document.getElementById('client-lat').value,
        longitude: document.getElementById('client-lon').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${id}` : '/api/clients';

    try { 
        const res = await fetch(url, { 
            method, 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });

        if(res.ok) { 
            closeClientModal(); 
            loadData(); 
            // Si on modifiait le client actuellement ouvert en détail, on rafraîchit la fiche
            if(id && id == currentClientId) openClientDetails(id); 
            showNotification('Client enregistré avec succès', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur lors de l\'enregistrement', 'error');
        }
    } catch(e) { 
        console.error(e);
        showNotification('Erreur réseau', 'error'); 
    }
}
function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) { const div = document.createElement('div'); div.id = 'notification-container'; div.className = 'notification-container'; document.body.appendChild(div); container = div; }
  const n = document.createElement('div'); n.className = `notification notification-${type}`; n.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> <span>${message}</span>`;
  container.appendChild(n); setTimeout(() => n.classList.add('show'), 10); setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
}
function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){ document.getElementById('pagination-info').textContent = `Page ${p.page} sur ${p.totalPages}`; document.getElementById('prev-page').disabled = p.page <= 1; document.getElementById('next-page').disabled = p.page >= p.totalPages; }
function changePage(delta) { currentPage += delta; loadData(); }
function resetFilters() { currentFilters = { search:'', canton:'', sector:'' }; loadData(); }
function exportData() { showNotification("Fonction d'export CSV à implémenter.", "info"); }

// --- FONCTIONS RENDEZ-VOUS ---

// Variable globale pour stocker l'ID du RDV (si pas déjà présente en haut du fichier)
let currentEditingRdvId = null;

async function openScheduleModal(clientId, clientName, rdvId = null) {
    document.getElementById('schedule-client-id').value = clientId;
    document.getElementById('schedule-client-name').textContent = clientName;
    currentEditingRdvId = rdvId;
    
    // Reset propre
    if(techSelectInstance) techSelectInstance.setSelected([]);

    const footer = document.querySelector('#schedule-modal .modal-footer');
    footer.innerHTML = `
        <button class="btn btn-secondary" onclick="closeScheduleModal()">Annuler</button>
        <button class="btn btn-primary" onclick="confirmSchedule()">Valider</button>
    `;

    if (rdvId) {
        // MODE MODIFICATION
        document.querySelector('#schedule-modal h2').innerHTML = '<i class="fas fa-edit"></i> Modifier RDV';
        
        // Bouton Supprimer
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn';
        btnDelete.style.cssText = "background-color: #ef4444; color: white; margin-right: auto;"; 
        btnDelete.innerHTML = '<i class="fas fa-trash"></i> Supprimer';
        btnDelete.onclick = () => deleteAppointment(rdvId);
        footer.insertBefore(btnDelete, footer.firstChild);

        try {
            const res = await fetch(`/api/clients/appointments/${rdvId}`);
            const rdv = await res.json();
            
            document.getElementById('schedule-date').value = rdv.appointment_date;
            
            // CORRECTION IMPORTANTE : Convertir les IDs en String pour SlimSelect
            if(techSelectInstance && rdv.technician_ids) {
                const idsAsString = rdv.technician_ids.map(id => String(id));
                techSelectInstance.setSelected(idsAsString);
            }
        } catch(e) { console.error(e); }
    } else {
        // MODE CRÉATION
        document.querySelector('#schedule-modal h2').innerHTML = '<i class="fas fa-calendar-plus"></i> Planifier RDV';
        const d = new Date(); d.setDate(d.getDate() + 1);
        document.getElementById('schedule-date').value = d.toISOString().split('T')[0];
    }
    
    document.getElementById('schedule-modal').classList.add('active');
}

async function deleteAppointment(rdvId) {
    if (!confirm("Voulez-vous vraiment supprimer ce rendez-vous ?")) return;
    
    try {
        const res = await fetch(`/api/clients/appointments/${rdvId}`, { method: 'DELETE' });
        
        if (res.ok) {
            // 1. D'abord on ferme la modale pour éviter les bugs visuels
            closeScheduleModal();
            showNotification("Rendez-vous supprimé", 'info');
            
            // 2. Ensuite on rafraîchit les données
            // Si on est dans une fiche client, on la met à jour
            const modalDetails = document.getElementById('client-details-modal');
            if (modalDetails && modalDetails.classList.contains('active')) {
                // On récupère l'ID du client depuis le champ caché de la modale RDV
                const clientId = document.getElementById('schedule-client-id').value;
                if(clientId) openClientDetails(clientId);
            }
            
            // Dans tous les cas, on rafraîchit la liste principale ou le planning
            loadData(); 
            
        } else {
            const err = await res.json();
            showNotification(err.error || "Erreur lors de la suppression", 'error');
        }
    } catch (e) { 
        console.error(e);
        showNotification("Erreur réseau", 'error');
    }
}

// --- FONCTIONS MANQUANTES (GEOLOCALISATION) ---

async function searchCoordinates() {
    const address = document.getElementById('client-address').value;
    const city = document.getElementById('client-city').value;
    const npa = document.getElementById('client-npa').value;
    const statusDiv = document.getElementById('geo-status');
    
    if(!address || !city) { 
        statusDiv.innerHTML = '<span style="color:#ef4444;">Adresse et Ville requises.</span>'; 
        return; 
    }
    
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    
    try {
        const query = `${address}, ${npa} ${city}, Switzerland`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.length > 0) {
            document.getElementById('client-lat').value = data[0].lat;
            document.getElementById('client-lon').value = data[0].lon;
            statusDiv.innerHTML = '<span style="color:#166534;"><i class="fas fa-check"></i> Trouvé !</span>';
        } else { 
            statusDiv.innerHTML = '<span style="color:#ef4444;">Aucun résultat.</span>'; 
        }
    } catch { 
        statusDiv.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>'; 
    }
}

// --- FONCTIONS MANQUANTES (SUPPRESSION CLIENT) ---

function openDeleteModal(id) { 
    clientIdToDelete = id; 
    document.getElementById('delete-modal').classList.add('active'); 
}

function closeDeleteModal() { 
    document.getElementById('delete-modal').classList.remove('active'); 
    clientIdToDelete = null; 
}

async function confirmDeleteClient() {
    if(!clientIdToDelete) return;
    try { 
        const res = await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' }); 
        if(res.ok) { 
            closeDeleteModal(); 
            // Si on est dans la fiche détail, on la ferme aussi
            if(document.getElementById('client-details-modal').classList.contains('active')) {
                closeClientDetailsModal();
            }
            loadData(); 
            showNotification('Client supprimé', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur suppression', 'error');
        }
    } catch { 
        showNotification('Erreur réseau', 'error'); 
    }
}

// --- FONCTIONS MANQUANTES (GESTION ÉQUIPEMENTS / MACHINES) ---

function openEquipFormModal(eq = null) {
    const modal = document.getElementById('equipment-form-modal');
    document.getElementById('equip-form').reset();
    document.getElementById('equip-id').value = '';
    
    // Remplir le select avec le catalogue (variable globale 'catalog')
    const select = document.getElementById('equip-select');
    select.innerHTML = '<option value="">-- Sélectionner --</option>' + catalog.map(c => `<option value="${c.id}">${c.name} (${c.brand})</option>`).join('');
    
    if(eq) {
        document.getElementById('equip-id').value = eq.id;
        select.value = eq.equipment_id;
        document.getElementById('equip-location').value = eq.location || '';
        document.getElementById('equip-serial').value = eq.serial_number;
        document.getElementById('equip-install').value = eq.installed_at;
        document.getElementById('equip-last').value = eq.last_maintenance_date;
        document.getElementById('equip-interval').value = eq.maintenance_interval;
    }
    modal.classList.add('active');
}

function closeEquipModal() { 
    document.getElementById('equipment-form-modal').classList.remove('active'); 
}

async function saveEquipment() {
    if(!currentClientId) return;
    const id = document.getElementById('equip-id').value;
    
    const data = {
        equipment_id: document.getElementById('equip-select').value,
        location: document.getElementById('equip-location').value.trim(),
        serial_number: document.getElementById('equip-serial').value,
        installed_at: document.getElementById('equip-install').value,
        last_maintenance_date: document.getElementById('equip-last').value,
        maintenance_interval: document.getElementById('equip-interval').value
    };
    
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${currentClientId}/equipment/${id}` : `/api/clients/${currentClientId}/equipment`;
    
    try { 
        const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        if(res.ok) { 
            closeEquipModal(); 
            loadClientEquipment(currentClientId); 
            loadData(); 
            showNotification('Équipement enregistré', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}

async function deleteEquipment(clientId, eqId) {
    if(!confirm("Supprimer la machine ?")) return;
    try { 
        const res = await fetch(`/api/clients/${clientId}/equipment/${eqId}`, { method: 'DELETE' }); 
        if(res.ok) {
            loadClientEquipment(clientId); 
            loadData(); 
            showNotification('Machine supprimée', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur lors de la suppression', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}

function exportData() {
    const link = document.createElement('a');
    link.href = '/api/clients/export-excel';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


let techSelectInstance = null;

async function loadTechnicians() {
    try {
        const res = await fetch('/api/clients/technicians');
        if (!res.ok) return;
        const users = await res.json();
        
        const select = document.getElementById('schedule-tech');
        
        // 1. NETTOYAGE AGRESSIF (Anti-doublons)
        // On détruit l'instance SlimSelect si on la connaît
        if (techSelectInstance) { 
            techSelectInstance.destroy(); 
            techSelectInstance = null; 
        }
        
        // Si SlimSelect a créé des éléments visuels orphelins, on les supprime manuellement
        if (select.nextElementSibling && select.nextElementSibling.classList.contains('ss-main')) {
            select.nextElementSibling.remove();
            select.style.display = ''; // On réaffiche le select natif pour le réinitialiser proprement
        }
        
        // 2. FORCER LES ATTRIBUTS
        select.multiple = true;
        select.setAttribute('multiple', 'multiple');
        
        // 3. REMPLISSAGE HTML
        select.innerHTML = users.map(u => 
            `<option value="${u.id}">${escapeHtml(u.name)} (${u.role})</option>`
        ).join('');

        // 4. INITIALISATION SLIMSELECT
        techSelectInstance = new SlimSelect({
            select: '#schedule-tech',
            settings: { 
                showSearch: false,
                placeholderText: 'Sélectionner technicien(s)',
                allowDeselect: true,
                closeOnSelect: false // IMPORTANT : Garde le menu ouvert pour en cocher plusieurs
            }
        });

    } catch (e) { console.error("Erreur chargement techniciens", e); }
}

// EXPOSITION DES FONCTIONS AU HTML
window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.saveClient = saveClient;
window.searchCoordinates = searchCoordinates; // <--- Celle qui manquait (Erreur 1)
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteClient = confirmDeleteClient; // <--- Celle qui manquait (Erreur 2)

// Fonctions Équipement
window.openEquipFormModal = openEquipFormModal;
window.closeEquipModal = closeEquipModal;
window.saveEquipment = saveEquipment;
window.deleteEquipment = deleteEquipment;
window.toggleClientHidden = toggleClientHidden;

// Fonctions RDV / Planning (Nouveautés)
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.confirmSchedule = confirmSchedule;
window.deleteAppointment = deleteAppointment;
window.exportData = exportData;