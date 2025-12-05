// public/js/report-view.js

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    if(params.get('id')) await loadReport(params.get('id'));
});

function toggleCb(element) {
    const box = element.querySelector('.cb-box');
    box.classList.toggle('checked');
}

async function loadReport(id) {
    try {
        const res = await fetch(`/api/reports/${id}`);
        const data = await res.json();

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

        if(data.work_type) {
            const el = document.getElementById(`cb-${data.work_type}`);
            if(el) el.classList.add('checked');
        }

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

        // 1. Travaux
        grid.innerHTML += sectionHeaderRow('Travaux réalisés :');
        const lines = (data.work_accomplished||'').split('\n');
        while(lines.length < 3) lines.push(''); 
        lines.forEach(line => grid.innerHTML += textOnlyRow(line));

        // 2. STK
        if(data.stk_tests && data.stk_tests.length > 0) {
            grid.innerHTML += emptyRowWithLines();
            data.stk_tests.forEach(t => {
                const showTotal = t.included ? 'Incl.' : fmt(t.price);
                grid.innerHTML += mergedDataRow(t.test_name, fmt(t.price), showTotal);
            });
        }

        // 3. Matériel
        grid.innerHTML += emptyRowWithLines();
        grid.innerHTML += sectionHeaderRow('Matériel utilisé :');
        
        let totalMat = 0;
        (data.materials||[]).forEach(m => {
             let displayTotal = fmt(m.total_price);
             if (m.total_price === 0 && m.unit_price > 0) displayTotal = 'Incl.';
             else totalMat += m.total_price;
             grid.innerHTML += fullRow(m.quantity, m.product_code, m.material_name, fmt(m.unit_price), displayTotal);
        });
        
        if(!data.materials || data.materials.length === 0) {
             grid.innerHTML += fullRow('', '', '', '', '');
             grid.innerHTML += fullRow('', '', '', '', '');
        }

        // 4. Frais
        grid.innerHTML += emptyRowWithLines();
        let travelDisplay = fmt(data.travel_costs);
        if(data.travel_included) travelDisplay = 'Incl.';
        
        const travelText = `<b>Frais de déplacement :</b> <span style="margin-left:10px;">${data.travel_location||''}</span>`;
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

// --- HELPERS ---

function fullRow(qty, code, desc, price, total) {
    return `<tr>
        <td class="txt-center">${qty||''}</td>
        <td class="txt-center">${code||''}</td>
        <td>${desc||''}</td>
        <td class="col-price col-align-right">${price||''}</td>
        <td class="col-total col-align-right">${total||''}</td>
    </tr>`;
}

function textOnlyRow(text) {
    return `<tr>
        <td colspan="3" style="border-right:1px solid #000;">${text||''}</td>
        <td style="border-right:1px solid #000;"></td>
        <td></td>
    </tr>`;
}

function mergedDataRow(text, price, total) {
    return `<tr>
        <td colspan="3" style="border-right:1px solid #000;">${text||''}</td>
        <td class="col-price col-align-right" style="border-right:1px solid #000;">${price||''}</td>
        <td class="col-total col-align-right">${total||''}</td>
    </tr>`;
}

function sectionHeaderRow(title) {
    return `<tr>
        <td colspan="3" class="section-header" style="border-right:1px solid #000;">${title}</td>
        <td style="border-right:1px solid #000;"></td>
        <td></td>
    </tr>`;
}

function emptyRowWithLines() {
    return `<tr>
        <td colspan="3" style="height:15px; border-right:1px solid #000;"></td>
        <td style="border-right:1px solid #000;"></td>
        <td></td>
    </tr>`;
}

function setText(id, txt) { const e = document.getElementById(id); if(e) e.innerText = txt||''; }
function fmt(num) { if (num === undefined || num === null || num === '') return ''; return parseFloat(num).toFixed(2); }
function formatDate(d) { if(!d) return ''; return new Date(d).toLocaleDateString('fr-CH'); }

function getInitials(name) {
    if(!name) return '';
    const parts = name.trim().split(/\s+/);
    if(parts.length === 1 && parts[0].length > 1) return parts[0].substring(0, 2).toUpperCase();
    return parts.map(p => p[0]).join('.').toUpperCase();
}