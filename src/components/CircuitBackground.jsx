// CircuitBackground — animated canvas circuit-board backdrop for the HUD interface.

import { useEffect, useRef } from 'react';

const LINE_COLOR   = 'rgba(0, 180, 255, 0.06)';
const NODE_COLOR   = 'rgba(0, 180, 255, 0.15)';
const PULSE_COLOR  = 'rgba(0, 212, 255, 0.85)';
const N_PULSES     = 30;

function buildCircuit(w, h) {
  const hLines = [];
  const vLines = [];

  let y = -20;
  while (y < h + 20) {
    y += 80 + Math.random() * 140;
    hLines.push(y);
  }
  let x = -20;
  while (x < w + 20) {
    x += 80 + Math.random() * 140;
    vLines.push(x);
  }

  const nodes = [];
  for (const hy of hLines) {
    for (const vx of vLines) {
      nodes.push({ x: vx, y: hy });
    }
  }

  const segments = [];
  for (const hy of hLines) {
    segments.push({ type: 'h', fixed: hy, a: 0, b: w });
  }
  for (const vx of vLines) {
    segments.push({ type: 'v', fixed: vx, a: 0, b: h });
  }

  return { segments, nodes };
}

function makePulse(segments, w, h) {
  const seg = segments[Math.floor(Math.random() * segments.length)];
  const isH = seg.type === 'h';
  return {
    seg,
    isH,
    progress: Math.random(),
    speed: 0.0008 + Math.random() * 0.002,
    dir: Math.random() < 0.5 ? 1 : -1,
  };
}

export default function CircuitBackground() {
  const canvasRef = useRef(null);
  const stateRef  = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      const circuit = buildCircuit(canvas.width, canvas.height);
      const pulses  = Array.from({ length: N_PULSES }, () =>
        makePulse(circuit.segments, canvas.width, canvas.height)
      );
      stateRef.current = { circuit, pulses };
    }

    function draw() {
      if (!stateRef.current) return;
      const { circuit, pulses } = stateRef.current;
      const { width: w, height: h } = canvas;

      ctx.clearRect(0, 0, w, h);

      // Draw circuit lines
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth   = 0.5;
      for (const seg of circuit.segments) {
        ctx.beginPath();
        if (seg.type === 'h') {
          ctx.moveTo(seg.a, seg.fixed);
          ctx.lineTo(seg.b, seg.fixed);
        } else {
          ctx.moveTo(seg.fixed, seg.a);
          ctx.lineTo(seg.fixed, seg.b);
        }
        ctx.stroke();
      }

      // Draw nodes at intersections
      ctx.fillStyle = NODE_COLOR;
      for (const n of circuit.nodes) {
        ctx.fillRect(n.x - 1.5, n.y - 1.5, 3, 3);
      }

      // Update + draw pulses
      for (const p of pulses) {
        p.progress += p.speed * p.dir;
        if (p.progress > 1 || p.progress < 0) {
          p.dir      = -p.dir;
          p.progress = Math.max(0, Math.min(1, p.progress));
        }

        const { seg, isH } = p;
        const px = isH
          ? seg.a + (seg.b - seg.a) * p.progress
          : seg.fixed;
        const py = isH
          ? seg.fixed
          : seg.a + (seg.b - seg.a) * p.progress;

        // Glow
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 6);
        grad.addColorStop(0, PULSE_COLOR);
        grad.addColorStop(1, 'rgba(0,212,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = 'rgba(180, 240, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let running = true;
    function loop() {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        loop();
      }
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        0,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}
