"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MIN_PHOTOS = 3;

interface PhotosUploadProps {
  onComplete: (urls: string[]) => void;
}

interface UploadedPhoto {
  previewUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
  failed: boolean;
}

/**
 * Single-screen photo upload for onboarding.
 *
 * User drops or browses a batch of photos. Each file is uploaded in parallel
 * to /api/upload, then persisted via /api/photos. First successful upload is
 * marked isPrimary=true; the rest isPrimary=false. Continue is enabled once
 * MIN_PHOTOS photos have landed remotely.
 *
 * Note: no "skip" — uploading photos is required for character-sheet + video
 * generation. User must bring at least MIN_PHOTOS.
 */
export default function PhotosUpload({ onComplete }: PhotosUploadProps) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref mirrors the number of successful uploads so the per-file async flow
  // can determine isPrimary without racing on React state updates.
  const successCountRef = useRef(0);

  const handleFiles = useCallback(async (files: FileList) => {
    const accepted = Array.from(files).filter(
      (f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024
    );
    if (accepted.length === 0) return;

    // Seed local state with uploading=true placeholders so previews show
    // immediately with spinner overlays.
    const startIndex = photos.length;
    setPhotos((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        previewUrl: URL.createObjectURL(file),
        remoteUrl: null,
        uploading: true,
        failed: false,
      })),
    ]);

    // Upload in parallel; update each slot as it resolves.
    await Promise.all(
      accepted.map(async (file, i) => {
        const slot = startIndex + i;
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("type", "photo");
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`upload ${res.status}`);
          const data = await res.json();

          // Determine primary: the first photo that successfully uploads
          // this session gets isPrimary=true.
          const isPrimary = successCountRef.current === 0;
          successCountRef.current += 1;

          await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              url: data.url,
              isPrimary,
            }),
          });

          setPhotos((prev) => {
            const next = [...prev];
            next[slot] = {
              ...next[slot],
              remoteUrl: data.url,
              uploading: false,
            };
            return next;
          });
        } catch {
          setPhotos((prev) => {
            const next = [...prev];
            next[slot] = { ...next[slot], uploading: false, failed: true };
            return next;
          });
        }
      })
    );
  }, [photos.length]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    // Note: we don't delete from Supabase / DB here — low cost, and the
    // server-side cleanup is a separate concern. The photo row will exist
    // but won't be referenced by the video pipeline (we only pass remoteUrls
    // from this component's state).
  }, []);

  const successfulUrls = photos
    .map((p) => p.remoteUrl)
    .filter((u): u is string => !!u);
  const canContinue = successfulUrls.length >= MIN_PHOTOS;
  const stillUploading = photos.some((p) => p.uploading);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <AnimatePresence initial={false}>
            {photos.map((photo, idx) => (
              <motion.div
                key={photo.previewUrl}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="relative aspect-square rounded-xl overflow-hidden border border-white/[0.08] group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {/* Upload overlay */}
                {photo.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <motion.div
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  </div>
                )}
                {/* Failure overlay */}
                {photo.failed && (
                  <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                    <span className="text-[10px] text-white font-semibold">Failed</span>
                  </div>
                )}
                {/* Remove button (hover) */}
                {!photo.uploading && (
                  <button
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove photo"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-white/[0.1] rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-500/30 transition-colors"
      >
        <Upload className="w-5 h-5 text-white/25 mx-auto mb-2" />
        <p className="text-[13px] text-white/35 font-medium">
          {photos.length === 0
            ? "Drop photos here or click to browse"
            : "Add more photos"}
        </p>
        <p className="text-[11px] text-white/20 mt-1">
          At least {MIN_PHOTOS} — more variety = better AI twin
        </p>
      </div>

      {/* Count + Continue */}
      <div className="space-y-2">
        <p className="text-[12px] text-white/30 text-center">
          {successfulUrls.length} / {MIN_PHOTOS} minimum
          {photos.length > successfulUrls.length &&
            ` · ${photos.length - successfulUrls.length} uploading`}
        </p>
        <motion.button
          onClick={() => onComplete(successfulUrls)}
          disabled={!canContinue || stillUploading}
          whileHover={canContinue && !stillUploading ? { scale: 1.02 } : {}}
          whileTap={canContinue && !stillUploading ? { scale: 0.97 } : {}}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {stillUploading
            ? "Uploading..."
            : canContinue
              ? `Continue with ${successfulUrls.length} photo${successfulUrls.length > 1 ? "s" : ""}`
              : `Need ${MIN_PHOTOS - successfulUrls.length} more`}
        </motion.button>
      </div>
    </div>
  );
}
