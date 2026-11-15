import { useState } from 'react'
import { LIMITS } from '@/config/limits'
import type { CoverChange } from './cover-picker'
import { lengthError } from './saved-text'
import { slugError } from './slug'

/** `slug` is set only when the URL was changed (leaving it out keeps the current one);
 *  `genre` only for a form that has the field. */
export type Details = { name: string; description: string; genre?: string; cover: CoverChange; slug?: string }

/** The current cover, shown in the picker. */
export type CurrentCover = { imageUrl: string | null; imageBgColor: string | null }

type DraftOptions = {
  /** The API's limit for this kind's description (config/limits.ts). */
  descriptionLimit?: number
  /** The readable URL's editable end; omitted for items without one (or not yet made). */
  url?: { pathPrefix: string; slug: string }
}

/** The cover / name / (genre) / description / URL being edited, and its checks: the
 *  Edit details dialog (albums, playlists), the Edit track page, and the upload wizard's
 *  details step. A `genre` in `initial` (even empty) adds the Genre field. */
export function useDetailsDraft(
  initial: { name: string; description: string; genre?: string },
  { descriptionLimit = LIMITS.description, url }: DraftOptions = {},
) {
  const hasGenre = initial.genre !== undefined
  const [name, setName] = useState(initial.name)
  const [genre, setGenre] = useState(initial.genre ?? '')
  const [description, setDescription] = useState(initial.description)
  const [slug, setSlug] = useState(url?.slug ?? '')
  const [cover, setCover] = useState<CoverChange>({ file: null, clear: false })

  // Each field's own check, shown under that field (the API's limits, config/limits.ts)
  const errors = {
    name: name.trim() ? lengthError(name, LIMITS.name) : 'Give it a name.',
    genre: lengthError(genre, LIMITS.genre),
    description: lengthError(description, descriptionLimit, 'multi'),
    url: url !== undefined && slug !== url.slug ? slugError(slug) : null,
  }
  const slugChanged = url !== undefined && slug !== url.slug
  const isDirty =
    name !== initial.name ||
    genre !== (initial.genre ?? '') ||
    description !== initial.description ||
    cover.file !== null ||
    cover.clear ||
    slugChanged
  const isValid = Object.values(errors).every((error) => error === null)

  return {
    name,
    setName,
    genre,
    setGenre,
    description,
    setDescription,
    slug,
    setSlug,
    cover,
    setCover,
    hasGenre,
    descriptionLimit,
    url,
    errors,
    isDirty,
    canSave: isDirty && isValid,
    toDetails: (): Details => ({
      name,
      description,
      ...(hasGenre && { genre }),
      cover,
      slug: slugChanged ? slug : undefined,
    }),
  }
}

export type DetailsDraft = ReturnType<typeof useDetailsDraft>
