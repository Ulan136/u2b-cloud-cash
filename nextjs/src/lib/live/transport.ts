// Транспорт-слой живых обновлений.
//
// Страницы и хук useLiveData зависят только от интерфейса LiveTransport.
// Реализация LocalTransport даёт три источника сигнала:
//   1. таймер (опрос) — запасной канал, ловит изменения с других устройств;
//   2. notify() — мгновенный сигнал после изменения данных в этой же вкладке;
//   3. BroadcastChannel — мгновенный сигнал другим вкладкам того же браузера.
// Позже можно заменить на PusherTransport (реалтайм между устройствами) —
// достаточно поменять фабрику getTransport().

export type SignalHandler = () => void;

export interface LiveTransport {
  /**
   * Подписка на сигналы канала. Возвращает функцию отписки.
   * onSignal вызывается, когда данные канала стоит перезагрузить.
   */
  subscribe(channel: string, onSignal: SignalHandler): () => void;
  /** Мгновенно попросить все страницы перезагрузиться (после изменения данных). */
  notify(): void;
}

/**
 * Локальный транспорт: опрос + мгновенные сигналы.
 * Сигнал не шлём, когда вкладка скрыта (экономим запросы) — мгновенное
 * обновление при возврате обеспечивает сам хук через focus/visibilitychange.
 */
export class LocalTransport implements LiveTransport {
  private handlers = new Set<SignalHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bc: BroadcastChannel | null = null;

  constructor(private readonly intervalMs: number = 12000) {
    if (typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel("u2b-live");
      // Сообщение от другой вкладки → тихо перезагрузить данные этой вкладки.
      this.bc.onmessage = () => this.fire();
    }
  }

  private fire() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.handlers.forEach((h) => h());
  }

  subscribe(_channel: string, onSignal: SignalHandler): () => void {
    this.handlers.add(onSignal);
    if (!this.timer) {
      this.timer = setInterval(() => this.fire(), this.intervalMs);
    }
    return () => {
      this.handlers.delete(onSignal);
      if (this.handlers.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  notify(): void {
    // локально — сразу; другим вкладкам браузера — через BroadcastChannel
    this.fire();
    try {
      this.bc?.postMessage("change");
    } catch {
      // канал мог закрыться — не критично
    }
  }
}

// ── Будущее: real-time между устройствами через Pusher ──
// export class PusherTransport implements LiveTransport { ... }

let singleton: LiveTransport | null = null;

/** Единая точка выбора транспорта. Чтобы включить Pusher — поменять только здесь. */
export function getTransport(): LiveTransport {
  if (!singleton) singleton = new LocalTransport(12000);
  return singleton;
}

/**
 * Позвать после успешного изменения данных (сохранение долга, кассы, зарплаты…),
 * чтобы открытые страницы/вкладки сразу перезагрузили данные, не дожидаясь опроса.
 */
export function notifyLive(): void {
  getTransport().notify();
}
