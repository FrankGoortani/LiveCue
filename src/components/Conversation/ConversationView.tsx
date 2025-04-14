import React, { useRef, useEffect, useCallback } from "react";
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
    setActiveConversation
  } = useConversations();

  const contentRef = useRef<HTMLDivElement>(null);

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
    const updateDimensions = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight;
        const contentWidth = contentRef.current.scrollWidth;

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

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={contentRef} className="bg-transparent flex flex-col h-full">
      <div className="px-4 py-3 flex flex-col h-full">
        <div className="flex flex-col w-full h-full">
          <div className="mb-3">
            <ConversationTabs />
          </div>

          {activeConversation && (
            <div className="flex flex-col h-full">
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

export default ConversationView;
