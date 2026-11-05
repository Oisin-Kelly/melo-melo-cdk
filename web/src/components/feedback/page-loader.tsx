import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useState } from 'react'
import { LOADING_PHRASES, STILL_LOADING, type LoadingWhat } from './loading-phrases'
import './loading.css'

/** Nothing shows for this long, so quick loads don't flash a loader. */
const SHOW_AFTER_MS = 200

const pick = (phrases: readonly string[]) => phrases[Math.floor(Math.random() * phrases.length)]

// A spinner and one phrase saying what's loading, picked at random from the screen's pool
// (so it reads a little differently each time). It only changes if the wait drags on:
// "Still going", then "Nearly there". Holds real space so the page doesn't collapse to
// a sliver and then jump. `compact` for panes and popovers.
export function PageLoader({ compact, what = 'generic' }: { compact?: boolean; what?: LoadingWhat }) {
  const [phrase] = useState(() => pick(LOADING_PHRASES[what]))
  const [isShown, setIsShown] = useState(false)
  const [stage, setStage] = useState(-1)

  useEffect(() => {
    const timers = [
      setTimeout(() => setIsShown(true), SHOW_AFTER_MS),
      ...STILL_LOADING.map(({ afterMs }, i) => setTimeout(() => setStage(i), afterMs)),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const text = stage >= 0 ? STILL_LOADING[stage].phrase : phrase

  return (
    <Center axis="both" minHeight={compact ? 160 : '50dvh'}>
      <div className="mm-page-loader" data-shown={isShown} role="status">
        <VStack gap={3} hAlign="center">
          <Spinner size={compact ? 'md' : 'lg'} aria-label={text} />
          {/* keyed by the text, so each change fades in rather than swapping abruptly */}
          <Text key={text} type="body" size={compact ? 'base' : 'lg'} color="secondary" className="mm-loader-text" aria-hidden="true">
            {text}
          </Text>
        </VStack>
      </div>
    </Center>
  )
}
