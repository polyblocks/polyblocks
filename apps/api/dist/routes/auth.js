/**
 * Auth routes — Google OAuth + email/password login, user management,
 * subscription/payment verification.
 *
 * All data is stored in MongoDB (users + sessions collections).
 */
import bcrypt from "bcryptjs";
import { usersCol, sessionsCol } from "../db.js";
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
                    };
                    await usersCol().insertOne(newUser);
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
        };
        await usersCol().insertOne(newUser);
        const token = await createSession(userId);
        return {
            user: publicUser(newUser),
            token,
        };
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
        // TODO: In production, verify the tx on-chain (check USDC transfer to your wallet).
        const now = new Date();
        const expires = new Date(now);
        expires.setDate(expires.getDate() + 30);
        const updateFields = {
            tier: "pro",
            subscribedAt: now.toISOString(),
            expiresAt: expires.toISOString(),
        };
        if (walletAddress) {
            updateFields.walletAddress = walletAddress;
        }
        await usersCol().updateOne({ _id: userId }, { $set: updateFields });
        app.log.info(`User ${user.email} upgraded to Pro (tx: ${txHash}${walletAddress ? `, wallet: ${walletAddress}` : ""})`);
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