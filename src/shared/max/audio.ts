import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type PreparedVoice = {
  /** Путь к готовому .ogg файлу (моно Opus), временный файл в os.tmpdir(). */
  oggPath: string;
  /** Длительность в миллисекундах, как ожидает MAX. */
  duration: number;
  /** Гистограмма амплитуды для визуализации волны в чате (~80 значений 0..31). */
  wave: Uint8Array;
};

async function convertToOgg(inputPath: string): Promise<string> {
  const outPath = path.join(os.tmpdir(), `${Date.now()}.ogg`);

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    // ВАЖНО: -map 0:a:0 -vn — берём только первую аудиодорожку.
    // Без этого ffmpeg подхватывает встроенную обложку mp3 (ID3 picture) как
    // видеопоток (Theora), и MAX отвечает AUDIO_VALIDATION_FAILED на такой файл.
    "-map", "0:a:0",
    "-vn",
    "-map_metadata", "-1",
    "-c:a", "libopus",
    "-b:a", "24k",
    "-ac", "1",
    "-ar", "48000",
    "-application", "voip",
    outPath,
  ]);

  return outPath;
}

async function getDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function generateWave(filePath: string, bars = 80): Promise<Uint8Array> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-i", filePath, "-f", "s16le", "-ac", "1", "-ar", "8000", "-"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 50 },
  );

  const pcm = stdout as unknown as Buffer;
  const sampleCount = Math.floor(pcm.length / 2);
  const samplesPerBar = Math.max(1, Math.floor(sampleCount / bars));

  const rawWave = new Array<number>(bars).fill(0);
  for (let i = 0; i < bars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(sampleCount, start + samplesPerBar);
    let sumAbs = 0;
    let count = 0;

    for (let j = start; j < end; j++) {
      sumAbs += Math.abs(pcm.readInt16LE(j * 2));
      count++;
    }

    rawWave[i] = count > 0 ? sumAbs / count : 0;
  }

  // Нормализуем по максимуму В ЭТОМ файле, а не по абсолютной шкале int16 —
  // иначе тихие записи (обычная человеческая речь редко доходит до предела
  // громкости) дают почти плоскую волну, как было до этой правки.
  const max = Math.max(...rawWave, 1);
  return Uint8Array.from(
    rawWave.map((v) => Math.min(31, Math.round((v / max) * 31))),
  );
}

/** mp3/wav/любой формат, понятный ffmpeg → готовые данные для AUDIO-вложения MAX. */
export async function prepareVoiceMessage(sourcePath: string): Promise<PreparedVoice> {
  const oggPath = await convertToOgg(sourcePath);
  const duration = await getDurationMs(oggPath);
  const wave = await generateWave(oggPath, 80);
  return { oggPath, duration, wave };
}
