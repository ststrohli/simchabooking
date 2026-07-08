import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, UploadTaskSnapshot, SettableMetadata } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a file directly to Firebase Storage using the official client SDK.
 * 
 * @param file The File or Blob to upload
 * @param storagePath Target destination path in the storage bucket
 * @returns The resolved public download URL of the uploaded file
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
    console.error("[Upload] Direct Firebase Storage upload failed:", err);
    if (err && (err.code === 'storage/unauthorized' || String(err.message || '').includes('unauthorized'))) {
      throw new Error("Upload has been blocked by Firebase Storage safety check. Please ensure you are logged in with correct account permissions, or retry in a new tab.");
    }
    throw err;
  }
};

/**
 * Uploads a file with real-time progress tracking.
 * 
 * @param file The File or Blob to upload
 * @param storagePath Target destination path in the storage bucket
 * @param onProgress Callback to receive progress percentage (0-100)
 * @returns The resolved public download URL of the uploaded file
 */
export const uploadFileWithProgress = (
  file: File | Blob,
  storagePath: string,
  onProgress?: (progress: number) => void,
  metadata?: SettableMetadata
): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log("[Upload] Attempting progress-tracked upload for path:", storagePath);
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
      (err: any) => {
        console.error("[Upload] Progress-tracked upload failed:", err);
        if (err && (err.code === 'storage/unauthorized' || String(err.message || '').includes('unauthorized'))) {
          reject(new Error("Upload has been blocked by Firebase Storage safety check. Please ensure you are logged in with correct account permissions, or retry in a new tab."));
        } else {
          reject(err);
        }
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log("[Upload] Firebase Storage upload succeeded:", downloadURL);
          resolve(downloadURL);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};
