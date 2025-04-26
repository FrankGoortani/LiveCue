import React, { memo } from "react";
import { useConversations } from "../../contexts/conversations";

const ConversationTabs: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    deleteConversation,
    updateConversation,
    resetConversation
  } = useConversations();

  // Create new conversation with proper cleanup
  const handleNewConversation = () => {
    // Create a fresh conversation
    createConversation();
  };

  // Reset the current conversation
  const handleResetConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    resetConversation(id);
  };

  // Rename conversation (placeholder for future implementation)
  const handleRenameConversation = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      updateConversation(id, { title: newTitle });
    }
  };

  return (
    <div className="flex items-center space-x-1 pb-2 overflow-x-auto scrollbar-hide">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`flex items-center px-3 py-1.5 rounded-t-lg cursor-pointer text-sm truncate
            ${activeConversationId === conversation.id
              ? "bg-black/80 text-white font-medium border border-gray-700"
              : "bg-black/60 text-white/80 hover:bg-black/70 border border-gray-700"
            }`}
          onClick={() => setActiveConversation(conversation.id)}
        >
          <span className="truncate max-w-[120px]">{conversation.title}</span>

          <div className="flex ml-2">
            {/* Reset button */}
            <button
              className="text-white/60 hover:text-white mr-1"
              title="Reset conversation"
              onClick={(e) => handleResetConversation(conversation.id, e)}
            >
              ↺
            </button>

            {/* Delete button - only show if there's more than one conversation */}
            {conversations.length > 1 && (
              <button
                className="text-white/60 hover:text-white"
                title="Delete conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conversation.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        className="bg-black/60 hover:bg-black/70 text-white/80 p-1.5 rounded-md border border-gray-700"
        onClick={handleNewConversation}
      >
        <span className="h-4 w-4 block">+</span>
      </button>
    </div>
  );
};

export default memo(ConversationTabs);
