import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, UploadTaskSnapshot, SettableMetadata } from 'firebase/storage';
import { storage } from './firebase';

const fileToDataURL = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/**
 * Uploads a file directly to Firebase Storage using the official client SDK.
 * Falls back to Base64 Data URL if Firebase Storage is unavailable or unpermitted.
 * 
 * @param file The File or Blob to upload
 * @param storagePath Target destination path in the storage bucket
 * @returns The resolved public download URL or Data URL of the uploaded file
 */
export const uploadFileRobustly = async (file: File | Blob, storagePath: string, metadata?: SettableMetadata): Promise<string> => {
  console.log("[Upload] Attempting official Direct Firebase Storage upload for path:", storagePath);
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file, metadata);
    console.log("[Upload] uploadBytes succeeded:", snapshot);
    const downloadURL = await getDownloadURL(storageRef);
    console.log("[Upload] Firebase Storage upload succeeded:", downloadURL);
    return downloadURL;
  } catch (err: any) {
    console.warn("[Upload] Direct Firebase Storage upload failed/unauthorized. Using Data URL fallback:", err);
    try {
      const dataUrl = await fileToDataURL(file);
      console.log("[Upload] Data URL fallback successfully generated.");
      return dataUrl;
    } catch (fallbackErr) {
      console.error("[Upload] Fallback Data URL generation failed:", fallbackErr);
      throw err;
    }
  }
};

/**
 * Uploads a file with real-time progress tracking.
 * Falls back to Base64 Data URL if Firebase Storage is unavailable or unpermitted.
 * 
 * @param file The File or Blob to upload
 * @param storagePath Target destination path in the storage bucket
 * @param onProgress Callback to receive progress percentage (0-100)
 * @returns The resolved public download URL or Data URL of the uploaded file
 */
export const uploadFileWithProgress = (
  file: File | Blob,
  storagePath: string,
  onProgress?: (progress: number) => void,
  metadata?: SettableMetadata
): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log("[Upload] Attempting progress-tracked upload for path:", storagePath);
    try {
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(progress);
          }
        },
        async (err: any) => {
          console.warn("[Upload] Progress-tracked upload failed/unauthorized. Using Data URL fallback:", err);
          try {
            if (onProgress) onProgress(100);
            const dataUrl = await fileToDataURL(file);
            console.log("[Upload] Data URL fallback successfully generated.");
            resolve(dataUrl);
          } catch (fallbackErr) {
            reject(err);
          }
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("[Upload] Firebase Storage upload succeeded:", downloadURL);
            resolve(downloadURL);
          } catch (err) {
            console.warn("[Upload] getDownloadURL failed. Using Data URL fallback:", err);
            try {
              if (onProgress) onProgress(100);
              const dataUrl = await fileToDataURL(file);
              resolve(dataUrl);
            } catch (fallbackErr) {
              reject(err);
            }
          }
        }
      );
    } catch (err) {
      console.warn("[Upload] Initializing uploadTask failed. Using Data URL fallback:", err);
      fileToDataURL(file)
        .then((dataUrl) => {
          if (onProgress) onProgress(100);
          resolve(dataUrl);
        })
        .catch(() => reject(err));
    }
  });
};
