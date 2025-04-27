/**
 * Type definitions for OtterAI Client
 */

export interface OtterAiCredentials {
  email: string;
  password: string;
}

export interface OtterAiConfig {
  baseUrl?: string;
  credentials: OtterAiCredentials;
}

export interface OtterAiLoginResponse {
  token: string;
  userId: string;
  email: string;
  [key: string]: any;
}

export interface OtterAiUser {
  id: string;
  email: string;
  name?: string;
  [key: string]: any;
}

export interface OtterAiSpeaker {
  id: string;
  name: string;
  userId: string;
  [key: string]: any;
}

export interface OtterAiSpeech {
  id: string;
  title: string;
  summary?: string;
  speakers?: OtterAiSpeaker[];
  created: string;
  modified: string;
  userId: string;
  groupId?: string;
  folderId?: string;
  [key: string]: any;
}

export interface OtterAiSpeechDetails extends OtterAiSpeech {
  transcription: OtterAiTranscription[];
  [key: string]: any;
}

export interface OtterAiTranscription {
  id: string;
  text: string;
  speaker?: string;
  speakerId?: string;
  startTime: number;
  endTime: number;
  [key: string]: any;
}

export interface OtterAiFolder {
  id: string;
  name: string;
  userId: string;
  [key: string]: any;
}

export interface OtterAiGroup {
  id: string;
  name: string;
  [key: string]: any;
}

export interface OtterAiNotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  [key: string]: any;
}

export interface OtterAiQueryParams {
  [key: string]: string | number | boolean | undefined;
}

export interface OtterAiUploadOptions {
  title: string;
  description?: string;
  speakers?: string[];
  groupId?: string;
  folderId?: string;
  [key: string]: any;
}

export enum OtterAiEndpoints {
  LOGIN = '/login',
  USER = '/user',
  SPEAKERS = '/speakers',
  SPEECHES = '/speeches',
  SPEECH = '/speech',
  SPEECH_QUERY = '/speech/query',
  UPLOAD = '/upload',
  TRASH = '/trash',
  NOTIFICATION_SETTINGS = '/notification/settings',
  GROUPS = '/groups',
  FOLDERS = '/folders',
}

export interface OtterAiError extends Error {
  statusCode?: number;
  response?: any;
}
