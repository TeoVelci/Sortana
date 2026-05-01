
import { supabase } from './supabaseClient';

export interface UploadResult {
  url: string;
  key: string;
}

export const getPresignedUrl = async (filename: string, filetype: string, retries = 3): Promise<UploadResult> => {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('/api/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename, filetype }),
      });

      if (response.ok) {
        return response.json();
      }
      
      const errorText = await response.text();
      lastError = new Error(`Failed to get upload URL: ${errorText}`);
    } catch (error: any) {
      lastError = error;
      console.warn(`GetPresignedUrl attempt ${i + 1} failed for ${filename}:`, error);
    }

    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('Failed to get upload URL after multiple attempts');
};

export const uploadFileToS3 = async (file: File | Blob, url: string, retries = 3): Promise<void> => {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (response.ok) {
        return;
      }
      
      const errorText = await response.text();
      lastError = new Error(`S3 Upload failed with status ${response.status}: ${errorText}`);
    } catch (error: any) {
      lastError = error;
      console.warn(`Upload attempt ${i + 1} failed for ${(file as File).name || 'blob'}:`, error);
    }

    // Exponential backoff: 1s, 2s, 4s...
    if (i < retries - 1) {
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to upload file to S3 after multiple attempts');
};

export const downloadFileFromS3 = async (key: string): Promise<Blob> => {
  const response = await fetch(`/api/file-url?key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error('Failed to get download URL');
  const { url } = await response.json();
  
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) throw new Error('Failed to download file from S3');
  return fileResponse.blob();
};

export const saveFileMetadata = async (
  userId: string,
  file: File,
  key: string,
  metadata: any
) => {
  // This function would typically save to Supabase DB or similar.
  // For now, we'll just log it or handle it in AppContext state.
  console.log('Saving metadata for', key, metadata);
  
  // Example Supabase Insert (if we had a table):
  /*
  const { error } = await supabase
    .from('files')
    .insert({
      user_id: userId,
      filename: file.name,
      s3_key: key,
      size: file.size,
      type: file.type,
      metadata: metadata
    });
  if (error) throw error;
  */
};
