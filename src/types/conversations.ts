// Message types
export enum MessageType {
  SCREENSHOT = 'screenshot',
  TEXT = 'text',
  SOLUTION = 'solution'
}

// Base Message interface
export interface Message {
  id: string;
  type: MessageType;
  timestamp: number;
  isEditing?: boolean;
}

// Screenshot message
export interface ScreenshotMessage extends Message {
  type: MessageType.SCREENSHOT;
  path: string;
  preview: string;
}

// Text message
export interface TextMessage extends Message {
  type: MessageType.TEXT;
  content: string;
  originalContent?: string;
}

// Solution message
export interface SolutionMessage extends Message {
  type: MessageType.SOLUTION;
  code: string;
  thoughts: string[];
  time_complexity: string;
  space_complexity: string;
  steps?: SolutionStep[];
  problem_statement?: any;
}

// Reference to SolutionStep from solutions.ts
import { SolutionStep } from './solutions';

// Conversation
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Application state for conversations
export interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
}
