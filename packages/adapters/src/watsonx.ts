import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";

let _client: WatsonXAI | null = null;

/**
 * Returns a shared WatsonXAI client singleton.
 * Reads WATSONX_API_KEY, WATSONX_PROJECT_ID, and WATSONX_URL from environment variables.
 * Throws if any required variable is missing.
 */
export function getWatsonxClient(): WatsonXAI {
    if (_client) return _client;

    const apiKey = process.env.WATSONX_API_KEY;
    const serviceUrl = process.env.WATSONX_URL;

    if (!apiKey) throw new Error("WATSONX_API_KEY environment variable is not set");
    if (!serviceUrl) throw new Error("WATSONX_URL environment variable is not set");

    _client = new WatsonXAI({
        version: "2024-05-31",
        serviceUrl,
        authenticator: new IamAuthenticator({ apikey: apiKey }),
    });

    return _client;
}
