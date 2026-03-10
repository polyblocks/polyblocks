/**
 * Auth routes — Google OAuth + email/password login, user management,
 * subscription/payment verification.
 *
 * All data is stored in MongoDB (users + sessions collections).
 */
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { ethers } from "ethers";
import { usersCol, sessionsCol } from "../db.js";
import { getPolygonProvider } from "../rpc.js";
const NOTIFY_EMAIL = "gaming.oars@gmail.com";
// ─── Email Transporter (lazy singleton) ─────────────────────────────────────
let _transporter = null;
function getMailTransporter() {
    if (_transporter)
        return _transporter;
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass)
        return null;
    _transporter = nodemailer.createTransport({
        host, port, secure: port === 465,
        auth: { user, pass },
    });
    return _transporter;
}
async function sendVerificationCode(email, code) {
    const transporter = getMailTransporter();
    if (!transporter)
        return;
    try {
        await transporter.sendMail({
            from: `"Polyblocks" <contact@poly-blocks.com>`,
            to: email,
            subject: "Your Polyblocks Verification Code",
            text: `Your verification code is: ${code}\n\nIt expires in 10 minutes.`,
            html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 10 minutes.</p>`,
        });
    }
    catch (err) {
        console.error("Failed to send verification email:", err);
    }
}
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function getVerificationExpiry() {
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10);
    return expires;
}
async function sendSubscriptionNotification(data) {
    const transporter = getMailTransporter();
    if (!transporter) {
        console.log(`[Email] SMTP not configured, skipping notification for ${data.userEmail}`);
        return;
    }
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: NOTIFY_EMAIL,
            subject: `🎉 New Pro Subscription - ${data.userEmail}`,
            text: `New Pro subscription activated!

User: ${data.userEmail}
User ID: ${data.userId}
Transaction: ${data.txHash}
${data.walletAddress ? `Wallet: ${data.walletAddress}` : ""}
Time: ${new Date().toISOString()}

— Polyblocks`,
        });
        console.log(`[Email] Subscription notification sent to ${NOTIFY_EMAIL}`);
    }
    catch (err) {
        console.error(`[Email] Failed to send notification:`, err);
    }
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function generateId() {
    return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function generateToken() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`;
}
/** Create a session in MongoDB (auto-expires in 30 days via TTL index). */
async function createSession(userId) {
    const token = generateToken();
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + 30);
    await sessionsCol().insertOne({
        _id: token,
        userId,
        createdAt: now,
        expiresAt: expires,
    });
    return token;
}
/** Look up session → userId.  Returns null if expired / not found. */
async function resolveSession(token) {
    if (!token)
        return null;
    const session = await sessionsCol().findOne({ _id: token });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        await sessionsCol().deleteOne({ _id: token });
        return null;
    }
    return session.userId;
}
/** Sanitise a DbUser for the client (strip passwordHash etc.). */
function publicUser(u) {
    return {
        id: u._id,
        email: u.email,
        name: u.name,
        avatar: u.avatar,
        tier: u.tier,
        subscribedAt: u.subscribedAt,
        expiresAt: u.expiresAt,
        verified: u.verified,
    };
}
/** If pro has expired, downgrade in-place and persist. */
async function checkExpiry(user) {
    if (user.tier === "pro" && user.expiresAt && new Date(user.expiresAt) < new Date()) {
        user.tier = "free";
        user.subscribedAt = null;
        user.expiresAt = null;
        await usersCol().updateOne({ _id: user._id }, { $set: { tier: "free", subscribedAt: null, expiresAt: null } });
    }
    return user;
}
/**
 * Verify Google ID token by calling Google's tokeninfo endpoint.
 */
async function verifyGoogleToken(idToken) {
    try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!res.ok)
            return null;
        const data = await res.json();
        return {
            sub: data.sub,
            email: data.email,
            name: data.name || data.email.split("@")[0],
            picture: data.picture || "",
        };
    }
    catch {
        return null;
    }
}
// ── Routes ───────────────────────────────────────────────────────────────────
export async function registerAuthRoutes(app) {
    // Read env vars at registration time (after dotenv has loaded).
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/auth/google/callback";
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    app.log.info(`Google OAuth configured: client_id=${GOOGLE_CLIENT_ID ? "set" : "MISSING"}, redirect=${REDIRECT_URI}`);
    // ═══════════════════════════════════════════════════════════════════════════
    // ── Google OAuth ──────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET /api/auth/google
     * Redirects user to Google's OAuth consent screen.
     */
    app.get("/google", async (_req, reply) => {
        if (!GOOGLE_CLIENT_ID) {
            // Dev mode — create a demo user
            const demoId = "demo_user";
            const existing = await usersCol().findOne({ _id: demoId });
            if (!existing) {
                await usersCol().insertOne({
                    _id: demoId,
                    email: "demo@polyblocks.dev",
                    name: "Demo User",
                    avatar: "",
                    tier: "free",
                    subscribedAt: null,
                    expiresAt: null,
                    googleId: "demo",
                    passwordHash: "",
                    createdAt: new Date().toISOString(),
                });
            }
            const token = await createSession(demoId);
            return reply.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
        }
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: "code",
            scope: "openid email profile",
            access_type: "offline",
            prompt: "consent",
        });
        return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
    /**
     * GET /api/auth/google/callback
     * Handles the redirect from Google with an authorization code.
     */
    app.get("/google/callback", async (req, reply) => {
        const { code, error } = req.query;
        if (error || !code) {
            return reply.redirect(`${FRONTEND_URL}/auth/callback?error=${error || "no_code"}`);
        }
        try {
            // Exchange code for tokens
            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: "authorization_code",
                }),
            });
            if (!tokenRes.ok) {
                return reply.redirect(`${FRONTEND_URL}/auth/callback?error=token_exchange_failed`);
            }
            const tokenData = await tokenRes.json();
            const googleUser = await verifyGoogleToken(tokenData.id_token);
            if (!googleUser) {
                return reply.redirect(`${FRONTEND_URL}/auth/callback?error=invalid_token`);
            }
            // Find or create user by googleId
            let user = await usersCol().findOne({ googleId: googleUser.sub });
            if (!user) {
                // Check if a user with same email already exists (e.g. registered via email)
                const byEmail = await usersCol().findOne({ email: googleUser.email });
                if (byEmail) {
                    // Link Google account to existing email user
                    await usersCol().updateOne({ _id: byEmail._id }, { $set: { googleId: googleUser.sub, avatar: googleUser.picture, name: googleUser.name } });
                    user = { ...byEmail, googleId: googleUser.sub, avatar: googleUser.picture, name: googleUser.name };
                }
                else {
                    const userId = generateId();
                    const vCode = generateVerificationCode();
                    const newUser = {
                        _id: userId,
                        email: googleUser.email,
                        name: googleUser.name,
                        avatar: googleUser.picture,
                        tier: "free",
                        subscribedAt: null,
                        expiresAt: null,
                        googleId: googleUser.sub,
                        passwordHash: "",
                        createdAt: new Date().toISOString(),
                        verified: false,
                        verificationCode: vCode,
                        verificationCodeExpiresAt: getVerificationExpiry(),
                    };
                    await usersCol().insertOne(newUser);
                    sendVerificationCode(googleUser.email, vCode).catch(() => { });
                    user = newUser;
                }
            }
            else {
                // Update profile info
                await usersCol().updateOne({ _id: user._id }, { $set: { name: googleUser.name, avatar: googleUser.picture, email: googleUser.email } });
            }
            const sessionToken = await createSession(user._id);
            return reply.redirect(`${FRONTEND_URL}/auth/callback?token=${sessionToken}`);
        }
        catch (err) {
            app.log.error(err, "Google OAuth callback error");
            return reply.redirect(`${FRONTEND_URL}/auth/callback?error=server_error`);
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // ── Email / Password Auth ─────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * POST /api/auth/register
     * Create a new account with email + password.
     */
    app.post("/register", async (req, reply) => {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return reply.code(400).send({ error: "Email and password are required" });
        }
        if (password.length < 8) {
            return reply.code(400).send({ error: "Password must be at least 8 characters" });
        }
        // Check duplicate email
        const existing = await usersCol().findOne({ email });
        if (existing) {
            return reply.code(409).send({ error: "Email already registered. Try signing in." });
        }
        const userId = generateId();
        const passwordHash = await bcrypt.hash(password, 12);
        const vCode = generateVerificationCode();
        const newUser = {
            _id: userId,
            email,
            name: name || email.split("@")[0],
            avatar: "",
            tier: "free",
            subscribedAt: null,
            expiresAt: null,
            googleId: "",
            passwordHash,
            createdAt: new Date().toISOString(),
            verified: false,
            verificationCode: vCode,
            verificationCodeExpiresAt: getVerificationExpiry(),
        };
        await usersCol().insertOne(newUser);
        const token = await createSession(userId);
        sendVerificationCode(email, vCode).catch(() => { });
        return {
            user: publicUser(newUser),
            token,
        };
    });
    app.post("/verify-code", async (req, reply) => {
        const { code } = req.body;
        const token = req.headers["x-session-token"] || "";
        if (!token || !code) {
            return reply.code(400).send({ error: "Missing token or code" });
        }
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const user = await usersCol().findOne({ _id: userId });
        if (!user)
            return reply.code(404).send({ error: "User not found" });
        if (user.verified) {
            return { ok: true, user: publicUser(user) };
        }
        if (!user.verificationCode || user.verificationCode !== code.trim()) {
            return reply.code(400).send({ error: "Invalid verification code" });
        }
        if (user.verificationCodeExpiresAt && new Date(user.verificationCodeExpiresAt) < new Date()) {
            return reply.code(400).send({ error: "Verification code has expired. Please request a new one." });
        }
        await usersCol().updateOne({ _id: user._id }, { $set: { verified: true }, $unset: { verificationCode: "", verificationCodeExpiresAt: "" } });
        const updatedUser = { ...user, verified: true };
        return { ok: true, user: publicUser(updatedUser) };
    });
    app.post("/resend-code", async (req, reply) => {
        const token = req.headers["x-session-token"] || "";
        if (!token)
            return reply.code(401).send({ error: "Not authenticated" });
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Invalid session" });
        const user = await usersCol().findOne({ _id: userId });
        if (!user)
            return reply.code(404).send({ error: "User not found" });
        if (user.verified) {
            return reply.code(400).send({ error: "User is already verified" });
        }
        const vCode = generateVerificationCode();
        const expires = getVerificationExpiry();
        await usersCol().updateOne({ _id: user._id }, { $set: { verificationCode: vCode, verificationCodeExpiresAt: expires } });
        sendVerificationCode(user.email, vCode).catch(() => { });
        return { ok: true, message: "Verification code sent" };
    });
    /**
     * POST /api/auth/login
     * Sign in with email + password.
     */
    app.post("/login", async (req, reply) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return reply.code(400).send({ error: "Email and password are required" });
        }
        const user = await usersCol().findOne({ email });
        if (!user) {
            return reply.code(401).send({ error: "Invalid email or password" });
        }
        if (!user.passwordHash) {
            return reply.code(401).send({
                error: "This account uses Google sign-in. Please click 'Sign in with Google'.",
            });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return reply.code(401).send({ error: "Invalid email or password" });
        }
        await checkExpiry(user);
        const token = await createSession(user._id);
        return {
            user: publicUser(user),
            token,
        };
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // ── Session routes (shared by Google + Email) ─────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * POST /api/auth/callback
     * Frontend sends the session token, we return the user object.
     */
    app.post("/callback", async (req, reply) => {
        const { token } = req.body;
        if (!token)
            return reply.code(400).send({ error: "Missing token" });
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Invalid or expired token" });
        const user = await usersCol().findOne({ _id: userId });
        if (!user)
            return reply.code(404).send({ error: "User not found" });
        await checkExpiry(user);
        return { user: publicUser(user), token };
    });
    /**
     * GET /api/auth/me
     * Returns the current user.  Requires x-session-token header.
     */
    app.get("/me", async (req, reply) => {
        const token = req.headers["x-session-token"] || "";
        const userId = await resolveSession(token);
        if (!userId)
            return reply.code(401).send({ error: "Not authenticated" });
        const user = await usersCol().findOne({ _id: userId });
        if (!user)
            return reply.code(404).send({ error: "User not found" });
        await checkExpiry(user);
        return { user: publicUser(user) };
    });
    /**
     * POST /api/auth/logout
     */
    app.post("/logout", async (req) => {
        const token = req.headers["x-session-token"] || "";
        if (token)
            await sessionsCol().deleteOne({ _id: token });
        return { ok: true };
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // ── Payment & Tier ────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    app.post("/redeem-promo", {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 hour'
            }
        }
    }, async (req, reply) => {
        const { userId, code } = req.body;
        if (!userId || !code) {
            return reply.code(400).send({ ok: false, message: "Missing userId or code." });
        }
        const user = await usersCol().findOne({ _id: userId });
        if (!user) {
            return reply.code(404).send({ ok: false, message: "User not found." });
        }
        if (code.trim().toUpperCase() !== "FREETRIAL101") {
            return reply.code(400).send({ ok: false, message: "Invalid or expired promo code." });
        }
        if (user.hasUsedTrial) {
            return reply.code(400).send({ ok: false, message: "You have already used a free trial." });
        }
        // Prevent multi-accounting from the same IP
        const ip = req.ip;
        if (ip) {
            const existingIpUser = await usersCol().findOne({ promoRedeemedIp: ip });
            if (existingIpUser && existingIpUser._id !== userId) {
                return reply.code(400).send({ ok: false, message: "A free trial has already been claimed from this device/IP." });
            }
        }
        const now = new Date();
        const expires = new Date(now);
        expires.setDate(expires.getDate() + 7); // Exactly 7 days
        await usersCol().updateOne({ _id: userId }, {
            $set: {
                tier: "pro",
                subscribedAt: now.toISOString(),
                expiresAt: expires.toISOString(),
                hasUsedTrial: true,
                promoRedeemedIp: ip, // Save IP to prevent reuse
            },
        });
        app.log.info(`User ${user.email} claimed 7-day Pro trial (FreeTrial101)`);
        return {
            ok: true,
            message: "Success! 7-day Pro trial activated.",
        };
    });
    /**
     * POST /api/auth/verify-payment
     * Accepts { userId, txHash, walletAddress? } and activates Pro for 30 days.
     */
    app.post("/verify-payment", async (req, reply) => {
        const { userId, txHash, walletAddress } = req.body;
        if (!userId || !txHash) {
            return reply.code(400).send({ ok: false, message: "Missing userId or txHash." });
        }
        const user = await usersCol().findOne({ _id: userId });
        if (!user) {
            return reply.code(404).send({ ok: false, message: "User not found." });
        }
        // Prevent double-spend / replay attacks of the same hash
        const hashAlreadyUsed = await usersCol().findOne({ proTxHash: txHash });
        if (hashAlreadyUsed) {
            return reply.code(400).send({
                ok: false,
                message: "This transaction hash has already been used for a Pro subscription."
            });
        }
        try {
            // 1. Fetch transaction receipt from Polygon
            const provider = await getPolygonProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            if (!receipt || receipt.status !== 1) {
                return reply.code(400).send({
                    ok: false,
                    message: "Transaction not found or failed on chain. Wait a moment and try again."
                });
            }
            // 2. Look for USDC Transfer log
            const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
            const PAYMENT_WALLET = "0xf2Ff454e34F15F6B4569bE5571B95B263eBE570B";
            const EXPECTED_AMOUNT = ethers.utils.parseUnits("5", 6); // 5 USDC (6 decimals)
            const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");
            let validPaymentFound = false;
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() && log.topics[0] === TRANSFER_TOPIC) {
                    const toAddress = ethers.utils.getAddress(ethers.utils.hexDataSlice(log.topics[2], 12));
                    const amount = ethers.BigNumber.from(log.data);
                    if (toAddress.toLowerCase() === PAYMENT_WALLET.toLowerCase() && amount.gte(EXPECTED_AMOUNT)) {
                        validPaymentFound = true;
                        break;
                    }
                }
            }
            if (!validPaymentFound) {
                return reply.code(400).send({
                    ok: false,
                    message: "Transaction does not contain a valid $5 USDC transfer to our payment wallet."
                });
            }
        }
        catch (err) {
            app.log.error(err, "Failed to verify transaction on-chain");
            return reply.code(500).send({
                ok: false,
                message: "Failed to verify transaction with the blockchain. Please try again later."
            });
        }
        const now = new Date();
        const expires = new Date(now);
        expires.setDate(expires.getDate() + 30);
        const updateFields = {
            tier: "pro",
            subscribedAt: now.toISOString(),
            expiresAt: expires.toISOString(),
            proTxHash: txHash,
        };
        if (walletAddress) {
            updateFields.walletAddress = walletAddress;
        }
        await usersCol().updateOne({ _id: userId }, { $set: updateFields });
        app.log.info(`User ${user.email} upgraded to Pro (tx: ${txHash}${walletAddress ? `, wallet: ${walletAddress}` : ""})`);
        // Send notification email
        sendSubscriptionNotification({
            userEmail: user.email,
            userId,
            txHash,
            walletAddress,
        }).catch(() => { });
        return {
            ok: true,
            message: "Payment verified! Your Pro subscription is now active.",
            user: {
                ...publicUser(user),
                tier: "pro",
                subscribedAt: now.toISOString(),
                expiresAt: expires.toISOString(),
            },
        };
    });
    /**
     * GET /api/auth/tier/:userId
     */
    app.get("/tier/:userId", async (req, reply) => {
        const { userId } = req.params;
        const user = await usersCol().findOne({ _id: userId });
        if (!user)
            return reply.code(404).send({ tier: "free" });
        await checkExpiry(user);
        return { tier: user.tier };
    });
}
//# sourceMappingURL=auth.js.map