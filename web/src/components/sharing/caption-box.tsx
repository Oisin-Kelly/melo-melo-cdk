import { VStack } from '@astryxdesign/core/VStack'
import { ExpandableText } from '@/components/media/detail-section'
import { tint } from '@/components/media/tint'
import './sharing.css'

// What someone wrote when sharing something: edged and washed in the shared item's cover
// colour, matching its row. The Home feed and a shared track/album's own page both use it.
export function CaptionBox({ text, colour }: { text: string; colour?: string | null }) {
  return (
    <div className="mm-caption-box" style={tint(colour)}>
      <VStack paddingInline={3} paddingBlock={2}>
        <ExpandableText text={text} />
      </VStack>
    </div>
  )
}
