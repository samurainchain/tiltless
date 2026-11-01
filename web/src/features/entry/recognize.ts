import { mergeReadings, parseScreenshotText, type ParsedScreenshot } from '../../core/ocr/parseScreenshot'

// On-device text recognition with Tesseract.js. The image never leaves the browser; the engine
// and the English and Russian models are fetched once and then cached by the browser. Spanish
// exchange screens are Latin text, which the English model reads.

export type RecognizeProgress = (fraction: number) => void

/**
 * Where the engine files are served from (see `tesseractAssets` in vite.config.ts): the site's
 * /tesseract/, whichever page asks. Absolute, because the worker resolves relative paths
 * against its own script URL, not the page.
 */
function assetUrl(path: string): string {
  return new URL(`/tesseract/${path}`, window.location.origin).href
}

interface Prepared {
  /** Grayscale, dark themes inverted: what Tesseract reads first. */
  plain: HTMLCanvasElement
  /**
   * For dark screenshots: only text-like pixels (neutral white and gray, green and red) kept,
   * black on white. Share cards print their numbers over busy art that the plain reading turns
   * into noise; this one is read when the plain reading falls short.
   */
  masked?: HTMLCanvasElement
}

/**
 * Prepares a screenshot for OCR: grayscale, light text on dark themes inverted to dark on
 * light, small images scaled up. Tesseract reads dark-on-light text at ~30 px best.
 */
async function preprocess(file: Blob): Promise<Prepared> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(3, Math.max(1, 1600 / Math.max(bitmap.width, bitmap.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  const colors = new Uint8ClampedArray(pixels)
  let total = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray
    total += gray
  }
  const dark = total / (pixels.length / 4) < 128
  if (dark) {
    for (let i = 0; i < pixels.length; i += 4) pixels[i] = pixels[i + 1] = pixels[i + 2] = 255 - pixels[i]!
  }
  context.putImageData(image, 0, 0)
  if (!dark) return { plain: canvas }

  const masked = document.createElement('canvas')
  masked.width = canvas.width
  masked.height = canvas.height
  const maskedContext = masked.getContext('2d')!
  const mask = maskedContext.createImageData(canvas.width, canvas.height)
  for (let i = 0; i < colors.length; i += 4) {
    const [r, g, b] = [colors[i]!, colors[i + 1]!, colors[i + 2]!]
    const high = Math.max(r, g, b)
    const text = (high - Math.min(r, g, b) < 22 && high > 130) || (g > r + 40 && g > b + 15 && g > 110) || (r > g + 50 && r > b + 30 && r > 120)
    mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = text ? 0 : 255
    mask.data[i + 3] = 255
  }
  maskedContext.putImageData(mask, 0, 0)
  return { plain: canvas, masked }
}

/** A plain reading this sure and complete needs no second, masked one. */
const SURE_CONFIDENCE = 60

/** Gives up when loading the engine or model stalls, e.g. offline on first use. */
const LOAD_TIMEOUT_MS = 60_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Screenshot reader timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function recognizeScreenshot(file: Blob, onProgress?: RecognizeProgress): Promise<ParsedScreenshot> {
  const [{ createWorker, OEM }, prepared] = await Promise.all([import('tesseract.js'), preprocess(file)])
  // Download failures inside the worker reach `errorHandler`, not the `createWorker` promise.
  let failLoading: (error: unknown) => void = () => undefined
  const loadFailed = new Promise<never>((_, reject) => (failLoading = reject))
  // A dark screenshot may need a second reading: the first then fills the first part of the bar.
  let pass = 0
  const share = prepared.masked ? 0.6 : 1
  // Both languages at once: a Russian exchange interface still prints pairs and units in Latin.
  const creating = createWorker(['eng', 'rus'], OEM.LSTM_ONLY, {
    errorHandler: (error: unknown) => failLoading(error),
    workerPath: assetUrl('worker.min.js'),
    corePath: assetUrl(''),
    // Without the bundled models, Tesseract.js downloads them from its default CDN.
    langPath: import.meta.env.VITE_OCR_LOCAL_MODEL ? assetUrl('lang') : undefined,
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress?.(pass === 0 ? message.progress * share : share + message.progress * (1 - share))
    },
  })
  const worker = await Promise.race([withTimeout(creating, LOAD_TIMEOUT_MS), loadFailed]).catch(async (error: unknown) => {
    // A worker that finishes loading after the timeout must not linger.
    void creating.then((late) => late.terminate(), () => undefined)
    throw error
  })
  try {
    // Keep column gaps: the parser splits "Label    value" pairs and table rows on them.
    await worker.setParameters({ preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(prepared.plain)
    const plain = parseScreenshotText(data.text, data.confidence)
    const complete = plain.entryPrice && plain.exitPrice && data.confidence >= SURE_CONFIDENCE
    if (!prepared.masked || complete) return plain
    pass = 1
    const second = await worker.recognize(prepared.masked)
    return mergeReadings(plain, parseScreenshotText(second.data.text, second.data.confidence))
  } finally {
    await worker.terminate()
  }
}
