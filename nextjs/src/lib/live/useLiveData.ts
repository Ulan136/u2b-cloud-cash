"use client";

import { type DependencyList, useCallback, useEffect, useRef, useState } from "react";
import { getTransport } from "./transport";

export interface LiveDataControls {
  /** идёт ли фоновое (тихое) обновление */
  refreshing: boolean;
  /** метка времени последнего успешного обновления (ms) */
  lastUpdated: number | null;
  /** ручной мгновенный перезапрос (фоновый, тихий) */
  refresh: () => void;
}

/**
 * Живое обновление данных страницы.
 *
 * - GET при монтировании и при изменении deps → foreground (можно заполнять формы).
 * - Сигнал транспорта (сейчас polling 20с) → background (тихий перезапрос без мигания).
 * - Возврат фокуса на вкладку и восстановление сети → мгновенный background-перезапрос.
 *
 * load получает { background }. Страница сама решает, что обновлять:
 * при background НЕ трогать несохранённый пользовательский ввод — только просмотр.
 */
export function useLiveData(
  channel: string,
  load: (ctx: { background: boolean }) => void | Promise<void>,
  deps: DependencyList = []
): LiveDataControls {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const lastBgRef = useRef(0);

  const run = useCallback(async (background: boolean) => {
    // схлопываем близкие фоновые перезапросы (focus + visibilitychange вместе)
    if (background) {
      const now = Date.now();
      if (now - lastBgRef.current < 3000) return;
      lastBgRef.current = now;
      setRefreshing(true);
    }
    try {
      await loadRef.current({ background });
      setLastUpdated(Date.now());
    } catch {
      // фоновые сетевые ошибки не показываем — просто ждём следующий сигнал
    } finally {
      if (background) setRefreshing(false);
    }
  }, []);

  // foreground: монтирование + изменение deps
  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // background-триггеры: сигнал транспорта, возврат фокуса, восстановление сети
  useEffect(() => {
    const onSignal = () => run(true);
    const unsub = getTransport().subscribe(channel, onSignal);

    const onVisible = () => {
      if (document.visibilityState === "visible") run(true);
    };
    const onOnline = () => run(true);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [channel, run]);

  return { refreshing, lastUpdated, refresh: () => run(true) };
}
