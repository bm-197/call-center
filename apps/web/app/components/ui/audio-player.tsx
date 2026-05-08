'use client';

import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
  Download01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

type AudioPlayerProps = {
  src: string;
  autoPlay?: boolean;
  downloadName?: string;
  className?: string;
};

export function AudioPlayer({
  src,
  autoPlay = false,
  downloadName,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (!seeking) setCurrentTime(audio.currentTime);
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => setIsPlaying(false);
    const onError = () => setError('Failed to load recording');
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onError);
    };
  }, [seeking]);

  function toggle(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setError('Playback failed'));
    else audio.pause();
  }

  function skip(deltaSeconds: number): void {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(
      0,
      Math.min(audio.duration, audio.currentTime + deltaSeconds),
    );
  }

  function onSeek(values: number[]): void {
    const next = values[0] ?? 0;
    setSeeking(true);
    setCurrentTime(next);
  }

  function onSeekCommit(values: number[]): void {
    const audio = audioRef.current;
    if (!audio) return;
    const next = values[0] ?? 0;
    audio.currentTime = next;
    setSeeking(false);
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border bg-card p-3',
        className,
      )}
    >
      <audio ref={audioRef} src={src} autoPlay={autoPlay} preload="metadata" />

      <Button
        type="button"
        size="icon"
        onClick={toggle}
        disabled={!!error}
        className="rounded-full"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <HugeiconsIcon
          icon={isPlaying ? PauseIcon : PlayIcon}
          size={16}
          strokeWidth={1.6}
        />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => skip(-10)}
        disabled={!!error}
        aria-label="Back 10 seconds"
      >
        <HugeiconsIcon icon={BackwardIcon} size={16} strokeWidth={1.6} />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => skip(10)}
        disabled={!!error}
        aria-label="Forward 10 seconds"
      >
        <HugeiconsIcon icon={ForwardIcon} size={16} strokeWidth={1.6} />
      </Button>

      <div className="flex flex-1 items-center gap-3">
        <Slider
          value={[currentTime]}
          min={0}
          max={duration || 1}
          step={0.1}
          onValueChange={onSeek}
          onValueCommit={onSeekCommit}
          disabled={!duration || !!error}
          className="flex-1"
        />
        <span className="text-muted-foreground w-[6.5rem] text-right font-mono text-xs tabular-nums">
          {error
            ? 'error'
            : `${formatTime(currentTime)} / ${formatTime(duration)}`}
        </span>
      </div>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        asChild
        aria-label="Download recording"
      >
        <a
          href={src}
          download={downloadName ?? true}
          target="_blank"
          rel="noopener"
        >
          <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.6} />
        </a>
      </Button>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
