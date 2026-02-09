// public/js/report-view.js

// CONFIGURATION
const HOURLY_RATE = 160; // Tarif horaire pour le calcul

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
        
        // Types de travaux
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
        title_main: "Service Rapport",
        label_name: "Name:",
        label_address: "Adresse:",
        label_city: "Ort:",
        label_contact: "Gesprochen mit:",
        label_tasks: "Arbeiten:",
        label_install: "Anlage:",
        header_intervenants: "Techniker:",
        header_du: "Von",
        header_au: "Bis",
        header_hours_norm: "Std.<br>Norm.",
        header_hours_sup: "Std.<br>Extra",
        total_upper: "TOTAL",
        section_work: "Ausgeführte Arbeiten:",
        section_material: "Verwendetes Material:",
        travel_costs: "Spesenabrechnung:",
        travel_included: "Inkl.",
        total_excl_vat: "Exkl. MWST",
        comments: "Bemerkungen:",
        sig_tech: "Unterschrift Techniker:",
        sig_client: "Unterschrift Kunde:",
        date: "Datum:",

        "Mise en marche": "Inbetriebsetzung-<br>Bericht",
        "Réparation": "Reparatur-<br>Bericht",
        "Réparation / Garantie": "Reparatur / Garantie-<br>Bericht",
        "Service d'entretien": "Service<br>Rapport",
        "Contrôle": "Kontroll-<br>Bericht",
        "Première validation": "Erstvalidierung",
        "Montage": "Montage-<br>Bericht",
        "Instruction": "Instruktions-<br>Protokoll",
        "Re-validation": "Revalidierung"
    }
};

const CHECKBOX_LABELS_DE = {
    "Mise en marche": "Inbetriebsetzung",
    "Réparation": "Reparaturen",
    "Réparation / Garantie": "Garantie-Reparatur",
    "Service d'entretien": "Service-Wartung",
    "Contrôle": "Kontrolle",
    "Première validation": "Erste Validierung",
    "Montage": "Montage",
    "Instruction": "Instruktion",
    "Re-validation": "Re-Validierung"
};

let currentLanguage = 'fr'; 
let currentWorkType = "";

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    if(params.get('id')) await loadReport(params.get('id'));
});

// --- GESTION CLICK CHECKBOX ---
function toggleCb(element) {
    const box = element.querySelector('.cb-box');
    box.classList.toggle('checked');

    const allCheckedIds = Array.from(document.querySelectorAll('.cb-box.checked'))
                               .map(el => el.id.replace('cb-', ''));
    
    currentWorkType = allCheckedIds.join(', ');
    updateTitleFromList(allCheckedIds);
}

function updateTitleFromList(typesList) {
    const titleEl = document.getElementById('report-title');
    if (!titleEl) return;
    const dict = TRANSLATIONS[currentLanguage];

    if (typesList.length === 0) {
        titleEl.innerHTML = dict.title_main;
        return;
    }
    if (typesList.length === 1) {
        const singleType = typesList[0];
        if (dict[singleType]) {
            titleEl.innerHTML = dict[singleType];
            return;
        }
    }
    const prefix = currentLanguage === 'de' ? 'Bericht: ' : 'Rapport : ';
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
        
        // A. On coche visuellement les cases (pour info)
        if(data.work_type) {
            const types = data.work_type.split(',').map(s => s.trim());
            types.forEach(type => {
                const el = document.getElementById(`cb-${type}`);
                if(el) el.classList.add('checked');
            });
        }

        // B. Gestion Intelligente du Titre
        if (data.title && data.title.trim() !== "") {
            // CAS 1 : Un titre personnalisé existe -> On l'utilise
            const titleEl = document.getElementById('report-title');
            if (titleEl) {
                titleEl.innerText = data.title;
                // Important : on retire l'attribut de traduction pour éviter qu'il ne soit écrasé
                titleEl.removeAttribute('data-t'); 
            }
        } else if (data.work_type) {
            // CAS 2 : Pas de titre perso -> On génère le titre auto (Mise en marche + Réparation...)
            const types = data.work_type.split(',').map(s => s.trim());
            updateTitleFromList(types);
        }

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

        if (currentLanguage === 'de') {
            document.querySelectorAll('.cb-label-text').forEach(el => {
                const originalFr = el.getAttribute('data-fr');
                if(CHECKBOX_LABELS_DE[originalFr]) el.textContent = CHECKBOX_LABELS_DE[originalFr];
            });
        }

        // --- Tableau Techniciens ---
        const techTbody = document.getElementById('tech-rows');
        let tNorm=0, tSup=0;
        let totalLaborCost = 0; // Ce qui est facturé (si non inclus)
        let totalTheoreticalValue = 0; // La valeur totale du travail (inclus ou non)

        (data.technicians||[]).forEach(t => {
            const tr = document.createElement('tr');
            let dayIdx = t.work_date ? new Date(t.work_date).getDay() : -1; 
            const daysMap = [1,2,3,4,5,6,0]; 
            const cells = daysMap.map(d => `<td style="font-weight:${d===dayIdx?'bold':'normal'}">${d===dayIdx?'X':''}</td>`).join('');
            
            // Logique Inclus / Non Inclus
            const isIncluded = (t.included === 1 || t.included === true || t.included === "true");
            
            // Calculs
            const hNorm = t.hours_normal || 0;
            const hExtra = t.hours_extra || 0;
            const rowValue = (hNorm + hExtra) * HOURLY_RATE;
            
            totalTheoreticalValue += rowValue; // On ajoute toujours à la valeur théorique
            
            if (!isIncluded) {
                totalLaborCost += rowValue; // On ajoute au coût facturé seulement si non inclus
            }

            // Affichage de (Incl.) dans le tableau
            const inclLabel = isIncluded 
                ? `<br><span style="font-size:0.7em; font-style:italic;">(${TRANSLATIONS[currentLanguage].travel_included})</span>` 
                : '';

            tr.innerHTML = `
                <td style="text-align:left;">${t.technician_name}</td>
                ${cells}
                <td class="col-align-right">${fmt(t.hours_normal)}${inclLabel}</td>
                <td class="col-align-right">${fmt(t.hours_extra)}${inclLabel}</td>
                <td></td><td></td>`;
            
            techTbody.appendChild(tr);
            
            tNorm += t.hours_normal||0;
            tSup += t.hours_extra||0;
        });

        // --- CORRECTION DU TOTAL (Logique 160.00 | 160.00 ou 160.00 | Incl.) ---
        document.getElementById('total-norm').innerText = fmt(tNorm);
        document.getElementById('total-sup').innerText = fmt(tSup);

        const laborPriceEl = document.getElementById('total-labor-price'); // Colonne 1 (Valeur)
        const laborInfoEl = document.getElementById('total-labor-info');   // Colonne 2 (Facturé/Info)

        if (laborPriceEl && laborInfoEl) {
            laborPriceEl.innerText = "";
            laborInfoEl.innerText = "";

            if (totalTheoreticalValue > 0) {
                // Colonne 1 : On affiche TOUJOURS la valeur du travail (Ex: 160.00)
                laborPriceEl.innerText = fmt(totalTheoreticalValue);
                
                // Colonne 2 :
                if (totalLaborCost > 0) {
                    // Si facturé : On affiche le montant facturé (Ex: 160.00)
                    laborInfoEl.innerText = fmt(totalLaborCost);
                } else {
                    // Si tout est inclus (Coût facturé = 0) : On affiche "Incl."
                    laborInfoEl.innerText = TRANSLATIONS[currentLanguage].travel_included;
                }
            }
        }
        // --------------------------------------------------------

        // --- GRID PRINCIPAL ---
        const grid = document.getElementById('main-grid-body');
        grid.innerHTML = '';
        grid.innerHTML += emptyRowWithLines();

        // 1. Travaux
        grid.innerHTML += sectionHeaderRow(TRANSLATIONS[currentLanguage].section_work);
        const lines = (data.work_accomplished||'').split('\n');
        while(lines.length < 3) lines.push(''); 
        lines.forEach(line => grid.innerHTML += textOnlyRow(line));

        // 2. STK
        if(data.stk_tests && data.stk_tests.length > 0) {
            grid.innerHTML += emptyRowWithLines();
            data.stk_tests.forEach(t => {
                const isInc = (t.included === 1 || t.included === true || t.included === "true");
                const showTotal = isInc ? TRANSLATIONS[currentLanguage].travel_included : fmt(t.price);
                grid.innerHTML += mergedDataRow(t.test_name, fmt(t.price), showTotal);
            });
        }

        // 3. Matériel
        grid.innerHTML += emptyRowWithLines();
        grid.innerHTML += sectionHeaderRow(TRANSLATIONS[currentLanguage].section_material);
        
        let totalMat = 0;
        (data.materials||[]).forEach(m => {
             // Détection "Inclus" (Compatible avec le nouveau champ BDD ou l'ancienne logique)
             const isInc = (m.included === 1 || m.included === true || m.included === "true") 
                        || (m.total_price === 0 && m.unit_price > 0);

             let displayTotal = fmt(m.total_price);
             let displayUnit = fmt(m.unit_price);

             if (isInc) {
                 displayTotal = TRANSLATIONS[currentLanguage].travel_included; // Affiche "Incl."
                 displayUnit = ""; // <--- FIX: On force le vide pour le prix unitaire
             } else {
                 totalMat += m.total_price;
             }
             
             grid.innerHTML += fullRow(m.quantity, m.product_code, m.material_name, displayUnit, displayTotal);
        });

        // 4. Frais de déplacement
        grid.innerHTML += emptyRowWithLines();
        let travelDisplay = fmt(data.travel_costs);
        const travelInc = (data.travel_included === 1 || data.travel_included === true || data.travel_included === "true");
        if(travelInc) travelDisplay = TRANSLATIONS[currentLanguage].travel_included;
        
        const travelLabel = TRANSLATIONS[currentLanguage].travel_costs;
        const travelText = `<b>${travelLabel}</b> <span style="margin-left:10px;">${data.travel_location||''}</span>`;
        grid.innerHTML += `
            <tr>
                <td class="col-desc" colspan="3" style="text-align:left; border-right:1px solid #000; padding:2px 4px;">${travelText}</td>
                <td class="col-price col-align-right" style="border-right:1px solid #000;">${fmt(data.travel_costs)}</td>
                <td class="col-total col-align-right">${travelDisplay}</td>
            </tr>`;

        // --- TOTAL GÉNÉRAL ---
        let grandTotal = 0;
        grandTotal += totalLaborCost; // On ajoute seulement ce qui est facturé
        grandTotal += travelInc ? 0 : (data.travel_costs||0);
        
        (data.stk_tests||[]).forEach(t => { 
            const isInc = (t.included === 1 || t.included === true || t.included === "true");
            if(!isInc) grandTotal += t.price; 
        });
        
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
        work_type: currentWorkType,
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
function textOnlyRow(text) { return `<tr><td colspan="3" style=\"border-right:1px solid #000;\">${text||''}</td><td style=\"border-right:1px solid #000;\"></td><td></td></tr>`; }
function mergedDataRow(text, price, total) { return `<tr><td colspan="3" style=\"border-right:1px solid #000;\">${text||''}</td><td class="col-price col-align-right" style=\"border-right:1px solid #000;\">${price||''}</td><td class="col-total col-align-right">${total||''}</td></tr>`; }
function sectionHeaderRow(title) { return `<tr><td colspan="3" class="section-header" style=\"border-right:1px solid #000;\">${title}</td><td style=\"border-right:1px solid #000;\"></td><td></td></tr>`; }
function emptyRowWithLines() { return `<tr><td colspan="3" style="height:15px; border-right:1px solid #000;"></td><td style="border-right:1px solid #000;"></td><td></td></tr>`; }
function setText(id, txt) { const e = document.getElementById(id); if(e) e.innerText = txt||''; }
function fmt(num) { if (num === undefined || num === null || num === '') return ''; return parseFloat(num).toFixed(2); }
function formatDate(d) { if(!d) return ''; return new Date(d).toLocaleDateString('fr-CH'); }
function getInitials(name) { if(!name) return ''; const p=name.trim().split(/\s+/); if(p.length===1 && p[0].length>1) return p[0].substring(0,2).toUpperCase(); return p.map(x=>x[0]).join('.').toUpperCase(); }