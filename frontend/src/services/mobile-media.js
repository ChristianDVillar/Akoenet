import { isCapacitorNative } from '../lib/mobile-runtime'

let cameraModulePromise = null

async function getCameraModule() {
  if (!cameraModulePromise) {
    cameraModulePromise = import('@capacitor/camera').catch(() => null)
  }
  return cameraModulePromise
}

function normalizeMime(format) {
  const f = String(format || '').toLowerCase()
  if (f === 'png') return 'image/png'
  if (f === 'gif') return 'image/gif'
  if (f === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/**
 * Opens native photo picker on Capacitor and returns a File for existing upload flow.
 * Returns null when cancelled/unsupported.
 */
export async function pickImageFileFromDevice() {
  if (!isCapacitorNative()) return null
  const mod = await getCameraModule()
  const Camera = mod?.Camera
  const CameraResultType = mod?.CameraResultType
  const CameraSource = mod?.CameraSource
  if (!Camera || !CameraResultType || !CameraSource) return null
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 85,
      correctOrientation: true,
    })
    if (!photo?.webPath) return null
    const res = await fetch(photo.webPath)
    const blob = await res.blob()
    const mime = blob.type || normalizeMime(photo.format)
    const ext = mime.split('/')[1] || 'jpg'
    return new File([blob], `mobile-upload-${Date.now()}.${ext}`, { type: mime })
  } catch {
    return null
  }
}
