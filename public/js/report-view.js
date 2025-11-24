document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');

    // Initialisation des dates par défaut si c'est une création (ou affichage vide)
    const today = formatDate(new Date().toISOString());
    if (!reportId) {
        setHtml('date-start', today);
        setHtml('date-end', today);
        setHtml('sig-date-tech', today);
        setHtml('sig-date-client', today);
        // Lignes vides par défaut
        addTechRow('', null, 0, 0);
        addMaterialRow('', '', '', '');
    }

    if (reportId) {
        await loadReportData(reportId);
    }

    // --- Écouteurs pour le calcul automatique ---
    // Recalcule le total dès qu'on touche à un champ prix ou quantité
    document.body.addEventListener('input', (e) => {
        const target = e.target;
        if (
            target.classList.contains('col-price') ||   // Prix STK / Voyage / Travaux
            target.classList.contains('mat-qty') ||     // Qté Matériel
            target.classList.contains('mat-price') ||   // Prix Unit Matériel
            target.classList.contains('tech-hours') ||  // Heures Tech
            target.id === 'travel-price'
        ) {
            calculateTotal();
        }
    });
});

// ==========================================
// 1. FONCTIONS D'INTERACTION (UI)
// ==========================================

// Gère les cases à cocher "custom" (carrés noirs)
window.toggleCb = function(element) {
    // Si tu veux qu'une seule case soit cochée à la fois (mode Radio), décommente ceci :
    // document.querySelectorAll('.cb-box').forEach(b => b.classList.remove('checked'));
    
    const box = element.querySelector('.cb-box');
    if (box) box.classList.toggle('checked');
}

// Gère les "X" dans la grille des jours techniciens
window.toggleDay = function(td) {
    const current = td.innerText.trim();
    if (current === 'X') {
        td.innerText = '';
        td.style.fontWeight = 'normal';
    } else {
        td.innerText = 'X';
        td.style.fontWeight = 'bold';
    }
}

// ==========================================
// 2. CHARGEMENT DES DONNÉES
// ==========================================

async function loadReportData(id) {
    try {
        const response = await fetch(`/api/reports/${id}`);
        if (!response.ok) throw new Error('Erreur chargement');
        const data = await response.json();

        // --- Champs Textes Simples ---
        setHtml('cabinet-name', data.cabinet_name);
        setHtml('client-address', data.address);
        setHtml('client-city', (data.postal_code || '') + ' ' + data.city);
        setHtml('interlocutor', data.interlocutor);
        setHtml('installation', data.installation);
        setHtml('remarks', data.remarks);

        // --- Dates ---
        // On prend la date du premier technicien ou la date de création
        let mainDate = data.created_at;
        if (data.technicians && data.technicians.length > 0 && data.technicians[0].work_date) {
            mainDate = data.technicians[0].work_date;
        }
        const formattedDate = formatDate(mainDate);
        setHtml('date-start', formattedDate);
        setHtml('date-end', formattedDate);

        if (data.technician_signature_date) setHtml('sig-date-tech', formatDate(data.technician_signature_date));
        if (data.client_signature_date) setHtml('sig-date-client', formatDate(data.client_signature_date));

        // Initiales Tech
        if (data.technicians && data.technicians[0]) {
            setHtml('sig-tech', getInitials(data.technicians[0].technician_name));
        }

        // --- Checkboxes (Type de travaux) ---
        // L'HTML a des IDs comme "cb-Mise en marche". On essaie de trouver celui qui correspond.
        if (data.work_type) {
            const cbId = `cb-${data.work_type}`;
            const cbElement = document.getElementById(cbId);
            if (cbElement) {
                cbElement.classList.add('checked');
            }
        }

        // --- Techniciens ---
        const techTbody = document.getElementById('tech-rows');
        techTbody.innerHTML = ''; // Reset
        if (data.technicians && data.technicians.length > 0) {
            data.technicians.forEach(t => {
                addTechRow(t.technician_name, t.work_date, t.hours_normal, t.hours_extra);
            });
        } else {
            addTechRow('', null, 0, 0); // Ligne vide
        }

        // --- Travaux Réalisés ---
        const workContainer = document.getElementById('work-lines-container');
        workContainer.innerHTML = '';
        const lines = (data.work_accomplished || '').split('\n');
        // On assure un minimum de 3 lignes pour le visuel
        while (lines.length < 3) lines.push('');

        lines.forEach(line => {
            workContainer.innerHTML += `
                <div class="grid-row">
                    <div class="col-qty" style="border-right:1px solid black"></div>
                    <div class="col-main" contenteditable="true" style="border-right:1px solid black">${line}</div>
                    <div class="col-price" contenteditable="true" style="border-right:1px solid black"></div>
                    <div class="col-incl"></div>
                </div>`;
        });

        // --- Tests STK ---
        const stkContainer = document.getElementById('stk-lines-container');
        stkContainer.innerHTML = '';
        if (data.stk_tests && data.stk_tests.length > 0) {
            data.stk_tests.forEach(test => {
                stkContainer.innerHTML += `
                <div class="grid-row row-stk">
                    <div class="col-qty" style="border-right:1px solid black"></div>
                    <div class="col-main" contenteditable="true" style="border-right:1px solid black">Test de sécurité électrique obligatoire i.O - <strong>${test.test_name}</strong></div>
                    <div class="col-price" contenteditable="true" style="border-right:1px solid black">${test.included ? '' : formatNumber(test.price)}</div>
                    <div class="col-incl col-check">${test.included ? 'Incl.' : ''}</div>
                </div>`;
            });
        }

        // --- Matériaux ---
        const matContainer = document.getElementById('material-rows-container');
        matContainer.innerHTML = '';
        if (data.materials && data.materials.length > 0) {
            data.materials.forEach(mat => {
                addMaterialRow(mat.quantity, mat.product_code, mat.material_name, mat.unit_price);
            });
        } else {
            addMaterialRow('', '', '', ''); // Vide pour faire joli
            addMaterialRow('', '', '', '');
        }

        // --- Frais Déplacement ---
        setHtml('travel-location', data.travel_location || data.city);
        if (data.travel_included) {
            setHtml('travel-incl', 'Incl.');
            setHtml('travel-price', '');
        } else {
            setHtml('travel-incl', '');
            setHtml('travel-price', formatNumber(data.travel_costs));
        }

        // Calcul final
        calculateTotal();

    } catch (e) {
        console.error(e);
        alert('Erreur chargement: ' + e.message);
    }
}

// ==========================================
// 3. FONCTIONS DE RENDU (HELPERS)
// ==========================================

function addTechRow(name, dateStr, hNorm, hExtra) {
    const tbody = document.getElementById('tech-rows');
    const tr = document.createElement('tr');

    // Calcul du jour de la semaine pour mettre un X (si date présente)
    let dayIndex = -1; // 0=Dimanche, 1=Lundi...
    if (dateStr) {
        dayIndex = new Date(dateStr).getDay();
    }
    // Ordre des colonnes HTML : Mo(1), Di(2), Mi(3), Do(4), Fr(5), Sa(6), So(0)
    const daysOrder = [1, 2, 3, 4, 5, 6, 0];

    let daysHtml = '';
    daysOrder.forEach(d => {
        const isChecked = (d === dayIndex);
        daysHtml += `<td class="col-day" onclick="toggleDay(this)" style="font-weight:${isChecked ? 'bold' : 'normal'}">${isChecked ? 'X' : ''}</td>`;
    });

    tr.innerHTML = `
        <td class="col-name" contenteditable="true">${name || ''}</td>
        ${daysHtml}
        <td class="col-hours tech-hours tech-norm" contenteditable="true">${hNorm ? formatNumber(hNorm) : ''}</td>
        <td class="col-hours tech-hours tech-extra" contenteditable="true">${hExtra ? formatNumber(hExtra) : ''}</td>
    `;
    tbody.appendChild(tr);
}

function addMaterialRow(qty, code, name, price) {
    const container = document.getElementById('material-rows-container');
    const div = document.createElement('div');
    div.className = 'grid-row mat-row'; // mat-row pour faciliter la sélection JS

    const total = (qty && price) ? (parseFloat(qty) * parseFloat(price)) : 0;

    // Attention aux styles inline border-right pour maintenir les lignes verticales
    div.innerHTML = `
        <div class="col-qty mat-qty" contenteditable="true" style="border-right:1px solid black">${qty || ''}</div>
        <div class="col-main mat-name" contenteditable="true" style="border-right:1px solid black">
            ${code ? code + ' - ' : ''}${name || ''}
        </div>
        <div class="col-price mat-price" contenteditable="true" style="border-right:1px solid black">${price ? formatNumber(price) : ''}</div>
        <div class="col-incl mat-total" style="text-align:right; padding-right:5px;">${total ? formatNumber(total) : ''}</div>
    `;
    container.appendChild(div);
}

// ==========================================
// 4. SAUVEGARDE
// ==========================================

window.saveReport = async function() {
    const btn = document.querySelector('.fab-save');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        // --- Récupération du Type (Checkbox) ---
        let workType = '';
        const checkedBox = document.querySelector('.cb-box.checked');
        if (checkedBox) {
            // L'ID est "cb-Mise en marche", on retire "cb-"
            workType = checkedBox.id.replace('cb-', '');
        }

        // --- Récupération Techniciens ---
        const technicians = [];
        // On prend la date "Du" comme date de référence
        const defaultDate = parseDate(getText('date-start'));

        document.querySelectorAll('#tech-rows tr').forEach(tr => {
            const name = tr.cells[0].innerText.trim();
            if (name) {
                technicians.push({
                    technician_name: name,
                    work_date: defaultDate,
                    hours_normal: parseSwissNumber(tr.querySelector('.tech-norm').innerText),
                    hours_extra: parseSwissNumber(tr.querySelector('.tech-extra').innerText)
                });
            }
        });

        // --- Récupération Travaux (Lignes textes) ---
        let workLines = [];
        document.querySelectorAll('#work-lines-container .col-main').forEach(div => {
            if (div.innerText.trim()) workLines.push(div.innerText.trim());
        });

        // --- Récupération STK ---
        const stk_tests = [];
        document.querySelectorAll('.row-stk').forEach(row => {
            // On extrait le nom (attention, le HTML contient "Test... - <strong>Nom</strong>")
            // On prend juste le texte brut, ou on essaie de parser
            let fullName = row.querySelector('.col-main').innerText.trim();
            // Nettoyage optionnel du préfixe si présent
            fullName = fullName.replace('Test de sécurité électrique obligatoire i.O - ', '');

            const priceTxt = row.querySelector('.col-price').innerText.trim();
            const inclTxt = row.querySelector('.col-incl').innerText.trim();

            if (fullName) {
                stk_tests.push({
                    test_name: fullName,
                    price: parseSwissNumber(priceTxt),
                    included: (inclTxt.toLowerCase().includes('incl'))
                });
            }
        });

        // --- Récupération Matériaux ---
        const materials = [];
        document.querySelectorAll('.mat-row').forEach(row => {
            const nameRaw = row.querySelector('.mat-name').innerText.trim();
            if (nameRaw) {
                // Essai de séparation Code / Nom si format "CODE - NOM"
                let code = '';
                let name = nameRaw;
                if (nameRaw.includes(' - ')) {
                    const parts = nameRaw.split(' - ');
                    code = parts[0];
                    name = parts.slice(1).join(' - ');
                }

                materials.push({
                    material_name: name,
                    product_code: code,
                    quantity: parseFloat(row.querySelector('.mat-qty').innerText) || 1,
                    unit_price: parseSwissNumber(row.querySelector('.mat-price').innerText),
                    total_price: parseSwissNumber(row.querySelector('.mat-total').innerText)
                });
            }
        });

        // --- Frais et Autres ---
        const travelTxt = getText('travel-price');
        const travelIncl = getText('travel-incl').toLowerCase().includes('incl');

        const data = {
            cabinet_name: getText('cabinet-name'),
            address: getText('client-address'),
            city: getText('client-city'), // Faudrait séparer postal_code idéalement
            interlocutor: getText('interlocutor'),
            work_type: workType,
            installation: getText('installation'),
            work_accomplished: workLines.join('\n'),
            remarks: getText('remarks'),
            travel_location: getText('travel-location'),
            travel_costs: parseSwissNumber(travelTxt),
            travel_included: travelIncl,
            technician_signature_date: parseDate(getText('sig-date-tech')),
            client_signature_date: parseDate(getText('sig-date-client')),
            technicians,
            materials,
            stk_tests,
            status: 'completed'
        };

        const method = reportId ? 'PUT' : 'POST';
        const url = reportId ? `/api/reports/${reportId}` : '/api/reports';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            btn.style.background = '#28a745'; // Vert succès
            btn.innerHTML = '<i class="fas fa-check"></i> Sauvegardé';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
                btn.style.background = '#28a745'; // Reste vert ou retour couleur
            }, 2000);
        } else {
            const err = await response.json();
            alert('Erreur: ' + (err.error || 'Erreur inconnue'));
            btn.innerHTML = oldHtml;
        }

    } catch (e) {
        console.error(e);
        alert('Erreur technique lors de la sauvegarde');
        btn.innerHTML = oldHtml;
    }
}

// ==========================================
// 5. CALCULS ET UTILITAIRES
// ==========================================

window.calculateTotal = function() {
    let grandTotal = 0;

    // 1. Matériaux (Recalculer Ligne + Somme)
    document.querySelectorAll('.mat-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.mat-qty').innerText) || 0;
        const price = parseSwissNumber(row.querySelector('.mat-price').innerText);
        const lineTotal = qty * price;

        // Mise à jour visuelle de la case total ligne
        row.querySelector('.mat-total').innerText = lineTotal ? formatNumber(lineTotal) : '';
        grandTotal += lineTotal;
    });

    // 2. STK
    document.querySelectorAll('.row-stk').forEach(row => {
        const inclTxt = row.querySelector('.col-check').innerText.toLowerCase();
        if (!inclTxt.includes('incl')) {
            grandTotal += parseSwissNumber(row.querySelector('.col-price').innerText);
        }
    });

    // 3. Frais déplacement
    const travelIncl = getText('travel-incl').toLowerCase().includes('incl');
    if (!travelIncl) {
        grandTotal += parseSwissNumber(getText('travel-price'));
    }

    // Mise à jour Total Global
    document.getElementById('grand-total').innerText = formatNumber(grandTotal);

    // 4. Somme des heures Tech
    let totalNorm = 0;
    let totalExtra = 0;
    document.querySelectorAll('.tech-norm').forEach(td => totalNorm += parseSwissNumber(td.innerText));
    document.querySelectorAll('.tech-extra').forEach(td => totalExtra += parseSwissNumber(td.innerText));

    document.getElementById('total-hours-norm').innerText = formatNumber(totalNorm);
    document.getElementById('total-hours-extra').innerText = totalExtra > 0 ? formatNumber(totalExtra) : '';
}

// --- Helpers ---

function getText(id) {
    const el = document.getElementById(id);
    return el ? el.innerText.trim() : '';
}

function setHtml(id, val) {
    const el = document.getElementById(id);
    if (el && val) el.innerText = val;
}

// Transforme "150.00" ou "150,00" en float 150.00
function parseSwissNumber(str) {
    if (!str) return 0;
    // Garde chiffres, point, virgule, moins. Remplace virgule par point.
    let clean = str.replace(/[^0-9.,-]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

// Transforme float en string "150.00"
function formatNumber(num) {
    if (num === undefined || num === null || num === '') return '';
    return parseFloat(num).toFixed(2);
}

// Format DD.MM.YYYY
function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Transforme DD.MM.YYYY en YYYY-MM-DD (pour la DB)
function parseDate(chDate) {
    if (!chDate) return new Date().toISOString().split('T')[0];
    const parts = chDate.split('.');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return new Date().toISOString().split('T')[0];
}

function getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('.').toUpperCase();
}