// public/js/clients.js

// --- VARIABLES GLOBALES ---
let currentView = 'directory';
let clients = [];
let catalog = [];
let currentClientId = null;
let clientIdToDelete = null;
// CORRECTION : On ajoute showHidden: false par défaut
let currentFilters = { search: '', canton: '', sector: '', showHidden: false };
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

    new SlimSelect({ select: '#filter-canton', settings: { showSearch: false, allowDeselect: false } });
    new SlimSelect({ select: '#filter-sector', settings: { showSearch: false, allowDeselect: false } });
    new SlimSelect({ select: '#adv-status',   settings: { showSearch: false, allowDeselect: false } });
    });

async function checkAuth() {
    try { const res = await fetch('/api/auth/me'); if(!res.ok) window.location.href='/login.html'; const d=await res.json(); currentUser=d.user; document.getElementById('user-info').innerHTML=`<div class="user-avatar">${d.user.name[0]}</div><div class="user-details"><strong>${escapeHtml(d.user.name)}</strong><span>${d.user.role}</span></div>`; } catch { window.location.href='/login.html'; }
}
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

// DANS public/js/clients.js

async function loadData() {
    const endpoint = currentView === 'directory' ? '/api/clients' : '/api/clients/planning';
    
    const hiddenCheckbox = document.getElementById('show-hidden-cb');
    const isShowHidden = hiddenCheckbox ? hiddenCheckbox.checked : false;
    const getVal = (id) => document.getElementById(id)?.value || '';

    const params = new URLSearchParams({
        search: currentFilters.search, 
        canton: currentFilters.canton, 
        category: currentFilters.sector,
        sortBy: currentSort.col, 
        sortOrder: currentSort.order,
        showHidden: isShowHidden,
        brand: getVal('adv-brand'),
        model: getVal('adv-model'),
        serialNumber: getVal('adv-serial'),
        status: getVal('adv-status')
    });

    try {
        const res = await fetch(`${endpoint}?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        
        // MISE À JOUR DU COMPTEUR (pour les deux vues)
        const countEl = document.getElementById('total-clients-count');
        
        if (currentView === 'directory') {
            renderDirectory(data.clients);
            if(countEl) countEl.textContent = data.count || data.clients.length;
        } 
        else {
            renderPlanning(data);
            // Pour le planning, data.data contient la liste des clients
            if(countEl) countEl.textContent = (data.data || []).length;
        }
        
    } catch(e) { console.error("Erreur loadData:", e); }
}

// 1. VARIABLE GLOBALE (À mettre tout en haut avec les autres)
let selectedClients = new Set(); // Stocke les IDs sélectionnés

// 2. MODIFIER LA FONCTION renderDirectory
function renderDirectory(list) {
    const tbody = document.getElementById('clients-tbody');
    // Réinitialisation de la checkbox "Tout sélectionner" si la page change
    const selectAllCb = document.getElementById('select-all-cb');
    if(selectAllCb) selectAllCb.checked = false;

    if(!list || list.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--neutral-400);">Aucun résultat trouvé.</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = list.map(c => {
        const isHidden = c.is_hidden === 1;
        const rowStyle = isHidden ? 'background-color:#f3f4f6; opacity:0.75;' : '';
        const badgeHidden = isHidden ? '<span class="badge" style="background:#e5e7eb; color:#6b7280; font-size:0.7em; margin-left:5px;">Masqué</span>' : '';
        
        // On vérifie si ce client est déjà coché
        const isChecked = selectedClients.has(c.id) ? 'checked' : '';

        return `
        <tr style="${rowStyle}" class="${isChecked ? 'row-selected' : ''}">
            <td style="text-align:center; padding-left:10px;">
                <input type="checkbox" class="row-checkbox client-cb" value="${c.id}" ${isChecked} onchange="toggleClientSelection(${c.id}, this)">
            </td>
            <td onclick="openClientDetails(${c.id})" style="cursor:pointer">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="flex-shrink: 0; min-width: 24px; display: flex; justify-content: center;">
                        ${window.getContractBadgeHtml ? window.getContractBadgeHtml(c) : ''}
                    </div>
                    
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <strong style="color:var(--color-primary); font-size:0.95rem; line-height: 1.2;">
                                ${escapeHtml(c.cabinet_name)}
                            </strong> 
                            ${badgeHidden}
                        </div>
                        <span style="font-size:0.8rem; color:var(--neutral-500); line-height: 1.2; margin-top: 2px;">
                            ${escapeHtml(c.activity)}
                        </span>
                    </div>
                </div>
            </td>
            <td onclick="openClientDetails(${c.id})" style="cursor:pointer">${escapeHtml(c.city)} <span style="font-size:0.75rem; color:var(--neutral-400);">(${c.canton||''})</span></td>
            <td onclick="openClientDetails(${c.id})" style="cursor:pointer">${escapeHtml(c.contact_name)}<br><span style="font-size:0.75rem; color:var(--neutral-500);">${escapeHtml(c.phone||'-')}</span></td>
            <td onclick="openClientDetails(${c.id})" style="cursor:pointer"><small style="color:var(--neutral-500);">${c.equipment_summary ? c.equipment_summary.split(';;').length + ' machines' : 'Aucune machine'}</small></td>
            <td onclick="openClientDetails(${c.id})" style="cursor:pointer">${c.appointment_at ? formatDate(c.appointment_at) : '-'}</td>
            <td style="text-align:right;">
                <div style="display:flex; justify-content:flex-end; gap:5px;">
                    <button class="btn-icon-sm btn-icon-secondary" onclick="event.stopPropagation(); toggleClientHidden(${c.id}, ${c.is_hidden || 0})">
                        <i class="fas ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    </button>
                    <button class="btn-icon-sm btn-icon-primary" onclick="event.stopPropagation(); openClientModal(${c.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    updateBulkToolbarUI(); // Vérifie l'état de la barre
}

// 3. AJOUTER CES NOUVELLES FONCTIONS (Gestion Sélection)

let currentConfirmCallback = null; // Stocke l'action à valider

// A. Logique de sélection (Reste similaire)
window.toggleClientSelection = function(id, cb) {
    const numericId = parseInt(id); // Important : Forcer le nombre
    if (cb.checked) selectedClients.add(numericId);
    else selectedClients.delete(numericId);
    
    // Ajout visuel immédiat (classe CSS)
    const tr = cb.closest('tr');
    if(tr) cb.checked ? tr.classList.add('row-selected') : tr.classList.remove('row-selected');
    
    updateBulkToolbarUI();
}

window.toggleSelectAll = function() {
    const masterCb = document.getElementById('select-all-cb');
    const checkboxes = document.querySelectorAll('.client-cb');
    
    checkboxes.forEach(cb => {
        cb.checked = masterCb.checked;
        const id = parseInt(cb.value);
        const tr = cb.closest('tr');
        
        if (masterCb.checked) {
            selectedClients.add(id);
            if(tr) tr.classList.add('row-selected');
        } else {
            selectedClients.delete(id);
            if(tr) tr.classList.remove('row-selected');
        }
    });
    updateBulkToolbarUI();
}

window.clearSelection = function() {
    selectedClients.clear();
    const masterCb = document.getElementById('select-all-cb');
    if(masterCb) masterCb.checked = false;
    document.querySelectorAll('.client-cb').forEach(cb => {
        cb.checked = false;
        cb.closest('tr')?.classList.remove('row-selected');
    });
    updateBulkToolbarUI();
}

function updateBulkToolbarUI() {
    const toolbar = document.getElementById('bulk-toolbar');
    const countSpan = document.getElementById('selected-count');
    if (!toolbar) return;
    if (selectedClients.size > 0) {
        toolbar.classList.add('visible');   // ← était 'active'
        toolbar.classList.remove('active'); // nettoie l'ancienne classe
        if (countSpan) countSpan.textContent = selectedClients.size;
    } else {
        toolbar.classList.remove('visible');
        toolbar.classList.remove('active');
    }
}

// B. NOUVELLE LOGIQUE DE CONFIRMATION (Sans alerte)
window.triggerBulkConfirm = function(action) {
    const count = selectedClients.size;
    if (count === 0) return;

    let title = "";
    let msg = "";
    let btnClass = "btn-primary";

    if (action === 'hide') {
        title = "Masquer les clients";
        msg = `Voulez-vous masquer ces ${count} clients ? Ils ne seront plus visibles dans la liste principale.`;
    } else if (action === 'show') {
        title = "Réafficher les clients";
        msg = `Voulez-vous rendre visibles ces ${count} clients ?`;
    } else if (action === 'delete') {
        title = "Suppression définitive";
        msg = `Attention : Vous allez supprimer ${count} clients. Cette action est irréversible.`;
        btnClass = "btn-danger";
    }

    // On ouvre notre belle modale
    openCustomConfirm(title, msg, btnClass, () => executeBulkAction(action));
}

// C. FONCTION D'EXÉCUTION (CORRIGÉE)
async function executeBulkAction(action) {
    console.group(`🔍 DEBUG: Bulk Action '${action}'`);
    
    const ids = Array.from(selectedClients).map(Number);
    console.log("🎯 IDs sélectionnés:", ids);

    closeConfirmModal();

    try {
        console.log("🚀 Envoi de la requête PUT...");
        const res = await fetch('/api/clients/bulk-update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids, action: action })
        });

        console.log("📡 Statut réponse:", res.status);

        if (res.ok) {
            const result = await res.json();
            console.log("✅ Succès:", result);
            showNotification(`${result.count} clients mis à jour.`, 'success');
            
            clearSelection();
            console.log("🔄 Rechargement des données...");
            await loadData(); 
        } else {
            const err = await res.json();
            console.error("❌ Erreur API:", err);
            showNotification(`Erreur : ${err.error}`, "error");
        }
    } catch(e) {
        console.error("💥 CRASH executeBulkAction:", e);
        showNotification("Erreur de connexion.", "error");
    } finally {
        console.groupEnd();
    }
}

// D. GESTIONNAIRE DE MODALE GÉNÉRIQUE (CORRIGÉ)
function openCustomConfirm(title, message, confirmBtnClass, callback) {
    // Correction des IDs pour correspondre à clients.html
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-text');
    const btn = document.getElementById('confirm-modal-btn');
    const modal = document.getElementById('confirm-modal');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    
    if (btn) {
        // On remplace les classes existantes pour gérer le style (rouge/bleu)
        btn.className = `btn ${confirmBtnClass}`; 
        
        // Important : on supprime les anciens écouteurs pour éviter les doublons d'action
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.onclick = () => {
            if (typeof callback === 'function') callback();
            closeConfirmModal();
        };
    }

    if (modal) modal.classList.add('active');
}

window.closeConfirmModal = function() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');
}

// E. MODIFIER VOTRE FONCTION 'toggleClientHidden' EXISTANTE
// Pour qu'elle utilise aussi la modale au lieu de confirm()
window.toggleClientHidden = function(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? "masquer" : "réafficher";
    
    openCustomConfirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} le client`,
        `Voulez-vous vraiment ${action} ce client ?`,
        "btn-primary",
        async () => {
            closeConfirmModal();
            try {
                const res = await fetch(`/api/clients/${id}/toggle-hidden`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_hidden: newStatus })
                });
                if (res.ok) {
                    loadData();
                    showNotification(`Client ${newStatus ? 'masqué' : 'réaffiché'}.`, 'success');
                }
            } catch(e) { console.error(e); }
        }
    );
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
let planningSort = { col: 'days', order: 'asc' };
 
function renderPlanning(apiData) {
    const tbody = document.getElementById('planning-tbody');
    if (!tbody) return;

    const rawClients = Array.isArray(apiData) ? apiData : (apiData.data || []);

    // Filtre recherche / canton
    const search = (document.getElementById('global-search')?.value || '').toLowerCase();
    const canton = document.getElementById('filter-canton')?.value || '';
    const statusFilter = document.getElementById('adv-status')?.value || '';

    const now = new Date(); now.setHours(0,0,0,0);

    // Construit les lignes par client
    let groups = rawClients
        .filter(c => {
            if (canton && c.canton !== canton) return false;
            if (search && !c.cabinet_name?.toLowerCase().includes(search) &&
                          !c.city?.toLowerCase().includes(search)) return false;
            return true;
        })
        .map(client => {
            let machines = (client.machines || []).map(m => {
                const next = m.next_date || null;
                const days = next ? Math.ceil((new Date(next) - now) / 86400000) : null;
                return { ...m, days };
            });

            // Filtre statut sur les machines
            if (statusFilter) {
                machines = machines.filter(m => {
                    if (statusFilter === 'expired') return m.days !== null && m.days < 0;
                    if (statusFilter === 'warning') return m.days !== null && m.days >= 0 && m.days <= 60;
                    if (statusFilter === 'ok')      return m.days !== null && m.days > 60;
                    if (statusFilter === 'planned') return !!client.future_rdv_id;
                    return true;
                });
            }

            // Trie les machines par jours restants (urgences d'abord)
            machines.sort((a, b) => {
                if (a.days === null) return 1;
                if (b.days === null) return -1;
                return a.days - b.days;
            });

            return { client, machines };
        })
        .filter(g => g.machines.length > 0); // Cache les clients sans machines après filtre

    // Tri global des groupes (par pire machine de chaque client)
    if (planningSort.col === 'days' || planningSort.col === 'next_service') {
        groups.sort((a, b) => {
            const da = a.machines[0]?.days ?? Infinity;
            const db = b.machines[0]?.days ?? Infinity;
            return planningSort.order === 'asc' ? da - db : db - da;
        });
    } else if (planningSort.col === 'cabinet') {
        groups.sort((a, b) => {
            const na = a.client.cabinet_name || '';
            const nb = b.client.cabinet_name || '';
            return planningSort.order === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na);
        });
    } else if (planningSort.col === 'canton') {
        groups.sort((a, b) => {
            const ca = a.client.canton || '';
            const cb = b.client.canton || '';
            return planningSort.order === 'asc' ? ca.localeCompare(cb) : cb.localeCompare(ca);
        });
    }

    // Compteur
    const totalMachines = groups.reduce((sum, g) => sum + g.machines.length, 0);
    const countEl = document.getElementById('total-clients-count');
    if (countEl) countEl.textContent = `${groups.length} clients · ${totalMachines} machines`;

    if (!groups.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-tertiary)">Aucun résultat.</td></tr>`;
        return;
    }

    let html = '';

    groups.forEach(({ client, machines }) => {
        // ── EN-TÊTE CLIENT ──────────────────────────────────────────
        const rdvBadge = client.future_rdv_id
            ? `<span style="background:var(--color-info-bg);color:var(--color-info);font-size:10px;padding:2px 8px;border-radius:2px;font-weight:700;margin-left:8px;"><i class="fas fa-calendar-check"></i> RDV ${fmtDate(client.future_rdv_date)}</span>`
            : '';

        // Pire statut du client (pour la couleur de l'en-tête)
        const worstDays = machines.reduce((min, m) => m.days !== null ? Math.min(min, m.days) : min, Infinity);
        let headerBorder = 'var(--border-primary)';
        if (worstDays < 0)   headerBorder = 'var(--color-danger)';
        else if (worstDays <= 30) headerBorder = 'var(--color-warning)';
        else if (worstDays !== Infinity) headerBorder = 'var(--color-success)';

        html += `
        <tr style="background:var(--bg-secondary);border-left:4px solid ${headerBorder};border-top:2px solid var(--border-primary);">
            <td colspan="5" style="padding:8px 14px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <strong style="font-size:var(--text-sm);color:var(--text-primary)">${escapeHtml(client.cabinet_name)}</strong>
                    <span style="background:var(--neutral-800);color:#fff;padding:1px 6px;border-radius:2px;font-weight:700;font-size:10px;">${escapeHtml(client.canton || '')}</span>
                    <span style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(client.city || '')}</span>
                    ${rdvBadge}
                    ${client.phone ? `<a href="tel:${escapeHtml(client.phone)}" onclick="event.stopPropagation()" style="font-size:11px;color:var(--text-tertiary);margin-left:auto;text-decoration:none;"><i class="fas fa-phone" style="margin-right:3px"></i>${escapeHtml(client.phone)}</a>` : ''}
                </div>
            </td>
            <td colspan="2" style="padding:8px 14px;text-align:right;">
                <span style="font-size:11px;color:var(--text-tertiary)">${machines.length} machine${machines.length > 1 ? 's' : ''}</span>
            </td>
            <td style="padding:8px 14px;text-align:right;">
                <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-icon-sm" title="Planifier RDV"
                        onclick="openScheduleModal(${client.client_id}, '${escapeJsArg(client.cabinet_name)}')">
                        <i class="fas fa-calendar-plus"></i>
                    </button>
                    <button class="btn-icon-sm" title="Voir fiche"
                        onclick="openClientDetails(${client.client_id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>`;

        // ── LIGNES MACHINES ─────────────────────────────────────────
        machines.forEach(m => {
            let rowStyle = 'background:var(--bg-elevated);';
            let daysHtml = '—';

            if (m.days === null) {
                daysHtml = `<span style="color:var(--text-tertiary);font-style:italic">—</span>`;
            } else if (m.days < 0) {
                rowStyle = 'background:rgba(239,68,68,0.05);';
                daysHtml = `<span style="color:var(--color-danger);font-weight:700">${m.days}j</span>`;
            } else if (m.days <= 30) {
                rowStyle = 'background:rgba(245,158,11,0.05);';
                daysHtml = `<span style="color:var(--color-warning);font-weight:700">${m.days}j</span>`;
            } else {
                daysHtml = `<span style="color:var(--color-success);font-weight:600">+${m.days}j</span>`;
            }

            html += `
            <tr style="${rowStyle}border-left:4px solid transparent;">
                <td style="padding:8px 14px 8px 28px;border-bottom:1px solid var(--border-primary);">
                    <div style="font-weight:600;color:var(--text-primary);font-size:var(--text-sm)">${escapeHtml(m.name || '—')}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(m.brand || '')}${m.serial ? ` · SN: ${escapeHtml(m.serial)}` : ''}</div>
                </td>
                <td colspan="2" style="padding:8px 14px;border-bottom:1px solid var(--border-primary);font-size:var(--text-sm);color:var(--text-secondary)"></td>
                <td style="padding:8px 14px;border-bottom:1px solid var(--border-primary);font-size:var(--text-sm);color:var(--text-secondary)">${fmtDate(m.installed_at)}</td>
                <td style="padding:8px 14px;border-bottom:1px solid var(--border-primary);font-size:var(--text-sm);color:var(--text-secondary)">${fmtDate(m.last_maintenance_date)}</td>
                <td style="padding:8px 14px;border-bottom:1px solid var(--border-primary);font-weight:600;color:var(--text-primary)">${fmtDate(m.next_date)}</td>
                <td style="padding:8px 14px;border-bottom:1px solid var(--border-primary);text-align:center">${daysHtml}</td>
                <td style="padding:8px 14px;border-bottom:1px solid var(--border-primary);"></td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
}
 
function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return new Intl.DateTimeFormat('fr-CH').format(dt);
}
 
// Tri Planning
window.planningHandleSort = function(col) {
    if (planningSort.col === col) {
        planningSort.order = planningSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        planningSort.col   = col;
        planningSort.order = 'asc';
    }
    // Met à jour les icônes
    document.querySelectorAll('.planning-th-sort').forEach(th => {
        th.querySelector('i').className = 'fas fa-sort';
    });
    const active = document.querySelector(`.planning-th-sort[data-col="${col}"] i`);
    if (active) active.className = `fas fa-sort-${planningSort.order === 'asc' ? 'up' : 'down'}`;
 
    loadData();
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
        
        const actionsRow = modal.querySelector('.sheet-actions-row');
        if (actionsRow) {
            actionsRow.innerHTML = `
                <button class="btn btn-primary btn-sm" onclick="openScheduleModal(${c.id}, '${escapeJsArg(c.cabinet_name)}')" title="Fixer un nouveau RDV">
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
                
                // GESTION DU STATUT HORS CONTRAT
                if (eq.is_secondary === 1) {
                    color = 'var(--neutral-400)';
                    text = 'Hors contrat';
                } else if(eq.days_remaining < 0) { 
                    color = 'var(--color-danger)'; text = 'Expiré'; 
                } else if(eq.days_remaining <= 30) { 
                    color = 'var(--color-warning)'; text = 'Bientôt'; 
                }

                const noteHtml = eq.notes ? 
                    `<div style="margin-top:6px; font-size:0.85rem; color:#6b7280; background:#f9fafb; padding:4px 8px; border-radius:4px; border:1px solid #e5e7eb; display:flex; gap:6px;">
                        <i class="fas fa-sticky-note" style="color:#f59e0b; margin-top:3px;"></i> 
                        <span style="font-style:italic;">${escapeHtml(eq.notes)}</span>
                     </div>` : '';
                     
                const jsonEq = JSON.stringify(eq).replace(/"/g, '&quot;');
                fullHtml += `
                <div class="eq-card-pro" style="border-left-color:${color}; ${eq.is_secondary === 1 ? 'background:#f8fafc; opacity:0.8;' : ''}">
                    <div class="eq-info">
                        <h4 class="eq-title">${escapeHtml(eq.final_name)}</h4>
                        <p class="eq-sub">${escapeHtml(eq.final_brand)} • S/N: ${escapeHtml(eq.serial_number||'-')}</p>
                        <span class="eq-date" style="color:${color}">${text} : ${formatDate(eq.next_maintenance_date)}</span>
                        ${noteHtml}  
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
  div.innerHTML = `<div style="text-align:center;padding:30px;color:var(--neutral-400);">
    <i class="fas fa-spinner fa-spin"></i> Chargement…
  </div>`;
 
  try {
    const res  = await fetch(`/api/clients/${id}/history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
 
    const countEl = document.getElementById('count-hist');
    if (countEl) countEl.textContent = list.length;
 
    if (!list.length) {
      div.innerHTML = `<div style="text-align:center;padding:2rem;
        color:var(--neutral-400);font-style:italic;">
        <i class="fas fa-history fa-2x" style="opacity:0.3;display:block;margin-bottom:10px;"></i>
        Aucun historique pour ce client.
      </div>`;
      return;
    }
 
    const cfg = {
      rdv:     { icon: 'fa-calendar-check',      label: 'Rendez-vous', color: '#3b82f6' },
      rapport: { icon: 'fa-file-alt',             label: 'Rapport',     color: '#10b981' },
      ticket:  { icon: 'fa-ticket-alt',           label: 'Ticket',      color: '#f59e0b' },
      rma:     { icon: 'fa-tools',                label: 'RMA',         color: '#8b5cf6' },
      pret:    { icon: 'fa-hand-holding-medical', label: 'Prêt',        color: '#06b6d4' },
    };
 
    const statusMap = {
      draft:      { label: 'Brouillon',   bg: '#f1f5f9', color: '#64748b' },
      pending:    { label: 'En attente',  bg: '#fef3c7', color: '#d97706' },
      validated:  { label: 'Validé',      bg: '#f0fdf4', color: '#16a34a' },
      archived:   { label: 'Archivé',     bg: '#f5f3ff', color: '#7c3aed' },
      'Ouvert':   { label: 'Ouvert',      bg: '#fef3c7', color: '#d97706' },
      'Clôturé':  { label: 'Clôturé',     bg: '#f0fdf4', color: '#16a34a' },
      'En cours': { label: 'En cours',    bg: '#e0f2fe', color: '#0284c7' },
      'Retourné': { label: 'Retourné',    bg: '#f0fdf4', color: '#16a34a' },
      'En retard':{ label: 'En retard',   bg: '#fef2f2', color: '#dc2626' },
    };
 
    const pageUrl = (type, linkId) => {
        if (type === 'rapport') return `/report-view.html?id=${linkId}`; // direct, pas via reports.html
        if (type === 'ticket')  return `/tickets.html?open=${linkId}`;
        if (type === 'rma')     return `/rmas.html?open=${linkId}`;
        if (type === 'pret')    return `/loans.html?open=${linkId}`;
    };
 
    const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }) : '—';
 
    // Groupement par mois
    const byMonth = {};
    list.forEach(item => {
      const d     = new Date(item.date || Date.now());
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
      if (!byMonth[key]) byMonth[key] = { label, items: [] };
      byMonth[key].items.push(item);
    });
 
    let html = '';
 
    Object.values(byMonth).forEach(group => {
      html += `
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;
          letter-spacing:0.07em;color:var(--neutral-400);
          padding:12px 0 6px;border-bottom:1px solid var(--border-primary);
          margin-bottom:8px;">
          ${group.label}
        </div>`;
 
      group.items.forEach(item => {
        const c   = cfg[item.type] || cfg.rdv;
        const sc  = item.status ? statusMap[item.status] : null;
        const url = pageUrl(item.type, item.link_id);
 
        html += `
          <div style="display:flex;gap:10px;align-items:flex-start;
            padding:10px 12px;margin-bottom:6px;border-radius:4px;
            background:${c.color}0d;border-left:3px solid ${c.color};">
 
            <!-- Icône -->
            <div style="width:30px;height:30px;border-radius:50%;flex-shrink:0;
              background:${c.color}20;display:flex;align-items:center;justify-content:center;">
              <i class="fas ${c.icon}" style="color:${c.color};font-size:11px;"></i>
            </div>
 
            <!-- Contenu -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap;">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;
                  letter-spacing:0.05em;color:${c.color};">${c.label}</span>
                ${item.ref ? `<span style="font-size:10px;color:var(--neutral-400);
                  font-family:monospace;">#${item.ref}</span>` : ''}
                ${sc ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;
                  border-radius:2px;background:${sc.bg};color:${sc.color};">
                  ${sc.label}</span>` : ''}
              </div>
 
              <div style="font-size:13px;color:var(--text-primary);font-weight:500;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${item.description || '—'}
              </div>
 
              ${item.machines ? `
                <div style="font-size:11px;color:var(--neutral-500);margin-top:2px;
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  🔧 ${item.machines}
                </div>` : ''}
 
              <div style="display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap;">
  <span style="font-size:11px;color:var(--neutral-400);">
    <i class="far fa-calendar" style="margin-right:3px;"></i>${fmtDate(item.date)}
  </span>
  ${item.tech_name ? `
    <span style="font-size:11px;color:var(--neutral-400);">
      <i class="fas fa-user" style="margin-right:3px;"></i>${item.tech_name}
    </span>` : ''}

  <!-- Actions -->
  <div style="margin-left:auto;display:flex;gap:4px;">
    ${item.type === 'rdv' ? `
      <button onclick="event.stopPropagation();openScheduleModal(${id},'',${item.id})"
        style="padding:3px 8px;font-size:11px;font-weight:600;color:#3b82f6;
          background:#3b82f615;border:1px solid #3b82f640;border-radius:3px;
          cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:3px;">
        <i class="fas fa-pen" style="font-size:9px;"></i> Modifier
      </button>
      <button onclick="event.stopPropagation();deleteAppointmentFromHistory(${item.id},${id})"
        style="padding:3px 8px;font-size:11px;font-weight:600;color:#ef4444;
          background:#ef444415;border:1px solid #ef444440;border-radius:3px;
          cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:3px;">
        <i class="fas fa-trash" style="font-size:9px;"></i> Supprimer
      </button>` : ''}
    ${url ? `
      <button onclick="event.stopPropagation();
  ${item.type === 'rapport' ? `window.open('${url}', '_blank')` : `window.location.href='${url}'`}"
        style="padding:3px 10px;font-size:11px;font-weight:600;
          color:${c.color};background:${c.color}15;border:1px solid ${c.color}40;
          border-radius:3px;cursor:pointer;font-family:inherit;
          display:flex;align-items:center;gap:4px;white-space:nowrap;">
        <i class="fas fa-arrow-right" style="font-size:9px;"></i> Voir
      </button>` : ''}
  </div>
</div>
            </div>
          </div>`;
      });
    });
 
    div.innerHTML = html;
 
  } catch (e) {
    console.error('loadClientHistory:', e);
    div.innerHTML = `<p style="color:var(--color-danger);padding:20px;">
      Erreur de chargement (${e.message}).
    </p>`;
  }
}

async function deleteAppointmentFromHistory(rdvId, clientId) {
    const ok = await confirmDelete('ce rendez-vous');
    if (!ok) return;
    try {
        const res = await fetch(`/api/clients/appointments/${rdvId}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification('Rendez-vous supprimé', 'success');
            loadClientHistory(clientId);
            loadData();
        } else {
            const err = await res.json();
            showNotification(err.error || 'Erreur suppression', 'error');
        }
    } catch { showNotification('Erreur réseau', 'error'); }
}
window.deleteAppointmentFromHistory = deleteAppointmentFromHistory;

function handleSort(col) { if(currentSort.col === col) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; else { currentSort.col = col; currentSort.order = 'asc'; } loadData(); }
// 1. Fonction d'ouverture (CORRIGÉE : IDs alignés sur le HTML)
async function openClientModal(id = null) {
    // 1. Reset du formulaire
    const form = document.getElementById('client-form');
    if(form) form.reset();
    
    // 2. Gestion du titre (Sécurisée)
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
        titleEl.innerHTML = id ? '<i class="fas fa-user-edit"></i> Modifier Client' : '<i class="fas fa-user-plus"></i> Nouveau Client';
    }
    
    // Reset ID
    const idField = document.getElementById('client-id');
    if(idField) idField.value = '';

    // --- NOUVEAU : Réinitialisation du contrat si c'est un nouveau client ---
    const contractCheckbox = document.getElementById('client-has-contract');
    if (contractCheckbox) contractCheckbox.checked = false;
    window.currentContractPath = null;
    if (typeof toggleContractZone === 'function') toggleContractZone();

    // 3. Si on modifie un client existant
    if (id) {
        if(idField) idField.value = id;

        try {
            const res = await fetch(`/api/clients/${id}`);
            if (!res.ok) throw new Error("Erreur chargement client");
            
            const client = await res.json();

            // Fonction helper pour remplir sans planter si un champ manque
            const setVal = (domId, value) => {
                const el = document.getElementById(domId);
                if (el) el.value = value || '';
            };

            setVal('client-name', client.cabinet_name);
            setVal('client-activity', client.activity);
            setVal('client-contact', client.contact_name);
            setVal('client-phone', client.phone);
            setVal('client-email', client.email);
            setVal('client-address', client.address);
            setVal('client-npa', client.postal_code);
            setVal('client-city', client.city);
            setVal('client-canton', client.canton);
            setVal('client-lat', client.latitude);
            setVal('client-lon', client.longitude);
            setVal('client-notes', client.notes);

            // --- NOUVEAU : Chargement de l'état du contrat pour ce client ---
            if (contractCheckbox) contractCheckbox.checked = (client.has_contract === 1);
            window.currentContractPath = client.contract_file || null;
            if (typeof toggleContractZone === 'function') toggleContractZone();

        } catch (err) {
            console.error(err);
            showNotification("Erreur lors du chargement", "error");
        }
    }

    // Affichage de la modale
    const modal = document.getElementById('client-modal');
    if(modal) modal.classList.add('active');
}

function closeClientModal() { document.getElementById('client-modal').classList.remove('active'); }
// 2. Fonction de sauvegarde (CORRIGÉE aussi pour envoyer les bons champs)
async function saveClient(event) {
    // --- CORRECTION DU BUG : On vérifie si l'événement existe avant de le bloquer ---
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    const id = getVal('client-id');
    const url = id ? `/api/clients/${id}` : '/api/clients';
    const method = id ? 'PUT' : 'POST';

    const body = {
        cabinet_name: getVal('client-name'),
        activity: getVal('client-activity'),
        contact_name: getVal('client-contact'),
        phone: getVal('client-phone'),
        email: getVal('client-email'),
        address: getVal('client-address'),
        postal_code: getVal('client-npa'),
        city: getVal('client-city'),
        canton: getVal('client-canton'),
        latitude: getVal('client-lat'),
        longitude: getVal('client-lon'),
        notes: getVal('client-notes'),
        // Sauvegarde de la case à cocher du contrat
        has_contract: document.getElementById('client-has-contract') && document.getElementById('client-has-contract').checked ? 1 : 0
    };

    // Validation minimale
    if (!body.cabinet_name) {
        showNotification("Le nom du cabinet est obligatoire", "error");
        return;
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            closeClientModal();
            loadData(); // Rafraichit la liste derrière
            showNotification("Client enregistré avec succès", "success");
            
            // Si on était dans la fiche détail, on la met à jour
            if (id && document.getElementById('client-details-modal').classList.contains('active')) {
                // Si vous avez une fonction de rafraîchissement des détails, elle va ici
            }
        } else {
            const err = await res.json();
            showNotification(err.error || "Erreur lors de l'enregistrement", "error");
        }
    } catch (err) {
        console.error(err);
        showNotification("Erreur de connexion", "error");
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
    document.getElementById('equip-notes').value = '';
    
    // Reset de la nouvelle case
    const secCb = document.getElementById('equip-secondary');
    if(secCb) secCb.checked = false;
    
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
        document.getElementById('equip-notes').value = eq.notes || '';
        // Coche la case si secondaire
        if(secCb) secCb.checked = (eq.is_secondary === 1);
    }
    modal.classList.add('active');
}

function closeEquipModal() { 
    document.getElementById('equipment-form-modal').classList.remove('active'); 
}

async function saveEquipment() {
    if(!currentClientId) return;
    const id = document.getElementById('equip-id').value;
    const secCb = document.getElementById('equip-secondary');
    
    const data = {
        equipment_id: document.getElementById('equip-select').value,
        location: document.getElementById('equip-location').value.trim(),
        serial_number: document.getElementById('equip-serial').value,
        installed_at: document.getElementById('equip-install').value,
        last_maintenance_date: document.getElementById('equip-last').value,
        maintenance_interval: document.getElementById('equip-interval').value,
        notes: document.getElementById('equip-notes').value.trim(),
        is_secondary: secCb && secCb.checked ? 1 : 0  // Envoi au serveur
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
    const ok = await confirmDelete('cet équipement');
    if (!ok) return;
    try {
        const res = await fetch(`/api/clients/${clientId}/equipment/${eqId}`, { method: 'DELETE' });
        if (res.ok) {
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

function escapeJsArg(t) {
    if (!t) return '';
    return t.toString()
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")    // Échappe l'apostrophe pour le Javascript
        .replace(/"/g, "&quot;") // Échappe les guillemets pour le HTML
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
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
window.requestBulkAction = window.triggerBulkConfirm;

// GESTION DES CONTRATS ET DOCUMENTS
window.toggleContractZone = function() {
    const isChecked = document.getElementById('client-has-contract').checked;
    const zone = document.getElementById('contract-file-zone');
    const badge = document.getElementById('contract-status-badge');
    const container = document.getElementById('contract-file-container');

    // Sécurité : on arrête tout si un des éléments HTML est introuvable
    if (!zone || !badge || !container) {
        console.error("Erreur : Un élément HTML du contrat est introuvable.");
        return;
    }

    if (isChecked) {
        zone.style.display = 'block';
        badge.style.display = 'inline-block';
        badge.textContent = 'Sous contrat';
        badge.className = 'badge badge-success';
        badge.style.background = '#dcfce7'; 
        badge.style.color = '#16a34a';

        if (window.currentContractPath) {
            container.innerHTML = `
                <a href="${window.currentContractPath}" target="_blank" class="btn btn-secondary btn-sm" style="background: white; border: 1px solid #e2e8f0;">
                    <i class="fas fa-file-pdf" style="color: #ef4444;"></i> Consulter le document
                </a>
                <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444;" onclick="deleteContractFile()">
                    <i class="fas fa-trash-alt"></i>
                </button>`;
        } else {
            container.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('input-contract-file').click()">
                    <i class="fas fa-upload"></i> Joindre le contrat (PDF/Image)
                </button>`;
        }
    } else {
        zone.style.display = 'none';
        badge.style.display = 'inline-block';
        badge.textContent = 'Sans contrat';
        badge.className = 'badge badge-secondary';
        badge.style.background = '#f1f5f9'; 
        badge.style.color = '#64748b';
    }
};

window.uploadContractFile = async function(input) {
    if (!input.files[0] || !currentClientId) return;
    
    const formData = new FormData();
    formData.append('file', input.files[0]);

    const container = document.getElementById('contract-file-container');
    container.innerHTML = '<span style="color: var(--color-primary); font-size: 0.9rem;"><i class="fas fa-spinner fa-spin"></i> Chargement...</span>';

    try {
        const res = await fetch(`/api/clients/${currentClientId}/contract`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            window.currentContractPath = data.filePath;
            toggleContractZone();
        }
    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'envoi.");
        toggleContractZone();
    }
};

window.deleteContractFile = async function() {
    if (!confirm("Retirer le document de ce contrat ?")) return;
    try {
        await fetch(`/api/clients/${currentClientId}/contract`, { method: 'DELETE' });
        window.currentContractPath = null;
        document.getElementById('input-contract-file').value = "";
        toggleContractZone();
    } catch (e) {
        console.error(e);
    }
};

window.getContractBadgeHtml = function(client) {
    if (client.has_contract !== 1) return ''; 
    
    // Style commun pour les petits badges icônes
    const badgeStyle = `
        width: 24px; 
        height: 24px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        border-radius: 6px; 
        font-size: 0.85rem; 
        transition: all 0.2s;
    `;

    if (client.contract_file) {
        return `
            <span class="badge" 
                  style="${badgeStyle} background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; cursor: pointer;" 
                  onmouseover="this.style.background='#bbf7d0'" 
                  onmouseout="this.style.background='#dcfce7'" 
                  onclick="event.stopPropagation(); window.open('${client.contract_file}', '_blank')" 
                  title="Voir le contrat">
                <i class="fas fa-file-signature"></i>
            </span>
        `;
    } else {
        return `
            <span class="badge" 
                  style="${badgeStyle} background: #f8fafc; color: #16a34a; border: 1px solid #e2e8f0;" 
                  title="Sous contrat (Pas de fichier joint)">
                <i class="fas fa-check"></i>
            </span>
        `;
    }
};