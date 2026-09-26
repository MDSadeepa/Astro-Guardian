import { Router, Request, Response } from "express";
import { GitHubAdapter } from "@guardian/adapters";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const APP_ID = process.env.GITHUB_APP_ID || "";
const PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n') : "";
const JWT_SECRET = process.env.SESSION_SECRET || "default_secret";

const github = new GitHubAdapter(APP_ID, PRIVATE_KEY);

router.get("/installations", async (req: Request, res: Response) => {
    try {
        const token = req.cookies.guardian_session;
        if (!token) {
            res.status(401).json({ error: "Not logged in" });
            return;
        }
        
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const username = decoded.username;

        if (!APP_ID || !PRIVATE_KEY) throw new Error("GitHub App credentials missing in .env");
        
        const installations = await github.getInstallations();
        
        // HUGE FIX: Only return the installations that belong to the logged-in user!
        const myInstallations = installations.filter((inst: any) => inst.account.login === username);
        
        res.json(myInstallations);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/repositories", async (req: Request, res: Response) => {
    try {
        const { installationId } = req.query;
        if (!installationId) {
            res.status(400).json({ error: "Missing installationId query param" });
            return;
        }
        const repos = await github.getRepositories(Number(installationId));
        res.json(repos);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/:owner/:repo/branches", async (req: Request, res: Response) => {
    try {
        const { installationId } = req.query;
        const { owner, repo } = req.params;
        if (!installationId) {
             res.status(400).json({ error: "Missing installationId query param" });
             return;
        }
        const branches = await github.getBranches(Number(installationId), owner, repo);
        res.json(branches);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
