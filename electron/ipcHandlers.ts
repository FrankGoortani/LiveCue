// ipcHandlers.ts

import { ipcMain, shell, dialog } from "electron";
import { randomBytes } from "crypto";
import { IIpcHandlerDeps } from "./main";
import { configHelper } from "./ConfigHelper";
import { OtterAi } from "../src/lib/transcription";

export function initializeIpcHandlers(deps: IIpcHandlerDeps): void {
  console.log("Initializing IPC handlers");

  // Conversation management handlers
  ipcMain.handle("create-conversation", (_event, conversation) => {
    try {
      // The frontend sends a fully-formed conversation object
      // We just need to notify the frontend that it was created
      return { success: true, data: conversation };
    } catch (error) {
      console.error("Error creating conversation:", error);
      return { success: false, error: "Failed to create conversation" };
    }
  });

  ipcMain.handle("update-conversation", (_event, conversation) => {
    try {
      // The frontend sends the updated conversation object
      // We just need to notify the frontend that it was updated
      return { success: true, data: conversation };
    } catch (error) {
      console.error("Error updating conversation:", error);
      return { success: false, error: "Failed to update conversation" };
    }
  });

  ipcMain.handle("delete-conversation", (_event, conversationId) => {
    try {
      // Delete any screenshots associated with this conversation
      const screenshotHelper = deps.getScreenshotHelper();
      const screenshots = screenshotHelper?.getConversationScreenshots(conversationId) || [];

      // Delete each screenshot file
      for (const screenshotPath of screenshots) {
        deps.deleteScreenshot(screenshotPath, conversationId);
      }

      return { success: true };
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return { success: false, error: "Failed to delete conversation" };
    }
  });

  ipcMain.handle("set-active-conversation", (_event, conversationId) => {
    try {
      // This is mostly handled in the frontend, but we might need this
      // for future backend operations
      return { success: true, data: conversationId };
    } catch (error) {
      console.error("Error setting active conversation:", error);
      return { success: false, error: "Failed to set active conversation" };
    }
  });

  // Configuration handlers
  ipcMain.handle("get-config", () => {
    return configHelper.loadConfig();
  });

  ipcMain.handle("update-config", (_event, updates) => {
    return configHelper.updateConfig(updates);
  });

  ipcMain.handle("check-api-key", () => {
    return configHelper.hasApiKey();
  });

  ipcMain.handle("validate-api-key", async (_event, apiKey) => {
    // First check the format
    if (!configHelper.isValidApiKeyFormat(apiKey)) {
      return {
        valid: false,
        error: "Invalid API key format. OpenAI API keys start with 'sk-'",
      };
    }

    // Then test the API key with OpenAI
    const result = await configHelper.testApiKey(apiKey);
    return result;
  });

  // Credits handlers
  ipcMain.handle("set-initial-credits", async (_event, credits: number) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return;

    try {
      // Set the credits in a way that ensures atomicity
      await mainWindow.webContents.executeJavaScript(
        `window.__CREDITS__ = ${credits}`
      );
      mainWindow.webContents.send("credits-updated", credits);
    } catch (error) {
      console.error("Error setting initial credits:", error);
      throw error;
    }
  });

  ipcMain.handle("decrement-credits", async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return;

    try {
      const currentCredits = await mainWindow.webContents.executeJavaScript(
        "window.__CREDITS__"
      );
      if (currentCredits > 0) {
        const newCredits = currentCredits - 1;
        await mainWindow.webContents.executeJavaScript(
          `window.__CREDITS__ = ${newCredits}`
        );
        mainWindow.webContents.send("credits-updated", newCredits);
      }
    } catch (error) {
      console.error("Error decrementing credits:", error);
    }
  });

  // Screenshot queue handlers
  ipcMain.handle("get-screenshot-queue", () => {
    return deps.getScreenshotQueue();
  });

  ipcMain.handle("get-extra-screenshot-queue", () => {
    return deps.getExtraScreenshotQueue();
  });

  ipcMain.handle("delete-screenshot", async (event, path: string, conversationId?: string) => {
    return deps.deleteScreenshot(path, conversationId);
  });

  ipcMain.handle("get-image-preview", async (event, path: string) => {
    return deps.getImagePreview(path);
  });

  // Screenshot processing handlers
  ipcMain.handle("process-screenshots", async () => {
    // Check for API key before processing
    if (!configHelper.hasApiKey()) {
      const mainWindow = deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send(deps.PROCESSING_EVENTS.API_KEY_INVALID);
      }
      return;
    }

    await deps.processingHelper?.processScreenshots();
  });

  // Window dimension handlers
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        deps.setWindowDimensions(width, height);
      }
    }
  );

  ipcMain.handle(
    "set-window-dimensions",
    (event, width: number, height: number) => {
      deps.setWindowDimensions(width, height);
    }
  );

  // Screenshot management handlers
  ipcMain.handle("get-screenshots", async () => {
    try {
      let previews = [];
      const currentView = deps.getView();

      if (currentView === "queue") {
        const queue = deps.getScreenshotQueue();
        previews = await Promise.all(
          queue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path),
          }))
        );
      } else {
        const extraQueue = deps.getExtraScreenshotQueue();
        previews = await Promise.all(
          extraQueue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path),
          }))
        );
      }

      return previews;
    } catch (error) {
      console.error("Error getting screenshots:", error);
      throw error;
    }
  });

  // Screenshot trigger handlers
  ipcMain.handle("trigger-screenshot", async (_event, conversationId) => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      try {
        const screenshotPath = await deps.takeScreenshot(conversationId);
        const preview = await deps.getImagePreview(screenshotPath);
        mainWindow.webContents.send("screenshot-taken", {
          path: screenshotPath,
          preview,
          conversationId,
        });
        return { success: true };
      } catch (error) {
        console.error("Error triggering screenshot:", error);
        return { error: "Failed to trigger screenshot" };
      }
    }
    return { error: "No main window available" };
  });

  ipcMain.handle("take-screenshot", async (_event, conversationId) => {
    try {
      const screenshotPath = await deps.takeScreenshot(conversationId);
      const preview = await deps.getImagePreview(screenshotPath);
      return {
        path: screenshotPath,
        preview,
        conversationId
      };
    } catch (error) {
      console.error("Error taking screenshot:", error);
      return { error: "Failed to take screenshot" };
    }
  });

  // Text message handlers
  ipcMain.handle("add-text-message", (_event, message) => {
    try {
      // This is just a pass-through, as text messages are managed in the frontend
      return { success: true, data: message };
    } catch (error) {
      console.error("Error adding text message:", error);
      return { success: false, error: "Failed to add text message" };
    }
  });

  ipcMain.handle("update-text-message", (_event, message) => {
    try {
      // This is just a pass-through, as text messages are managed in the frontend
      return { success: true, data: message };
    } catch (error) {
      console.error("Error updating text message:", error);
      return { success: false, error: "Failed to update text message" };
    }
  });

  ipcMain.handle("delete-text-message", (_event, messageId, conversationId) => {
    try {
      // This is just a pass-through, as text messages are managed in the frontend
      return { success: true };
    } catch (error) {
      console.error("Error deleting text message:", error);
      return { success: false, error: "Failed to delete text message" };
    }
  });

  // Process screenshot handlers
  ipcMain.handle("trigger-process-screenshots", async (_event, conversationId, messages) => {
    try {
      // Check for API key before processing
      if (!configHelper.hasApiKey()) {
        const mainWindow = deps.getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(deps.PROCESSING_EVENTS.API_KEY_INVALID);
        }
        return { success: false, error: "API key required" };
      }

      await deps.processingHelper?.processScreenshots(conversationId, messages);
      return { success: true };
    } catch (error) {
      console.error("Error processing screenshots:", error);
      return { error: "Failed to process screenshots" };
    }
  });

  // Open external URL handler
  ipcMain.handle("open-external-url", (event, url: string) => {
    shell.openExternal(url);
  });

  // Open external URL handler
  ipcMain.handle("openLink", (event, url: string) => {
    try {
      console.log(`Opening external URL: ${url}`);
      shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error(`Error opening URL ${url}:`, error);
      return { success: false, error: `Failed to open URL: ${error}` };
    }
  });

  // Settings portal handler
  ipcMain.handle("open-settings-portal", () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("show-settings-dialog");
      return { success: true };
    }
    return { success: false, error: "Main window not available" };
  });

  // Window management handlers
  ipcMain.handle("toggle-window", () => {
    try {
      deps.toggleMainWindow();
      return { success: true };
    } catch (error) {
      console.error("Error toggling window:", error);
      return { error: "Failed to toggle window" };
    }
  });

  ipcMain.handle("reset-queues", async () => {
    try {
      deps.clearQueues();
      return { success: true };
    } catch (error) {
      console.error("Error resetting queues:", error);
      return { error: "Failed to reset queues" };
    }
  });

  // Reset handlers
  ipcMain.handle("trigger-reset", () => {
    try {
      // First cancel any ongoing requests
      deps.processingHelper?.cancelOngoingRequests();

      // Clear all queues immediately
      deps.clearQueues();

      // Reset view to queue
      deps.setView("queue");

      // Get main window and send reset events
      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send reset events in sequence
        mainWindow.webContents.send("reset-view");
        mainWindow.webContents.send("reset");
      }

      return { success: true };
    } catch (error) {
      console.error("Error triggering reset:", error);
      return { error: "Failed to trigger reset" };
    }
  });

  // Window movement handlers
  ipcMain.handle("trigger-move-left", () => {
    try {
      deps.moveWindowLeft();
      return { success: true };
    } catch (error) {
      console.error("Error moving window left:", error);
      return { error: "Failed to move window left" };
    }
  });

  ipcMain.handle("trigger-move-right", () => {
    try {
      deps.moveWindowRight();
      return { success: true };
    } catch (error) {
      console.error("Error moving window right:", error);
      return { error: "Failed to move window right" };
    }
  });

  ipcMain.handle("trigger-move-up", () => {
    try {
      deps.moveWindowUp();
      return { success: true };
    } catch (error) {
      console.error("Error moving window up:", error);
      return { error: "Failed to move window up" };
    }
  });

  ipcMain.handle("trigger-move-down", () => {
    try {
      deps.moveWindowDown();
      return { success: true };
    } catch (error) {
      console.error("Error moving window down:", error);
      return { error: "Failed to move window down" };
    }
  });

  // Delete last screenshot handler
  ipcMain.handle("delete-last-screenshot", async (_event, conversationId) => {
    try {
      let screenshot;

      if (conversationId) {
        // Get the screenshots for this conversation
        const screenshotHelper = deps.getScreenshotHelper();
        const screenshots = screenshotHelper?.getConversationScreenshots(conversationId) || [];

        if (screenshots.length === 0) {
          return { success: false, error: "No screenshots in this conversation" };
        }

        // Get the last screenshot
        screenshot = screenshots[screenshots.length - 1];
      } else {
        // Use the original queue-based logic for backwards compatibility
        const queue =
          deps.getView() === "queue"
            ? deps.getScreenshotQueue()
            : deps.getExtraScreenshotQueue();

        if (queue.length === 0) {
          return { success: false, error: "No screenshots to delete" };
        }

        // Get the last screenshot in the queue
        screenshot = queue[queue.length - 1];
      }

      // Delete the screenshot
      const result = await deps.deleteScreenshot(screenshot, conversationId);

      // Notify the renderer about the change
      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("screenshot-deleted", {
          path: screenshot,
          conversationId
        });

        // Otter.ai integration handlers
        ipcMain.handle("otterai:get-recent-transcripts", async () => {
          try {
            const config = configHelper.loadConfig();

            // Get Otter.ai credentials from config
            const otterCredentials = {
              email: config.otterAiEmail || process.env.OTTER_AI_EMAIL,
              password: config.otterAiPassword || process.env.OTTER_AI_PASSWORD
            };

            // Check if credentials are available
            if (!otterCredentials.email || !otterCredentials.password) {
              return {
                success: false,
                error: "Otter.ai credentials not configured. Please set them in the settings."
              };
            }

            // Initialize Otter.ai client
            const otterAi = new OtterAi({
              credentials: otterCredentials
            });

            // Login and get recent transcripts
            await otterAi.login();
            const speeches = await otterAi.getSpeeches({ limit: 20 });

            return {
              success: true,
              data: speeches
            };
          } catch (error) {
            console.error("Error fetching Otter.ai transcripts:", error);
            return {
              success: false,
              error: error instanceof Error ? error.message : "Failed to fetch transcripts"
            };
          }
        });

        ipcMain.handle("otterai:get-transcript-details", async (_event, speechId) => {
          try {
            const config = configHelper.loadConfig();

            // Get Otter.ai credentials from config
            const otterCredentials = {
              email: config.otterAiEmail || process.env.OTTER_AI_EMAIL,
              password: config.otterAiPassword || process.env.OTTER_AI_PASSWORD
            };

            // Check if credentials are available
            if (!otterCredentials.email || !otterCredentials.password) {
              return {
                success: false,
                error: "Otter.ai credentials not configured. Please set them in the settings."
              };
            }

            // Initialize Otter.ai client
            const otterAi = new OtterAi({
              credentials: otterCredentials
            });

            // Login and get transcript details
            await otterAi.login();
            const speechDetails = await otterAi.getSpeech(speechId);

            return {
              success: true,
              data: speechDetails
            };
          } catch (error) {
            console.error("Error fetching Otter.ai transcript details:", error);
            return {
              success: false,
              error: error instanceof Error ? error.message : "Failed to fetch transcript details"
            };
          }
        });

        ipcMain.handle("otterai:save-credentials", async (_event, credentials) => {
          try {
            // Validate input
            if (!credentials || !credentials.email || !credentials.password) {
              return {
                success: false,
                error: "Invalid credentials. Both email and password are required."
              };
            }

            // Update config with new credentials
            configHelper.updateConfig({
              otterAiEmail: credentials.email,
              otterAiPassword: credentials.password
            });

            return { success: true };
          } catch (error) {
            console.error("Error saving Otter.ai credentials:", error);
            return {
              success: false,
              error: error instanceof Error ? error.message : "Failed to save credentials"
            };
          }
        });
      }

      return result;
    } catch (error) {
      console.error("Error deleting last screenshot:", error);
      return { success: false, error: "Failed to delete last screenshot" };
    }
  });

// Otter.ai integration handlers
console.log("Registering Otter.ai IPC handlers");
console.log("Registering otterai:get-recent-transcripts");
ipcMain.handle("otterai:get-recent-transcripts", async () => {
  try {
    const config = configHelper.loadConfig();

    // Get Otter.ai credentials from config
    const otterCredentials = {
      email: config.otterAiEmail || process.env.OTTER_AI_EMAIL,
      password: config.otterAiPassword || process.env.OTTER_AI_PASSWORD
    };

    // Check if credentials are available
    if (!otterCredentials.email || !otterCredentials.password) {
      return {
        success: false,
        error: "Otter.ai credentials not configured. Please set them in the settings."
      };
    }

    // Initialize Otter.ai client
    const otterAi = new OtterAi({
      credentials: otterCredentials
    });

    // Login and get recent transcripts
    await otterAi.login();
    const speeches = await otterAi.getSpeeches({ limit: 20 });

    return {
      success: true,
      data: speeches
    };
  } catch (error) {
    console.error("Error fetching Otter.ai transcripts:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch transcripts"
    };
  }
});
console.log("Registering otterai:get-transcript-details");
ipcMain.handle("otterai:get-transcript-details", async (_event, speechId) => {
  try {
    const config = configHelper.loadConfig();

    // Get Otter.ai credentials from config
    const otterCredentials = {
      email: config.otterAiEmail || process.env.OTTER_AI_EMAIL,
      password: config.otterAiPassword || process.env.OTTER_AI_PASSWORD
    };

    // Check if credentials are available
    if (!otterCredentials.email || !otterCredentials.password) {
      return {
        success: false,
        error: "Otter.ai credentials not configured. Please set them in the settings."
      };
    }

    // Initialize Otter.ai client
    const otterAi = new OtterAi({
      credentials: otterCredentials
    });

    // Login and get transcript details
    await otterAi.login();
    const speechDetails = await otterAi.getSpeech(speechId);

    return {
      success: true,
      data: speechDetails
    };
  } catch (error) {
    console.error("Error fetching Otter.ai transcript details:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch transcript details"
    };
  }
});
console.log("Registering otterai:save-credentials");
ipcMain.handle("otterai:save-credentials", async (_event, credentials) => {
  try {
    // Validate input
    if (!credentials || !credentials.email || !credentials.password) {
      return {
        success: false,
        error: "Invalid credentials. Both email and password are required."
      };
    }

    // Update config with new credentials
    configHelper.updateConfig({
      otterAiEmail: credentials.email,
      otterAiPassword: credentials.password
    });

    return { success: true };
  } catch (error) {
    console.error("Error saving Otter.ai credentials:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save credentials"
    };
  }
});
  // Get conversation screenshots handler
  ipcMain.handle("get-conversation-screenshots", async (_event, conversationId) => {
    try {
      if (!conversationId) {
        return { success: false, error: "No conversation ID provided" };
      }

      const screenshotHelper = deps.getScreenshotHelper();
      const screenshots = screenshotHelper?.getConversationScreenshots(conversationId) || [];

      const previews = await Promise.all(
        screenshots.map(async (path) => ({
          path,
          preview: await deps.getImagePreview(path),
          conversationId
        }))
      );

      return { success: true, data: previews };
    } catch (error) {
      console.error("Error getting conversation screenshots:", error);
      return { success: false, error: "Failed to get conversation screenshots" };
    }
  });
}
