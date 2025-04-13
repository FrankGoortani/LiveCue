import React from "react";
import { Button } from "../ui/button";

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onViewCompleteSolution: () => void;
  isShowingCompleteSolution: boolean;
}

const StepNavigation: React.FC<StepNavigationProps> = ({
  currentStep,
  totalSteps,
  onPreviousStep,
  onNextStep,
  onViewCompleteSolution,
  isShowingCompleteSolution
}) => {
  return (
    <div className="flex flex-col space-y-2 w-full transition-all duration-300">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviousStep}
            disabled={currentStep === 0 || isShowingCompleteSolution}
            className="text-xs bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-all"
            aria-label="Previous step"
            title="Previous step (Left arrow key)"
          >
            <span className="text-xs">←</span> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextStep}
            disabled={currentStep === totalSteps - 1 || isShowingCompleteSolution}
            className="text-xs bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-all"
            aria-label="Next step"
            title="Next step (Right arrow key)"
          >
            Next <span className="text-xs">→</span>
          </Button>
        </div>

        <div className="text-xs text-white/70 transition-all animate-fadeIn">
          {isShowingCompleteSolution
            ? "Complete Solution"
            : `Step ${currentStep + 1} of ${totalSteps}`}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onViewCompleteSolution}
          className="text-xs bg-white/10 hover:bg-white/20 text-white transition-all"
          aria-label={isShowingCompleteSolution ? "View Steps" : "View Complete Solution"}
        >
          {isShowingCompleteSolution ? "View Steps" : "View Complete Solution"}
        </Button>
      </div>

      {!isShowingCompleteSolution && (
        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
          <div
            className="bg-blue-400 h-full transition-all duration-300 ease-in-out"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default StepNavigation;
