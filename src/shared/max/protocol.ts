import { encode, decode, ExtensionCodec } from "@msgpack/msgpack";
import { createHeader, Kne } from "./compressor";
import LZ4 from "lz4js";

/** Оборачивает bigint для передачи через msgpack extension type 1 (int64). */
export const MAX_INT64 = (value: bigint) => ({ __maxInt64: value });

/** Кодек для исходящих пакетов: наши MAX_INT64(...) → msgpack extension type 1. */
export const encodeExtCodec = new ExtensionCodec();
encodeExtCodec.register({
  type: 1,
  encode: (value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("__maxInt64" in value)
    ) {
      return null;
    }

    const bigint = (value as { __maxInt64: bigint }).__maxInt64;
    const result = new Uint8Array(9);
    result[0] = 0xd3;
    new DataView(result.buffer).setBigInt64(1, bigint);
    return result;
  },
  decode: () => {
    throw new Error("encodeExtCodec: decode not implemented");
  },
});

/**
 * Кодек для входящих пакетов. Важно: значение extension type 1 на входе —
 * это не сырые 8 байт int64, а САМОСТОЯТЕЛЬНЫЙ вложенный msgpack-скаляр
 * (может быть int32 (5 байт, тег 0xd2) или int64 (9 байт, тег 0xd3), в
 * зависимости от величины числа). Поэтому декодируем его рекурсивно.
 */
export const decodeExtCodec = new ExtensionCodec();
decodeExtCodec.register({
  type: 1,
  encode: () => null,
  decode: (data) => decode(data, { useBigInt64: true }),
});

export type MaxFrame = {
  cmd: number;
  seq: number;
  opcode: number;
  flag: number;
  payload: unknown;
};

/**
 * Собирает исходящий бинарный пакет MAX.
 * Формат: [10, cmd, seq(int16 BE), opcode(int16 BE), flag, len(uint24 BE), ...payload]
 * payload сжимается через Kne (LZ4-подобный компрессор из браузерного бандла),
 * если его msgpack-представление длиннее 32 байт.
 */
export function encodeFrame(
  cmd: number,
  seq: number,
  opcode: number,
  payload?: unknown,
): Uint8Array {
  let body: Uint8Array =
    payload == null
      ? new Uint8Array()
      : encode(payload, {
          extensionCodec: encodeExtCodec,
          ignoreUndefined: true,
        });

  let flag = 0;
  if (body.length > 32) {
    const compressed = Kne(body);
    flag = Math.min(Math.ceil(body.length / compressed.length), 255);
    if (flag > 0) body = compressed;
  }

  const header = createHeader(cmd, seq, opcode, flag, body.length);
  const packet = new Uint8Array(header.length + body.length);
  packet.set(header, 0);
  packet.set(body, header.length);
  return packet;
}

/** Разбирает входящий бинарный пакет MAX (с LZ4-распаковкой при flag > 0). */
export function decodeFrame(raw: Buffer): MaxFrame {
  const cmd = raw[1];
  const seq = raw.readInt16BE(2);
  const opcode = raw.readInt16BE(4);
  const flag = raw[6];
  const len = (raw[7] << 16) | (raw[8] << 8) | raw[9];
  let body: Uint8Array = raw.subarray(10, 10 + len);

  if (flag > 0) {
    // точный размер распакованных данных неизвестен заранее, берём с запасом
    const out = new Uint8Array(Math.max(len * flag, len) * 4 + 1024);
    const n = LZ4.decompressBlock(body, out, 0, body.length, 0);
    body = out.subarray(0, n);
  }
  // ВОТ ЗДЕСЬ смотрим сырые msgpack-байты

  const marker = Buffer.from("_type");

  for (let i = 0; i <= body.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (body[i + j] !== marker[j]) {
        break;
      }
    }
  }
  const payload =
    body.length > 0
      ? decode(body, { extensionCodec: decodeExtCodec })
      : undefined;

  inspectAudioTypes(payload);

  return { cmd, seq, opcode, flag, payload };
}

/** Приводит любой Buffer/ArrayBuffer/Buffer[] от `ws` к единому Buffer. */
export function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw));
  return Buffer.concat(raw as Buffer[]);
}

export function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function inspectAudioTypes(value: unknown): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      inspectAudioTypes(item);
    }
    return;
  }

  const obj = value as Record<string, unknown>;

  if ("_type" in obj) {
    console.log("ATTACHMENT TYPE:", {
      value: obj._type,
      typeof: typeof obj._type,
      constructor:
        obj._type && typeof obj._type === "object"
          ? obj._type.constructor?.name
          : undefined,
    });
  }

  for (const child of Object.values(obj)) {
    inspectAudioTypes(child);
  }
}
