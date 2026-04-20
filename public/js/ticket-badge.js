document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/tickets/badge');
        if (res.ok) {
            const data = await res.json();
            
            // S'il y a des tickets à traiter
            if (data.count > 0) {
                // On cherche le lien "Tickets" dans le menu de gauche
                const ticketLinks = document.querySelectorAll('a[href="/tickets.html"]');
                ticketLinks.forEach(link => {
                    const badge = document.createElement('span');
                    badge.className = 'ticket-badge';
                    badge.innerText = data.count;
                    link.appendChild(badge);
                });
            }
        }
    } catch (e) {
        console.error("Erreur de chargement du badge des tickets:", e);
    }
});