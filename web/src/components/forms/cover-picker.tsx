import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useRef, useState } from 'react'
import { CoverArt } from '@/components/media/cover-art'
import { IMAGE_ACCEPT, imageFileError } from '@/lib/dropbox'
import { FileInput } from './file-input'

/** What the owner did to the cover: a new file to upload, removed it, or neither. */
export type CoverChange = { file: File | null; clear: boolean }

type Props = {
  /** The current cover, if any. */
  imageUrl: string | null
  imageBgColor: string | null
  onChange: (change: CoverChange) => void
  /** A picked file the server wouldn't take (type or size). */
  onError: (message: string) => void
}

// Cover editing for tracks, albums and playlists: a preview, Add/Change cover and Remove.
// The upload itself happens on save (stageUpload → imageKey); this only picks.
export function CoverPicker({ imageUrl, imageBgColor, onChange, onError }: Props) {
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null)
  const [isCleared, setIsCleared] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Free the picked cover's preview URL when it's replaced or the form closes
  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked])


  const previewUrl = picked?.url ?? (isCleared ? null : imageUrl)

  const pick = (file: File) => {
    const error = imageFileError(file)
    if (error) return onError(error)
    setPicked({ file, url: URL.createObjectURL(file) })
    setIsCleared(false)
    onChange({ file, clear: false })
  }

  const remove = () => {
    setPicked(null)
    // Removing a just-picked file goes back to the saved cover; removing the saved one clears it
    const clear = Boolean(imageUrl)
    setIsCleared(clear)
    onChange({ file: null, clear })
  }

  // A large preview (120px) so you can see the cover you're choosing; on narrow phones the
  // buttons wrap underneath it rather than squeezing beside it. Beside it, they line up with
  // the cover's top edge
  return (
    <HStack gap={4} vAlign="start" wrap="wrap">
      <CoverArt imageUrl={previewUrl} imageBgColor={imageBgColor} size="lg" />
      <VStack gap={1}>
        <HStack gap={2}>
          <Button
            label={previewUrl ? 'Change cover' : 'Add cover'}
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
          />
          {previewUrl && <Button label="Remove" variant="ghost" size="sm" onClick={remove} />}
        </HStack>
        <Text type="supporting" color="secondary">
          JPEG, PNG, WebP or GIF, up to 20 MB.
        </Text>
      </VStack>
      <FileInput ref={fileInput} accept={IMAGE_ACCEPT} onPick={pick} />
    </HStack>
  )
}
