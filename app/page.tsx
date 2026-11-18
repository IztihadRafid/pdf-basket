"use client";
import HoopUpload from "@/components/HoopUpload";
import PdfBasketUpload from "@/components/PdfBasketUpload";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 py-10">
      {/* <PdfBasketUpload
        onUpload={async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          await fetch("/api/upload", { method: "POST", body: fd });
        }}
      /> */}
      <HoopUpload
        onUpload={async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload failed");
        }}
      />
    </main>
  );
}
