import { supabase } from "@/integrations/supabase/client";

/**
 * Compresses an image file if it exceeds max dimension or filesize
 * and converts to a compact WebP/JPEG Base64 Data URL.
 */
export async function compressImageToDataUrl(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const compressedUrl = canvas.toDataURL(mime, quality);
        resolve(compressedUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a note image to Supabase Storage if available,
 * or gracefully falls back to a clean Base64 Data URL.
 */
export async function uploadNoteImage(file) {
  const fileName = file.name || `image_${Date.now()}.png`;
  const cleanAlt = fileName.replace(/\.[^/.]+$/, "").replace(/[^\w\s-]/g, " ") || "Uploaded image";

  try {
    // 1. Try Supabase Storage if authenticated
    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: null }));
    if (auth?.user) {
      const ext = file.name ? file.name.split(".").pop() : "png";
      const storagePath = `${auth.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("note-images")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (!uploadError && uploadData?.path) {
        const { data: publicUrlData } = supabase.storage
          .from("note-images")
          .getPublicUrl(uploadData.path);

        if (publicUrlData?.publicUrl) {
          return {
            url: publicUrlData.publicUrl,
            alt: cleanAlt,
          };
        }
      }
    }
  } catch (err) {
    console.warn("Supabase storage upload fallback to base64:", err);
  }

  // 2. Fallback: Compact Data URL (reliable, 100% offline & portable)
  const dataUrl = await compressImageToDataUrl(file);
  return {
    url: dataUrl,
    alt: cleanAlt,
  };
}
