// OCR utilities using Tesseract.js

let workerPromise: Promise<unknown> | null = null;

interface TesseractResult {
  data: {
    text: string;
    words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    lines?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  };
}

async function getWorker(): Promise<{
  recognize: (image: HTMLCanvasElement | string) => Promise<TesseractResult>;
  terminate: () => Promise<void>;
}> {
  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    workerPromise = Promise.resolve(worker);
  }
  return (await workerPromise) as unknown as ReturnType<typeof getWorker>;
}

export async function runOcr(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number) => void
): Promise<string> {
  const worker = await getWorker();

  // Tesseract.js v7 uses a different progress API
  const result = await worker.recognize(canvas);
  onProgress?.(1);
  return result.data.text;
}

export async function runOcrWords(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number) => void,
): Promise<TesseractResult['data']> {
  const worker = await getWorker();
  const result = await worker.recognize(canvas);
  onProgress?.(1);
  return result.data;
}

export async function runOcrOnImageData(
  dataUrl: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(dataUrl);
  onProgress?.(1);
  return result.data.text;
}

export function terminateOcr(): void {
  if (workerPromise) {
    workerPromise.then(async (w) => {
      await (w as { terminate: () => Promise<void> }).terminate();
    });
    workerPromise = null;
  }
}
