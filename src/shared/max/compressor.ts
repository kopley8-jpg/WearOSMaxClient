const Une = 12;
const Vr = 5;
const Wne = 13;
const Gr = 15;
const Ur = 4;
const Br = 4;
const Wr = 15;
const Jr = 6;
const Kr = 13;
const qr = 8192;
const Hr = 65535;

function qne(e: number) {
  return e + Math.floor(e / 255) + 16;
}

function Xr(e: Uint8Array, t: number) {
  return (e[t] | (e[t + 1] << 8) | (e[t + 2] << 16) | (e[t + 3] << 24)) >>> 0;
}

function Zr(e: Uint8Array, t: number) {
  return (Math.imul(Xr(e, t), 2654435761) >>> (32 - Kr)) & (qr - 1);
}

function Qr(e: Uint8Array, t: number, n: Int32Array) {
  n[Zr(e, t)] = t;
}

function Jne(e: number, t: number, n: Int32Array) {
  n[t] = e;
}

function Yne(e: Uint8Array, t: number, n: Int32Array) {
  return n[Zr(e, t)];
}

function Xne(e: Uint8Array, t: number, n: number, r: number) {
  let i = 0;

  for (; t + i < r && e[t + i] === e[n + i]; ) {
    i++;
  }

  return i;
}

function $r(e: Uint8Array, t: number, n: Uint8Array, r: number, i: number) {
  let a = i - r;

  if (a >= Gr) {
    e[t++] = Gr << Ur;

    let n = a - Gr;

    for (; n >= 255; n -= 255) {
      e[t++] = 255;
    }

    e[t++] = n;
  } else {
    e[t++] = a << Ur;
  }

  for (let i = 0; i < a; i++) {
    e[t++] = n[r + i];
  }

  return t;
}
const browserPayloadBase64 =
  "hKZjaGF0SWTHCQHT//+39oEZpaemcG9zdElkwKdtZXNzYWdlhqR0eXBlwKR0ZXh0wKNjaWTHCQHT///+XzpQOTOoZWxlbWVudHPApGxpbmvAqGF0dGFjaGVzkYWlX3R5cGWlQVVESU+nYXVkaW9JZM8AAARDGzoAWahkdXJhdGlvbs4AAgCypHdhdmXEUAAAAQEXFwICICBGRnR0f39KShERAAAAAAABAQoKf39/f39/FhZ/fxQDAwQEBgYKCgYGAQEbGzExLy83NyJMTDQ0f39/fywsAAAAAAAAAAABpXRva2Vu2VRmOUxIb2REMGNPSS03RFhOOVFjN0duQml0T2RweThpU2RCYkVENDdITndIc0llYm02cXl6ODFSVkQ3V1JLN1hPSWwxcjQ5VXkzd2lXb2JCQVBkM2Ombm90aWZ5ww==";

const data = Uint8Array.from(atob(browserPayloadBase64), (char) =>
  char.charCodeAt(0),
);

export const logSuka = () =>
  console.log([
    Zr(data, 0),
    Zr(data, 1),
    Zr(data, 10),
    Zr(data, 20),
    Zr(data, 100),
    Zr(data, 200),
    Zr(data, 300),
  ]);

export function Kne(e: Uint8Array) {
  let t = e.length;

  if (t === 0) return new Uint8Array();

  let n = new Uint8Array(qne(t));
  let r = new Int32Array(qr).fill(0);
  let i = 0;
  let a = 0;
  let o = 0;
  let s = t;
  let c = s - Une;
  let l = s - Vr;

  if (t < Wne) {
    o = $r(n, o, e, a, s);
    return n.subarray(0, o);
  }

  Qr(e, i, r);
  i++;

  let u = Zr(e, i);

  for (;;) {
    let t, d;

    {
      let l = i;
      d = 1;
      let f = 1 << Jr;

      do {
        let p = u;

        i = l;
        l += d;
        d = f++ >>> Jr;

        if (l > c) {
          return ((o = $r(n, o, e, a, s)), n.subarray(0, o));
        }

        t = r[p];

        Jne(i, p, r);
        u = Zr(e, l);
      } while (t + Hr < i || Xr(e, t) !== Xr(e, i));
    }

    for (; i > a && t > 0 && e[i - 1] === e[t - 1]; ) {
      i--;
      t--;
    }

    let f = i - a;

    if (((d = o++), f >= Gr)) {
      n[d] = Gr << Ur;

      let e = f - Gr;

      for (; e >= 255; e -= 255) {
        n[o++] = 255;
      }

      n[o++] = e;
    } else {
      n[d] = f << Ur;
    }

    for (let t = 0; t < f; t++) {
      n[o++] = e[a + t];
    }

    for (;;) {
      let f = i - t;

      n[o++] = f & 255;
      n[o++] = (f >>> 8) & 255;

      let p = Xne(e, i + Br, t + Br, l);

      if (((i += Br + p), p >= Wr)) {
        n[d] |= Wr;
        p -= Wr;

        for (; p >= 510; p -= 510) {
          n[o++] = 255;
          n[o++] = 255;
        }

        p >= 255 && ((p -= 255), (n[o++] = 255));
        n[o++] = p;
      } else {
        n[d] |= p;
      }

      if (((a = i), i > c)) {
        return ((o = $r(n, o, e, a, s)), n.subarray(0, o));
      }

      if (
        (Qr(e, i - 2, r),
        (t = Yne(e, i, r)),
        Qr(e, i, r),
        t + Hr >= i && Xr(e, t) === Xr(e, i))
      ) {
        d = o++;
        n[d] = 0;
        continue;
      }

      u = Zr(e, ++i);
      break;
    }
  }
}

export function createHeader(
  cmd: number,
  seq: number,
  opcode: number,
  chunkCount: number,
  payloadLength: number,
) {
  const header = new Uint8Array(10);
  const view = new DataView(header.buffer);

  view.setUint8(0, 10);
  view.setUint8(1, cmd);
  view.setInt16(2, seq);
  view.setInt16(4, opcode);
  view.setUint8(6, chunkCount);

  header[7] = (payloadLength >>> 16) & 0xff;
  header[8] = (payloadLength >>> 8) & 0xff;
  header[9] = payloadLength & 0xff;

  return header;
}

export function createPacket(
  cmd: number,
  seq: number,
  opcode: number,
  payload: Uint8Array,
) {
  const header = createHeader(cmd, seq, opcode, 0, payload.length);

  const packet = new Uint8Array(header.length + payload.length);

  packet.set(header, 0);
  packet.set(payload, header.length);

  return packet;
}

export const testCompression = () => {
  const compressed = Kne(data);

  const packet = createPacket(0, 43, 64, compressed);

  console.log("packet length:", packet.length);
  console.log("first 20:", Array.from(packet.slice(0, 20)));
  console.log("last 20:", Array.from(packet.slice(-20)));
};

export const testCompressedPayload = () => {
  return Kne(data);
};
