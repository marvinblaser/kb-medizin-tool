require('dotenv').config(); // Charge le fichier .env
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true pour le port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Vérification au démarrage
transporter.verify((error, success) => {
    if (error) console.error("⚠️ Erreur de connexion au serveur mail :", error.message);
    else console.log("✅ Serveur mail prêt à envoyer des messages !");
});

const sendMail = async (to, subject, htmlContent) => {
    if (!to) return; 
    
    try {
        await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: to,
            subject: subject,
            html: htmlContent
        });
        console.log(`📧 E-mail envoyé avec succès à ${to}`);
    } catch (error) {
        console.error(`❌ Échec de l'envoi de l'e-mail à ${to}:`, error.message);
    }
};

module.exports = { sendMail };