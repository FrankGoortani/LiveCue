import React, { useRef, useEffect, useCallback, memo } from "react";
import { useConversations } from "../../contexts/conversations";
import ConversationTabs from "./ConversationTabs";
import MessageList from "./MessageList";
import TextMessageInput from "./TextMessageInput";

interface ConversationViewProps {
  setView: (view: "queue" | "solutions" | "debug") => void;
  credits: number;
  currentLanguage: string;
  setLanguage: (language: string) => void;
}

const ConversationView: React.FC<ConversationViewProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage,
}) => {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    setActiveConversation,
    resetConversation
  } = useConversations();

  const contentRef = useRef<HTMLDivElement>(null);

  // Compute and send content dimensions
  const updateDimensions = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollWidth: width, scrollHeight: height } = contentRef.current;
    window.electronAPI.updateContentDimensions({ width, height });
  }, []);

  // Function to handle CMD+Enter shortcut
  const handleCmdEnter = useCallback(() => {
    if (activeConversationId && activeConversation) {
      // Get the last 20 messages from the conversation
      const recentMessages = activeConversation.messages.slice(-20);

      // Only proceed if there are messages in the conversation
      if (recentMessages.length > 0) {
        // Trigger processing with the active conversation ID and messages
        window.electronAPI.triggerProcessScreenshots(activeConversationId, recentMessages);
      }
    }
  }, [activeConversationId, activeConversation]);

  // Listen for CMD+Enter shortcut events from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCmdEnterTriggered(handleCmdEnter);
    return () => unsubscribe();
  }, [handleCmdEnter]);

  // Listen for reset shortcut event to clear current conversation
  useEffect(() => {
    const unsubscribe = window.electronAPI.onReset(() => {
      if (activeConversationId) {
        resetConversation(activeConversationId);
      }
    });
    return unsubscribe;
  }, [activeConversationId, resetConversation]);

  // Create a default conversation if none exists
  useEffect(() => {
    if (conversations.length === 0) {
      // Create initial conversation
      createConversation("New Conversation");
    } else if (!activeConversationId && conversations.length > 0) {
      // If no active conversation but conversations exist, set the first one as active
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, createConversation, setActiveConversation]);

  // Handle window resizing to update electron window dimensions
  useEffect(() => {
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    updateDimensions(); // Initial call
    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  return (
    <div ref={contentRef} className="bg-transparent flex flex-col h-full w-[1000px]">
      <div className="px-4 py-3 flex flex-col h-full">
        <div className="flex flex-col w-full h-full">
          <div className="mb-3">
            <ConversationTabs />
          </div>

          {activeConversation && (
            <div className="flex flex-col w-full h-full">
              <div className="flex-grow overflow-hidden">
                <MessageList
                  messages={activeConversation.messages}
                  conversationId={activeConversation.id}
                />
              </div>

              <div className="mt-auto sticky bottom-0 pt-3 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm">
                <TextMessageInput
                  conversationId={activeConversation.id}
                  currentLanguage={currentLanguage}
                  setLanguage={setLanguage}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(ConversationView);
