import React, { useState, useCallback, memo } from "react";
import { useConversations } from "../../contexts/conversations";
import { LanguageSelector } from "../shared/LanguageSelector";
import TranscriptButton from "./TranscriptButton";

interface TextMessageInputProps {
  conversationId: string;
  currentLanguage: string;
  setLanguage: (language: string) => void;
}

const TextMessageInput: React.FC<TextMessageInputProps> = ({
  conversationId,
  currentLanguage,
  setLanguage,
}) => {
  const [message, setMessage] = useState("");
  const { addTextMessage } = useConversations();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (message.trim()) {
      addTextMessage(conversationId, message);
      setMessage("");
    }
  }, [addTextMessage, conversationId, message]);

  return (
    <div className="mt-4">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <LanguageSelector
                currentLanguage={currentLanguage}
                setLanguage={setLanguage}
              />
              <TranscriptButton conversationId={conversationId} />
            </div>
          </div>
        </div>

        <div className="flex space-x-2">
          <textarea
            value={message}
           onChange={useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value), [])}
           placeholder="Type your message here..."
            className="flex-1 p-2 border border-gray-700 rounded-md min-h-[80px] text-sm text-white bg-black/70 focus:outline-none focus:ring-2 focus:ring-gray-600"
           onKeyDown={useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               handleSubmit(e);
             }
           }, [handleSubmit])}
          />

          <button
            type="submit"
            disabled={!message.trim()}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              message.trim()
                ? "bg-black/80 text-white border border-gray-700 hover:bg-black/90"
                : "bg-black/40 text-gray-500 border border-gray-700 cursor-not-allowed"
            }`}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default memo(TextMessageInput);
