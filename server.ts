import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase request body limits to handle base64 images
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Initialize Google Gemini AI client
// Lazy-initialized inside endpoint to handle missing key gracefully
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper function to handle Gemini API generation with exponential-backoff retries for transient errors (e.g. 503)
async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3, initialDelayMs = 1500) {
  let delayMs = initialDelayMs;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      const isTransient =
        error?.status === 503 ||
        error?.status === 429 ||
        error?.message?.includes("503") ||
        error?.message?.includes("429") ||
        error?.message?.includes("temporary") ||
        error?.message?.includes("busy") ||
        error?.message?.includes("demand") ||
        error?.message?.includes("UNAVAILABLE");

      if (isTransient && attempt < retries) {
        console.warn(`Gemini API transient error on attempt ${attempt}/${retries}: ${error?.message || error}. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
  throw new Error("Gemini API content generation exceeded maximum retries.");
}

// API endpoint for analyzing civic issues using Gemini 3.5 Flash
app.post("/api/analyze", async (req, res) => {
  try {
    const { image, description } = req.body;

    if (!description) {
      res.status(400).json({ error: "Description is required" });
      return;
    }

    const ai = getAiClient();
    const modelName = "gemini-3.5-flash";

    let promptText = "";
    let contents: any[] = [];

    if (image) {
      // Extract mimeType and base64 string from data URL
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      let mimeType = "image/jpeg";
      let base64Data = image;

      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      promptText = `
      Analyze this uploaded photo of a civic issue along with the following citizen's description:
      "${description}"

      You must analyze the image and description to verify if they are authentic, if it constitutes spam, what category it belongs to, its severity level, and a clean summary.

      Respond with a strictly formatted JSON array containing exactly one object, according to this schema:
      [{
        "category": "pothole" | "streetlight" | "garbage" | "water_leak" | "other",
        "clean_description": "<one clear sentence summarizing the issue>",
        "severity": "low" | "medium" | "high",
        "is_authentic": true or false,
        "is_spam": true or false,
        "reasoning": "<one short sentence explaining your severity/authenticity decision>"
      }]

      Guidelines:
      - category: Choose the most accurate one. If none of 'pothole', 'streetlight', 'garbage', or 'water_leak' match, use 'other'.
      - clean_description: Rewrite the user's description into a single, professional, grammatically correct sentence summarizing the civic issue.
      - severity: Rate as 'high' (e.g., severe water leaks, deep potholes on main roads, dangling power lines/dark streetlights on major intersections), 'medium' (standard streetlights out, pothole in residential area, heap of trash), or 'low' (minor issue, small trash pile, small sidewalk crack).
      - is_authentic: Determine if the image genuinely depicts a real-world physical civic issue matching the description. Set to false if it's completely unrelated, a sketch, stock art, or modified maliciously.
      - is_spam: Set to true if the content is advertising, nonsensical, abusive, obscene, or completely unrelated to a community civic complaint.
      - reasoning: Briefly explain your severity rating or choice of authenticity/spam flags in one short, clear sentence.

      Do not include any markdown formatting, markdown code blocks, or extra text. Output ONLY the JSON array.
      `;

      contents = [
        promptText,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ];
    } else {
      // Text-only report (no image provided)
      promptText = `
      Analyze this civic issue report submitted by a citizen:
      "${description}"

      You must analyze the description to verify if it constitutes spam, what category it belongs to, its severity level, and a clean summary.
      Since no photo was provided, set is_authentic to true but make sure to explain in reasoning that it is a text-only report.

      Respond with a strictly formatted JSON array containing exactly one object, according to this schema:
      [{
        "category": "pothole" | "streetlight" | "garbage" | "water_leak" | "other",
        "clean_description": "<one clear sentence summarizing the issue>",
        "severity": "low" | "medium" | "high",
        "is_authentic": true,
        "is_spam": true or false,
        "reasoning": "<one short sentence explaining your severity decision, noting that no image was attached>"
      }]

      Guidelines:
      - category: Choose the most accurate one. If none of 'pothole', 'streetlight', 'garbage', or 'water_leak' match, use 'other'.
      - clean_description: Rewrite the user's description into a single, professional, grammatically correct sentence summarizing the civic issue.
      - severity: Rate as 'high' (e.g., severe water leaks, deep potholes on main roads, dangling power lines/dark streetlights on major intersections), 'medium' (standard streetlights out, pothole in residential area, heap of trash), or 'low' (minor issue, small trash pile, small sidewalk crack).
      - is_authentic: Since there is no image, set to true.
      - is_spam: Set to true if the text description is advertising, nonsensical, abusive, obscene, or completely unrelated to a community civic complaint.
      - reasoning: Briefly explain your severity rating or choice of spam flags in one short, clear sentence, noting that no photo was provided.

      Do not include any markdown formatting, markdown code blocks, or extra text. Output ONLY the JSON array.
      `;

      contents = [promptText];
    }

    const response = await generateContentWithRetry(ai, {
      model: modelName,
      contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    // Parse the JSON array
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        res.json({ success: true, analysis: parsed[0] });
      } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        res.json({ success: true, analysis: parsed });
      } else {
        throw new Error("Invalid format returned from Gemini model");
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", text);
      // Fallback in case parsing fails or is slightly malformed
      res.json({
        success: true,
        analysis: {
          category: "other",
          clean_description: description.substring(0, 100),
          severity: "medium",
          is_authentic: true,
          is_spam: false,
          reasoning: "Failed to parse detailed AI breakdown, using fallback values.",
        },
      });
    }
  } catch (error: any) {
    console.error("Error analyzing issue with Gemini:", error);
    res.status(500).json({
      error: "Failed to analyze civic issue. " + (error?.message || ""),
    });
  }
});

// API endpoint for generating a briefing for hot zones using Gemini 3.5 Flash
app.post("/api/hotzone-briefing", async (req, res) => {
  try {
    const { issues, areaName } = req.body;

    if (!issues || !Array.isArray(issues)) {
      res.status(400).json({ error: "Issues array is required" });
      return;
    }

    const ai = getAiClient();
    const modelName = "gemini-3.5-flash";

    const issuesJsonStr = JSON.stringify(
      issues.map((i) => ({
        category: i.category,
        severity: i.severity,
        clean_description: i.clean_description || i.description,
        upvotes: i.upvotes || 0,
      })),
      null,
      2
    );

    const promptText = `You are generating a briefing for a local government authority.

Given this list of civic issues in the same area:
${issuesJsonStr}

Also add one sentence predicting whether this issue is likely to worsen or recur if left unresolved, based on the severity and report pattern. Write a single paragraph (max 60 words) summarizing the situation for the authority to act on. Mention total number of reports, the most common issue category, and the highest severity issue. Be direct and factual, no fluff.`;

    const response = await generateContentWithRetry(ai, {
      model: modelName,
      contents: [promptText],
    });

    const text = response.text || "No briefing text returned from AI.";
    res.json({ success: true, briefing: text.trim() });
  } catch (error: any) {
    console.error("Error generating hotzone briefing with Gemini:", error);
    res.status(500).json({
      error: "Failed to generate briefing. " + (error?.message || ""),
    });
  }
});

// Setup Vite development server or serve static production bundle
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

initServer();
