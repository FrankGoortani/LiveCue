// Solutions.tsx
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";

import ScreenshotQueue from "../components/Queue/ScreenshotQueue";

import { ProblemStatementData, SolutionStep } from "../types/solutions";
import SolutionCommands from "../components/Solutions/SolutionCommands";
import StepNavigation from "../components/Solutions/StepNavigation";
import StepContent from "../components/Solutions/StepContent";
import Debug from "./Debug";
import { useToast } from "../contexts/toast";
import { useConversations } from "../contexts/conversations";
import { MessageType, SolutionMessage } from "../types/conversations";
import { COMMAND_KEY } from "../utils/platform";

export const ContentSection = ({
  title,
  content,
  isLoading,
}: {
  title: string;
  content: React.ReactNode;
  isLoading: boolean;
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
);
const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage,
  steps,
}: {
  title: string;
  content: React.ReactNode;
  isLoading: boolean;
  currentLanguage: string;
  steps?: SolutionStep[];
}) => {
  const [copied, setCopied] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showCompleteSolution, setShowCompleteSolution] = useState(false);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only apply keyboard shortcuts when steps exist and we're not showing complete solution
      if (steps && steps.length > 0 && !showCompleteSolution) {
        if (e.key === "ArrowLeft") {
          setCurrentStepIndex((prev) => Math.max(0, prev - 1));
        } else if (e.key === "ArrowRight") {
          setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [steps, showCompleteSolution]); // Re-attach listener if these dependencies change

  const copyToClipboard = () => {
    if (typeof content === "string") {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handlePreviousStep = () => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    if (steps) {
      setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
    }
  };

  const toggleSolutionView = () => {
    setShowCompleteSolution((prev) => !prev);
  };

  return (
    <div className="space-y-4 relative">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="mt-4 flex">
            <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
              Loading solutions...
            </p>
          </div>
        </div>
      ) : (
        <>
          {steps && steps.length > 0 && (
            <div className="mb-4">
              <StepNavigation
                currentStep={currentStepIndex}
                totalSteps={steps.length}
                onPreviousStep={handlePreviousStep}
                onNextStep={handleNextStep}
                onViewCompleteSolution={toggleSolutionView}
                isShowingCompleteSolution={showCompleteSolution}
              />
            </div>
          )}

          {steps && steps.length > 0 && !showCompleteSolution ? (
            <StepContent
              step={steps[currentStepIndex]}
              currentLanguage={currentLanguage}
              previousStep={
                currentStepIndex > 0 ? steps[currentStepIndex - 1] : undefined
              }
            />
          ) : (
            <div className="w-full relative">
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <SyntaxHighlighter
                showLineNumbers
                language={currentLanguage == "golang" ? "go" : currentLanguage}
                style={dracula}
                customStyle={{
                  maxWidth: "100%",
                  margin: 0,
                  padding: "1rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  backgroundColor: "rgba(22, 27, 34, 0.5)",
                }}
                wrapLongLines={true}
              >
                {content as string}
              </SyntaxHighlighter>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading,
}: {
  timeComplexity: string | null;
  spaceComplexity: string | null;
  isLoading: boolean;
}) => {
  // Helper to ensure we have proper complexity values
  const formatComplexity = (complexity: string | null): string => {
    // Default if no complexity returned by LLM
    if (!complexity || complexity.trim() === "") {
      return "Complexity not available";
    }

    const bigORegex = /O\([^)]+\)/i;
    // Return the complexity as is if it already has Big O notation
    if (bigORegex.test(complexity)) {
      return complexity;
    }

    // Concat Big O notation to the complexity
    return `O(${complexity})`;
  };

  const formattedTimeComplexity = formatComplexity(timeComplexity);
  const formattedSpaceComplexity = formatComplexity(spaceComplexity);

  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        Complexity
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Calculating complexity...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Time:</strong> {formattedTimeComplexity}
              </div>
            </div>
          </div>
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Space:</strong> {formattedSpaceComplexity}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void;
  credits: number;
  currentLanguage: string;
  setLanguage: (language: string) => void;
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage,
}) => {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const { activeConversation, addSolutionMessage } = useConversations();

  const [debugProcessing, setDebugProcessing] = useState(false);
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null);
  const [solutionData, setSolutionData] = useState<string | null>(null);
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null);
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  );
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  );
  const [solutionSteps, setSolutionSteps] = useState<SolutionStep[] | null>(
    null
  );

  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  const [isResetting, setIsResetting] = useState(false);

  interface Screenshot {
    id: string;
    path: string;
    preview: string;
    timestamp: number;
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([]);

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        // If there's an active conversation, get screenshots from it
        if (activeConversation && activeConversation.id) {
          const result = await window.electronAPI.getConversationScreenshots(
            activeConversation.id
          );
          if (result.success && result.data) {
            const screenshots = result.data.map((p: any) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now(),
            }));
            console.log("Conversation screenshots:", screenshots);
            setExtraScreenshots(screenshots);
          } else {
            // Fallback to regular screenshots if needed
            const existing = await window.electronAPI.getScreenshots();
            const screenshots = (Array.isArray(existing) ? existing : []).map(
              (p) => ({
                id: p.path,
                path: p.path,
                preview: p.preview,
                timestamp: Date.now(),
              })
            );
            setExtraScreenshots(screenshots);
          }
        }
      } catch (error) {
        console.error("Error loading extra screenshots:", error);
        setExtraScreenshots([]);
      }
    };

    fetchScreenshots();
  }, [activeConversation, solutionData]);

  const { showToast } = useToast();

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight;
        const contentWidth = contentRef.current.scrollWidth;
        if (isTooltipVisible) {
          contentHeight += tooltipHeight;
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight,
        });
      }
    };

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    updateDimensions();

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(
        async (data: {
          path: string;
          preview: string;
          conversationId?: string;
        }) => {
          try {
            // If this screenshot is for our active conversation, update the list
            if (
              data.conversationId &&
              activeConversation &&
              data.conversationId === activeConversation.id
            ) {
              const result =
                await window.electronAPI.getConversationScreenshots(
                  activeConversation.id
                );
              if (result.success && result.data) {
                const screenshots = result.data.map((p: any) => ({
                  id: p.path,
                  path: p.path,
                  preview: p.preview,
                  timestamp: Date.now(),
                }));
                setExtraScreenshots(screenshots);
              }
            } else {
              // Fallback to the old behavior
              const existing = await window.electronAPI.getScreenshots();
              const screenshots = (Array.isArray(existing) ? existing : []).map(
                (p) => ({
                  id: p.path,
                  path: p.path,
                  preview: p.preview,
                  timestamp: Date.now(),
                })
              );
              setExtraScreenshots(screenshots);
            }
          } catch (error) {
            console.error("Error loading extra screenshots:", error);
          }
        }
      ),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true);

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"],
        });
        queryClient.removeQueries({
          queryKey: ["new_solution"],
        });

        // Reset screenshots
        setExtraScreenshots([]);

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false);
        }, 0);
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        setSolutionData(null);
        setThoughtsData(null);
        setTimeComplexityData(null);
        setSpaceComplexityData(null);
      }),
      window.electronAPI.onProblemExtracted((data: ProblemStatementData) => {
        queryClient.setQueryData(["problem_statement"], data);
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", error, "error");
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string;
          thoughts: string[];
          time_complexity: string;
          space_complexity: string;
        } | null;
        if (!solution) {
          setView("queue");
        }
        setSolutionData(solution?.code || null);
        setThoughtsData(solution?.thoughts || null);
        setTimeComplexityData(solution?.time_complexity || null);
        setSpaceComplexityData(solution?.space_complexity || null);
        console.error("Processing error:", error);
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess(
        (data: {
          code: string;
          thoughts: string[];
          time_complexity: string;
          space_complexity: string;
          steps?: SolutionStep[];
        }) => {
          if (!data) {
            console.warn("Received empty or invalid solution data");
            return;
          }
          console.log("DEBUG: onSolutionSuccess event received", { data });

          // Handle legacy solutions without steps by generating steps
          let steps = data.steps;
          if (!steps || steps.length === 0) {
            console.log(
              "Legacy solution without steps detected, generating steps"
            );

            // Generate default steps from the complete solution
            steps = [
              {
                title: "Understanding the Problem",
                explanation:
                  "First step is understanding the problem requirements and constraints.",
                code: "// Analysis phase - no code yet",
              },
              {
                title: "Basic Approach",
                explanation: "Developing a basic solution approach.",
                code: data.code
                  .split("\n")
                  .slice(0, Math.ceil(data.code.split("\n").length / 3))
                  .join("\n"),
              },
              {
                title: "Optimized Implementation",
                explanation: "Improving the solution with optimizations.",
                code: data.code
                  .split("\n")
                  .slice(0, Math.ceil((data.code.split("\n").length * 2) / 3))
                  .join("\n"),
              },
              {
                title: "Complete Solution",
                explanation:
                  "The full implementation with all edge cases handled.",
                code: data.code,
              },
            ];
          }
          // Add the solution to the active conversation
          if (activeConversation) {
            console.log(
              "DEBUG: Adding solution to conversation",
              activeConversation.id
            );
            addSolutionMessage(activeConversation.id, {
              code: data.code,
              thoughts: data.thoughts,
              time_complexity: data.time_complexity,
              space_complexity: data.space_complexity,
              steps: steps,
              problem_statement: queryClient.getQueryData([
                "problem_statement",
              ]),
            });
          }

          const solutionData = {
            code: data.code,
            thoughts: data.thoughts,
            time_complexity: data.time_complexity,
            space_complexity: data.space_complexity,
            steps: steps,
          };

          queryClient.setQueryData(["solution"], solutionData);
          setSolutionData(solutionData.code || null);
          setThoughtsData(solutionData.thoughts || null);
          setTimeComplexityData(solutionData.time_complexity || null);
          setSpaceComplexityData(solutionData.space_complexity || null);
          setSolutionSteps(solutionData.steps || null);

          // Fetch latest screenshots when solution is successful
          const fetchScreenshots = async () => {
            try {
              const existing = await window.electronAPI.getScreenshots();
              const screenshots =
                existing.previews?.map(
                  (p: { path: string; preview: string }) => ({
                    id: p.path,
                    path: p.path,
                    preview: p.preview,
                    timestamp: Date.now(),
                  })
                ) || [];
              setExtraScreenshots(screenshots);
            } catch (error) {
              console.error("Error loading extra screenshots:", error);
              setExtraScreenshots([]);
            }
          };
          fetchScreenshots();
        }
      ),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true);
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data: any) => {
        queryClient.setQueryData(["new_solution"], data);
        setDebugProcessing(false);
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        );
        setDebugProcessing(false);
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
          "neutral"
        );
      }),
      // Removed out of credits handler - unlimited credits in this version
    ];

    return () => {
      resizeObserver.disconnect();
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [isTooltipVisible, tooltipHeight, activeConversation, addSolutionMessage]);

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    );
    setSolutionData(queryClient.getQueryData(["solution"]) || null);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        );
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string;
          thoughts: string[];
          time_complexity: string;
          space_complexity: string;
          steps: SolutionStep[];
        } | null;

        setSolutionData(solution?.code ?? null);
        setThoughtsData(solution?.thoughts ?? null);
        setTimeComplexityData(solution?.time_complexity ?? null);
        setSpaceComplexityData(solution?.space_complexity ?? null);
        setSolutionSteps(solution?.steps ?? null);
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible);
    setTooltipHeight(height);
  };

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index];

    try {
      // If we have an active conversation, include its ID when deleting
      const conversationId = activeConversation
        ? activeConversation.id
        : undefined;

      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path,
        conversationId
      );

      if (response.success) {
        // Fetch screenshots for the active conversation
        if (conversationId) {
          const result = await window.electronAPI.getConversationScreenshots(
            conversationId
          );
          if (result.success && result.data) {
            const screenshots = result.data.map((p: any) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now(),
            }));
            setExtraScreenshots(screenshots);
          }
        } else {
          // Fallback to the old behavior
          const existing = await window.electronAPI.getScreenshots();
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p: { path: string; preview: string }) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now(),
            })
          );
          setExtraScreenshots(screenshots);
        }
      } else {
        console.error("Failed to delete extra screenshot:", response.error);
        showToast("Error", "Failed to delete the screenshot", "error");
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error);
      showToast("Error", "Failed to delete the screenshot", "error");
    }
  };

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        <div ref={contentRef} className="relative">
          <div className="space-y-3 px-4 py-3">
            {/* Conditionally render the screenshot queue if solutionData is available */}
            {solutionData && (
              <div className="bg-transparent w-fit">
                <div className="pb-3">
                  <div className="space-y-3 w-fit">
                    <ScreenshotQueue
                      isLoading={debugProcessing}
                      screenshots={extraScreenshots}
                      onDeleteScreenshot={handleDeleteExtraScreenshot}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Navbar of commands with the SolutionsHelper */}
            <SolutionCommands
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              isProcessing={!problemStatementData || !solutionData}
              extraScreenshots={extraScreenshots}
              credits={credits}
              currentLanguage={currentLanguage}
              setLanguage={setLanguage}
            />

            {/* Main Content - Modified width constraints */}
            <div className="w-full text-sm text-black bg-black/60 rounded-md">
              <div className="rounded-lg overflow-hidden">
                <div className="px-4 py-3 space-y-4 max-w-full">
                  {!solutionData && (
                    <>
                      <ContentSection
                        title="Problem Statement"
                        content={problemStatementData?.problem_statement}
                        isLoading={!problemStatementData}
                      />
                      {problemStatementData && (
                        <div className="mt-4 flex">
                          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                            Generating solutions...
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {solutionData && (
                    <>
                      <ContentSection
                        title={`My Thoughts (${COMMAND_KEY} + Arrow keys to scroll)`}
                        content={
                          thoughtsData && (
                            <div className="space-y-3">
                              <div className="space-y-1">
                                {thoughtsData.map((thought, index) => (
                                  <div
                                    key={index}
                                    className="flex items-start gap-2"
                                  >
                                    <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                                    <div>{thought}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        }
                        isLoading={!thoughtsData}
                      />

                      <SolutionSection
                        title="Solution"
                        content={solutionData}
                        isLoading={!solutionData}
                        currentLanguage={currentLanguage}
                        steps={solutionSteps || []}
                      />

                      <ComplexitySection
                        timeComplexity={timeComplexityData}
                        spaceComplexity={spaceComplexityData}
                        isLoading={!timeComplexityData || !spaceComplexityData}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Solutions;
