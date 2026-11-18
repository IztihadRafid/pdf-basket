"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, DragEvent, PointerEvent } from "react";

type Status =
  | "empty"
  | "ready"
  | "aiming"
  | "flying"
  | "missed"
  | "uploading"
  | "done";
type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  scored: boolean;
};
type Props = {
  onUpload: (file: File) => Promise<unknown>;
  gravity?: number;
  power?: number;
  maxPull?: number;
};

const W = 800,
  H = 540,
  FLOOR = 480,
  R = 18,
  CW = 80,
  CH = 100;
const START = { x: 120, y: FLOOR - R };
const RIM = { y: 190, l: 594, r: 684 };
const RIM_TIP = 4;
const BOARD = { x: 688, y: 100, w: 10, h: 115 };
const MIN_PULL = 18;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const NET =
  Array.from({ length: 6 }, (_, i) => {
    const t = (i * 90) / 6,
      t2 = ((i + 1) * 90) / 6,
      b = 16 + i * 9.5,
      b2 = 16 + (i + 1) * 9.5;
    return `M${t} 0L${b2} 56M${t2} 0L${b} 56`;
  }).join("") + "M6 20H84M11 38H79";
const COLORS = [
  "bg-orange-400",
  "bg-yellow-300",
  "bg-sky-400",
  "bg-pink-400",
  "bg-lime-400",
  "bg-white",
];
const makeConfetti = () =>
  Array.from({ length: 36 }, (_, i) => ({
    color: COLORS[i % COLORS.length],
    dx: (Math.random() - 0.5) * 360,
    dy: -200 + Math.random() * 320,
    r: Math.random() * 720,
  }));
const MSG: Partial<Record<Status, [string, string]>> = {
  missed: ["Dumb! 😒", "Missed. Your PDF is still here, shoot again."],
  uploading: ["Nothing but net! 🏀", "Uploading your PDF…"],
  done: [
    "Uploaded useless document 😁",
    "Your PDF has been successfully uploaded! 🎉",
  ],
};

export default function HoopUpload({
  onUpload,
  gravity = 1000,
  power = 8.5,
  maxPull = 180,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [aim, setAim] = useState<{ dx: number; dy: number } | null>(null);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [swish, setSwish] = useState(false);
  const [confetti, setConfetti] = useState<ReturnType<typeof makeConfetti>>([]);
  const [go, setGo] = useState(false);
  const [frame, setFrame] = useState(0);
  const [over, setOver] = useState(false);

  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const ball = useRef<Ball>({
    ...START,
    vx: 0,
    vy: 0,
    rot: 0,
    spin: 0,
    scored: false,
  });
  const grab = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const timer = useRef(0);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const paint = useCallback(() => {
    const b = ball.current;
    if (card.current)
      card.current.style.transform = `translate(${b.x - CW / 2}px,${b.y - CH / 2}px) rotate(${b.rot}deg)`;
  }, []);

  const place = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearTimeout(timer.current);
    Object.assign(ball.current, {
      x: START.x,
      y: START.y,
      vx: 0,
      vy: 0,
      rot: 0,
      spin: 0,
      scored: false,
    });
    if (card.current) card.current.style.transition = "";
    paint();
    setAim(null);
    setSwish(false);
    setGo(false);
    setConfetti([]);
  }, [paint]);

  const glide = (x: number, y: number, ms: number) => {
    const el = card.current,
      b = ball.current;
    if (!el) return;
    b.rot = ((((b.rot + 180) % 360) + 360) % 360) - 180;
    paint();
    void el.offsetWidth;
    el.style.transition = `transform ${ms}ms ease-out`;
    Object.assign(b, { x, y, rot: 0 });
    paint();
  };

  useLayoutEffect(() => {
    place();
  }, [file, place]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(timer.current);
    },
    [],
  );

  const upload = async (f: File) => {
    setStatus("uploading");
    await onUpload(f).catch(() => {});
    setStatus("done");
  };

  const miss = () => {
    setStatus("missed");
    timer.current = window.setTimeout(() => {
      glide(START.x, START.y, 600);
      timer.current = window.setTimeout(() => {
        place();
        setStatus("ready");
      }, 650);
    }, 700);
  };

  const score = (f: File) => {
    ball.current.scored = true;
    ball.current.vx *= 0.25;
    setSwish(true);
    window.setTimeout(() => setSwish(false), 250);
    setConfetti(makeConfetti());
    requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    upload(f);
  };

  const fly = (f: File) => {
    let last = performance.now();
    const b = ball.current;
    const bounce = (cx: number, cy: number, pr: number) => {
      const dx = b.x - cx,
        dy = b.y - cy,
        d = Math.hypot(dx, dy);
      if (d === 0 || d >= R + pr) return;
      const nx = dx / d,
        ny = dy / d,
        vn = b.vx * nx + b.vy * ny;
      b.x = cx + nx * (R + pr);
      b.y = cy + ny * (R + pr);
      if (vn < 0) {
        b.vx -= 1.65 * vn * nx;
        b.vy -= 1.65 * vn * ny;
        b.spin *= 0.8;
      }
    };

    const tick = (now: number) => {
      const h = Math.min((now - last) / 1000, 1 / 30) / 3;
      last = now;
      for (let i = 0; i < 3; i++) {
        const prevY = b.y;
        b.vy += gravity * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.rot += b.spin * h;

        if (!b.scored) {
          bounce(RIM.l, RIM.y, RIM_TIP);
          bounce(RIM.r, RIM.y, RIM_TIP);
          bounce(
            clamp(b.x, BOARD.x, BOARD.x + BOARD.w),
            clamp(b.y, BOARD.y, BOARD.y + BOARD.h),
            0,
          );

          if (
            prevY < RIM.y &&
            b.y >= RIM.y &&
            b.vy > 0 &&
            b.x > RIM.l &&
            b.x < RIM.r
          )
            score(f);
        }
        if (b.x < R || b.x > W - R) {
          b.x = clamp(b.x, R, W - R);
          b.vx *= -0.6;
        }
        if (b.y > FLOOR - R && b.vy > 0) {
          b.y = FLOOR - R;
          b.vy = Math.abs(b.vy) > 90 ? b.vy * -0.55 : 0;
          const f2 = Math.exp(-4 * h);
          b.vx *= f2;
          b.spin *= f2;
        }
      }
      paint();
      if (b.y >= FLOOR - R - 0.01 && b.vy === 0 && Math.abs(b.vx) < 12) {
        if (b.scored) glide(b.x, b.y, 300);
        else miss();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const toWorld = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (status !== "ready") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = toWorld(e);
    setStatus("aiming");
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (status !== "aiming") return;
    const p = toWorld(e);
    let dx = p.x - grab.current.x,
      dy = p.y - grab.current.y;
    const d = Math.hypot(dx, dy);
    if (d > maxPull) {
      dx *= maxPull / d;
      dy *= maxPull / d;
    }
    ball.current.x = START.x + dx;
    ball.current.y = START.y + dy;
    paint();
    setAim({ dx, dy });
  };

  const release = () => {
    if (status !== "aiming" || !file) return;
    const b = ball.current,
      dx = b.x - START.x,
      dy = b.y - START.y;
    setAim(null);
    if (Math.hypot(dx, dy) < MIN_PULL) {
      place();
      setStatus("ready");
      return;
    }
    Object.assign(b, {
      vx: -dx * power,
      vy: -dy * power,
      spin: 480,
      scored: false,
    });
    setStatus("flying");
    fly(file);
  };

  const take = (f?: File) => {
    if (!f) return;
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name)))
      return setError("Only .pdf files are allowed.");
    setError("");
    setFile(f);
    setStatus("ready");
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    take(e.target.files?.[0]);
    e.target.value = "";
  };

  const drop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    if (!busy) take(e.dataTransfer.files?.[0]);
  };

  const reset = () => {
    if (status === "done") {
      setFile(null);
      setStatus("empty");
      return;
    }
    place();
    setStatus(file ? "ready" : "empty");
  };

  const pull = aim ? Math.hypot(aim.dx, aim.dy) : 0;
  const dots =
    aim && pull >= MIN_PULL
      ? Array.from({ length: 26 }, (_, i) => {
          const t = (i + 1) * 0.055;
          return {
            x: START.x + aim.dx * (1 - power * t),
            y: START.y + aim.dy * (1 - power * t) + 0.5 * gravity * t * t,
          };
        }).filter((p) => p.y < FLOOR - R && p.x < W)
      : [];
  const angle = aim
    ? Math.round((Math.atan2(aim.dy, -aim.dx) * 180) / Math.PI)
    : 0;
  const msg = MSG[status];
  const made = status === "uploading" || status === "done";
  const busy =
    status === "aiming" || status === "flying" || status === "uploading";

  useEffect(() => {
    if (!made) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 4), 150);
    return () => clearInterval(id);
  }, [made]);

  return (
    <section className="mx-auto w-full max-w-4xl space-y-3 p-4 font-sans">
      <div
        ref={wrap}
        className="relative w-full select-none overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/20"
        style={{ height: H * scale }}
      >
        <div
          ref={stage}
          className="absolute left-0 top-0 origin-top-left select-none overflow-hidden bg-gradient-to-b from-indigo-950 via-indigo-900 to-fuchsia-900"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(255,255,255,.22),transparent_55%)]" />

          <div
            className="absolute inset-x-0 bottom-0 border-t-4 border-white/80 bg-gradient-to-b from-amber-500 to-amber-700"
            style={{ top: FLOOR }}
          >
            <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_78px,rgba(0,0,0,.12)_78px_80px)]" />
          </div>
          <div
            className="absolute rounded-[50%] border-2 border-white/60"
            style={{
              left: START.x - 55,
              top: FLOOR + 14,
              width: 110,
              height: 32,
            }}
          />
          <div
            className="absolute rounded-[50%] bg-black/30 blur-sm"
            style={{
              left: START.x - 34,
              top: FLOOR + 20,
              width: 68,
              height: 14,
            }}
          />

          <div className="absolute left-5 top-4 text-3xl font-black italic tracking-tight text-white drop-shadow">
            PDF UPLOADS
          </div>

          <div
            className="absolute rounded bg-neutral-600"
            style={{
              left: BOARD.x + 2,
              top: BOARD.y + BOARD.h,
              width: 6,
              height: FLOOR - BOARD.y - BOARD.h,
            }}
          />
          <div
            className="absolute rounded-sm border-2 border-white bg-white/90 shadow-lg"
            style={{
              left: BOARD.x,
              top: BOARD.y,
              width: BOARD.w,
              height: BOARD.h,
            }}
          />
          <div
            className="absolute bg-neutral-400"
            style={{
              left: RIM.r,
              top: RIM.y - 2,
              width: BOARD.x - RIM.r,
              height: 4,
            }}
          />
          <div
            className={`absolute z-30 h-1.5 rounded-full bg-orange-500 transition-shadow duration-300 ${made ? "shadow-[0_0_24px_8px_rgba(250,204,21,.9)]" : ""}`}
            style={{
              left: RIM.l - RIM_TIP,
              top: RIM.y - 3,
              width: RIM.r - RIM.l + RIM_TIP * 2,
            }}
          />
          <svg
            className={`pointer-events-none absolute z-30 origin-top transition-transform duration-200 ${swish ? "scale-x-90 scale-y-125" : ""}`}
            style={{ left: RIM.l, top: RIM.y + 2 }}
            width={RIM.r - RIM.l}
            height={56}
            viewBox="0 0 90 56"
            fill="none"
          >
            <path d={NET} className="stroke-white/90 stroke-[1.5]" />
          </svg>

          {dots.map((p, i) => (
            <span
              key={i}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{
                left: p.x,
                top: p.y,
                width: 9 - i * 0.18,
                height: 9 - i * 0.18,
                opacity: 1 - i / 30,
              }}
            />
          ))}

          {file && (
            <div
              ref={card}
              role="button"
              aria-label="Pull back and release to shoot the PDF"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={release}
              onPointerCancel={release}
              onDragStart={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              className={`absolute left-0 top-0 z-20 touch-none select-none drop-shadow-[0_10px_8px_rgba(0,0,0,.45)] ${status === "ready" ? "cursor-grab" : status === "aiming" ? "cursor-grabbing" : ""}`}
              style={{ width: CW, height: CH }}
            >
              <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-orange-400 to-orange-600 [clip-path:polygon(0_0,72%_0,100%_22%,100%_100%,0_100%)]">
                <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-black/35" />
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-black/35" />
                <div className="absolute -left-9 top-0 h-full w-14 rounded-full border-2 border-black/35" />
                <div className="absolute -right-9 top-0 h-full w-14 rounded-full border-2 border-black/35" />
                <div className="absolute left-[72%] top-0 h-[22%] w-[28%] bg-amber-100 [clip-path:polygon(0_0,0_100%,100%_100%)]" />
                {made && (
                  <div
                    className="absolute left-1 top-1 flex h-9 w-9 flex-col items-center justify-center rounded-full border-2 border-black bg-yellow-300 transition-transform duration-150"
                    style={{
                      transform: `rotate(${[-10, 0, 10, 0][frame]}deg) scale(${frame % 2 ? 1.12 : 1})`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-black" />
                      <span className="h-2.5 w-2.5 rounded-full border border-black bg-white p-px">
                        <span className="block h-1 w-1 rounded-full bg-black" />
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 flex w-6 flex-col overflow-hidden rounded-b-full border-2 border-black bg-rose-500 transition-all duration-150 ${frame % 2 ? "h-4" : "h-3"}`}
                    >
                      <div className="flex h-1.5 border-b-2 border-black bg-white">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="flex-1 border-r border-black/50 last:border-r-0"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="absolute left-1.5 top-11 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow">
                  📄 PDF
                </div>
                <div className="absolute inset-x-1.5 bottom-2 truncate rounded bg-white/95 px-1 py-0.5 text-center text-[9px] font-semibold text-neutral-800">
                  {file.name}
                </div>
              </div>
            </div>
          )}

          {confetti.map((c, i) => (
            <span
              key={i}
              className={`pointer-events-none absolute z-40 h-2 w-2 rounded-sm transition-all duration-1000 ease-out ${c.color} ${go ? "opacity-0" : "opacity-100"}`}
              style={{
                left: (RIM.l + RIM.r) / 2,
                top: RIM.y + 20,
                transform: go
                  ? `translate(${c.dx}px,${c.dy}px) rotate(${c.r}deg)`
                  : "none",
              }}
            />
          ))}

          {status === "aiming" && (
            <div className="absolute left-5 top-14 w-44 text-xs font-bold text-white">
              <div className="mb-1 flex justify-between">
                <span>Power {Math.round((pull / maxPull) * 100)}%</span>
                <span>{angle}°</span>
              </div>
              <div className="h-2 rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-400 to-red-500"
                  style={{ width: `${(pull / maxPull) * 100}%` }}
                />
              </div>
            </div>
          )}
          {msg && (
            <div
              role="status"
              className={`absolute left-1/2 top-6 z-50 -translate-x-1/2 rounded-2xl px-6 py-4 text-center shadow-2xl backdrop-blur ${status === "done" ? "bg-emerald-50 ring-4 ring-emerald-400" : "bg-white/95"}`}
            >
              <div className="text-xl font-black text-neutral-900">
                {msg[0]}
              </div>
              <div
                className={`mt-0.5 text-sm font-medium ${status === "done" ? "text-emerald-700" : "text-neutral-600"}`}
              >
                {status === "done" && "✅ "}
                {msg[1]}
              </div>
              {status === "done" && file && (
                <div className="mt-1 max-w-64 truncate text-xs text-neutral-500">
                  {file.name}
                </div>
              )}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-amber-50/90">
            {status === "empty" && "Choose a PDF to get your ball"}
            {status === "ready" && "Press the PDF, pull back, release to shoot"}
          </div>
        </div>
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition focus-within:ring-4 focus-within:ring-orange-300 ${over ? "border-orange-500 bg-orange-100" : "border-neutral-300 bg-white hover:border-orange-400 hover:bg-orange-50"} ${busy ? "pointer-events-none opacity-50" : ""}`}
      >
        <span className="text-3xl">📄</span>
        <span className="text-sm font-bold text-neutral-800">
          {over
            ? "Drop it!"
            : file
              ? "Drop another PDF or click to change"
              : "Drag & drop a PDF here"}
        </span>
        <span className="text-xs text-neutral-500">
          or click to browse (PDF only)
        </span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          onChange={pick}
          disabled={busy}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={reset}
          disabled={!file || status === "uploading"}
          className="rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-100 disabled:opacity-40"
        >
          {status === "done" ? "Upload another PDF" : "Reset shot"}
        </button>
        {file && (
          <span className="max-w-full truncate text-sm font-medium text-neutral-600">
            {file.name}
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm font-medium text-red-600">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
