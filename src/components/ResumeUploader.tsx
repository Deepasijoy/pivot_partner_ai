import React, { useRef, useState } from 'react';
import type { ResumeProfile } from '../types';
import { parseResume } from '../services/resumeParserService';

interface ResumeUploaderProps {
  onParsed?: (profile: ResumeProfile) => void;
}

const ResumeUploader: React.FC<ResumeUploaderProps> = ({ onParsed }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedProfile, setParsedProfile] = useState<ResumeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selectedFile: File) => {
    setFile(selectedFile);
    setParsedProfile(null);
    setError(null);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      selectFile(droppedFile);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      selectFile(selectedFile);
    }
  };

  const handleParse = async () => {
  if (!file) return;
  setIsLoading(true);
  setError(null);
  try {
    const profile = await parseResume(file);
    setParsedProfile(profile);
    onParsed?.(profile);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to parse resume. Please try again.');
  } finally {
    setIsLoading(false);
  }
};

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 sm:p-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#26c485] bg-[#26c485]/5' : 'border-[var(--border-warm)] hover:border-[#26c485]'
        }`}
      >
        <svg
          className="h-8 w-8 text-[var(--text-muted)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75V15"
          />
        </svg>
        <p className="text-[var(--text-dark)] font-medium">Drag resume here or click to upload</p>
        <p className="text-sm text-[var(--text-muted)]">PDF only</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {file && (
        <div className="mt-4 flex items-center justify-between rounded-md bg-[var(--surface-2)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-dark)]">{file.name}</p>
            <p className="text-xs text-[var(--text-light)]">{formatFileSize(file.size)}</p>
          </div>
        </div>
      )}

      {file && !parsedProfile && !isLoading && (
        <button
          type="button"
          onClick={handleParse}
          className="mt-4 w-full sm:w-auto rounded-md bg-[#26c485] px-6 py-2.5 font-medium text-white hover:opacity-90 transition-opacity"
        >
          Parse Resume
        </button>
      )}

      {isLoading && (
        <div className="mt-4 flex items-center gap-3 text-[var(--text-light)]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#26c485] border-t-transparent" />
          <span className="text-sm">Analyzing resume...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-sm" style={{ color: 'var(--status-danger)' }}>{error}</p>
          <button
            type="button"
            onClick={handleParse}
            className="mt-2 text-sm font-medium underline transition-opacity hover:opacity-80"
            style={{ color: 'var(--status-danger)' }}
          >
            Retry
          </button>
        </div>
      )}

      {parsedProfile && !isLoading && (
        <div className="mt-4 rounded-md border border-[#26c485]/30 bg-[#26c485]/5 p-4">
          <p className="text-sm font-medium text-[var(--primary-dark)]">Resume parsed successfully</p>
          <p className="mt-1 text-xs text-[var(--text-light)]">
            {parsedProfile.yearsExperience} years experience · {parsedProfile.industries.join(', ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {parsedProfile.skills.map((skill) => (
              <span
                key={skill.name}
                className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"
              >
                {skill.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeUploader;
