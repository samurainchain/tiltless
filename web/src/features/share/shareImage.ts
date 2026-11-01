import { useEffect, useState } from 'react'

// Turning a drawn card into a PNG, and handing it to the system share sheet or a download.
// Shared by the trade card and the period recap.

function loadLogo(): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = '/favicon.svg'
  })
}

/** Draws the card while the sheet is open and keeps the PNG; `undefined` until it's ready. */
export function useCardImage(open: boolean, width: number, height: number, draw: ((ctx: CanvasRenderingContext2D, logo: CanvasImageSource | undefined) => void) | undefined) {
  const [image, setImage] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!open || !draw) {
      setImage(undefined)
      return
    }
    let cancelled = false
    let url: string | undefined
    void (async () => {
      const logo = await loadLogo()
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx || cancelled) return
      await document.fonts?.ready
      draw(ctx, logo)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setImage({ blob, url })
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, width, height, draw])
  return image
}

export function downloadImage(url: string, name: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
}

/** The image as a file, when the browser can share files through the system sheet. */
export function shareableFile(blob: Blob | undefined, name: string): File | undefined {
  if (!blob) return undefined
  const file = new File([blob], name, { type: 'image/png' })
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) ? file : undefined
}

/** Opens the system share sheet; false when it failed (closing the sheet isn't a failure). */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file] })
    return true
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError'
  }
}
