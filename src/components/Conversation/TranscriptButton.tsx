import React, { useState, useCallback, useRef } from 'react';
import { useConversations } from '../../contexts/conversations';
import { useToast } from '../../contexts/toast';
import { OtterAiSpeech, OtterAiSpeechDetails } from '../../lib/transcription/otterAiTypes';

interface TranscriptButtonProps {
  conversationId: string;
}

const TranscriptButton: React.FC<TranscriptButtonProps> = ({ conversationId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [transcripts, setTranscripts] = useState<OtterAiSpeech[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { addTextMessage } = useConversations();
  const { showToast } = useToast();

  // Handle clicking outside the dropdown to close it
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setShowDropdown(false);
    }
  }, []);

  // Add and remove event listeners for clicking outside dropdown
  React.useEffect(() => {
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown, handleClickOutside]);

  // Fetch recent transcripts from Otter.ai
  const fetchTranscripts = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.otterAiGetRecentTranscripts();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch transcripts');
      }

      setTranscripts(result.data);
      setShowDropdown(true);
    } catch (error) {
      console.error('Error fetching transcripts:', error);
      showToast(
        'Error',
        error instanceof Error ? error.message : 'Failed to fetch transcripts',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // Insert transcript into conversation
  const insertTranscript = useCallback(async (speechId: string, title: string) => {
    try {
      setIsLoading(true);
      setShowDropdown(false);

      // First add a message indicating we're getting the transcript
      addTextMessage(conversationId, `Inserting transcript: "${title}"...`);

      // Fetch transcript details
      const result = await window.electronAPI.otterAiGetTranscriptDetails(speechId);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch transcript details');
      }

      const details = result.data as OtterAiSpeechDetails;

      // Format the transcript text
      let transcriptText = `## Transcript: ${details.title}\n`;
      transcriptText += `**Date:** ${new Date(details.created).toLocaleString()}\n\n`;

      // Add each transcription segment
      details.transcription.forEach(segment => {
        const speaker = segment.speaker ? `**${segment.speaker}:** ` : '';
        transcriptText += `${speaker}${segment.text}\n`;
      });

      // Add the transcript to the conversation
      addTextMessage(conversationId, transcriptText);

      showToast(
        'Success',
        'Transcript added to conversation',
        'success'
      );
    } catch (error) {
      console.error('Error inserting transcript:', error);
      showToast(
        'Error',
        error instanceof Error ? error.message : 'Failed to insert transcript',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, addTextMessage, showToast]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={fetchTranscripts}
        disabled={isLoading}
        className={`px-2 py-1 rounded-md text-sm font-medium flex items-center
          bg-black/80 text-white border border-gray-700 hover:bg-black/90
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isLoading ? (
          <span className="animate-pulse">Loading...</span>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 mr-1"
            >
              <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
              <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
            </svg>
            Transcripts
          </>
        )}
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-10 mt-2 w-96 max-h-96 overflow-y-auto bg-black/90 border border-gray-700 rounded-md shadow-lg"
        >
          <div className="p-2">
            <h3 className="text-white text-sm font-medium mb-2">Recent Transcripts</h3>
            {transcripts.length === 0 ? (
              <p className="text-gray-400 text-sm">No transcripts found</p>
            ) : (
              <ul className="space-y-1">
                {transcripts.map(transcript => (
                  <li key={transcript.id}>
                    <button
                      onClick={() => insertTranscript(transcript.id, transcript.title)}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800 rounded-md"
                    >
                      <div className="font-medium">{transcript.title}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(transcript.created).toLocaleString()}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptButton;
