// public/js/report-view.js

// --- DICTIONNAIRE DE TRADUCTION ---
const TRANSLATIONS = {
    fr: {
        title_main: "Rapport de service<br>d'entretien",
        label_name: "Nom :",
        label_address: "Adresse :",
        label_city: "Lieu :",
        label_contact: "Interlocuteur :",
        label_tasks: "Travaux :",
        label_install: "Installation :",
        header_intervenants: "Intervenants :",
        header_du: "Du",
        header_au: "Au",
        header_hours_norm: "Heures<br>norm.",
        header_hours_sup: "Heures<br>sup.",
        total_upper: "TOTAL",
        section_work: "Travaux réalisés :",
        section_material: "Matériel utilisé :",
        travel_costs: "Frais de déplacement :",
        travel_included: "Incl.", 
        total_excl_vat: "Exkl. MWST", 
        comments: "Commentaires :",
        sig_tech: "Signature de l'intervenant :",
        sig_client: "Signature du client :",
        date: "Date :",
        
        // Types de travaux (Titres Singles)
        "Mise en marche": "Rapport de<br>Mise en marche",
        "Réparation": "Rapport de<br>Réparation",
        "Réparation / Garantie": "Rapport de<br>Réparation / Garantie",
        "Service d'entretien": "Rapport de<br>Service d'entretien",
        "Contrôle": "Rapport de<br>Contrôle",
        "Première validation": "Rapport de<br>Première validation",
        "Montage": "Rapport de<br>Montage",
        "Instruction": "Rapport<br>d'Instruction",
        "Re-validation": "Rapport de<br>Re-validation"
    },
    de: {
        title_main: "Servicebericht",
        label_name: "Name:",
        label_address: "Adresse:",
        label_city: "Ort:",
        label_contact: "Ansprechpartner:",
        label_tasks: "Arbeiten:",
        label_install: "Installation:",
        header_intervenants: "Techniker:",
        header_du: "Vom",
        header_au: "Bis",
        header_hours_norm: "Std.<br>Norm.",
        header_hours_sup: "Std.<br>Extra",
        total_upper: "TOTAL",
        section_work: "Ausgeführte Arbeiten:",
        section_material: "Verbrauchtes Material:",
        travel_costs: "Wegpauschale:",
        travel_included: "Inkl.",
        total_excl_vat: "Exkl. MWST",
        comments: "Bemerkungen:",
        sig_tech: "Unterschrift Techniker:",
        sig_client: "Unterschrift Kunde:",
        date: "Datum:",

        "Mise en marche": "Inbetriebnahme-<br>Protokoll",
        "Réparation": "Reparatur-<br>Bericht",
        "Réparation / Garantie": "Reparatur / Garantie-<br>Bericht",
        "Service d'entretien": "Wartungs-<br>Protokoll",
        "Contrôle": "Kontroll-<br>Bericht",
        "Première validation": "Erstvalidierungs-<br>Protokoll",
        "Montage": "Montage-<br>Bericht",
        "Instruction": "Instruktions-<br>Protokoll",
        "Re-validation": "Revalidierungs-<br>Protokoll"
    }
};

const CHECKBOX_LABELS_DE = {
    "Mise en marche": "Inbetriebnahme",
    "Réparation": "Reparatur",
    "Réparation / Garantie": "Reparatur / Garantie",
    "Service d'entretien": "Wartung",
    "Contrôle": "Kontrolle",
    "Première validation": "Erstvalidierung",
    "Montage": "Montage",
    "Instruction": "Instruktion",
    "Re-validation": "Revalidierung"
};

let currentLanguage = 'fr'; 
let currentWorkType = "";

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    if(params.get('id')) await loadReport(params.get('id'));
});

// --- GESTION CLICK CHECKBOX (MULTI-COMPATIBLE) ---
function toggleCb(element) {
    const box = element.querySelector('.cb-box');
    box.classList.toggle('checked');

    // On scanne toutes les cases cochées pour reconstruire la liste
    const allCheckedIds = Array.from(document.querySelectorAll('.cb-box.checked'))
                               .map(el => el.id.replace('cb-', ''));
    
    // On met à jour la variable globale (ex: "Maintenance, Réparation")
    currentWorkType = allCheckedIds.join(', ');
    
    // On met à jour le titre
    updateTitleFromList(allCheckedIds);
}

function updateTitleFromList(typesList) {
    const titleEl = document.getElementById('report-title');
    if (!titleEl) return;
    const dict = TRANSLATIONS[currentLanguage];

    // Cas 1 : Aucun choix
    if (typesList.length === 0) {
        titleEl.innerHTML = dict.title_main; // Titre par défaut
        return;
    }

    // Cas 2 : Un seul choix (On utilise la belle traduction officielle)
    if (typesList.length === 1) {
        const singleType = typesList[0];
        if (dict[singleType]) {
            titleEl.innerHTML = dict[singleType];
            return;
        }
    }

    // Cas 3 : Choix multiples (On génère un titre combiné)
    const prefix = currentLanguage === 'de' ? 'Bericht: ' : 'Rapport : ';
    // On essaie de traduire chaque terme si possible pour l'affichage (optionnel, ici on garde le FR technique)
    titleEl.innerHTML = prefix + typesList.join(' + ');
}


// --- CHARGEMENT DU RAPPORT ---
async function loadReport(id) {
    try {
        const res = await fetch(`/api/reports/${id}`);
        const data = await res.json();

        // 1. Langue
        currentLanguage = data.language || 'fr';
        applyLanguage(currentLanguage);

        // 2. Initialisation Données
        currentWorkType = data.work_type || "";
        
        // --- FIX : GESTION DES CASES À COCHER MULTIPLES ---
        if(data.work_type) {
            // On sépare par la virgule : "Type A, Type B" -> ["Type A", "Type B"]
            const types = data.work_type.split(',').map(s => s.trim());
            
            // On coche chaque case correspondante
            types.forEach(type => {
                const el = document.getElementById(`cb-${type}`);
                if(el) el.classList.add('checked');
            });
            
            // On met à jour le titre en fonction de cette liste
            updateTitleFromList(types);
        }
        // --------------------------------------------------

        setText('cabinet-name', data.cabinet_name);
        setText('client-address', data.address);
        setText('client-city', (data.postal_code||'') + ' ' + data.city);
        setText('interlocutor', data.interlocutor);
        setText('installation', data.installation);
        setText('remarks', data.remarks);

        const dateStr = formatDate(data.technicians?.[0]?.work_date || data.created_at);
        setText('date-start', dateStr);
        setText('date-end', dateStr);
        if(data.technician_signature_date) setText('sig-date-tech', formatDate(data.technician_signature_date));
        if(data.technicians?.[0]) setText('sig-tech', getInitials(data.technicians[0].technician_name));

        // 4. Traduction des labels des checkboxes (Seulement si DE)
        if (currentLanguage === 'de') {
            document.querySelectorAll('.cb-label-text').forEach(el => {
                const originalFr = el.getAttribute('data-fr');
                if(CHECKBOX_LABELS_DE[originalFr]) el.textContent = CHECKBOX_LABELS_DE[originalFr];
            });
        }

        // --- Tableau Techniciens ---
        const techTbody = document.getElementById('tech-rows');
        let tNorm=0, tSup=0;
        (data.technicians||[]).forEach(t => {
            const tr = document.createElement('tr');
            let dayIdx = t.work_date ? new Date(t.work_date).getDay() : -1; 
            const daysMap = [1,2,3,4,5,6,0]; 
            const cells = daysMap.map(d => `<td style="font-weight:${d===dayIdx?'bold':'normal'}">${d===dayIdx?'X':''}</td>`).join('');
            
            tr.innerHTML = `<td style="text-align:left;">${t.technician_name}</td>${cells}<td class="col-align-right">${fmt(t.hours_normal)}</td><td class="col-align-right">${fmt(t.hours_extra)}</td><td></td><td></td>`;
            techTbody.appendChild(tr);
            tNorm += t.hours_normal||0;
            tSup += t.hours_extra||0;
        });
        document.getElementById('total-norm').innerText = fmt(tNorm);
        document.getElementById('total-sup').innerText = fmt(tSup);

        // --- GRID ---
        const grid = document.getElementById('main-grid-body');
        grid.innerHTML = '';
        grid.innerHTML += emptyRowWithLines();

        // Travaux
        grid.innerHTML += sectionHeaderRow(TRANSLATIONS[currentLanguage].section_work);
        const lines = (data.work_accomplished||'').split('\n');
        while(lines.length < 3) lines.push(''); 
        lines.forEach(line => grid.innerHTML += textOnlyRow(line));

        // STK
        if(data.stk_tests && data.stk_tests.length > 0) {
            grid.innerHTML += emptyRowWithLines();
            data.stk_tests.forEach(t => {
                const showTotal = t.included ? TRANSLATIONS[currentLanguage].travel_included : fmt(t.price);
                grid.innerHTML += mergedDataRow(t.test_name, fmt(t.price), showTotal);
            });
        }

        // Matériel
        grid.innerHTML += emptyRowWithLines();
        grid.innerHTML += sectionHeaderRow(TRANSLATIONS[currentLanguage].section_material);
        
        let totalMat = 0;
        (data.materials||[]).forEach(m => {
             let displayTotal = fmt(m.total_price);
             if (m.total_price === 0 && m.unit_price > 0) displayTotal = TRANSLATIONS[currentLanguage].travel_included;
             else totalMat += m.total_price;
             grid.innerHTML += fullRow(m.quantity, m.product_code, m.material_name, fmt(m.unit_price), displayTotal);
        });
        
        if(!data.materials || data.materials.length === 0) {
             grid.innerHTML += fullRow('', '', '', '', '');
             grid.innerHTML += fullRow('', '', '', '', '');
        }

        // Frais
        grid.innerHTML += emptyRowWithLines();
        let travelDisplay = fmt(data.travel_costs);
        if(data.travel_included) travelDisplay = TRANSLATIONS[currentLanguage].travel_included;
        
        const travelLabel = TRANSLATIONS[currentLanguage].travel_costs;
        const travelText = `<b>${travelLabel}</b> <span style="margin-left:10px;">${data.travel_location||''}</span>`;
        grid.innerHTML += `
            <tr>
                <td class="col-desc" colspan="3" style="text-align:left; border-right:1px solid #000; padding:2px 4px;">${travelText}</td>
                <td class="col-price col-align-right" style="border-right:1px solid #000;">${fmt(data.travel_costs)}</td>
                <td class="col-total col-align-right">${travelDisplay}</td>
            </tr>`;

        // Total
        let grandTotal = 0;
        grandTotal += data.travel_included ? 0 : (data.travel_costs||0);
        (data.stk_tests||[]).forEach(t => { if(!t.included) grandTotal += t.price; });
        (data.materials||[]).forEach(m => { grandTotal += m.total_price; });
        document.getElementById('grand-total').innerText = fmt(grandTotal);

    } catch(e) { console.error(e); }
}

function applyLanguage(lang) {
    const t = TRANSLATIONS[lang];
    if(!t) return;
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if(t[key]) el.innerHTML = t[key];
    });
}

// --- SAUVEGARDE (Si modifications manuelles sur le PDF) ---
async function saveReport() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if(!id) return alert("Erreur ID");

    const updatedData = {
        work_type: currentWorkType, // Envoie la chaîne combinée
        installation: document.getElementById('installation').innerText,
        remarks: document.getElementById('remarks').innerText,
    };

    try {
        const res = await fetch(`/api/reports/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (res.ok) alert("Sauvegardé !");
        else alert("Erreur sauvegarde.");
    } catch (e) { console.error(e); }
}

// --- HELPERS ---
function fullRow(qty, code, desc, price, total) { return `<tr><td class="txt-center">${qty||''}</td><td class="txt-center">${code||''}</td><td>${desc||''}</td><td class="col-price col-align-right">${price||''}</td><td class="col-total col-align-right">${total||''}</td></tr>`; }
function textOnlyRow(text) { return `<tr><td colspan="3" style="border-right:1px solid #000;">${text||''}</td><td style="border-right:1px solid #000;"></td><td></td></tr>`; }
function mergedDataRow(text, price, total) { return `<tr><td colspan="3" style="border-right:1px solid #000;">${text||''}</td><td class="col-price col-align-right" style="border-right:1px solid #000;">${price||''}</td><td class="col-total col-align-right">${total||''}</td></tr>`; }
function sectionHeaderRow(title) { return `<tr><td colspan="3" class="section-header" style="border-right:1px solid #000;">${title}</td><td style="border-right:1px solid #000;"></td><td></td></tr>`; }
function emptyRowWithLines() { return `<tr><td colspan="3" style="height:15px; border-right:1px solid #000;"></td><td style="border-right:1px solid #000;"></td><td></td></tr>`; }
function setText(id, txt) { const e = document.getElementById(id); if(e) e.innerText = txt||''; }
function fmt(num) { if (num === undefined || num === null || num === '') return ''; return parseFloat(num).toFixed(2); }
function formatDate(d) { if(!d) return ''; return new Date(d).toLocaleDateString('fr-CH'); }
function getInitials(name) { if(!name) return ''; const p=name.trim().split(/\s+/); if(p.length===1 && p[0].length>1) return p[0].substring(0,2).toUpperCase(); return p.map(x=>x[0]).join('.').toUpperCase(); }