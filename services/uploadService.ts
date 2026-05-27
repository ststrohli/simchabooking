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
  console.log("[Upload] Attempting server-side upload bypass for path:", storagePath);
  try {
    const formData = new FormData();
    let uploadFile = file;
    if (!(file instanceof File) && file instanceof Blob) {
      // Reconstitute file name if it's a blob
      uploadFile = new File([file], "blob_upload", { type: file.type });
    }
    formData.append('file', uploadFile);
    formData.append('path', storagePath);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data && data.url) {
          console.log("[Upload] Server-side bypass upload succeeded:", data.url);
          return data.url;
        }
      } catch (e) {
        console.warn("[Upload] Received non-JSON response from server-side bypass upload:", text);
      }
    } else {
      const errMsg = await response.text();
      console.warn("[Upload] Server-side upload bypass returned error status:", response.status, errMsg);
    }
  } catch (err) {
    console.warn("[Upload] Server-side upload bypass failed with exception:", err);
  }

  console.log("[Upload] Falling back to official Direct Firebase Storage upload for path:", storagePath);
  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    console.log("[Upload] Firebase Storage fallback upload succeeded:", downloadURL);
    return downloadURL;
  } catch (err: any) {
    console.error("[Upload] Direct Firebase Storage upload failed:", err);
    if (err && (err.code === 'storage/unauthorized' || String(err.message || '').includes('unauthorized'))) {
      throw new Error("Upload has been blocked by Firebase Storage safety check. Please ensure you are logged in with correct account permissions, or retry in a new tab.");
    }
    throw err;
  }
};
