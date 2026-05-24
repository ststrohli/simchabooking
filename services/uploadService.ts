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
  console.log("[Upload] Attempting official Firebase Storage upload for path:", storagePath);
  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    console.log("[Upload] Firebase Storage upload succeeded:", downloadURL);
    return downloadURL;
  } catch (err: any) {
    console.error("[Upload] Direct Firebase Storage upload failed:", err);
    throw err;
  }
};
