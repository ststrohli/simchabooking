import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Robustly uploads a file by first attempting the server-side API upload bypass.
 * If the server-side upload is not available, fails, or returns an invalid/HTML response (e.g. 502/504/404/Vite fallback),
 * it seamlessly falls back to direct client-side upload using the Firebase Storage SDK.
 * 
 * @param file The File or Blob to upload
 * @param storagePath Target destination path in the storage bucket
 * @returns The resolved public download URL of the uploaded file
 */
export const uploadFileRobustly = async (file: File | Blob, storagePath: string): Promise<string> => {
  // 1. Try server-side upload first
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', storagePath);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const text = await response.text();
      // Try parsing as JSON to make sure it's valid JSON
      try {
        const data = JSON.parse(text);
        if (data && data.url) {
          console.log("[Upload] Server-side upload succeeded:", data.url);
          return data.url;
        }
      } catch {
        console.warn("[Upload] Server-side returned non-JSON/invalid JSON response, falling back to client-side:", text.substring(0, 100));
      }
    } else {
      console.warn("[Upload] Server-side upload response not OK:", response.status, response.statusText);
    }
  } catch (err) {
    console.error("[Upload] Server-side upload failed/errored, falling back to client-side:", err);
  }

  // 2. Fallback to client-side upload directly to Firebase Storage
  console.log("[Upload] Attempting client-side fallback upload for path:", storagePath);
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  console.log("[Upload] Client-side upload succeeded:", downloadURL);
  return downloadURL;
};
