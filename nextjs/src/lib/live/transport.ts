// Транспорт-слой живых обновлений.
//
// Страницы и хук useLiveData зависят только от интерфейса LiveTransport.
// Сейчас единственная реализация — PollingTransport (таймер как источник сигнала).
// Позже можно добавить PusherTransport с тем же интерфейсом — ни страницы,
// ни хук useLiveData менять не придётся (достаточно поменять фабрику getTransport).

export type SignalHandler = () => void;

export interface LiveTransport {
  /**
   * Подписка на сигналы канала. Возвращает функцию отписки.
   * onSignal вызывается, когда данные канала стоит перезагрузить.
   */
  subscribe(channel: string, onSignal: SignalHandler): () => void;
}

/**
 * Polling-транспорт: сигнал = тик таймера.
 * Не шлёт сигнал, когда вкладка скрыта (экономим запросы) — мгновенное
 * обновление при возврате обеспечивает сам хук через focus/visibilitychange.
 */
export class PollingTransport implements LiveTransport {
  constructor(private readonly intervalMs: number = 20000) {}

  subscribe(_channel: string, onSignal: SignalHandler): () => void {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      onSignal();
    }, this.intervalMs);
    return () => clearInterval(id);
  }
}

// ── Будущее: real-time через Pusher ──
// export class PusherTransport implements LiveTransport {
//   constructor(private readonly pusher: Pusher) {}
//   subscribe(channel: string, onSignal: SignalHandler): () => void {
//     const ch = this.pusher.subscribe(channel);
//     ch.bind("update", onSignal);
//     return () => { ch.unbind("update", onSignal); this.pusher.unsubscribe(channel); };
//   }
// }

let singleton: LiveTransport | null = null;

/** Единая точка выбора транспорта. Чтобы включить Pusher — поменять только здесь. */
export function getTransport(): LiveTransport {
  if (!singleton) singleton = new PollingTransport(20000);
  return singleton;
}
