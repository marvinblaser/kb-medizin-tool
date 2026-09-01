// server/migrations/028_ticket_reports.js
// Liste de rapports liés à un ticket, éditable (ajout/retrait manuel).
// Pré-remplie à la création du ticket avec les rapports déjà associés à la
// même machine, mais purement informative ensuite — pas de re-synchronisation
// automatique qui écraserait les modifications manuelles.

module.exports = {
  id: '028_ticket_reports',
  up(db, callback) {
    db.run(
      `CREATE TABLE IF NOT EXISTS ticket_reports (
        ticket_id INTEGER NOT NULL,
        report_id INTEGER NOT NULL,
        PRIMARY KEY (ticket_id, report_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      )`,
      (err) => callback(err || null)
    );
  }
};
