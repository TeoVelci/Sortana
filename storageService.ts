
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
    // Pause if offline
    while (!navigator.onLine) {
       await new Promise(resolve => window.addEventListener('online', resolve, { once: true }));
    }

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
export const fetchDirectS3Response = async (key: string, onProgress?: (msg: string) => void): Promise<Response> => {
  if (onProgress) onProgress(`[DBG7A] Fetching Edge URL`);
  const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}&redirect=false`;
  const res = await fetch(edgeUrl);
  if (!res.ok) throw new Error(`Edge Function error: ${res.status}`);
  if (onProgress) onProgress(`[DBG7B] Parsing Edge JSON`);
  const data = await res.json();
  if (!data.url) throw new Error("No presigned URL returned");
  if (onProgress) onProgress(`[DBG7C] Fetching S3 URL`);
  const s3Res = await fetch(data.url);
  if (onProgress) onProgress(`[DBG7D] S3 Fetch Complete`);
  return s3Res;
};

export const downloadFileFromS3 = async (key: string): Promise<Blob> => {
  const response = await fetchDirectS3Response(key);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.blob();
};

/**
 * Helper to get a public URL for display by hitting the edge function with GET method.
 * The edge function returns a 302 redirect to the temporary presigned S3 URL,
 * meaning this URL can safely be used directly in <img src="..." />.
 */
export const getPublicUrl = (key: string, download: boolean = false, filename?: string): string => {
  if (!key) return '';
  // Format the direct function URL. 
  // We cannot use supabase.functions.invoke() synchronously, 
  // so we build the public endpoint directly.
  let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}`;
  if (download) {
    url += `&download=true`;
    if (filename) url += `&filename=${encodeURIComponent(filename)}`;
  }
  return url;
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

/**
 * Uploads a large file using S3 Multipart Upload.
 * Chops file into 5MB chunks and uploads concurrently, with offline resilience.
 */
export const multipartUploadFileToS3 = async (
  file: File, 
  filename: string,
  onProgress?: (percent: number) => void
): Promise<UploadResult> => {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  
  // 1. Create Multipart Upload
  const { data: createData, error: createError } = await supabase.functions.invoke('get-aws-presigned-url', {
    body: { action: 'createMultipart', filename, filetype: file.type || 'application/octet-stream' }
  });
  if (createError) throw createError;
  const { uploadId, key } = createData;

  const uploadedParts: { ETag: string, PartNumber: number }[] = [];
  
  try {
    // 2. Upload chunk function
    const uploadChunk = async (partNumber: number, chunk: Blob) => {
      const { data: signData, error: signError } = await supabase.functions.invoke('get-aws-presigned-url', {
        body: { action: 'signPart', uploadId, partNumber, key }
      });
      if (signError) throw signError;
      
      let retries = 5;
      while (retries > 0) {
        // Pause if offline
        while (!navigator.onLine) {
           await new Promise(resolve => window.addEventListener('online', resolve, { once: true }));
        }

        try {
          const res = await fetch(signData.url, {
            method: 'PUT',
            body: chunk,
          });
          
          if (!res.ok) throw new Error(`Upload part ${partNumber} failed: ${res.status}`);
          
          const etag = res.headers.get('ETag') || res.headers.get('etag');
          if (!etag) throw new Error("No ETag returned for part");
          
          return { ETag: etag.replace(/"/g, ''), PartNumber: partNumber };
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    };

    // We can use a simple concurrency limiter
    let activeUploads = 0;
    const maxConcurrent = 3;
    let partsCompleted = 0;
    const promises: Promise<any>[] = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      while (activeUploads >= maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100)); // wait
      }
      
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      activeUploads++;
      const promise = uploadChunk(partNumber, chunk).then((res) => {
        if (res) uploadedParts.push(res);
        activeUploads--;
        partsCompleted++;
        if (onProgress) onProgress(Math.round((partsCompleted / totalParts) * 100));
      }).catch(err => {
        activeUploads--;
        throw err;
      });
      promises.push(promise);
    }
    
    await Promise.all(promises);
    
    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    // 3. Complete Multipart
    const { data: completeData, error: completeError } = await supabase.functions.invoke('get-aws-presigned-url', {
      body: { action: 'completeMultipart', uploadId, parts: uploadedParts, key }
    });
    if (completeError) throw completeError;

    return { url: '', key };

  } catch (err) {
    // 4. Abort on fatal error
    await supabase.functions.invoke('get-aws-presigned-url', {
      body: { action: 'abortMultipart', uploadId, key }
    }).catch(console.error); 
    
    throw err;
  }
};
