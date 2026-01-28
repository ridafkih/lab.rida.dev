import { useState, useCallback, useRef, useEffect } from "react";

type UseControllableParams<T> = {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
};

export function useControllable<T>({
  value: controlledValue,
  defaultValue,
  onChange,
}: UseControllableParams<T>): readonly [T | undefined, (nextValue: T) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setValue = useCallback(
    (nextValue: T) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      onChangeRef.current?.(nextValue);
    },
    [isControlled],
  );

  return [value, setValue];
}
