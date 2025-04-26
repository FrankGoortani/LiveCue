import React, { memo } from "react";
import { Message, MessageType, TextMessage, ScreenshotMessage, SolutionMessage } from "../../types/conversations";
import { useConversations } from "../../contexts/conversations";

interface MessageItemProps {
  message: Message;
  conversationId: string;
}

const MessageItem = memo(({ message, conversationId }: MessageItemProps) => {
  // Render based on message type
  switch (message.type) {
    case MessageType.SCREENSHOT:
      return null // <ScreenshotMessageItem message={message as ScreenshotMessage} conversationId={conversationId} />;
    case MessageType.TEXT:
      return <TextMessageItem message={message as TextMessage} conversationId={conversationId} />;
    case MessageType.SOLUTION:
      return <SolutionMessageItem message={message as SolutionMessage} conversationId={conversationId} />;
    default:
      return <div>Unknown message type</div>;
  }
});

interface TypedMessageItemProps<T extends Message> {
  message: T;
  conversationId: string;
}

// Screenshot message component
const ScreenshotMessageItem = memo(({ message, conversationId }: TypedMessageItemProps<ScreenshotMessage>) => {
  const { deleteMessage } = useConversations();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    deleteMessage(conversationId, message.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="rounded-lg overflow-hidden bg-black/70 border border-gray-700 shadow-sm my-2 p-2">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-white/60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
        <button
          onClick={handleDeleteClick}
          className="text-red-500 hover:text-red-400 transition-colors text-xs"
        >
          Delete
        </button>
      </div>
      <div className="relative">
        <img
          src={message.preview}
          alt="Screenshot"
          className="w-full h-auto rounded"
        />

        {showDeleteConfirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded">
            <div className="text-center p-4">
              <p className="text-white mb-3">Delete this screenshot?</p>
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={handleConfirmDelete}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={handleCancelDelete}
                  className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Text message component
const TextMessageItem = memo(({ message, conversationId }: TypedMessageItemProps<TextMessage>) => {
  return (
    <div className="rounded-lg bg-black/70 border border-gray-700 shadow-sm my-2 p-3">
      <div className="flex justify-between items-center mb-1">
        <div className="text-sm text-white/60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
      <div className="text-white/90 whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
});

// Solution message component
const SolutionMessageItem = memo(({ message }: TypedMessageItemProps<SolutionMessage>) => {
  return (
    <div className="rounded-lg bg-black/70 border border-gray-700 shadow-sm my-2 p-3">
      <div className="flex justify-between items-center mb-1">
        <div className="text-sm text-white/60">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <div className="bg-black/80 border border-gray-700 p-3 rounded my-2">
        <h3 className="font-medium text-white/90 mb-2">Solution</h3>

        <div className="bg-black/90 border border-gray-700 p-2 rounded mb-2 text-sm font-mono text-white/80 whitespace-pre-wrap">
            {message.code.split("\n").slice(0, 2).join("\n")}
            ...
        </div>
      </div>
    </div>
  );
});

export default MessageItem;
