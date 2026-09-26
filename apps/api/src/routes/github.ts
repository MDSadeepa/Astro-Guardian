import { Router, Request, Response } from "express";
import { GitHubAdapter } from "@astro-guardian/adapters";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const APP_ID = process.env.GITHUB_APP_ID || "";
const PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n') : "";

const github = new GitHubAdapter(APP_ID, PRIVATE_KEY);

router.get("/installations", async (req: Request, res: Response) => {
    try {
        if (!APP_ID || !PRIVATE_KEY) throw new Error("GitHub App credentials missing in .env");
        const installations = await github.getInstallations();
        res.json(installations);
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
