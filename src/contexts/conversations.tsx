import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Conversation,
  ConversationState,
  Message,
  MessageType,
  TextMessage,
  ScreenshotMessage,
  SolutionMessage
} from '../types/conversations';

// Interface for the conversations context
interface ConversationsContextType {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;

  // Conversation actions
  createConversation: (title?: string) => Conversation;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  resetConversation: (id: string) => void; // New function to reset conversation

  // Message actions
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => Message;
  addTextMessage: (conversationId: string, content: string) => TextMessage;
  addScreenshotMessage: (conversationId: string, path: string, preview: string) => ScreenshotMessage;
  addSolutionMessage: (
    conversationId: string,
    solution: Omit<SolutionMessage, 'id' | 'timestamp' | 'type'>
  ) => SolutionMessage;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setMessageEditing: (conversationId: string, messageId: string, isEditing: boolean) => void;
}

// Create the context with undefined as default value
export const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

// Provider props interface
interface ConversationsProviderProps {
  children: ReactNode;
}

// Create the provider component
export const ConversationsProvider: React.FC<ConversationsProviderProps> = ({ children }) => {
  // Initialize state with empty conversations array and null active conversation
  const [state, setState] = useState<ConversationState>({
    conversations: [],
    activeConversationId: null
  });

  // Load conversations from local storage on initial render
  useEffect(() => {
    const storedConversations = localStorage.getItem('conversations');
    const storedActiveId = localStorage.getItem('activeConversationId');

    if (storedConversations) {
      setState({
        conversations: JSON.parse(storedConversations),
        activeConversationId: storedActiveId ? JSON.parse(storedActiveId) : null
      });
    }
  }, []);

  // Save conversations to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(state.conversations));
    if (state.activeConversationId) {
      localStorage.setItem('activeConversationId', JSON.stringify(state.activeConversationId));
    } else {
      localStorage.removeItem('activeConversationId');
    }
  }, [state.conversations, state.activeConversationId]);

  // Find the active conversation based on activeConversationId
  const activeConversation = state.activeConversationId
    ? state.conversations.find(conv => conv.id === state.activeConversationId) || null
    : null;

  // Create a new conversation
  const createConversation = (title?: string): Conversation => {
    const now = Date.now();
    const newConversation: Conversation = {
      id: uuidv4(),
      title: title || `Conversation ${state.conversations.length + 1}`,
      messages: [], // Ensure messages is an empty array
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    // Update all conversations to be inactive
    const updatedConversations = state.conversations.map(conv => ({
      ...conv,
      isActive: false
    }));

    // Add the new conversation to the state
    setState(prevState => {
      // Clear any previous active conversation to prevent memory leaks
      if (prevState.activeConversationId) {
        // This ensures we're starting with a clean slate
        const cleanConversations = updatedConversations.map(conv =>
          (conv.id === prevState.activeConversationId)
            ? { ...conv, messages: [] } // Clear messages from previous active conversation
            : conv
        );

        return {
          ...prevState,
          conversations: [...cleanConversations, newConversation],
          activeConversationId: newConversation.id
        };
      }

      return {
        ...prevState,
        conversations: [...updatedConversations, newConversation],
        activeConversationId: newConversation.id
      };
    });

    return newConversation;
  };

  // Update a conversation
  const updateConversation = (id: string, updates: Partial<Conversation>): void => {
    setState(prevState => {
      const updatedConversations = prevState.conversations.map(conv =>
        conv.id === id
          ? {
              ...conv,
              ...updates,
              updatedAt: Date.now()
            }
          : conv
      );

      return {
        ...prevState,
        conversations: updatedConversations
      };
    });
  };

  // Delete a conversation
  const deleteConversation = (id: string): void => {
    setState(prevState => {
      const filteredConversations = prevState.conversations.filter(conv => conv.id !== id);
      const newActiveId = prevState.activeConversationId === id
        ? (filteredConversations.length > 0 ? filteredConversations[0].id : null)
        : prevState.activeConversationId;

      return {
        conversations: filteredConversations,
        activeConversationId: newActiveId
      };
    });
  };

  // Set the active conversation
  const setActiveConversation = (id: string | null): void => {
    if (id === state.activeConversationId) return;

    setState(prevState => {
      // Mark all conversations as inactive except the one being activated
      const updatedConversations = prevState.conversations.map(conv => ({
        ...conv,
        isActive: conv.id === id
      }));

      return {
        conversations: updatedConversations,
        activeConversationId: id
      };
    });
  };

  // Reset a conversation by clearing all messages
  const resetConversation = (id: string): void => {
    setState(prevState => {
      const now = Date.now();
      const updatedConversations = prevState.conversations.map(conv => {
        if (conv.id === id) {
          return {
            ...conv,
            messages: [], // Clear all messages
            updatedAt: now
          };
        }
        return conv;
      });

      return {
        ...prevState,
        conversations: updatedConversations
      };
    });
  };

  // Add a message to a conversation
  const addMessage = (conversationId: string, messageData: Omit<Message, 'id' | 'timestamp'>): Message => {
    const newMessage: Message = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...messageData
    };

    setState(prevState => {
      const updatedConversations = prevState.conversations.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: [...conv.messages, newMessage],
            updatedAt: newMessage.timestamp
          };
        }
        return conv;
      });

      return {
        ...prevState,
        conversations: updatedConversations
      };
    });

    return newMessage;
  };

  // Add a text message
  const addTextMessage = (conversationId: string, content: string): TextMessage => {
    const message: Omit<TextMessage, 'id' | 'timestamp'> = {
      type: MessageType.TEXT,
      content
    };
    return addMessage(conversationId, message) as TextMessage;
  };

  // Add a screenshot message
  const addScreenshotMessage = (conversationId: string, path: string, preview: string): ScreenshotMessage => {
    const message: Omit<ScreenshotMessage, 'id' | 'timestamp'> = {
      type: MessageType.SCREENSHOT,
      path,
      preview
    };
    return addMessage(conversationId, message) as ScreenshotMessage;
  };

  // Add a solution message
  const addSolutionMessage = (
    conversationId: string,
    solution: Omit<SolutionMessage, 'id' | 'timestamp' | 'type'>
  ): SolutionMessage => {
    const message: Omit<SolutionMessage, 'id' | 'timestamp'> = {
      type: MessageType.SOLUTION,
      ...solution
    };
    return addMessage(conversationId, message) as SolutionMessage;
  };

  // Update a message
  const updateMessage = (conversationId: string, messageId: string, updates: Partial<Message>): void => {
    setState(prevState => {
      const now = Date.now();
      const updatedConversations = prevState.conversations.map(conv => {
        if (conv.id === conversationId) {
          const updatedMessages = conv.messages.map(msg =>
            msg.id === messageId
              ? { ...msg, ...updates }
              : msg
          );
          return {
            ...conv,
            messages: updatedMessages,
            updatedAt: now
          };
        }
        return conv;
      });

      return {
        ...prevState,
        conversations: updatedConversations
      };
    });
  };

  // Delete a message
  const deleteMessage = (conversationId: string, messageId: string): void => {
    setState(prevState => {
      const now = Date.now();
      const updatedConversations = prevState.conversations.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: conv.messages.filter(msg => msg.id !== messageId),
            updatedAt: now
          };
        }
        return conv;
      });

      return {
        ...prevState,
        conversations: updatedConversations
      };
    });
  };

  // Set message editing state
  const setMessageEditing = (conversationId: string, messageId: string, isEditing: boolean): void => {
    updateMessage(conversationId, messageId, { isEditing });
  };

  const value: ConversationsContextType = {
    conversations: state.conversations,
    activeConversationId: state.activeConversationId,
    activeConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    setActiveConversation,
    resetConversation,
    addMessage,
    addTextMessage,
    addScreenshotMessage,
    addSolutionMessage,
    updateMessage,
    deleteMessage,
    setMessageEditing
  };

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
};

// Custom hook to use the conversations context
export function useConversations() {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationsProvider');
  }
  return context;
}
