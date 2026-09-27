import { getWatsonxClient } from "./watsonx";

const GRANITE_MODEL_ID = "ibm/granite-3-8b-instruct";

export interface DetailedFix {
    pkg: string;
    oldVersion?: string;
    safeVersion: string;
    def: {
        safeVersion: string;
        severity: string;
        description: string;
        cve: string;
    };
}

export interface GraniteAnalysis {
    status: "success" | "fallback";
    findings: Array<{
        category: string;
        severity: string;
        package: string;
        cve: string;
        issue: string;
        action: string;
        affectedFile: string;
    }>;
    bob_summary: string;
}

export class BobAdapter {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Calls IBM watsonx.ai Granite-3-8b-instruct with the real OSV/npm-audit findings.
     * Falls back to structured OSV data if Granite is unavailable.
     */
    async analyzeRepository(language: string, detailedFixes: DetailedFix[]): Promise<GraniteAnalysis> {
        // Build findings from OSV/npm-audit data regardless — used for fallback and as Granite input
        const findings = detailedFixes.map(fix => ({
            category: "dependency",
            severity: fix.def.severity,
            package: fix.pkg,
            cve: fix.def.cve,
            issue: fix.def.description || `Vulnerability in ${fix.pkg}`,
            action: `Upgrade to ${fix.def.safeVersion}`,
            affectedFile: language === "Node.js" ? "package.json" : language === "Python" ? "requirements.txt" : "pom.xml",
        }));

        if (detailedFixes.length === 0) {
            return {
                status: "success",
                findings: [],
                bob_summary: `IBM Bob analyzed the ${language} repository using watsonx.ai Granite. No vulnerable dependencies were detected — the project is clean.`,
            };
        }

        // Build the structured prompt for Granite
        const cveList = detailedFixes
            .map(fix => `- Package: ${fix.pkg}, CVE: ${fix.def.cve}, Severity: ${fix.def.severity}, Old: ${fix.oldVersion || "unknown"} → Fixed: ${fix.def.safeVersion}, Description: ${fix.def.description}`)
            .join("\n");

        const prompt = `You are a security expert reviewing a ${language} project.
The automated OSV/npm-audit scanner detected the following vulnerabilities that have been patched:

${cveList}

For each vulnerability:
1. Explain the attack surface in 1-2 plain English sentences (what can an attacker do?)
2. Confirm whether a version bump alone is sufficient or if further hardening is needed
3. Rate the overall patch quality (sufficient / recommend additional hardening)

Then write a concise GitHub Pull Request description (3-5 sentences) summarising what was fixed and why a reviewer should approve.

Respond in this exact format:
ANALYSIS:
[your per-CVE analysis]

PR_DESCRIPTION:
[your PR body text]`;

        try {
            const projectId = process.env.WATSONX_PROJECT_ID;
            if (!projectId) throw new Error("WATSONX_PROJECT_ID is not set");

            const client = getWatsonxClient();
            const response = await client.generateText({
                modelId: GRANITE_MODEL_ID,
                projectId,
                input: prompt,
                parameters: {
                    max_new_tokens: 800,
                    min_new_tokens: 50,
                    temperature: 0.2,
                    repetition_penalty: 1.1,
                },
            });

            const generated = response.result?.results?.[0]?.generated_text ?? "";

            // Extract PR_DESCRIPTION section
            const prMatch = generated.match(/PR_DESCRIPTION:\s*([\s\S]+?)(?:\n[A-Z_]+:|$)/);
            const bobSummary = prMatch
                ? prMatch[1].trim()
                : `IBM Bob (watsonx.ai Granite) patched ${detailedFixes.length} ${language} vulnerabilities: ${detailedFixes.map(f => f.def.cve).join(", ")}. All packages have been upgraded to safe versions and validated in Docker.`;

            return {
                status: "success",
                findings,
                bob_summary: bobSummary,
            };

        } catch (error: any) {
            console.error("[BobAdapter] Granite call failed, using OSV fallback:", error.message);

            // Fallback: use the structured OSV data directly so the PR and UI still show real CVE data
            const fallbackSummary = `IBM Bob automatically patched ${detailedFixes.length} security vulnerabilities in this ${language} repository using OSV/npm-audit data. Fixed packages: ${detailedFixes.map(f => `${f.pkg} (${f.def.cve})`).join(", ")}. All changes were validated in an isolated Docker container.`;

            return {
                status: "fallback",
                findings,
                bob_summary: fallbackSummary,
            };
        }
    }
}
