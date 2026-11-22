/**
 * Hands a file to the user.
 *
 * On iPhone, the Web Share API opens the normal share sheet (Save to Files, AirDrop, Mail…),
 * which is the most natural way to keep a file. It must be called directly from a tap, so the
 * file should already be built. Where file sharing isn't supported (most desktop browsers),
 * fall back to an ordinary download.
 */
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Any other failure (e.g. permission): fall through to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
