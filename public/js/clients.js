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
    await checkAuth();
    await loadCatalog();
    loadData();

    // --- GESTION OUVERTURE DIRECTE DEPUIS DASHBOARD ---
    const urlParams = new URLSearchParams(window.location.search);
    const clientToOpen = urlParams.get('open');

    if (clientToOpen) {
        setTimeout(() => { openClientDetails(clientToOpen); }, 500);
        window.history.replaceState({}, document.title, "/clients.html");
    }

    // --- LISTENERS (ÉCOUTEURS D'ÉVÉNEMENTS) ---
    
    // 1. Recherche Globale
    document.getElementById('global-search')?.addEventListener('input', debounce(e => { 
        currentFilters.search = e.target.value; currentPage = 1; loadData(); 
    }, 300));

    // 2. Filtres Barre d'outils (Canton / Secteur)
    document.getElementById('filter-canton')?.addEventListener('change', e => { 
        currentFilters.canton = e.target.value; currentPage = 1; loadData(); 
    });
    document.getElementById('filter-sector')?.addEventListener('change', e => { 
        currentFilters.sector = e.target.value; currentPage = 1; loadData(); 
    });

    // 3. FILTRES AVANCÉS (Le correctif est ici !)
    // On écoute le changement du Statut
    document.getElementById('adv-status')?.addEventListener('change', () => { 
        currentPage = 1; loadData(); 
    });
    
    // On écoute aussi les champs textes (Marque, Modèle, Série) avec un petit délai (debounce)
    ['adv-brand', 'adv-model', 'adv-serial'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debounce(() => { 
            currentPage = 1; loadData(); 
        }, 500));
    });

    // Boutons Interface
    document.getElementById('toggle-advanced-filters')?.addEventListener('click', () => document.getElementById('advanced-filters-panel').classList.toggle('hidden'));
    document.getElementById('clear-filters')?.addEventListener('click', resetFilters);
    
    // Pagination & Autres
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    document.getElementById('limit-select')?.addEventListener('change', e => { itemsPerPage = parseInt(e.target.value); currentPage = 1; loadData(); });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', confirmDeleteClient);
    document.getElementById('btn-geo-search')?.addEventListener('click', searchCoordinates);
    
    // Import Excel
    document.getElementById('import-excel-input')?.addEventListener('change', async (e) => {
        /* ... (Garder votre code d'import existant ici) ... */
        const file = e.target.files[0];
        if (!file) return;
        // (Pour alléger la réponse j'abrège cette partie qui fonctionnait déjà, ne la supprimez pas si vous copiez-collez tout)
        const formData = new FormData(); formData.append('file', file);
        try { await fetch('/api/clients/import', { method: 'POST', body: formData }); loadData(); showNotification("Import terminé", 'success'); } catch { showNotification("Erreur import", 'error'); } e.target.value = '';
    });


    // --- INITIALISATION SLIMSELECT (Nettoyage + Création) ---
    
    const destroyPreviousSlimSelect = (selector) => {
        const el = document.querySelector(selector);
        if (el && el.style.display === 'none' && el.nextElementSibling?.classList.contains('ss-main')) {
            el.nextElementSibling.remove();
            el.style.display = '';
        }
    };

    // 1. Nettoyage préventif
    destroyPreviousSlimSelect('#filter-canton');
    destroyPreviousSlimSelect('#filter-sector');
    destroyPreviousSlimSelect('#adv-status'); // <--- On nettoie aussi le Statut

    // 2. Initialisations
    new SlimSelect({
        select: '#filter-canton',
        settings: { showSearch: false, placeholderText: 'Canton', allowDeselect: true }
    });

    new SlimSelect({
        select: '#filter-sector',
        settings: { showSearch: false, placeholderText: 'Secteur', allowDeselect: true }
    });

    // 3. Initialisation du Statut (Nouveau !)
    new SlimSelect({
        select: '#adv-status',
        settings: { 
            showSearch: false, 
            placeholderText: 'Statut', 
            allowDeselect: true 
        }
    });
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
        brand: document.getElementById('adv-brand')?.value||'', model: document.getElementById('adv-model')?.value||'', serialNumber: document.getElementById('adv-serial')?.value||'', status: document.getElementById('adv-status')?.value||''
    });
    try {
        const res = await fetch(`${endpoint}?${params}`);
        const data = await res.json();
        if (currentView === 'directory') renderDirectory(data.clients); else renderPlanning(data);
        updatePagination({ page: currentPage, totalPages: data.pagination?.totalPages || 1, totalItems: data.pagination?.totalItems || data.length });
    } catch(e) { console.error(e); }
}

function renderDirectory(list) {
    const tbody = document.getElementById('clients-tbody');
    if(!list || list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--neutral-400);">Aucun résultat trouvé.</td></tr>'; return; }
    tbody.innerHTML = list.map(c => `
        <tr onclick="openClientDetails(${c.id})">
            <td><strong style="color:var(--color-primary); font-size:0.95rem;">${escapeHtml(c.cabinet_name)}</strong><br><span style="font-size:0.8rem; color:var(--neutral-500);">${escapeHtml(c.activity)}</span></td>
            <td>${escapeHtml(c.city)} <span style="font-size:0.75rem; color:var(--neutral-400);">(${c.canton||''})</span></td>
            <td>${escapeHtml(c.contact_name)}<br><span style="font-size:0.75rem; color:var(--neutral-500);">${escapeHtml(c.phone||'-')}</span></td>
            <td><small style="color:var(--neutral-500);">${c.equipment_summary ? c.equipment_summary.split(';;').length + ' machines installées' : 'Aucune machine'}</small></td>
            <td>${c.appointment_at ? formatDate(c.appointment_at) : '-'}</td>
            <td style="text-align:right;">
                <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openClientModal(${c.id})" title="Éditer"><i class="fas fa-pen"></i></button>
            </td>
        </tr>`).join('');
}

function renderPlanning(list) {
    const tbody = document.getElementById('planning-tbody');
    tbody.innerHTML = '';

    // 1. Récupération des données (format envoyé par le nouveau Backend)
    const data = Array.isArray(list) ? list : (list.data || []);

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:2rem; color:var(--neutral-400);">Aucune maintenance prévue selon ces critères.</td></tr>`;
        return;
    }

    // 2. Génération des lignes (Client + Accordéon)
    data.forEach(client => {
        // A. Déterminer le statut global du client (Couleur de la ligne)
        let statusClass = 'row-ok';
        let statusIcon = '<i class="fas fa-check-circle" style="color:var(--color-success)"></i>';
        
        // worst_status_score vient du backend : 2=Expired, 1=Warning, 0=OK
        if (client.worst_status_score === 2) { 
            statusClass = 'row-expired';
            statusIcon = '<i class="fas fa-exclamation-circle" style="color:var(--color-danger)"></i>';
        } else if (client.worst_status_score === 1) { 
            statusClass = 'row-warning';
            statusIcon = '<i class="fas fa-clock" style="color:var(--color-warning)"></i>';
        }

        // B. Résumé textuel du parc
        const countTotal = client.machines.length;
        const countExpired = client.machines.filter(m => m.status === 'expired').length;
        const countWarning = client.machines.filter(m => m.status === 'warning').length;
        
        let summaryHTML = `<strong>${countTotal} Appareils</strong>`;
        if (countExpired > 0) summaryHTML += ` <span style="color:var(--color-danger); font-size:0.85em; font-weight:600;">• ${countExpired} à faire</span>`;
        if (countWarning > 0) summaryHTML += ` <span style="color:var(--color-warning); font-size:0.85em; font-weight:600;">• ${countWarning} bientôt</span>`;

        // --- CRÉATION DE LA LIGNE PRINCIPALE (CLIENT) ---
        const tr = document.createElement('tr');
        tr.className = `planning-row ${statusClass}`;
        tr.style.cursor = 'pointer';
        
        tr.innerHTML = `
            <td style="text-align:center; font-size:1.2rem;">${statusIcon}</td>
            <td>
                <div style="font-weight:700; color:var(--neutral-800);">${escapeHtml(client.cabinet_name)}</div>
                <div style="font-size:0.85rem; color:var(--neutral-500);"><i class="fas fa-phone-alt" style="font-size:0.75rem"></i> ${client.phone || '-'}</div>
            </td>
            <td>
                <span class="badge-canton">${client.canton}</span> ${escapeHtml(client.city)}
            </td>
            <td>${summaryHTML}</td>
            <td style="font-family:monospace; font-weight:600; color:var(--neutral-700);">
                ${formatDate(client.earliest_date)}
            </td>
            <td style="text-align:right;">
                <button class="btn-icon-sm btn-icon-secondary btn-toggle-details">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </td>
        `;

        // --- CRÉATION DE LA LIGNE DE DÉTAILS (CACHÉE) ---
        const trDetails = document.createElement('tr');
        trDetails.className = 'details-row hidden';
        trDetails.style.backgroundColor = '#f8fafc'; 
        
        // Construction de la liste des machines (Sous-tableau)
        let machinesHTML = client.machines.map(m => {
            let color = 'var(--color-success)';
            let icon = 'fa-check';
            let txtColor = 'var(--neutral-600)';

            if (m.status === 'expired') { 
                color = 'var(--color-danger)'; icon = 'fa-exclamation-triangle'; txtColor = 'var(--color-danger)';
            } else if (m.status === 'warning') { 
                color = 'var(--color-warning)'; icon = 'fa-clock'; txtColor = '#d97706';
            }
            
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom:1px solid #eee;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i class="fas ${icon}" style="color:${color}; width:20px; text-align:center;"></i>
                        <div>
                            <div style="font-weight:600; font-size:0.9rem; color:var(--neutral-800);">${escapeHtml(m.name)}</div>
                            <div style="font-size:0.8rem; color:#64748b;">
                                SN: <code style="background:white; border:1px solid #e2e8f0; padding:1px 4px; border-radius:3px;">${escapeHtml(m.serial || '?')}</code> 
                                ${m.location ? `• <i class="fas fa-map-marker-alt"></i> ${escapeHtml(m.location)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right; display:flex; align-items:center; gap:15px;">
                        <div>
                            <div style="font-size:0.85rem; font-weight:700; color:${txtColor};">${formatDate(m.next_date)}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">${m.days} jours restants</div>
                        </div>
                        <button class="btn-icon-sm btn-icon-primary" 
                                onclick="event.stopPropagation(); window.location.href='/reports.html?action=create&client=${client.client_id}&eq=${m.id}'" 
                                title="Créer rapport pour cette machine">
                            <i class="fas fa-file-signature"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        trDetails.innerHTML = `
            <td colspan="6" style="padding: 0;">
                <div class="details-container" style="padding: 1rem 2rem 1.5rem 2rem; border-left: 4px solid var(--neutral-300);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <h4 style="margin:0; font-size:0.8rem; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.05em;">
                            Détail du parc machine
                        </h4>
                        <button class="btn btn-sm btn-secondary" onclick="openClientDetails(${client.client_id})">
                            <i class="fas fa-external-link-alt"></i> Voir fiche complète
                        </button>
                    </div>
                    ${machinesHTML}
                </div>
            </td>
        `;

        // --- INTERACTION ---
        // Clic sur la ligne = Ouvrir/Fermer
        tr.addEventListener('click', (e) => {
            // Si on clique sur un bouton ou un lien dans la ligne principale, on ne déclenche pas l'accordéon
            if (e.target.closest('button') && !e.target.classList.contains('btn-toggle-details')) return;
            
            trDetails.classList.toggle('hidden');
            
            // Animation de l'icône chevron
            const icon = tr.querySelector('.fa-chevron-down') || tr.querySelector('.fa-chevron-up');
            if(icon) {
                if (trDetails.classList.contains('hidden')) {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                } else {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                }
            }
        });

        tbody.appendChild(tr);
        tbody.appendChild(trDetails);
    });
}

async function openClientDetails(id) {
    currentClientId = id;
    const modal = document.getElementById('client-details-modal');
    try {
        const res = await fetch(`/api/clients/${id}`);
        const c = await res.json();
        document.getElementById('sheet-name').textContent = c.cabinet_name;
        document.getElementById('sheet-category').textContent = c.activity || 'Autre';
        document.getElementById('sheet-city-header').textContent = c.city;
        document.getElementById('sheet-address').textContent = `${c.address}, ${c.postal_code||''} ${c.city}`;
        document.getElementById('sheet-phone').textContent = c.phone || '-';
        document.getElementById('sheet-email').textContent = c.email || '-';
        document.getElementById('sheet-contact').textContent = c.contact_name;
        document.getElementById('sheet-notes').textContent = c.notes || 'Aucune note renseignée.';
        document.getElementById('sheet-coords').innerHTML = c.latitude ? `<i class="fas fa-check-circle"></i> ${c.latitude}, ${c.longitude}` : 'Non localisé';
        
        switchSheetTab('equipment'); loadClientEquipment(id); loadClientHistory(id);
        modal.classList.add('active');
    } catch {}
}
function closeClientDetailsModal() { document.getElementById('client-details-modal').classList.remove('active'); }

function switchSheetTab(tab) {
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
    
    const btn = document.getElementById(`btn-tab-${tab}`);
    if(btn) btn.classList.add('active');
    
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// 3. Affichage (Groupement par dossiers)
async function loadClientEquipment(id) {
    const div = document.getElementById('sheet-equipment-list');
    div.innerHTML = '<p style="color:var(--neutral-500);">Chargement...</p>';
    div.classList.remove('cards-grid'); // On retire la grille globale pour gérer les sous-grilles

    try {
        const res = await fetch(`/api/clients/${id}/equipment`);
        const list = await res.json();
        document.getElementById('count-eq').textContent = list.length;

        if (list.length === 0) {
            div.innerHTML = '<p>Aucun équipement.</p>';
            return;
        }

        // REGROUPEMENT
        const groups = {};
        list.forEach(eq => {
            const loc = eq.location && eq.location.trim() !== "" ? eq.location : "Général";
            if (!groups[loc]) groups[loc] = [];
            groups[loc].push(eq);
        });

        // GENERATION HTML
        let fullHtml = "";
        const sortedKeys = Object.keys(groups).sort();

        sortedKeys.forEach(groupName => {
            const items = groups[groupName];
            
            // Titre du dossier
            fullHtml += `
                <div style="width:100%; margin-top:1.5rem; margin-bottom:0.5rem; padding-bottom:0.5rem; border-bottom:2px solid var(--neutral-100); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-folder-open" style="color:var(--color-primary);"></i>
                    <h4 style="margin:0; font-size:1rem; color:var(--neutral-700); text-transform:uppercase;">${escapeHtml(groupName)} <span style="font-size:0.8em; opacity:0.6; margin-left:5px;">(${items.length})</span></h4>
                </div>
                <div class="cards-grid" style="margin-bottom:1rem;">
            `;

            // Liste des machines du dossier
            items.forEach(eq => {
                let color = 'var(--color-success)', text = 'OK';
                if(eq.days_remaining < 0) { color = 'var(--color-danger)'; text = 'Expiré'; }
                else if(eq.days_remaining < 30) { color = 'var(--color-warning)'; text = 'Bientôt'; }
                
                const jsonEq = JSON.stringify(eq).replace(/"/g, '&quot;');

                fullHtml += `
                <div class="eq-card-pro" style="border-left-color:${color}">
                    <div class="eq-info">
                        <h4 class="eq-title">${escapeHtml(eq.final_name)}</h4>
                        <p class="eq-sub">${escapeHtml(eq.final_brand)} • S/N: <code style="background:var(--neutral-100); padding:1px 4px; border-radius:4px;">${escapeHtml(eq.serial_number||'-')}</code></p>
                        <span class="eq-date" style="color:${color}">${text} : ${formatDate(eq.next_maintenance_date)}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <button class="btn-icon-sm btn-icon-secondary" onclick="openEquipFormModal(${jsonEq})" title="Modifier"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon-sm btn-icon-danger" onclick="deleteEquipment(${id}, ${eq.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            });

            fullHtml += `</div>`;
        });

        div.innerHTML = fullHtml;

    } catch (e) {
        console.error(e);
        div.innerHTML = '<p style="color:red">Erreur de chargement.</p>';
    }
}

async function loadClientHistory(id) {
    const div = document.getElementById('sheet-history-list');
    div.innerHTML = '<p style="color:var(--neutral-500); padding-left:20px;">Chargement de l\'historique...</p>';
    
    try {
        const res = await fetch(`/api/clients/${id}/appointments`);
        const list = await res.json();
        document.getElementById('count-hist').textContent = list.length;
        
        if(list.length === 0) { 
            div.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--neutral-400); font-style:italic;"><i class="fas fa-history fa-2x" style="opacity:0.3; margin-bottom:10px;"></i><br>Aucun historique récent.</div>'; 
            return; 
        }
        
        div.innerHTML = list.map(h => {
            const isReport = h.source_type === 'report';
            const typeClass = isReport ? 'type-report' : 'type-rdv';
            const icon = isReport ? 'fa-file-alt' : 'fa-calendar-check';
            const title = isReport ? 'Rapport d\'Intervention' : 'Rendez-vous';
            const tagClass = isReport ? 'tag-report' : 'tag-rdv';
            const tagName = isReport ? (h.report_number || 'Rapport') : 'RDV';
            
            const machineName = h.machines || h.installation || h.equipment_name || null;
            
            const machineHtml = machineName ? 
                `<div class="timeline-machine"><i class="fas fa-server"></i> ${escapeHtml(machineName)}</div>` : '';

            const dateObj = new Date(h.appointment_date);
            const dateStr = dateObj.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            
            return `
            <div class="timeline-item ${typeClass}">
                <div class="timeline-marker"><i class="fas ${icon}"></i></div>
                <span class="timeline-date">${dateStr}</span>
                
                <div class="timeline-card">
                    <div class="timeline-header">
                        <h4 class="timeline-title">${title}</h4>
                        <span class="timeline-tag ${tagClass}">${tagName}</span>
                    </div>
                    
                    ${machineHtml}
                    
                    <div class="timeline-desc">
                        ${escapeHtml(h.task_description || 'Aucune description.')}
                    </div>

                    ${h.report_id ? `
                    <div class="timeline-action">
                        <button class="btn-doc-action" onclick="window.open('/report-view.html?id=${h.report_id}', '_blank')">
                            <i class="fas fa-file-pdf"></i> Ouvrir le document
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

function parseDateCH(dateStr) { if(!dateStr) return 0; const [d,m,y] = dateStr.split('.'); return new Date(`${y}-${m}-${d}`).getTime(); }
function handleSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }
function handlePlanningSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }

async function openClientModal(id = null) {
    const modal = document.getElementById('client-modal');
    document.getElementById('client-form').reset(); document.getElementById('client-id').value = '';
    document.getElementById('geo-status').innerHTML = '';
    if (id) {
        const res = await fetch(`/api/clients/${id}`); const d = await res.json();
        document.getElementById('client-id').value = d.id;
        document.getElementById('client-name').value = d.cabinet_name;
        document.getElementById('client-activity').value = d.activity;
        document.getElementById('client-contact').value = d.contact_name;
        document.getElementById('client-phone').value = d.phone;
        document.getElementById('client-email').value = d.email;
        document.getElementById('client-address').value = d.address;
        document.getElementById('client-npa').value = d.postal_code;
        document.getElementById('client-city').value = d.city;
        document.getElementById('client-canton').value = d.canton;
        document.getElementById('client-notes').value = d.notes;
        document.getElementById('client-lat').value = d.latitude;
        document.getElementById('client-lon').value = d.longitude;
    }
    modal.classList.add('active');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }

async function searchCoordinates() {
    const address = document.getElementById('client-address').value;
    const city = document.getElementById('client-city').value;
    const npa = document.getElementById('client-npa').value;
    const statusDiv = document.getElementById('geo-status');
    if(!address || !city) { statusDiv.innerHTML = '<span style="color:#ef4444;">Adresse et Ville requises.</span>'; return; }
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', ' + npa + ' ' + city + ', Switzerland')}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            document.getElementById('client-lat').value = data[0].lat;
            document.getElementById('client-lon').value = data[0].lon;
            statusDiv.innerHTML = '<span style="color:#166534;"><i class="fas fa-check"></i> Trouvé !</span>';
        } else { statusDiv.innerHTML = '<span style="color:#ef4444;">Aucun résultat.</span>'; }
    } catch { statusDiv.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>'; }
}

async function saveClient() {
    const id = document.getElementById('client-id').value;
    const data = {
        cabinet_name: document.getElementById('client-name').value, activity: document.getElementById('client-activity').value,
        contact_name: document.getElementById('client-contact').value, phone: document.getElementById('client-phone').value, email: document.getElementById('client-email').value,
        address: document.getElementById('client-address').value, postal_code: document.getElementById('client-npa').value, city: document.getElementById('client-city').value, canton: document.getElementById('client-canton').value,
        notes: document.getElementById('client-notes').value, latitude: document.getElementById('client-lat').value, longitude: document.getElementById('client-lon').value
    };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/clients/${id}` : '/api/clients';
    try { 
        const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        if(res.ok) { 
            closeClientModal(); loadData(); if(id && id == currentClientId) openClientDetails(id); showNotification('Client enregistré', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur lors de l\'enregistrement', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}

function openEquipFormModal(eq = null) {
    const modal = document.getElementById('equipment-form-modal');
    document.getElementById('equip-form').reset();
    document.getElementById('equip-id').value = '';
    
    const select = document.getElementById('equip-select');
    select.innerHTML = '<option value="">-- Sélectionner --</option>' + catalog.map(c => `<option value="${c.id}">${c.name} (${c.brand})</option>`).join('');
    
    if(eq) {
        document.getElementById('equip-id').value = eq.id;
        select.value = eq.equipment_id;
        // NOUVEAU : Remplir l'emplacement
        document.getElementById('equip-location').value = eq.location || '';
        document.getElementById('equip-serial').value = eq.serial_number;
        document.getElementById('equip-install').value = eq.installed_at;
        document.getElementById('equip-last').value = eq.last_maintenance_date;
        document.getElementById('equip-interval').value = eq.maintenance_interval;
    }
    modal.classList.add('active');
}

function closeEquipModal() { document.getElementById('equipment-form-modal').classList.remove('active'); }

// 2. Sauvegarde (Envoi vers le serveur)
async function saveEquipment() {
    if(!currentClientId) return;
    const id = document.getElementById('equip-id').value;
    
    const data = {
        equipment_id: document.getElementById('equip-select').value,
        // NOUVEAU : Récupérer la valeur de l'emplacement
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
    } catch(e) { console.error(e); showNotification('Erreur réseau', 'error'); }
}

async function deleteEquipment(clientId, eqId) {
    if(!confirm("Supprimer la machine ?")) return;
    try { 
        const res = await fetch(`/api/clients/${clientId}/equipment/${eqId}`, { method: 'DELETE' }); 
        if(res.ok) {
            loadClientEquipment(clientId); loadData(); showNotification('Machine supprimée', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur lors de la suppression', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}

function openDeleteModal(id) { clientIdToDelete = id; document.getElementById('delete-modal').classList.add('active'); }
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); clientIdToDelete = null; }
async function confirmDeleteClient() {
    if(!clientIdToDelete) return;
    try { 
        const res = await fetch(`/api/clients/${clientIdToDelete}`, { method: 'DELETE' }); 
        if(res.ok) { 
            closeDeleteModal(); if(document.getElementById('client-details-modal').classList.contains('active')) closeClientDetailsModal(); loadData(); showNotification('Client supprimé', 'success'); 
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur suppression', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}

// --- UTILS & NOTIFICATIONS ---
function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    const div = document.createElement('div'); div.id = 'notification-container'; div.className = 'notification-container';
    document.body.appendChild(div); container = div;
  }
  const n = document.createElement('div'); n.className = `notification notification-${type}`;
  n.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> <span>${message}</span>`;
  container.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
}

function debounce(f,w){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>f.apply(this,a),w);};}
function escapeHtml(t){if(!t)return '';return t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function formatDate(s){return s?new Date(s).toLocaleDateString('fr-CH'):'-';}
function updatePagination(p){
    document.getElementById('pagination-info').textContent = `Page ${p.page} sur ${p.totalPages}`;
    document.getElementById('prev-page').disabled = p.page <= 1;
    document.getElementById('next-page').disabled = p.page >= p.totalPages;
}
function changePage(delta) { currentPage += delta; loadData(); }
function resetFilters() { currentFilters = { search:'', canton:'', sector:'' }; document.getElementById('global-search').value=''; document.getElementById('filter-canton').value=''; document.getElementById('filter-sector').value=''; loadData(); }
function exportData() { showNotification("Fonction d'export CSV à implémenter.", "info"); }

window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.saveClient = saveClient;
window.searchCoordinates = searchCoordinates;

function exportData() {
    const link = document.createElement('a');
    link.href = '/api/clients/export-excel';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}