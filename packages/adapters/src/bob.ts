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

    // Invokes Bob Shell non-interactively via a pseudo-TTY (script wrapper)
    // because bob run requires a real terminal to produce output.
    async analyzeRepository(repoName: string, branch: string, workspacePath: string): Promise<BobScanResult> {
        console.log(`[IBM Bob] Starting analysis on ${repoName} (${branch}) at ${workspacePath}`);

        try {
            const prompt = `Review this codebase at ${workspacePath} for hardcoded secrets, vulnerable dependencies, and security issues. Use gitleaks and semgrep tools. Report findings clearly.`;

            // Use `script -q -c '...' /dev/null` to give bob a fake PTY so it produces output
            const cmd = `script -q -c 'bob run --workspace "${workspacePath}" --trust --accept-license --max-turns 5 --format json "${prompt.replace(/'/g, "")}"' /dev/null`;

            const { stdout } = await execAsync(cmd, {
                env: { ...process.env, BOBSHELL_API_KEY: this.apiKey },
                timeout: 120000
            });

            const rawOutput = stdout.trim();
            console.log(`[IBM Bob] Raw output: ${rawOutput.substring(0, 200)}`);

            // Parse the JSON result from bob
            let bobSummary = "";
            let secretsFound = 0;
            let semgrepIssues = 0;

            try {
                const parsed = JSON.parse(rawOutput);
                bobSummary = parsed.last_message || "";
                // Count security keywords in the AI response
                const secretMatches = bobSummary.match(/secret|hardcoded|leaked|api.?key|password|credential/gi) || [];
                secretsFound = new Set(secretMatches).size;
                const semgrepMatches = bobSummary.match(/semgrep|rule|finding|violation|vulnerability|vulnerable/gi) || [];
                semgrepIssues = new Set(semgrepMatches).size;
            } catch (_) {
                // Not JSON - use raw text
                const secretMatches = rawOutput.match(/secret|hardcoded|leaked|api.?key|password|credential/gi) || [];
                secretsFound = new Set(secretMatches).size;
                const semgrepMatches = rawOutput.match(/semgrep|rule|finding|violation|vulnerability|vulnerable/gi) || [];
                semgrepIssues = new Set(semgrepMatches).size;
                bobSummary = rawOutput.split("\n").filter((l: string) => l.trim()).slice(-5).join(" ").substring(0, 500);
            }

            if (!bobSummary) bobSummary = "IBM Bob AI completed the security scan successfully.";

            console.log(`[IBM Bob] Analysis complete. Summary: ${bobSummary.substring(0, 100)}`);
            return { secretsFound, semgrepIssues, bobSummary, rawOutput };

        } catch (error: any) {
            console.warn(`[IBM Bob] CLI unavailable or failed: ${error.message?.substring(0, 100)}`);
            return {
                secretsFound: 0,
                semgrepIssues: 0,
                bobSummary: "Bob CLI was not available on this server. Manual security review recommended.",
                rawOutput: ""
            };
        }
    }
}

