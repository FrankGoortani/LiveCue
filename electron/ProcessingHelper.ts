// ProcessingHelper.ts
import fs from "node:fs";
import path from "node:path";
import { ScreenshotHelper } from "./ScreenshotHelper";
import { IProcessingHelperDeps } from "./main";
import * as axios from "axios";
import { app, BrowserWindow, dialog } from "electron";
import { OpenAI } from "openai";
import { configHelper } from "./ConfigHelper";
import Anthropic from "@anthropic-ai/sdk";

// Interface for Gemini API requests
interface GeminiMessage {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}
interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<{
    type: "text" | "image";
    text?: string;
    source?: {
      type: "base64";
      media_type: string;
      data: string;
    };
  }>;
}
export class ProcessingHelper {
  private deps: IProcessingHelperDeps;
  private screenshotHelper: ScreenshotHelper;
  private openaiClient: OpenAI | null = null;
  private geminiApiKey: string | null = null;
  private anthropicClient: Anthropic | null = null;

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null;
  private currentExtraProcessingAbortController: AbortController | null = null;

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps;
    this.screenshotHelper = deps.getScreenshotHelper();

    // Initialize AI client based on config
    this.initializeAIClient();

    // Listen for config changes to re-initialize the AI client
    configHelper.on("config-updated", () => {
      this.initializeAIClient();
    });
  }

  /**
   * Initialize or reinitialize the AI client with current config
   */
  private initializeAIClient(): void {
    try {
      const config = configHelper.loadConfig();

      if (config.apiProvider === "openai") {
        if (config.apiKey) {
          this.openaiClient = new OpenAI({
            apiKey: config.apiKey,
            timeout: 60000, // 60 second timeout
            maxRetries: 2, // Retry up to 2 times
          });
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.log("OpenAI client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, OpenAI client not initialized");
        }
      } else if (config.apiProvider === "gemini") {
        // Gemini client initialization
        this.openaiClient = null;
        this.anthropicClient = null;
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey;
          console.log("Gemini API key set successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Gemini client not initialized");
        }
      } else if (config.apiProvider === "anthropic") {
        // Reset other clients
        this.openaiClient = null;
        this.geminiApiKey = null;
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2,
          });
          console.log("Anthropic client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn(
            "No API key available, Anthropic client not initialized"
          );
        }
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error);
      this.openaiClient = null;
      this.geminiApiKey = null;
      this.anthropicClient = null;
    }
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      );
      if (isInitialized) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }
    throw new Error("App failed to initialize after 5 seconds");
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return 999; // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow);
      return 999; // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error);
      return 999; // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }

      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow);
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          );

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }

      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error);
      return "python";
    }
  }

  public async processScreenshots(conversationId?: string, messages?: any[]): Promise<void> {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;

    const config = configHelper.loadConfig();

    // First verify we have a valid AI client
    if (config.apiProvider === "openai" && !this.openaiClient) {
      this.initializeAIClient();

      if (!this.openaiClient) {
        console.error("OpenAI client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
      this.initializeAIClient();

      if (!this.geminiApiKey) {
        console.error("Gemini API key not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "anthropic" && !this.anthropicClient) {
      // Add check for Anthropic client
      this.initializeAIClient();

      if (!this.anthropicClient) {
        console.error("Anthropic client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    }

    const view = this.deps.getView();
    console.log("Processing screenshots in view:", view);

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START);
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue();
      console.log("Processing main queue screenshots:", screenshotQueue);

      // Get any existing screenshots
      const existingScreenshots = screenshotQueue
        ? screenshotQueue.filter((path) => fs.existsSync(path))
        : [];

      // Check if we have messages to process
      const hasMessages = Array.isArray(messages) && messages.length > 0;

      // If we have no screenshots and no messages, notify the user
      if (existingScreenshots.length === 0 && !hasMessages) {
        console.log("No screenshots or messages found");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController();
        const { signal } = this.currentProcessingAbortController;

        // Only process screenshots if they exist
        const screenshots = existingScreenshots.length > 0 ? await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString("base64"),
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        ) : [];

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots ? screenshots.filter(Boolean) : [];

        // Check if we have conversation messages to include in the prompt
        const hasMessages = Array.isArray(messages) && messages.length > 0;

        // Only require valid screenshots if there are no messages
        if (validScreenshots.length === 0 && !hasMessages) {
          throw new Error("Failed to load screenshot data and no messages available");
        }

        const result = await this.processScreenshotsHelper(
          validScreenshots,
          signal,
          conversationId,
          messages
        );

        if (!result.success) {
          console.log("Processing failed:", result.error);
          if (
            result.error?.includes("API Key") ||
            result.error?.includes("OpenAI") ||
            result.error?.includes("Gemini")
          ) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            );
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            );
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error");
          this.deps.setView("queue");
          return;
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing");
        // Removed duplicate SOLUTION_SUCCESS event emission that was causing solutions to be added twice
        // The event is already emitted in processScreenshotsHelper
        this.deps.setView("solutions");
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        );
        console.error("Processing error:", error);
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          );
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          );
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error");
        this.deps.setView("queue");
      } finally {
        this.currentProcessingAbortController = null;
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue();
      console.log("Processing extra queue screenshots:", extraScreenshotQueue);

      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);

        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter((path) =>
        fs.existsSync(path)
      );
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START);

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController();
      const { signal } = this.currentExtraProcessingAbortController;

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots,
        ];

        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }

              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString("base64"),
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        );

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);

        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }

        console.log(
          "Combined screenshots for processing:",
          validScreenshots.map((s) => s.path)
        );

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal,
          conversationId
        );

        if (result.success) {
          this.deps.setHasDebugged(true);
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          );
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          );
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          );
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          );
        }
      } finally {
        this.currentExtraProcessingAbortController = null;
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    conversationId?: string,
    messages?: any[]
  ) {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();

      // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
      const imageDataList = screenshots.map((screenshot) => screenshot.data);

      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20,
        });
      }

      let problemInfo;

      if (config.apiProvider === "openai") {
        // Verify OpenAI client
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize

          if (!this.openaiClient) {
            return {
              success: false,
              error:
                "OpenAI API key not configured or invalid. Please check your settings.",
            };
          }
        }

        // Extract conversation context from messages if available
        let conversationContext = "";
        const hasConversationMessages = Array.isArray(messages) && messages.length > 0;

        if (hasConversationMessages) {
          // Get the last 20 messages at most
          const recentMessages = messages.slice(-20);

          // Format the conversation messages
          conversationContext = recentMessages.map(msg => {
            if (msg.type === 'text') {
              return `User: ${(msg as any).content}`;
            } else if (msg.type === 'solution') {
              return `Assistant: Generated solution in ${(msg as any).language || language}`;
            }
            return "";
          }).filter(text => text.length > 0).join("\n\n");

          // Add a heading if we have conversation context
          if (conversationContext) {
            conversationContext = `\n\nRECENT CONVERSATION CONTEXT:\n${conversationContext}\n\n`;
          }
        }

        // Use OpenAI for processing
        const openaiMessages = [
          {
            role: "system" as const,
            content:
              imageDataList.length > 0
                ? "You are a coding challenge interpreter. Follow these steps: 1- Review everything in the screenshot. 2- Find the problem in the screenshot we want to solve. 3- Follow the pattern and language requested in the screenshot; if language is not clear, use the preferred language provided. 4- Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output, language. Just return the structured JSON without any other text."
                : "You are a coding challenge interpreter. Analyze the conversation context provided. Extract the coding problem details and return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output, language. Just return the structured JSON without any other text.",
          },
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: imageDataList.length > 0
                ? `Review these screenshots carefully. Find the problem we need to solve. First, look for any language explicitly mentioned in the screenshot and use that. Only if no language is specified in the screenshot, fall back to ${language}.${conversationContext} \n Return in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback).`
                : `Based on the conversation context provided${conversationContext ? "" : " (if any)"}, extract the coding problem details. Use ${language} as the programming language unless another language is clearly specified in the context. \n Return in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback).`,
              },
              ...(imageDataList.length > 0 ? imageDataList.map((data) => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` },
              })) : []),
            ],
          },
        ];

        // Send to OpenAI Vision API
        const extractionResponse =
          await this.openaiClient.chat.completions.create({
            model: config.extractionModel || "gpt-4o",
            messages: openaiMessages,
            max_tokens: 16384,
            temperature: 0.1,
          });

        // Parse the response
        try {
          const responseText = extractionResponse.choices[0].message.content;
          // Handle when OpenAI might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, "").trim();

          // Check if the response looks like an error message rather than JSON
          if (jsonText.startsWith("I'm sorry") || !jsonText.includes("{")) {
            throw new Error("OpenAI returned an error message instead of JSON: " + jsonText);
          }

          try {
            problemInfo = JSON.parse(jsonText);
          } catch (parseError) {
            // If JSON parsing fails, create a structured response with the text content
            console.log("Could not parse response as JSON, creating structured response", parseError);
            problemInfo = {
              problem_statement: responseText,
              constraints: "No specific constraints provided",
              example_input: "No example input provided",
              example_output: "No example output provided",
              language: language
            };
          }
        } catch (error) {
          console.error("Error parsing OpenAI response:", error);
          return {
            success: false,
            error:
              "Failed to parse problem information. Please try again or use clearer screenshots.",
          };
        }
      } else if (config.apiProvider === "gemini") {
        // Use Gemini API
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings.",
          };
        }

        try {
          // Extract conversation context from messages if available
          let conversationContext = "";
          const hasConversationMessages = Array.isArray(messages) && messages.length > 0;

          if (hasConversationMessages) {
            // Get the last 20 messages at most
            const recentMessages = messages.slice(-20);

            // Format the conversation messages
            conversationContext = recentMessages.map(msg => {
              if (msg.type === 'text') {
                return `User: ${(msg as any).content}`;
              } else if (msg.type === 'solution') {
                return `Assistant: Generated solution in ${(msg as any).language || language}`;
              }
              return "";
            }).filter(text => text.length > 0).join("\n\n");

            // Add a heading if we have conversation context
            if (conversationContext) {
              conversationContext = `\n\nRECENT CONVERSATION CONTEXT:\n${conversationContext}\n\n`;
            }
          }

          // Create Gemini message structure
          const geminiMessages: GeminiMessage[] = [
            {
              role: "user",
              parts: [
                {
                  text: imageDataList.length > 0
                    ? `Follow these steps: 1- Review everything in these screenshots carefully. 2- Find the problem we need to solve. 3- Prioritize any language explicitly mentioned in the screenshot; only if no language is specified in the screenshot, fall back to ${language}. 4- Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback). Just return the structured JSON without any other text.${conversationContext}`
                    : `Based on the conversation context provided${conversationContext ? "" : " (if any)"}, extract the coding problem details. Use ${language} as the programming language unless another language is clearly specified in the context. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback). Just return the structured JSON without any other text.${conversationContext}`,
                },
                ...(imageDataList.length > 0 ? imageDataList.map((data) => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data,
                  },
                })) : []),
              ],
            },
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${
              config.extractionModel || "gemini-2.0-flash"
            }:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 16384,
              },
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;

          if (
            !responseData.candidates ||
            responseData.candidates.length === 0
          ) {
            throw new Error("Empty response from Gemini API");
          }

          const responseText = responseData.candidates[0].content.parts[0].text;

          // Handle when Gemini might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, "").trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error using Gemini API:", error);
          return {
            success: false,
            error:
              "Failed to process with Gemini API. Please check your API key or try again later.",
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error:
              "Anthropic API key not configured. Please check your settings.",
          };
        }

        try {
          // Extract conversation context from messages if available
          let conversationContext = "";
          const hasConversationMessages = Array.isArray(messages) && messages.length > 0;

          if (hasConversationMessages) {
            // Get the last 20 messages at most
            const recentMessages = messages.slice(-20);

            // Format the conversation messages
            conversationContext = recentMessages.map(msg => {
              const typedMsg = msg as any;
              if (typedMsg.type === 'text') {
                return `User: ${typedMsg.content}`;
              } else if (typedMsg.type === 'solution') {
                return `Assistant: Generated solution in ${typedMsg.language || language}`;
              }
              return "";
            }).filter(text => text.length > 0).join("\n\n");

            // Add a heading if we have conversation context
            if (conversationContext) {
              conversationContext = `\n\nRECENT CONVERSATION CONTEXT:\n${conversationContext}\n\n`;
            }
          }

          const anthropicMessages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: imageDataList.length > 0
                    ? `Follow these steps: 1- Review everything in these screenshots carefully. 2- Find the problem we need to solve. 3- Prioritize any language explicitly mentioned in the screenshot; only if no language is specified in the screenshot, fall back to ${language}. 4- Return in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback).${conversationContext}`
                    : `Based on the conversation context provided${conversationContext ? "" : " (if any)"}, extract the coding problem details. Use ${language} as the programming language unless another language is clearly specified in the context. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output, language (include the programming language you identified or the fallback).${conversationContext}`,
                },
                ...(imageDataList.length > 0 ? imageDataList.map((data) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data,
                  },
                })) : []),
              ],
            },
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.extractionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 16384,
            messages: anthropicMessages,
            temperature: 0.1,
          });

          const responseText = (
            response.content[0] as { type: "text"; text: string }
          ).text;
          const jsonText = responseText.replace(/```json|```/g, "").trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error: any) {
          console.error("Error using Anthropic API:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error:
                "Claude API rate limit exceeded. Please wait a few minutes before trying again.",
            };
          } else if (
            error.status === 413 ||
            (error.message && error.message.includes("token"))
          ) {
            return {
              success: false,
              error:
                "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs.",
            };
          }

          return {
            success: false,
            error:
              "Failed to process with Anthropic API. Please check your API key or try again later.",
          };
        }
      }

      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message:
            "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40,
        });
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);

      // Include conversation ID if provided
      if (conversationId) {
        problemInfo.conversationId = conversationId;
      }

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal, conversationId);
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();

          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100,
          });

          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user.",
        };
      }

      // Handle OpenAI API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings.",
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error:
            "OpenAI API rate limit exceeded or insufficient credits. Please try again later.",
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "OpenAI server error. Please try again later.",
        };
      }

      console.error("API Error Details:", error);
      return {
        success: false,
        error:
          error.message || "Failed to process screenshots. Please try again.",
      };
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal, conversationId?: string) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const defaultLanguage = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Determine which language to use - prefer the one detected from OCR if available
      const language = problemInfo.language || defaultLanguage;

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Creating optimal solution with detailed explanations...",
          progress: 60,
        });
      }

      // Create prompt for solution generation
      const promptText = `
Generate a STEP-BY-STEP solution for the following coding problem, focusing on OPTIMAL time and space complexity:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

IMPORTANT: I want a progressive, step-by-step solution that builds toward the optimal approach. Break down your solution into multiple discrete steps (at least 3-4 steps) that gradually develop the complete solution.

For each step, include:
1. Step Title: A short, descriptive title for the step (e.g., "Understanding the problem", "Creating a basic approach", "Optimizing the solution")
2. Explanation: A clear explanation of what this step accomplishes
3. Code: The code snippet implementing this particular step (can be partial code)

The final step must contain the complete, optimized solution with all necessary components.

Format each step using this EXACT structure to ensure proper parsing:
---STEP_TITLE: [Title of the step]
---STEP_EXPLANATION: [Explanation text]
---STEP_CODE:
\`\`\`${language}
[Code for this step]
\`\`\`

Additionally, include these sections after all the steps:
1. Your Thoughts: A list of key insights, including why you chose this approach over other possibilities
2. Time complexity: O(X) with a detailed explanation (at least 2 sentences) that justifies why this time complexity is optimal for the problem
3. Space complexity: O(X) with a detailed explanation (at least 2 sentences) that explains any trade-offs made between time and space efficiency

Your solution must be:
1. Optimal for both time and space complexity (or explain necessary trade-offs)
2. Well-commented to explain critical steps
3. Handle all edge cases
4. Include explicit reasoning for why your approach provides the best complexity balance

Example steps could include:
- Understanding the problem (analyzing constraints, edge cases)
- Creating a basic approach (possibly brute force)
- Optimizing the algorithm
- Final complete solution
`;

      let responseContent;

      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings.",
          };
        }

        // Send to OpenAI API
        const solutionResponse =
          await this.openaiClient.chat.completions.create({
            model: config.solutionModel || "gpt-4o",
            messages: [
              {
                role: "system",
                content:
                  "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations.",
              },
              { role: "user", content: promptText },
            ],
            max_tokens: 4000,
            temperature: 0.2,
          });

        responseContent = solutionResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini") {
        // Gemini processing
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings.",
          };
        }

        try {
          // Create Gemini message structure
          const geminiMessages = [
            {
              role: "user",
              parts: [
                {
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${promptText}`,
                },
              ],
            },
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${
              config.solutionModel || "gemini-2.0-flash"
            }:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000,
              },
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;

          if (
            !responseData.candidates ||
            responseData.candidates.length === 0
          ) {
            throw new Error("Empty response from Gemini API");
          }

          responseContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for solution:", error);
          return {
            success: false,
            error:
              "Failed to generate solution with Gemini API. Please check your API key or try again later.",
          };
        }
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error:
              "Anthropic API key not configured. Please check your settings.",
          };
        }

        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${promptText}`,
                },
              ],
            },
          ];

          // Send to Anthropic API
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2,
          });

          responseContent = (
            response.content[0] as { type: "text"; text: string }
          ).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for solution:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error:
                "Claude API rate limit exceeded. Please wait a few minutes before trying again.",
            };
          } else if (
            error.status === 413 ||
            (error.message && error.message.includes("token"))
          ) {
            return {
              success: false,
              error:
                "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs.",
            };
          }

          return {
            success: false,
            error:
              "Failed to generate solution with Anthropic API. Please check your API key or try again later.",
          };
        }
      }

      // Extract steps from the response
      const stepPattern = /---STEP_TITLE: (.*?)\n---STEP_EXPLANATION: ([\s\S]*?)(?=\n---STEP_CODE:)\n---STEP_CODE:\n```(?:\w+)?\n([\s\S]*?)```/g;
      const steps = [];
      let match;

      // Extract all steps
      while ((match = stepPattern.exec(responseContent)) !== null) {
        steps.push({
          title: match[1].trim(),
          explanation: match[2].trim(),
          code: match[3].trim()
        });
      }

      // If no steps were found in the expected format, try to extract content in a more flexible way
      if (steps.length === 0) {
        console.log("No steps found in the expected format, trying alternative extraction");

        // Find step titles using common patterns
        const possibleStepTitles = responseContent.match(/(?:Step \d+:|###|##) (.*?)(?:\n|$)/g);

        if (possibleStepTitles && possibleStepTitles.length > 0) {
          // Try to create steps based on section headers
          const sections = responseContent.split(/(?:Step \d+:|###|##) .*?\n/);

          // Skip the first section if it's empty (before the first step)
          const startIndex = sections[0].trim() === "" ? 1 : 0;

          for (let i = 0; i < possibleStepTitles.length && i + startIndex < sections.length; i++) {
            const title = possibleStepTitles[i].replace(/(?:Step \d+:|###|##) /g, "").trim();
            const content = sections[i + startIndex];

            // Try to find code block in this section
            const codeBlocMatch = content.match(/```(?:\w+)?\s*([\s\S]*?)```/);
            const code = codeBlocMatch ? codeBlocMatch[1].trim() : "";

            // Use the content before the code block as explanation
            const explanation = codeBlocMatch
              ? content.substring(0, content.indexOf("```")).trim()
              : content.trim();

            steps.push({
              title,
              explanation,
              code
            });
          }
        }
      }

      // If we still have no steps, create a single step with the entire solution
      if (steps.length === 0) {
        console.log("Creating a single default step with the whole solution");
        const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : "";

        steps.push({
          title: "Complete Solution",
          explanation: "The solution to the problem.",
          code
        });
      }

      // Get the code from the final step (or the entire solution if no steps)
      const finalStepCode = steps.length > 0 ? steps[steps.length - 1].code : "";
      const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      const code = finalStepCode || (codeMatch ? codeMatch[1].trim() : responseContent);

      // Extract thoughts, looking for bullet points or numbered lists
      const thoughtsRegex =
        /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
      const thoughtsMatch = responseContent.match(thoughtsRegex);
      let thoughts: string[] = [];

      if (thoughtsMatch && thoughtsMatch[1]) {
        // Extract bullet points or numbered items
        const bulletPoints = thoughtsMatch[1].match(
          /(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g
        );
        if (bulletPoints) {
          thoughts = bulletPoints
            .map((point) => point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").trim())
            .filter(Boolean);
        } else {
          // If no bullet points found, split by newlines and filter empty lines
          thoughts = thoughtsMatch[1]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        }
      }

      // Extract complexity information
      const timeComplexityPattern =
        /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;
      const spaceComplexityPattern =
        /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;

      let timeComplexity =
        "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
      let spaceComplexity =
        "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";

      const timeMatch = responseContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (
          !timeComplexity.includes("-") &&
          !timeComplexity.includes("because")
        ) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, "").trim();
            timeComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const spaceMatch = responseContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(n) - ${spaceComplexity}`;
        } else if (
          !spaceComplexity.includes("-") &&
          !spaceComplexity.includes("because")
        ) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, "").trim();
            spaceComplexity = `${notation} - ${rest}`;
          }
        }
      }

      // If there are no steps yet, create some default ones
      if (steps.length === 0) {
        steps.push({
          title: "Understanding the Problem",
          explanation: "Analyzing the problem requirements and constraints.",
          code: "// Initial analysis - no code yet"
        });

        if (code) {
          steps.push({
            title: "Complete Solution",
            explanation: "The final implementation that solves the problem.",
            code: code
          });
        }
      }

      const formattedResponse = {
        code: code,
        thoughts:
          thoughts.length > 0
            ? thoughts
            : ["Solution approach based on efficiency and readability"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity,
        conversationId: conversationId,
        steps: steps
      };

      return { success: true, data: formattedResponse };
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user.",
        };
      }

      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings.",
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error:
            "OpenAI API rate limit exceeded or insufficient credits. Please try again later.",
        };
      }

      console.error("Solution generation error:", error);
      return {
        success: false,
        error: error.message || "Failed to generate solution",
      };
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal,
    conversationId?: string
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30,
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map((screenshot) => screenshot.data);

      let debugContent;

      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings.",
          };
        }

        const messages = [
          {
            role: "system" as const,
            content: (imageDataList.length > 0
              ? `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.`
              : `You are a coding interview assistant helping debug and improve solutions. Analyze the problem statement and provide detailed debugging help.`) + `

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`,
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: imageDataList.length > 0
                  ? `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${problemInfo.language || language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed`
                  : `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${problemInfo.language || language}. I need help with debugging or improving my solution. Please provide a detailed analysis with:
1. Potential issues to look for in my code
2. Specific improvements and corrections to consider
3. Any optimizations that would make the solution better
4. A clear explanation of common pitfalls and how to avoid them`,
              },
              ...imageDataList.map((data) => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` },
              })),
            ],
          },
        ];

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60,
          });
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model: config.debuggingModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2,
        });

        debugContent = debugResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini") {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings.",
          };
        }

        try {
          const debugPrompt = (imageDataList.length > 0
            ? `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases.`
            : `You are a coding interview assistant helping debug and improve solutions.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving solutions to this type of problem.`) + `

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).
`;
          const geminiMessages = [
            {
              role: "user",
              parts: [
                { text: debugPrompt },
                ...(imageDataList.length > 0 ? imageDataList.map((data) => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data,
                  },
                })) : []),
              ],
            },
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message:
                "Analyzing code and generating debug feedback with Gemini...",
              progress: 60,
            });
          }

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${
              config.debuggingModel || "gemini-2.0-flash"
            }:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000,
              },
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;

          if (
            !responseData.candidates ||
            responseData.candidates.length === 0
          ) {
            throw new Error("Empty response from Gemini API");
          }

          debugContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for debugging:", error);
          return {
            success: false,
            error:
              "Failed to process debug request with Gemini API. Please check your API key or try again later.",
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error:
              "Anthropic API key not configured. Please check your settings.",
          };
        }

        try {
          const debugPrompt = imageDataList.length > 0
            ? `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${problemInfo.language || language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases.`
            : `You are a coding interview assistant helping debug and improve solutions.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${problemInfo.language || language}. I need help with debugging or improving solutions to this type of problem.`;

          const formattedDebugPrompt = debugPrompt + `

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.
`;

          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: formattedDebugPrompt,
                },
                ...(imageDataList.length > 0 ? imageDataList.map((data) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data,
                  },
                })) : []),
              ],
            },
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message:
                "Analyzing code and generating debug feedback with Claude...",
              progress: 60,
            });
          }

          const response = await this.anthropicClient.messages.create({
            model: config.debuggingModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2,
          });

          debugContent = (response.content[0] as { type: "text"; text: string })
            .text;
        } catch (error: any) {
          console.error("Error using Anthropic API for debugging:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error:
                "Claude API rate limit exceeded. Please wait a few minutes before trying again.",
            };
          } else if (
            error.status === 413 ||
            (error.message && error.message.includes("token"))
          ) {
            return {
              success: false,
              error:
                "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs.",
            };
          }

          return {
            success: false,
            error:
              "Failed to process debug request with Anthropic API. Please check your API key or try again later.",
          };
        }
      }

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100,
        });
      }

      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      let formattedDebugContent = debugContent;

      if (!debugContent.includes("# ") && !debugContent.includes("## ")) {
        formattedDebugContent = debugContent
          .replace(
            /issues identified|problems found|bugs found/i,
            "## Issues Identified"
          )
          .replace(
            /code improvements|improvements|suggested changes/i,
            "## Code Improvements"
          )
          .replace(
            /optimizations|performance improvements/i,
            "## Optimizations"
          )
          .replace(/explanation|detailed analysis/i, "## Explanation");
      }

      const bulletPoints = formattedDebugContent.match(
        /(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g
      );
      const thoughts = bulletPoints
        ? bulletPoints
            .map((point) =>
              point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, "").trim()
            )
            .slice(0, 5)
        : ["Debug analysis based on your screenshots"];

      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode",
        conversationId: conversationId,
      };

      return { success: true, data: response };
    } catch (error: any) {
      console.error("Debug processing error:", error);
      return {
        success: false,
        error: error.message || "Failed to process debug request",
      };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false;

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort();
      this.currentProcessingAbortController = null;
      wasCancelled = true;
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort();
      this.currentExtraProcessingAbortController = null;
      wasCancelled = true;
    }

    this.deps.setHasDebugged(false);

    this.deps.setProblemInfo(null);

    const mainWindow = this.deps.getMainWindow();
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
    }
  }
}
