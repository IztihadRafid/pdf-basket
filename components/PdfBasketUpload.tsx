"use client";

import { useEffect, useRef, useState } from "react";

const W = 400,
  H = 560,
  R = 22;
const START = { x: W / 2, y: H - 70 };
const HOOP = { x: W / 2, y: 170, half: 52 };
const G = 0.5,
  POWER = 0.2,
  MAX_PULL = 120;

type Status = "empty" | "ready" | "aiming" | "flying" | "missed" | "done";

const MSG: Record<Status, string> = {
  empty: "Choose a PDF to get your file 🏀",
  ready: "Pull the file back, aim, release!",
  aiming: "Aim... release to shoot",
  flying: "",
  missed: "Missed! Try again",
  done: "File uploaded 🎉",
};

// keep the pulled file within MAX_PULL of the start, and never above it
const clampPull = (px: number, py: number) => {
  const dx = px - START.x,
    dy = py - START.y;
  const k = Math.min(1, MAX_PULL / (Math.hypot(dx, dy) || 1));
  return { x: START.x + dx * k, y: Math.max(START.y, START.y + dy * k) };
};

export default function PdfBasketUpload({
  onUpload,
}: {
  onUpload?: (file: File) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [error, setError] = useState("");
  const [pos, setPos] = useState(START);
  const arena = useRef<HTMLDivElement>(null);
  const ball = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const pick = (f?: File) => {
    if (!f) return;
    if (f.type !== "application/pdf") return setError("Only PDF files allowed");
    setError("");
    setFile(f);
    setPos(START);
    setStatus("ready");
  };

  useEffect(() => {
    if (status !== "flying") return;
    let raf = 0;
    const tick = () => {
      const b = ball.current;
      const prevY = b.y;
      b.vy += G;
      b.x += b.vx;
      b.y += b.vy;

      // side walls
      if (b.x < R || b.x > W - R) {
        b.x = Math.min(Math.max(b.x, R), W - R);
        b.vx *= -0.7;
      }

      for (const rx of [HOOP.x - HOOP.half, HOOP.x + HOOP.half]) {
        const dx = b.x - rx,
          dy = b.y - HOOP.y;
        const d = Math.hypot(dx, dy) || 1,
          min = R + 4;
        if (d < min) {
          const nx = dx / d,
            ny = dy / d;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 1.6 * dot * nx; // 0.6 bounciness
            b.vy -= 1.6 * dot * ny;
          }
          b.x = rx + nx * min;
          b.y = HOOP.y + ny * min;
        }
      }

      if (
        prevY < HOOP.y &&
        b.y >= HOOP.y &&
        b.vy > 0 &&
        Math.abs(b.x - HOOP.x) < HOOP.half
      ) {
        setPos({ x: HOOP.x, y: HOOP.y + 32 });
        setStatus("done");
        Promise.resolve(onUpload?.(file!)).catch(() =>
          setError("Upload failed"),
        );
        return;
      }

      if (b.y > H - R && b.vy > 0) {
        setPos(START);
        setStatus("missed");
        return;
      }

      setPos({ x: b.x, y: b.y });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const canThrow = status === "ready" || status === "missed";

  const aim = (e: React.PointerEvent) => {
    const r = arena.current!.getBoundingClientRect();
    setPos(clampPull(e.clientX - r.left, e.clientY - r.top));
  };

  const release = () => {
    const vx = (START.x - pos.x) * POWER,
      vy = (START.y - pos.y) * POWER;
    if (Math.hypot(vx, vy) < 3) {
      // tiny pull = cancel
      setPos(START);
      return setStatus("ready");
    }
    ball.current = { x: pos.x, y: pos.y, vx, vy };
    setStatus("flying");
  };

  const dots = [];
  if (status === "aiming") {
    const vx = (START.x - pos.x) * POWER,
      vy = (START.y - pos.y) * POWER;
    for (let t = 4; t <= 56; t += 4) {
      dots.push({
        x: pos.x + vx * t,
        y: pos.y + vy * t + (G * t * (t + 1)) / 2,
      });
    }
  }

  return (
    <div className="mx-auto w-[400px] space-y-3 bg-white py-4 text-center text-sm text-slate-700">
      <label className="inline-block cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 focus-within:ring-2 focus-within:ring-indigo-300">
        {file ? "Change PDF" : "Choose PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <p className="h-5 truncate text-slate-500">
        {file ? `📄 ${file.name}` : ""}
      </p>

      <div
        ref={arena}
        className="relative h-[560px] w-[400px] touch-none select-none overflow-hidden rounded-2xl bg-slate-900"
      >
        {/* backboard, rim, net */}
        <div className="absolute left-[135px] top-[60px] h-[110px] w-[130px] rounded-md border-2 border-slate-500 bg-slate-800" />
        <div className="absolute left-[165px] top-[110px] h-[60px] w-[70px] rounded border-2 border-red-500/70" />
        <div className="absolute left-[148px] top-[167px] h-1.5 w-[104px] rounded bg-red-500" />
        <div className="absolute left-[158px] top-[173px] h-10 w-[84px] rounded-b-2xl border-x-2 border-b-2 border-dashed border-white/50" />

        {/* floor + start marker */}
        <div className="absolute bottom-0 h-3 w-full bg-amber-700" />
        <div
          className="absolute h-11 w-11 rounded-full border-2 border-dashed border-white/20"
          style={{ transform: `translate(${START.x - R}px, ${START.y - R}px)` }}
        />

        {/* aim dots */}
        {dots.map((d, i) => (
          <div
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-white/60"
            style={{ transform: `translate(${d.x - 3}px, ${d.y - 3}px)` }}
          />
        ))}

        {/* the PDF file icon */}
        {file && (
          <div
            role="button"
            aria-label="PDF file: drag back and release to shoot"
            onPointerDown={(e) => {
              if (!canThrow) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setStatus("aiming");
            }}
            onPointerMove={(e) => status === "aiming" && aim(e)}
            onPointerUp={() => status === "aiming" && release()}
            onPointerCancel={() => status === "aiming" && release()}
            className={`absolute left-0 top-0 h-11 w-11 touch-none ${
              canThrow || status === "aiming"
                ? "cursor-grab active:cursor-grabbing"
                : "pointer-events-none"
            }`}
            style={{ transform: `translate(${pos.x - R}px, ${pos.y - R}px)` }}
          >
            <svg viewBox="0 0 44 44" className="h-11 w-11 drop-shadow-md">
              <path
                d="M9 3h18l9 9v29H9z"
                strokeWidth="2"
                strokeLinejoin="round"
                className="fill-white stroke-red-600"
              />
              <path
                d="M27 3v9h9"
                strokeWidth="2"
                strokeLinejoin="round"
                className="fill-red-100 stroke-red-600"
              />
              <rect
                x="9"
                y="22"
                width="27"
                height="12"
                className="fill-red-600"
              />
              <text
                x="22.5"
                y="31.5"
                textAnchor="middle"
                className="fill-white text-[9px] font-bold"
              >
                PDF
              </text>
            </svg>
          </div>
        )}
      </div>

      <p
        aria-live="polite"
        className={`min-h-9 ${
          error
            ? "text-red-500"
            : status === "done"
              ? "text-3xl font-bold text-green-600"
              : "text-slate-600"
        }`}
      >
        {error || MSG[status]}
      </p>
    </div>
  );
}

/* Usage (in a client component, or a client wrapper):
<PdfBasketUpload
  onUpload={async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    await fetch("/api/upload", { method: "POST", body: fd });
  }}
/>
*/
