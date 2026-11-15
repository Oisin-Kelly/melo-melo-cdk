import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  MusicalNoteIcon,
  QueueListIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { useState, type CSSProperties } from "react";
import { useLocation } from "react-router";
import { CoverArt } from "@/components/media/cover-art";
import { LikeButton } from "@/components/media/media-rows";
import { tint } from "@/components/media/tint";
import { profilePath, trackPath } from "@/lib/links";
import { nameOf } from "@/types/user";
import {
  NextButton,
  PlayPauseButton,
  Scrubber,
  TrackByline,
  Transport,
} from "./player-controls";
import { QueueList } from "./queue-list";
import type { PlayContext } from "./queue";
import {
  useCurrentTrack,
  usePlaybackPosition,
  usePlayerState,
  usePlayingFrom,
} from "./use-player";
import "./player.css";

// Phones: a floating pill above the tab bar (cover, title, play/pause, next, a thin
// progress line along its bottom). Tapping it opens Now playing, laid out like the iOS
// app's player: the cover sitting at the foot of a block of its own colour, the title and
// who made it, the scrubber in the text colour with the times under it, then shuffle /
// back / a big play / next / repeat, and the queue below.
export function MiniPlayer() {
  const track = useCurrentTrack();
  const from = usePlayingFrom();
  const { pathname } = useLocation();
  // Open on the page it was opened on: a link in the sheet (the title, who made it)
  // closes it on the way to that page
  const [openOn, setOpenOn] = useState<string | null>(null);
  const isOpen = openOn === pathname;
  const setIsOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  if (!track) return null;
  return (
    <>
      <div className="mm-mini-dock">
        <section
          className="mm-mini"
          aria-label="Now playing"
          style={tint(track.imageBgColor)}
        >
          <HStack gap={3} vAlign="center" paddingInline={2} paddingBlock={2}>
            <CoverArt
              imageUrl={track.imageUrl}
              imageBgColor={track.imageBgColor}
              size="sm"
            />
            <StackItem size="fill">
              {/* The whole pill opens the sheet; its buttons sit above this */}
              <button
                type="button"
                className="mm-mini-open"
                onClick={() => setIsOpen(true)}
              >
                <VStack gap={0.5}>
                  <Text type="body" weight="bold" maxLines={1}>
                    {track.name}
                  </Text>
                  <TrackByline track={track} isLinked={false} />
                </VStack>
              </button>
            </StackItem>
            <PlayPauseButton variant="ghost" size="lg" />
            <NextButton size="lg" />
          </HStack>
          <ProgressLine />
        </section>
      </div>
      <BottomSheet
        label="Now playing"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        height="tall"
        padding={0}
        className="mm-now-sheet"
        style={tint(track.imageBgColor)}
      >
        <div className="mm-now-art">
          {/* What it's playing from: an icon for the kind (album, playlist, Liked tracks)
              beside its name, the words left to screen readers. Its row is kept when
              there's none, so the cover sits in the same place */}
          <HStack
            gap={1.5}
            vAlign="center"
            hAlign="center"
            className="mm-now-from"
          >
            {from && (
              <>
                <Icon icon={fromIcon(from)} size="sm" color="secondary" />
                <Link
                  href={from.href}
                  type="body"
                  color="primary"
                  weight="semibold"
                  maxLines={1}
                  aria-label={`Playing from ${from.name}`}
                >
                  {from.name}
                </Link>
              </>
            )}
          </HStack>
          <span className="mm-now-cover">
            <CoverArt
              imageUrl={track.imageUrl}
              imageBgColor={track.imageBgColor}
              size="xl"
            />
          </span>
        </div>
        <VStack gap={4} paddingInline={6} paddingBlock={4}>
          {/* Room for two lines of title, filled from the bottom: a short title or a long
              one leaves the controls in the same place */}
          <VStack vAlign="end" className="mm-now-heading">
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <VStack gap={0.5}>
                  <Link
                    href={trackPath(track)}
                    color="primary"
                    weight="bold"
                    maxLines={2}
                    className="mm-now-title"
                  >
                    {track.name}
                  </Link>
                  <Link
                    href={profilePath(track.owner.username)}
                    color="secondary"
                    maxLines={1}
                    className="mm-now-owner"
                  >
                    {nameOf(track.owner)}
                  </Link>
                </VStack>
              </StackItem>
              <LikeButton
                kind="TRACK"
                id={track.id}
                liked={track.likedByMe}
                name={track.name}
              />
            </HStack>
          </VStack>
          <VStack gap={2}>
            <Scrubber layout="below" />
            <Transport isSpread />
          </VStack>
          <VStack gap={3} paddingBlockStart={4}>
            <Text type="label" weight="semibold">
              Up next
            </Text>
            <QueueList />
          </VStack>
        </VStack>
      </BottomSheet>
    </>
  );
}

function fromIcon(from: PlayContext) {
  if (from.type === "ALBUM") return RectangleStackIcon;
  if (from.type === "PLAYLIST")
    return from.id === "likes" ? HeartIcon : QueueListIcon;
  return MusicalNoteIcon;
}

function ProgressLine() {
  const track = useCurrentTrack();
  const { status } = usePlayerState();
  const position = usePlaybackPosition();
  const duration = status.duration || track?.duration || 0;
  const share = duration > 0 ? Math.min(position / duration, 1) : 0;
  return (
    <span
      className="mm-mini-progress"
      style={{ "--mm-progress": share } as CSSProperties}
      aria-hidden
    />
  );
}
