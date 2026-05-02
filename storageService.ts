
import { supabase } from './supabaseClient';

export interface UploadResult {
  url: string;
  key: string;
}

const BUCKET_NAME = 'sortana'; // Default bucket name

/**
 * Generates a unique presigned URL for the file via the Supabase Edge Function.
 */
export const getPresignedUrl = async (filename: string, filetype: string): Promise<UploadResult> => {
  const { data, error } = await supabase.functions.invoke('get-aws-presigned-url', {
    body: { filename, filetype }
  });

  if (error) throw error;
  return data; // { url: string, key: string }
};

/**
 * Uploads a file directly to AWS S3 using the presigned URL.
 */
export const uploadFileToS3 = async (file: File | Blob, url: string, retries = 3): Promise<void> => {
  let lastError: any;

  // Standard S3 PUT upload
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (response.ok) return;
      lastError = new Error(`S3 Upload failed: ${response.status} ${response.statusText}`);
    } catch (error: any) {
      lastError = error;
    }
    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
  }
  throw lastError;
};

/**
 * Gets a public URL for a file via the Edge Function.
 */
export const downloadFileFromS3 = async (key: string): Promise<Blob> => {
  const url = getPublicUrl(key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.blob();
};

/**
 * Helper to get a public URL for display by hitting the edge function with GET method.
 * The edge function returns a 302 redirect to the temporary presigned S3 URL,
 * meaning this URL can safely be used directly in <img src="..." />.
 */
export const getPublicUrl = (key: string): string => {
  if (!key) return '';
  // Format the direct function URL. 
  // We cannot use supabase.functions.invoke() synchronously, 
  // so we build the public endpoint directly.
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}`;
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
