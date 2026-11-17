import { createContext, useContext } from 'react'

// Opening the upload dialog from anywhere in the app (the header's Upload buttons, /upload
// links). UploadProvider (in AppLayout) holds it; outside one, opening does nothing.
export const UploadContext = createContext<{ open: () => void }>({ open: () => {} })

export const useUpload = () => useContext(UploadContext)
