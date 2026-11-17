import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useUpload } from '@/features/tracks/components/upload-context'

// /upload: Upload is a dialog over whatever page you're on, so a link to it lands on Home
// with the dialog open
export function OpenUpload() {
  const { open } = useUpload()
  useEffect(() => {
    open()
  }, [open])
  return <Navigate to="/" replace />
}
