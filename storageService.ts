
import { supabase } from './supabaseClient';

export interface UploadResult {
  url: string;
  key: string;
}

const BUCKET_NAME = 'sortana'; // Default bucket name

/**
 * Universal retry wrapper for network requests to handle browser tab suspension
 * and temporary network drops.
 */
const withRetry = async <T>(operation: () => Promise<T>, maxRetries: number = 12): Promise<T> => {
    let retries = maxRetries;
    let delay = 2000;
    while (retries > 0) {
        // Pause if strictly offline
        while (!navigator.onLine) {
            await new Promise(resolve => window.addEventListener('online', resolve, { once: true }));
        }
        
        try {
            return await operation();
        } catch (err: any) {
            retries--;
            if (retries === 0) throw err;
            console.warn(`Network operation failed, retrying in ${delay}ms... (${maxRetries - retries}/${maxRetries})`, err);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 1.5, 10000); // Caps at 10s per retry
        }
    }
    throw new Error("Unreachable");
};

/**
 * Generates a unique presigned URL for the file via the Supabase Edge Function.
 */
export const getPresignedUrl = async (filename: string, filetype: string): Promise<UploadResult> => {
  return withRetry(async () => {
      const { data, error } = await supabase.functions.invoke('get-aws-presigned-url', {
        body: { filename, filetype }
      });
      if (error) throw error;
      return data;
  });
};

/**
 * Uploads a file directly to AWS S3 using the presigned URL.
 */
export const uploadFileToS3 = async (file: File | Blob, presignedUrl: string, onProgress?: (percent: number) => void) => {
    return withRetry(async () => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', presignedUrl, true);
            
            xhr.setRequestHeader('Content-Type', (file as File).type || 'application/octet-stream');
            
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };
            }
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(true);
                } else {
                    reject(new Error(`Upload failed with status: ${xhr.status}`));
                }
            };
            
            xhr.onerror = () => {
                reject(new Error('Upload failed due to network error'));
            };
            
            xhr.send(file);
        });
    });
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
  const createData = await withRetry(async () => {
      const { data, error } = await supabase.functions.invoke('get-aws-presigned-url', {
        body: { action: 'createMultipart', filename, filetype: file.type || 'application/octet-stream' }
      });
      if (error) throw error;
      return data;
  });
  const { uploadId, key } = createData;

  const uploadedParts: { ETag: string, PartNumber: number }[] = [];
  
  try {
    // 2. Upload chunk function
    const uploadChunk = async (partNumber: number, chunk: Blob) => {
      return withRetry(async () => {
          // 2a. Get Presigned URL for Chunk
          const { data: signData, error: signError } = await supabase.functions.invoke('get-aws-presigned-url', {
            body: { action: 'signPart', uploadId, partNumber, key }
          });
          if (signError) throw signError;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout to prevent browser connection queue aborts
          
          let res;
          try {
              res = await fetch(signData.url, {
                method: 'PUT',
                body: new Blob([chunk]), // Strip type to prevent fetch from sending unsigned Content-Type header
                signal: controller.signal
              });
          } finally {
              clearTimeout(timeoutId);
          }
          
          if (!res.ok) throw new Error(`Upload part ${partNumber} failed: ${res.status}`);
          
          const eTag = res.headers.get('ETag') || res.headers.get('etag') || 'dummy-etag-bypassed-by-backend';
          
          return { ETag: eTag.replace(/"/g, ''), PartNumber: partNumber };
      });
    };

    // We can use a simple concurrency limiter
    let activeUploads = 0;
    const maxConcurrent = 3;
    let partsCompleted = 0;
    const promises: Promise<any>[] = [];
    let hasFailed = false;

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      if (hasFailed) break;
      
      while (activeUploads >= maxConcurrent) {
        if (hasFailed) break;
        await new Promise(resolve => setTimeout(resolve, 100)); // wait
      }
      
      if (hasFailed) break;
      
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
        hasFailed = true;
        throw err;
      });
      promises.push(promise);
    }
    
    await Promise.all(promises);
    
    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    // 3. Complete Multipart
    await withRetry(async () => {
        const { error: completeError } = await supabase.functions.invoke('get-aws-presigned-url', {
          body: { action: 'completeMultipart', uploadId, key, parts: uploadedParts }
        });
        if (completeError) throw completeError;
    });

    return { url: '', key };

  } catch (err) {
    // 4. Abort on fatal error
    await supabase.functions.invoke('get-aws-presigned-url', {
      body: { action: 'abortMultipart', uploadId, key }
    }).catch(console.error); 
    
    throw err;
  }
};
