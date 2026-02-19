/**
 * Contact Form route — stores messages in MongoDB and optionally sends
 * email notification via SMTP (nodemailer).
 *
 * Messages are always persisted in the "contact_messages" collection so
 * you never lose a submission even without SMTP configured.
 */
import nodemailer from "nodemailer";
import { getDb } from "../db.js";
function contactCol() {
    return getDb().collection("contact_messages");
}
// ── SMTP transporter (lazy, cached) ─────────────────────────────────────────
let _transporter = null;
function getTransporter() {
    if (_transporter)
        return _transporter;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass)
        return null;
    _transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user, pass },
    });
    return _transporter;
}
// ── Routes ──────────────────────────────────────────────────────────────────
export async function registerContactRoutes(app) {
    // ── Submit contact form ──────────────────────────────────────────────────
    app.post("/submit", async (request, reply) => {
        const body = request.body;
        const name = (body.name || "").trim();
        const email = (body.email || "").trim();
        const message = (body.message || "").trim();
        if (!name || !email || !message) {
            return reply.code(400).send({
                success: false,
                error: "Name, email, and message are required.",
            });
        }
        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return reply.code(400).send({
                success: false,
                error: "Invalid email address.",
            });
        }
        // Always store in MongoDB
        const doc = {
            name,
            email,
            message,
            createdAt: new Date().toISOString(),
            emailSent: false,
        };
        await contactCol().insertOne(doc);
        // Try to send email notification
        const transporter = getTransporter();
        const recipientEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER || "contact@poly-blocks.com";
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || process.env.SMTP_USER,
                    to: recipientEmail,
                    replyTo: email,
                    subject: `[Polyblocks Contact] Message from ${name}`,
                    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
                    html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <hr />
            <p>${message.replace(/\n/g, "<br>")}</p>
          `,
                });
                // Mark as sent
                await contactCol().updateOne({ createdAt: doc.createdAt, email }, { $set: { emailSent: true } });
            }
            catch (err) {
                console.error("Failed to send contact email:", err);
                // Not a fatal error — message is still saved in DB
            }
        }
        else {
            console.log(`📨 Contact form from ${name} <${email}> saved to DB (no SMTP configured).`, `Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable email delivery.`);
        }
        return { success: true };
    });
    // ── List messages (admin/debug) ──────────────────────────────────────────
    app.get("/messages", async () => {
        const messages = await contactCol()
            .find()
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();
        return messages;
    });
}
//# sourceMappingURL=contact.js.map