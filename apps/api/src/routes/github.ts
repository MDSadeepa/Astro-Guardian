import { Router, Request, Response } from "express";
import { GitHubAdapter } from "@astro-guardian/adapters";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../db";

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
        const dbUserId = decoded.id; // Extracted from our new JWT

        if (!APP_ID || !PRIVATE_KEY) throw new Error("GitHub App credentials missing in .env");
        
        const installations = await github.getInstallations();
        
        // Filter installations that belong to the logged-in user
        const myInstallations = installations.filter((inst: any) => inst.account.login === username);
        
        // [NEW] Sync installations to Prisma Database
        for (const inst of myInstallations) {
            await prisma.installation.upsert({
                where: { githubId: inst.id.toString() },
                update: { userId: dbUserId },
                create: { githubId: inst.id.toString(), userId: dbUserId }
            });
        }
        
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
        
        // Fetch from GitHub App
        const repos = await github.getRepositories(Number(installationId));
        
        // [NEW] Find the synced installation in DB
        const inst = await prisma.installation.findUnique({
             where: { githubId: installationId.toString() }
        });
        
        // [NEW] Sync Repositories to Database
        if (inst) {
            for (const repo of repos) {
                await prisma.repository.upsert({
                    where: { githubId: repo.id.toString() },
                    update: { name: repo.name, owner: repo.owner.login, defaultBranch: repo.default_branch },
                    create: { 
                         githubId: repo.id.toString(), 
                         name: repo.name, 
                         owner: repo.owner.login, 
                         defaultBranch: repo.default_branch,
                         installationId: inst.id
                    }
                });
            }
        }
        
        // [NEW] Fetch from DB to inject our Custom `healthScore`
        const dbRepos = await prisma.repository.findMany({
            where: { installationId: inst?.id }
        });

        const mappedRepos = repos.map((r: any) => {
             const dbRepo = dbRepos.find(d => d.githubId === r.id.toString());
             return { ...r, healthScore: dbRepo?.healthScore ?? 100 };
        });
        
        res.json(mappedRepos);
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
