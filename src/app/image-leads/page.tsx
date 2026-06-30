"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { RecordIndex } from "@/components/record/RecordIndex";
import { imageLeadsConfig } from "@/components/record/configs/image-leads";
import type { RecordRow } from "@/components/record/types";

export default function ImageLeadsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reload, setReload] = useState(0);

  const upload = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const fd = new FormData();
    images.forEach((f) => fd.append("files", f));
    const res = await fetch("/api/image-leads/upload", { method: "POST", body: fd });
    if (!res.ok) {
      toast.error("No se pudieron subir las capturas");
      return;
    }
    setReload((n) => n + 1);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
      <RecordIndex
        config={imageLeadsConfig}
        onNew={() => inputRef.current?.click()}
        newLabel="Subir capturas"
        reloadSignal={reload}
        pollWhile={(row: RecordRow) => row.status === "analyzing"}
      />
    </>
  );
}
