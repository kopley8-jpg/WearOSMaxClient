/**
 * Обёртка над ws://localhost:3001 (см. src/server.ts). Превращает
 * type-based обмен сообщениями в обычные async-методы.
 *
 * Использование:
 *   const bridge = new MaxBridge();
 *   await bridge.connect();
 *   const { chats } = await bridge.auth();
 *   await bridge.sendVoice("C:/path/to/file.mp3");
 *
 * Ограничение: сервер не присылает id запроса, поэтому одновременные вызовы
 * одного и того же метода не различаются — ответы разбираются в порядке
 * отправки (FIFO-очередь). Для обычного использования из UI (одна кнопка —
 * один вызов за раз) этого достаточно.
 */

type PendingRequest = {
  successType: string;
  errorType: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export class MaxBridge extends EventTarget {
  private ws: WebSocket | null = null;
  private readonly queue: PendingRequest[] = [];
  private readonly url: string;

  constructor(url = "ws://localhost:3001") {
    super();
    this.url = url;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Открывает соединение с локальным мостом (НЕ авторизация в MAX — для неё вызови auth()). */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.dispatchEvent(new Event("connected"));
        resolve();
      };

      ws.onerror = () => {
        reject(new Error("Bridge WebSocket error"));
      };

      ws.onclose = () => {
        // Обрываем все зависшие запросы, чтобы await не висел вечно
        while (this.queue.length) {
          this.queue.shift()!.reject(new Error("Bridge connection closed"));
        }
        this.dispatchEvent(new Event("disconnected"));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const pending = this.queue[0];

        if (!pending) {
          // Пуш без ожидающего запроса — например, будущее "NEW_MESSAGE".
          this.dispatchEvent(new CustomEvent("push", { detail: message }));
          return;
        }

        if (message.type === pending.successType) {
          this.queue.shift();
          pending.resolve(message.payload);
        } else if (message.type === pending.errorType) {
          this.queue.shift();
          pending.reject(new Error(message.error ?? "Unknown bridge error"));
        }
      };
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Авторизация в MAX (INIT+LOGIN на сервере). Возвращает { profile, chats, contacts, ... }. */
  auth() {
    return this.request<any>("AUTH", "AUTH_SUCCESS", "AUTH_ERROR");
  }

  getHistory() {
    return this.request<any>("GET_HISTORY", "HISTORY_SUCCESS", "HISTORY_ERROR");
  }

  /** path — путь к mp3/wav и т.п. на диске сервера (не файл из браузера!). */
  sendVoice(path: string) {
    return this.request<any>("SEND_VOICE", "VOICE_SUCCESS", "VOICE_ERROR", { path });
  }

  uploadAudio(path: string) {
    return this.request<any>("UPLOAD_AUDIO", "UPLOAD_SUCCESS", "UPLOAD_ERROR", { path });
  }

  private request<T>(
    type: string,
    successType: string,
    errorType: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.isConnected) {
      return Promise.reject(new Error("Bridge is not connected — call connect() first"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ successType, errorType, resolve, reject });
      this.ws!.send(JSON.stringify({ type, ...payload }));
    });
  }
}
