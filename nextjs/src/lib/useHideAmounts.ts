"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Скрытие сумм по «глазку». Состояние в localStorage.
 *
 * Суммы на странице появляются только после клиентской загрузки данных (useLiveData),
 * а флаг hidden выставляется из localStorage сразу на маунте — поэтому цифры не мелькают:
 * к моменту прихода данных hidden уже корректен.
 */
export function useHideAmounts(key: string) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      // localStorage недоступен — просто показываем суммы
    }
  }, [key]);

  const toggle = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // игнорируем
      }
      return next;
    });
  }, [key]);

  return { hidden, toggle };
}
