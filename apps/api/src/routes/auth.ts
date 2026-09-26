import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const JWT_SECRET = process.env.SESSION_SECRET || "default_secret";

// 1. Redirect user to GitHub for login
router.get("/github", (req, res) => {
    const redirectUri = "http://51.79.165.228/api/v1/auth/github/callback";
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}`;
    res.redirect(githubAuthUrl);
});

// 2. GitHub redirects back here with a "code"
router.get("/github/callback", async (req, res) => {
    const code = req.query.code;
    
    if (!code) {
         res.status(400).send("No code provided");
         return;
    }

    try {
        // Exchange code for Access Token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code
            })
        });
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) throw new Error("Failed to get access token");

        // Fetch User Profile
        const userResponse = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();

        // Create JWT Session
        const token = jwt.sign(
            { id: userData.id, username: userData.login, avatar: userData.avatar_url, githubToken: accessToken }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Set HttpOnly Cookie (Page 11 requirement)
        res.cookie("guardian_session", token, {
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        });

        // Redirect back to frontend
        res.redirect("http://51.79.165.228");

    } catch (error: any) {
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});

// 3. Return the current user based on HttpOnly cookie
router.get("/me", (req, res) => {
    const token = req.cookies.guardian_session;
    if (!token) {
        res.status(401).json({ error: "Not logged in" });
        return;
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch (err) {
        res.status(401).json({ error: "Invalid session" });
    }
});

// 4. Logout
router.post("/logout", (req, res) => {
    res.clearCookie("guardian_session");
    res.json({ message: "Logged out" });
});

export default router;
