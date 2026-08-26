import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, UploadTaskSnapshot, SettableMetadata } from 'firebase/storage';
import { storage } from './firebase';

const fileToDataURL = async (file: File | Blob): Promise<string> => {
  const isImage = file.type.startsWith('image/');
  
  if (isImage) {
    try {
      const compressed = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const maxWidth = 1000;
            const maxHeight = 1000;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(e.target?.result as string);
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.onerror = () => resolve(e.target?.result as string);
          img.src = e.target?.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      if (compressed.length <= 750000) {
        return compressed;
      }
    } catch (e) {
      console.warn("[Upload] Image compression fallback warning:", e);
    }
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length > 750000) {
    throw new Error(`File is too large (${Math.round(rawDataUrl.length / 1024)}KB) to attach directly without cloud storage. Please attach a file under 700KB.`);
  }

  return rawDataUrl;
};

const uploadToBackendAPI = (
  file: File | Blob, 
  storagePath: string, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.url);
        } catch (e) {
          reject(new Error("Invalid response from server"));
        }
      } else {
        reject(new Error(xhr.responseText || `Server error: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during backend upload"));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', storagePath);

    xhr.send(formData);
  });
};

/**
 * Uploads a file directly to Firebase Storage using the official client SDK.
 * Falls back to Backend API if Firebase Storage is unavailable or unpermitted.
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
    console.warn("[Upload] Direct Firebase Storage upload failed/unauthorized. Using Backend API fallback:", err);
    try {
      const backendUrl = await uploadToBackendAPI(file, storagePath);
      console.log("[Upload] Backend API fallback succeeded:", backendUrl);
      return backendUrl;
    } catch (apiErr) {
      console.warn("[Upload] Backend API fallback failed. Using Data URL fallback:", apiErr);
      try {
        const dataUrl = await fileToDataURL(file);
        console.log("[Upload] Data URL fallback successfully generated.");
        return dataUrl;
      } catch (fallbackErr) {
        console.error("[Upload] Fallback Data URL generation failed:", fallbackErr);
        throw err;
      }
    }
  }
};

/**
 * Uploads a file with real-time progress tracking.
 * Falls back to Backend API if Firebase Storage is unavailable or unpermitted.
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
          console.warn("[Upload] Progress-tracked upload failed/unauthorized. Using Backend API fallback:", err);
          try {
            const backendUrl = await uploadToBackendAPI(file, storagePath, onProgress);
            console.log("[Upload] Backend API fallback succeeded:", backendUrl);
            resolve(backendUrl);
          } catch (apiErr) {
            console.warn("[Upload] Backend API fallback failed. Using Data URL fallback:", apiErr);
            try {
              if (onProgress) onProgress(100);
              const dataUrl = await fileToDataURL(file);
              console.log("[Upload] Data URL fallback successfully generated.");
              resolve(dataUrl);
            } catch (fallbackErr) {
              reject(err);
            }
          }
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("[Upload] Firebase Storage upload succeeded:", downloadURL);
            resolve(downloadURL);
          } catch (err) {
            console.warn("[Upload] getDownloadURL failed. Using Backend API fallback:", err);
            try {
              const backendUrl = await uploadToBackendAPI(file, storagePath, onProgress);
              console.log("[Upload] Backend API fallback succeeded:", backendUrl);
              resolve(backendUrl);
            } catch (apiErr) {
              console.warn("[Upload] Backend API fallback failed. Using Data URL fallback:", apiErr);
              try {
                if (onProgress) onProgress(100);
                const dataUrl = await fileToDataURL(file);
                resolve(dataUrl);
              } catch (fallbackErr) {
                reject(err);
              }
            }
          }
        }
      );
    } catch (err) {
      console.warn("[Upload] Initializing uploadTask failed. Using Backend API fallback:", err);
      uploadToBackendAPI(file, storagePath, onProgress)
        .then(resolve)
        .catch((apiErr) => {
          console.warn("[Upload] Backend API fallback failed. Using Data URL fallback:", apiErr);
          fileToDataURL(file)
            .then((dataUrl) => {
              if (onProgress) onProgress(100);
              resolve(dataUrl);
            })
            .catch(() => reject(err));
        });
    }
  });
};
