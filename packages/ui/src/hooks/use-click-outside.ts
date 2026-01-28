import { useEffect, useRef, type RefObject } from "react";

export function useClickOutside<T extends HTMLElement>(
  handler: () => void,
  enabled: boolean = true,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) {
        handlerRef.current();
      }
    }

    function handleTouch(event: TouchEvent) {
      const target = event.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) {
        handlerRef.current();
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleTouch);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleTouch);
    };
  }, [enabled]);

  return ref;
}
