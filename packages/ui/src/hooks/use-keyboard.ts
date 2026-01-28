import { useEffect, useCallback } from "react";

type KeyHandler = (event: KeyboardEvent) => void;
type KeyMap = Record<string, KeyHandler>;

export function useKeyboard(keyMap: KeyMap, enabled: boolean = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key;
      const handler = keyMap[key];

      if (handler) {
        handler(event);
      }
    },
    [keyMap],
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}

export function useEscapeKey(handler: () => void, enabled: boolean = true) {
  useKeyboard({ Escape: handler }, enabled);
}
