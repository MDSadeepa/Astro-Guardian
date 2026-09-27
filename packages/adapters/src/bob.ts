import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface BobScanResult {
    secretsFound: number;
    semgrepIssues: number;
    bobSummary: string;
    rawOutput: string;
}

export class BobAdapter {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // Invokes Bob Shell non-interactively to review the workspace for secrets,
    // vulnerable dependencies, and security issues using gitleaks + semgrep.
    async analyzeRepository(repoName: string, branch: string, workspacePath: string): Promise<BobScanResult> {
        console.log(`[IBM Bob] Starting analysis on ${repoName} (${branch}) at ${workspacePath}`);

        // Ensure license is accepted before the real scan call — required for
        // non-interactive mode on first run. This is a no-op if already accepted.
        try {
            await execAsync(`bob --auth-method api-key --accept-license -p "ping"`, {
                cwd: workspacePath,
                env: { ...process.env, BOBSHELL_API_KEY: this.apiKey },
                timeout: 15000
            });
        } catch (_) { /* ignore — proceeds even if ping fails */ }

        try {
            const prompt = `Review this codebase for hardcoded secrets, vulnerable dependencies, and security issues. Use gitleaks and semgrep tools available on this server.`;

            const { stdout } = await execAsync(
                `bob --auth-method api-key --accept-license -p "${prompt}"`,
                {
                    cwd: workspacePath,
                    env: { ...process.env, BOBSHELL_API_KEY: this.apiKey },
                    timeout: 120000  // 2 minutes max for Bob to run tools
                }
            );

            const rawOutput = stdout.trim();

            // Count secret findings from gitleaks output Bob produces
            const secretMatches = rawOutput.match(/Secret|secret|hardcoded|leaked|api.?key|password/gi) || [];
            const secretsFound = new Set(secretMatches).size;

            // Count semgrep findings
            const semgrepMatches = rawOutput.match(/semgrep|rule|finding|violation/gi) || [];
            const semgrepIssues = new Set(semgrepMatches).size;

            // Extract a clean summary — last paragraph Bob writes, or full output if short
            const lines = rawOutput.split("\n").filter(l => l.trim());
            const bobSummary = lines.length > 0
                ? lines.slice(-5).join(" ").replace(/\s+/g, " ").trim()
                : "Bob CLI completed analysis. No structured summary returned.";

            console.log(`[IBM Bob] Analysis complete. Raw output length: ${rawOutput.length} chars`);

            return { secretsFound, semgrepIssues, bobSummary, rawOutput };

        } catch (error: any) {
            // Bob CLI not available or timed out — fail gracefully
            console.warn(`[IBM Bob] CLI unavailable or failed: ${error.message}`);
            return {
                secretsFound: 0,
                semgrepIssues: 0,
                bobSummary: "Bob CLI was not available on this server. Manual security review recommended.",
                rawOutput: ""
            };
        }
    }
}
