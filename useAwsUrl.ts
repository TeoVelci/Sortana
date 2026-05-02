import { useState, useEffect } from 'react';
import { getPublicUrl } from './storageService';

/**
 * A custom React hook that asynchronously fetches the true S3 presigned URL for a given key.
 * This bypasses the 302 Redirect, providing the true `s3.amazonaws.com` URL
 * which guarantees native support for <video> byte-range requests and scrubbing.
 */
export const useAwsUrl = (key?: string | null) => {
    const [url, setUrl] = useState<string>('');

    useEffect(() => {
        if (!key) {
            setUrl('');
            return;
        }

        // We append redirect=false to instruct the Edge Function to return JSON instead of 302
        const edgeFunctionUrl = `${getPublicUrl(key)}&redirect=false`;

        let isMounted = true;

        fetch(edgeFunctionUrl)
            .then(res => res.json())
            .then(data => {
                if (isMounted && data && data.url) {
                    setUrl(data.url);
                }
            })
            .catch(err => {
                console.error("Failed to fetch AWS presigned URL for key:", key, err);
                // Fallback to the original redirect URL just in case
                if (isMounted) {
                    setUrl(getPublicUrl(key)); 
                }
            });

        return () => {
            isMounted = false;
        };
    }, [key]);

    return url;
};
