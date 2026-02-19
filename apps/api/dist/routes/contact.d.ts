/**
 * Contact Form route — stores messages in MongoDB and optionally sends
 * email notification via SMTP (nodemailer).
 *
 * Messages are always persisted in the "contact_messages" collection so
 * you never lose a submission even without SMTP configured.
 */
import type { FastifyInstance } from "fastify";
export declare function registerContactRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=contact.d.ts.map