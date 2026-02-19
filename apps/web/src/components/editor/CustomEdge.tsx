import { useEffect, useRef } from "react";
import { BaseEdge, EdgeProps, getSmoothStepPath } from "@xyflow/react";

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  animated,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const pathRef = useRef<SVGPathElement | null>(null);
  const circleRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (!animated) return;
    let raf = 0;
    let start = 0;
    const durationMs = Math.max(150, Number(data?.animationDurationMs) || 1000);

    const tick = (now: number) => {
      if (!start) start = now;
      const path = pathRef.current;
      const circle = circleRef.current;

      if (path && circle) {
        const length = path.getTotalLength();
        const progress = ((now - start) % durationMs) / durationMs;
        const p = path.getPointAtLength(progress * length);
        circle.setAttribute("cx", String(p.x));
        circle.setAttribute("cy", String(p.y));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated, edgePath, data?.animationDurationMs]);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {animated && (
        <>
          <path ref={pathRef} d={edgePath} fill="none" stroke="none" />
          <circle ref={circleRef} r="3" fill="var(--pb-accent)" style={{ pointerEvents: "none" }} />
        </>
      )}
    </>
  );
}
