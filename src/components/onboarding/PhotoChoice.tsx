"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Upload, Zap, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PhotoChoiceProps {
  onChooseCamera: () => void;
  onUploadComplete: (urls: string[]) => void;
}

export default function PhotoChoice({ onChooseCamera, onUploadComplete }: PhotoChoiceProps) {
  const [mode, setMode] = useState<"choose" | "uploading">("choose");
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    setMode("uploading");
    setUploading(true);

    const newUrls: string[] = [];
    const newPreviews: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) continue;

      // Create local preview
      const preview = URL.createObjectURL(file);
      newPreviews.push(preview);
      setPreviews((prev) => [...prev, preview]);

      // Upload to server
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "photo");
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          newUrls.push(data.url);
          setUploadedUrls((prev) => [...prev, data.url]);

          // Also create photo record
          await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, url: data.url, isPrimary: newUrls.length === 1 }),
          });
        }
      } catch {
        // Continue with other files
      }
    }

    setUploading(false);
  }, []);

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

  const handleDone = useCallback(() => {
    onUploadComplete(uploadedUrls);
  }, [uploadedUrls, onUploadComplete]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <AnimatePresence mode="wait">
        {mode === "choose" && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {/* Primary: Camera */}
            <motion.button
              onClick={onChooseCamera}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/8 to-transparent p-5 flex items-center gap-4 transition-all hover:border-indigo-400/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]"
            >
              <motion.div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex-shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-xl bg-indigo-500/30"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-left z-10">
                <p className="text-[15px] font-bold text-white">Take pictures now</p>
                <p className="text-[12px] text-indigo-300/60 mt-0.5 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  4 quick expressions for best results
                </p>
              </div>
              <div className="ml-auto z-10">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-[10px] text-white/40">&rarr;</span>
                </div>
              </div>
            </motion.button>

            {/* Secondary: Upload */}
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="group w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                <Upload className="w-4 h-4 text-white/35" />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-semibold text-white/55">Upload photos</p>
                <p className="text-[12px] text-white/25 mt-0.5">From your device</p>
              </div>
            </motion.button>

            <p className="text-[11px] text-white/20 text-center pt-1">
              Your photos are only used to build your AI twin. Never shared.
            </p>
          </motion.div>
        )}

        {mode === "uploading" && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            {/* Thumbnail grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {previews.map((preview, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/[0.08]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone for more */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/[0.1] rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-500/30 transition-colors"
            >
              <Upload className="w-5 h-5 text-white/25 mx-auto mb-2" />
              <p className="text-[13px] text-white/30">
                {previews.length > 0 ? "Drop more photos or click to add" : "Drop photos here or click to browse"}
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {uploadedUrls.length > 0 && (
                <motion.button
                  onClick={handleDone}
                  disabled={uploading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] disabled:opacity-40 transition-all"
                >
                  {uploading ? (
                    <motion.div
                      className="w-4 h-4 mx-auto border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                  ) : (
                    `Continue with ${uploadedUrls.length} photo${uploadedUrls.length > 1 ? "s" : ""}`
                  )}
                </motion.button>
              )}

              <button
                onClick={() => { setMode("choose"); setPreviews([]); setUploadedUrls([]); }}
                className="w-full py-2 text-[12px] text-white/20 hover:text-white/40 transition-colors"
              >
                Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
