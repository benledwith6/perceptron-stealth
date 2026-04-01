"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";
import { motion } from "framer-motion";

interface PhotoUploadProps {
  existingCount: number;
  onComplete: (urls: string[]) => void;
  onSkip: () => void;
}

export default function PhotoUpload({ existingCount, onComplete, onSkip }: PhotoUploadProps) {
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) continue;

      const preview = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, preview]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "photo");
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          newUrls.push(data.url);
          setUploadedUrls((prev) => [...prev, data.url]);

          await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, url: data.url, isPrimary: false }),
          });
        }
      } catch {
        // Continue
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

      <p className="text-[13px] text-white/30 text-center">
        {existingCount} photo{existingCount !== 1 ? "s" : ""} captured
      </p>

      {/* Thumbnail grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((preview, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/[0.08]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-white/[0.1] rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-500/30 transition-colors"
      >
        <Upload className="w-6 h-6 text-white/20 mx-auto mb-2" />
        <p className="text-[14px] text-white/35 font-medium">
          Drop photos here or click to browse
        </p>
        <p className="text-[12px] text-white/20 mt-1">
          More reference photos = better AI twin
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {uploadedUrls.length > 0 && (
          <motion.button
            onClick={() => onComplete(uploadedUrls)}
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
              `Continue with ${uploadedUrls.length} more photo${uploadedUrls.length > 1 ? "s" : ""}`
            )}
          </motion.button>
        )}

        <button
          onClick={onSkip}
          disabled={uploading}
          className="w-full py-2.5 text-[13px] text-white/20 hover:text-white/40 transition-colors"
        >
          Skip — {existingCount} photo{existingCount !== 1 ? "s" : ""} {existingCount === 1 ? "is" : "are"} enough
        </button>
      </div>
    </div>
  );
}
