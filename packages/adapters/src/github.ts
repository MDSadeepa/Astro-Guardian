import jwt from "jsonwebtoken";

export class GitHubAdapter {
    private appId: string;
    private privateKey: string;

    constructor(appId: string, privateKey: string) {
        this.appId = appId;
        this.privateKey = privateKey;
    }

    private generateJWT(): string {
        const payload = {
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + (10 * 60),
            iss: this.appId
        };
        return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
    }

    private async request(path: string, token: string, method: string = "GET", body?: any) {
        const url = `https://api.github.com${path}`;
        const response = await fetch(url, {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Astro-Guardian",
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`GitHub API Error (${response.status}): ${errText}`);
        }
        return response.json();
    }

    async getInstallations() {
        const token = this.generateJWT();
        return this.request("/app/installations", token);
    }

    async getInstallationToken(installationId: number): Promise<string> {
        const token = this.generateJWT();
        const data = await this.request(`/app/installations/${installationId}/access_tokens`, token, "POST");
        return data.token;
    }

    async getRepositories(installationId: number) {
        const token = await this.getInstallationToken(installationId);
        const data = await this.request("/installation/repositories", token);
        return data.repositories;
    }

    async getBranches(installationId: number, owner: string, repo: string) {
        const token = await this.getInstallationToken(installationId);
        return this.request(`/repos/${owner}/${repo}/branches`, token);
    }

    // PHASE 6: AUTOMATED PULL REQUESTS
    async createPullRequest(installationId: number, owner: string, repo: string, title: string, head: string, base: string, bodyText: string) {
        const token = await this.getInstallationToken(installationId);
        return this.request(`/repos/${owner}/${repo}/pulls`, token, "POST", {
            title, head, base, body: bodyText
        });
    }
}
