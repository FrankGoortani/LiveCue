import React, { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { SolutionStep } from "../../types/solutions";

interface StepContentProps {
  step: SolutionStep;
  currentLanguage: string;
  previousStep?: SolutionStep; // Optional previous step for comparison
}

const StepContent: React.FC<StepContentProps> = ({
  step,
  currentLanguage,
  previousStep
}) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(step.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4 animate-fadeIn transition-all duration-300 ease-in-out">
      <div className="space-y-2">
        <h2 className="text-[15px] font-medium text-white tracking-wide">
          {step.title}
        </h2>
        <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
          {step.explanation}
        </div>

        {/* Keyboard shortcut tooltip */}
        <div className="mt-1 text-xs text-gray-400">
          Use <kbd className="bg-white/10 rounded px-1">←</kbd> and <kbd className="bg-white/10 rounded px-1">→</kbd> arrow keys to navigate between steps
        </div>
      </div>

      <div className="space-y-2 relative">
        <h3 className="text-[13px] font-medium text-white tracking-wide">
          Code
        </h3>
        <div className="w-full relative">
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <SyntaxHighlighter
            showLineNumbers
            language={currentLanguage === "golang" ? "go" : currentLanguage}
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
            {/* Display code with highlighting new lines */}
            {step.code}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
};

export default StepContent;
