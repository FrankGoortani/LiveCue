import React, { useRef, useEffect, memo } from "react";
import MessageItem from "./MessageItem";
import { Message } from "../../types/conversations";

interface MessageListProps {
  messages: Message[];
  conversationId: string;
}

const MessageList = memo(({ messages, conversationId }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  // Handle empty state
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-black/70 border border-gray-700 rounded-lg text-white/60">
        <p>No messages in this conversation yet.</p>
        <p className="text-sm mt-2">Add a screenshot or send a message to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-black/60 border border-gray-700 rounded-lg p-3 overflow-y-auto h-full max-h-[calc(100vh-180px)]">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          conversationId={conversationId}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;
