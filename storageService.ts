
import { supabase } from './supabaseClient';

export interface UploadResult {
  url: string;
  key: string;
}

const BUCKET_NAME = 'sortana'; // Default bucket name

/**
 * Generates a unique key for the file in Supabase Storage.
 * In a serverless environment, we bypass the /api/upload-url call.
 */
export const getPresignedUrl = async (filename: string, _filetype: string): Promise<UploadResult> => {
  // Instead of a real presigned URL, we return a "supabase://" protocol URL
  // that our uploadFile function will recognize.
  const timestamp = Date.now();
  const key = `uploads/${timestamp}-${filename}`;
  return {
    url: `supabase://${key}`,
    key: key
  };
};

/**
 * Uploads a file directly to Supabase Storage.
 * Handles both the custom "supabase://" protocol and standard URLs for backward compatibility.
 */
export const uploadFileToS3 = async (file: File | Blob, url: string, retries = 3): Promise<void> => {
  let lastError: any;

  // Check if this is a Supabase direct upload
  if (url.startsWith('supabase://')) {
    const key = url.replace('supabase://', '');
    
    for (let i = 0; i < retries; i++) {
      try {
        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(key, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
            cacheControl: '3600'
          });

        if (error) throw error;
        return; // Success
      } catch (error: any) {
        lastError = error;
        console.warn(`Supabase upload attempt ${i + 1} failed:`, error);
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
    throw lastError || new Error('Supabase upload failed after retries');
  }

  // Fallback for standard S3 PUT uploads (if needed)
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (response.ok) return;
      lastError = new Error(`S3 Upload failed: ${response.status}`);
    } catch (error: any) {
      lastError = error;
    }
    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
  }
  throw lastError;
};

/**
 * Gets a public URL for a file in Supabase Storage.
 */
export const downloadFileFromS3 = async (key: string): Promise<Blob> => {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(key);

  if (error) throw error;
  return data;
};

/**
 * Helper to get a public URL for display.
 */
export const getPublicUrl = (key: string): string => {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(key);
  return data.publicUrl;
};

export const saveFileMetadata = async (
  userId: string,
  file: File,
  key: string,
  metadata: any
) => {
  console.log('Saving metadata for', key, metadata);
  // Metadata is handled via upsertItem in AppContext
};
