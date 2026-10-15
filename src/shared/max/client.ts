import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MAX_INT64,
  encodeFrame,
  decodeFrame,
  toBuffer,
  bigintReplacer,
  type MaxFrame,
} from "./protocol";
import { prepareVoiceMessage } from "./audio";
import type { ChatLastMessage, ChatPreview } from "../types/types";

const execFileAsync = promisify(execFile);

const MAX_WS_URL = "wss://api.oneme.ru/websocket";
const PING_INTERVAL_MS = 25_000;
const RESPONSE_TIMEOUT_MS = 30_000;

export type MaxClientConfig = {
  token: string;
  deviceId: string;
  /** По умолчанию wss://api.oneme.ru/websocket — реальный бинарный эндпоинт MAX. */
  wsUrl?: string;
};

/** MAX использует отрицательные int64 как идентификаторы чатов. */
export type ChatId = bigint;

type Waiter = {
  opcode: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * Клиент бинарного протокола MAX Messenger (LZ4 + msgpack,
 * wss://api.oneme.ru/websocket — НЕ wss://ws-api.oneme.ru, тот отдаёт
 * только легаси JSON и рвёт любые бинарные кадры).
 *
 * ```ts
 * const client = new MaxClient({ token, deviceId });
 * await client.connect();
 * const history = await client.getHistory(-79205620931161n);
 * await client.sendVoice(-79205620931161n, "C:/path/to/voice.mp3");
 * ```
 *
 * События: "push" (любой входящий кадр, не являющийся ответом на запрос —
 * presence, новые сообщения и т.п.), "close", "error".
 */

export class MaxClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private seq = 0;
  private authenticated = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private readonly pending = new Map<number, Waiter>();

  private readonly wsUrl: string;
  private readonly token: string;
  private readonly deviceId: string;

  constructor(config: MaxClientConfig) {
    super();
    this.token = config.token;
    this.deviceId = config.deviceId;
    this.wsUrl = config.wsUrl ?? MAX_WS_URL;
  }

  get isConnected(): boolean {
    return this.authenticated;
  }

  /** Открывает соединение и выполняет INIT+LOGIN. Резолвится с payload LOGIN-ответа. */
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // 1. Открываем WebSocket
    await this.open();

    // 2. Инициализируем сессию
    await this.request(6, {
      userAgent: {
        deviceType: "WEB",
        locale: "ru",
        deviceLocale: "ru",
        osVersion: "Windows",
        deviceName: "Chrome",
        headerUserAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
        appVersion: "25.11.1",
        screen: "1920x1080 1.0x",
        timezone: "Europe/Moscow",
      },
      deviceId: this.deviceId,
    });

    // 3. Логинимся
    const loginResult = await this.request(19, {
      interactive: true,
      token: this.token,
      chatsCount: 100,
      chatsSync: 100,
      contactsSync: 0,
      presenceSync: 0,
      draftsSync: 0,
    });

    // 4. Собираем ID собеседников из DIALOG
    const dialogUserIds: number[] = [
      ...new Set<number>(
        (loginResult.chats ?? [])
          .filter((chat: any) => chat.type === "DIALOG")
          .flatMap((chat: any) =>
            Object.keys(chat.participants ?? {})
              .map(Number)
              .filter((id) => id !== Number(chat.owner)),
          ),
      ),
    ];

    console.log("DIALOG USER IDS:", dialogUserIds);

    // 5. Получаем профили собеседников
    const profiles = await this.getContacts(dialogUserIds);

    console.log("CONTACT INFO:");
    console.dir(profiles, { depth: null });

    const profilesById = new Map<number, any>(
      profiles.map((profile: any) => [profile.id, profile]),
    );

    // 6. Формируем превью чатов
    const chats = (loginResult.chats ?? []).map((chat: any) => {
      if (chat?.type === "CHAT") {
        console.dir(chat, { depth: null });
      }

      return this.getChatPreview(chat, profilesById);
    });

    this.authenticated = true;

    return {
      chats,
    };
  }
  disconnect(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
  }

  /** История чата. from/forward/backward — параметры протокола MAX. */
  async getHistory(
    chatId: string,
    opts: { from?: bigint; forward?: number; backward?: number } = {},
  ) {
    const from = opts.from ?? BigInt(Date.now());
    return this.request(49, {
      chatId: MAX_INT64(BigInt(chatId)),
      from: Number(from), // веб шлёт обычный uint64, не ext
      forward: opts.forward ?? 0,
      backward: opts.backward ?? 30,
      getMessages: true, // было getMessage
    });
  }

  /** Страница истории строго старше `before`, по возрастанию времени. */
  async getHistoryPage(chatId: ChatId, before?: bigint, count = 30) {
    const res = await this.getHistory(chatId, {
      from: before,
      backward: count,
    });
    const msgs: any[] = res.messages ?? [];
    return msgs
      .filter((m) => before === undefined || BigInt(m.time) < before)
      .sort((a, b) => (BigInt(a.time) < BigInt(b.time) ? -1 : 1));
  }

  /**
   * Конвертирует аудиофайл (mp3/wav/что угодно, понятное ffmpeg) в голосовое
   * сообщение MAX и отправляет его в чат. Возвращает объект сообщения от сервера.
   */
  async sendVoice(chatId: ChatId, sourcePath: string) {
    const { oggPath, duration, wave } = await prepareVoiceMessage(sourcePath);
    const { size } = await stat(oggPath);

    const uploadResult = await this.request(82, {
      count: 1,
      type: 2,
      uploaderType: 1,
    });
    const info = uploadResult.info[0];

    await this.uploadRaw(info.url, oggPath, size);

    return this.request(64, {
      chatId: MAX_INT64(chatId),
      message: {
        cid: MAX_INT64(BigInt(-Date.now())),
        attaches: [
          {
            _type: "AUDIO",
            audioId: Number(info.videoId),
            duration,
            wave,
            token: info.token,
          },
        ],
      },
      notify: true,
    });
  }

  /** Загружает произвольный файл и прикрепляет его к сообщению. */
  async sendFile(chatId: ChatId, filePath: string) {
    const file = await readFile(filePath);
    const fileName = basename(filePath);
    const ext = fileName.includes(".") ? fileName.split(".").pop()! : "";

    const uploadResult = await this.request(87, {
      name: fileName,
      size: file.length,
      ext,
      count: 1,
    });
    const info = uploadResult.info?.[0];
    if (!info) throw new Error("MAX did not return upload info");

    const form = new FormData();
    form.append("file", new Blob([file]), fileName);
    const response = await fetch(info.url, { method: "POST", body: form });
    if (!response.ok) {
      throw new Error(
        `File upload failed: ${response.status} ${await response.text()}`,
      );
    }

    // Как и в браузере: MAX не всегда готов сразу принять только что
    // загруженный файл в сообщении — небольшая пауза снижает шанс ошибки.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return this.request(64, {
      chatId: MAX_INT64(chatId),
      message: {
        cid: MAX_INT64(BigInt(Date.now())),
        attaches: [
          {
            _type: "FILE",
            fileId: info.fileId,
            token: info.token,
            name: fileName,
            size: file.length,
          },
        ],
      },
      notify: true,
    });
  }

  // ---------------------------------------------------------------------
  // Внутреннее
  // ---------------------------------------------------------------------

  private getChatPreview(chat: any, profiles: Map<number, any>): ChatPreview {
    if (!chat) {
      throw new Error("MAX returned an empty chat");
    }

    if (chat.type === "DIALOG") {
      if (!chat.participants) {
        throw new Error(`DIALOG chat ${chat.id} has no participants`);
      }

      const otherUserId = Object.keys(chat.participants)
        .map(Number)
        .find((id) => id !== Number(chat.owner));

      // Избранное
      if (chat.id === 0) {
        return {
          id: String(chat.id),
          type: "DIALOG",
          title: "Избранное",
          avatarUrl: undefined,
          lastMessage: mapLastMessage(chat.lastMessage),
        };
      }

      if (otherUserId === undefined) {
        console.log("DIALOG WITHOUT OTHER USER:");
        console.dir(chat, { depth: null });
      }

      const contact =
        otherUserId !== undefined ? profiles.get(otherUserId) : undefined;

      if (!contact) {
        console.log("DIALOG WITHOUT CONTACT:");
        console.dir(chat, { depth: null });
        console.log("OTHER USER:", otherUserId);
      }

      const customName = contact?.names?.find(
        (name: any) => name.type === "CUSTOM",
      )?.name;

      const oneMeName = contact?.names?.find(
        (name: any) => name.type === "ONEME",
      )?.name;

      return {
        id: String(chat.id),
        type: "DIALOG",
        title: customName ?? oneMeName ?? `Пользователь ${otherUserId}`,
        avatarUrl: contact?.baseUrl,
        lastMessage: mapLastMessage(chat.lastMessage),
      };
    }

    return {
      id: String(chat.id),
      type: "CHAT",
      title: chat.title ?? "Без названия",
      avatarUrl: chat.baseIconUrl,
      lastMessage: mapLastMessage(chat.lastMessage),
    };
  }

  async getChatMedia(chatId: ChatId, messageId: bigint) {
    return this.request(51, {
      chatId: MAX_INT64(chatId),
      message: MAX_INT64(messageId),
      attachTypes: ["VIDEO", "_MSG", "AUDIO"],
      forward: 0,
      backward: 0,
    });
  }

  async getVoiceUrl(chatId: ChatId, messageId: bigint): Promise<string> {
    const result = await this.getChatMedia(chatId, messageId);

    const message = result.messages?.find(
      (message: any) => String(message.id) === String(messageId),
    );

    const audio = message?.attaches?.find(
      (attach: any) => attach._type === "AUDIO",
    );

    if (!audio?.url) {
      throw new Error(`Audio URL not found for message ${messageId}`);
    }

    return audio.url;
  }

  async getContacts(contactIds: number[]) {
    const result = await this.request(32, {
      contactIds,
    });

    return result.contacts ?? [];
  }
  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, {
        headers: { Origin: "https://web.max.ru", "User-Agent": "Mozilla/5.0" },
      });

      ws.on("open", () => {
        this.ws = ws;
        resolve();
      });

      ws.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      ws.on("close", (code, reason) => {
        this.stopHeartbeat();
        this.authenticated = false;
        this.ws = null;
        this.emit("close", { code, reason: reason.toString() });
      });

      ws.on("message", (raw) => {
        const data = toBuffer(raw);
        if (data[0] !== 10) return; // не бинарный кадр протокола — игнорируем

        let frame: MaxFrame;
        try {
          frame = decodeFrame(data);
        } catch (error) {
          this.emit("error", error as Error);
          return;
        }

        const waiter = this.pending.get(frame.seq);
        if (
          waiter &&
          (frame.cmd === 1 || frame.cmd === 3) &&
          frame.opcode === waiter.opcode
        ) {
          clearTimeout(waiter.timeout);
          this.pending.delete(frame.seq);

          if (frame.cmd === 3) {
            waiter.reject(
              new Error(
                `MAX error: ${JSON.stringify(frame.payload, bigintReplacer)}`,
              ),
            );
          } else {
            waiter.resolve(frame.payload);
          }
          return;
        }

        this.emit("push", frame);
      });
    });
  }

  /** Отправляет запрос и ждёт ответ с тем же seq/opcode (или ошибку cmd:3). */
  private request(opcode: number, payload?: unknown): Promise<any> {
    if (!this.ws)
      return Promise.reject(new Error("MAX WebSocket is not connected"));

    const seq = ++this.seq;
    const promise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`Timeout waiting for opcode=${opcode}, seq=${seq}`));
      }, RESPONSE_TIMEOUT_MS);

      this.pending.set(seq, { opcode, resolve, reject, timeout });
    });

    this.ws.send(encodeFrame(0, seq, opcode, payload));
    return promise;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.request(1, { interactive: true }).catch(() => {
        /* heartbeat не критичен — реальный обрыв соединения поймает "close" */
      });
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Заливка сырого файла в MAX storage (тот же URL, что вернул opcode 82/87). */
  private async uploadRaw(
    url: string,
    filePath: string,
    size: number,
  ): Promise<void> {
    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "-w",
      "\nHTTP:%{http_code}\n",
      "-X",
      "POST",
      "-H",
      "Content-Type: application/octet-stream",
      "-H",
      `Content-Disposition: attachment; filename=${basename(filePath)}`,
      "-H",
      `Content-Range: bytes 0-${size - 1}/${size}`,
      "--data-binary",
      `@${filePath}`,
      url,
    ]);

    if (stdout.includes("AUDIO_VALIDATION_FAILED")) {
      throw new Error("MAX rejected audio: AUDIO_VALIDATION_FAILED");
    }
  }
}

function mapLastMessage(message: any): ChatLastMessage | undefined {
  if (!message) return undefined;

  if (message.link?.type === "FORWARD") {
    return {
      type: "forward",
    };
  }

  const attach = message.attaches?.[0];

  if (typeof message.text === "string" && message.text.length > 0) {
    return {
      type: "text",
      text: message.text,
    };
  }

  if (!attach) {
    return undefined;
  }

  if (
    attach.audioId != null &&
    typeof attach.duration === "number" &&
    attach.wave != null
  ) {
    return {
      type: "voice",
      duration: attach.duration,
    };
  }

  switch (attach._type) {
    case "PHOTO":
      return { type: "photo" };

    case "VIDEO":
      return { type: "video" };

    case "FILE":
      if (attach.preview?._type === "MUSIC") {
        return {
          type: "audio",
          audioName: attach.preview.title ?? attach.name,
        };
      }

      return {
        type: "file",
        fileName: attach.name,
      };

    case "CALL":
      return {
        type: "call",
      };
    case "STICKER":
      return {
        type: "sticker",
      };
    case "CONTROL":
      return {
        type: "control",
        text: attach.shortMessage ?? attach.message,
      };

    default:
      return undefined;
  }
}
